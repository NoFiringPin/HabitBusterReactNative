import type { BehaviorProfile } from '../models/behaviorProfile';
import {
  DeviceConnection,
  DeviceMode,
  Emitter,
  type DeviceSample,
  type Listener,
  type TwitchDevice,
  type TwitchEvent,
  type Unsubscribe,
} from './twitchDevice';

/**
 * A fully in-app simulation of the wearable, so the whole
 * customize -> calibrate -> recognize loop is demoable with no hardware.
 *
 * It streams believable `DeviceSample`s: quiet noise at rest, and elevated
 * motion + pitch while `performingGesture` is true (the calibration and monitor
 * screens drive that flag from a press-and-hold button). In `run` mode it
 * applies the pushed `BehaviorProfile` with the same debounce shape as the
 * firmware and emits `TwitchEvent`s.
 *
 * Ported 1:1 from `lib/services/mock_twitch_device.dart`.
 */
export class MockTwitchDevice implements TwitchDevice {
  private connectionEmitter = new Emitter<DeviceConnection>();
  private sampleEmitter = new Emitter<DeviceSample>();
  private eventEmitter = new Emitter<TwitchEvent>();

  private timer: ReturnType<typeof setInterval> | null = null;
  private _connection = DeviceConnection.disconnected;
  private mode = DeviceMode.idle;
  private profile: BehaviorProfile | null = null;

  /** Set by the UI to mimic the wearer actually doing the behavior. */
  performingGesture = false;

  // Smoothed internal state, mirroring the firmware's filters.
  private motion = 0;
  private pitch = -5;
  private flagCount = 0;

  // Debounce bookkeeping.
  private candidateTrue = false;
  private trueSince = 0;
  private falseSince = 0;
  private flagged = false;
  private flaggedSince = 0;
  private clock = 0;

  private static readonly flagOnTime = 0.35;
  private static readonly flagOffTime = 0.6;
  private static readonly minRedTime = 1.0;
  private static readonly tick = 0.05; // 20 Hz

  get name(): string {
    return 'Simulator (no hardware)';
  }
  get isSimulated(): boolean {
    return true;
  }
  get connection(): DeviceConnection {
    return this._connection;
  }

  onConnection(listener: Listener<DeviceConnection>): Unsubscribe {
    return this.connectionEmitter.add(listener);
  }
  onSample(listener: Listener<DeviceSample>): Unsubscribe {
    return this.sampleEmitter.add(listener);
  }
  onEvent(listener: Listener<TwitchEvent>): Unsubscribe {
    return this.eventEmitter.add(listener);
  }

  private setConnection(c: DeviceConnection): void {
    this._connection = c;
    this.connectionEmitter.emit(c);
  }

  async connect(): Promise<void> {
    this.setConnection(DeviceConnection.connecting);
    await new Promise((r) => setTimeout(r, 500));
    this.setConnection(DeviceConnection.connected);
    if (this.timer == null) {
      this.timer = setInterval(() => this.step(), 50);
    }
  }

  async disconnect(): Promise<void> {
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.setConnection(DeviceConnection.disconnected);
  }

  async setMode(mode: DeviceMode): Promise<void> {
    this.mode = mode;
    // Reset the detector when (re)entering run so old state can't linger.
    if (mode === DeviceMode.run) {
      this.flagged = false;
      this.candidateTrue = false;
    }
  }

  async pushProfile(profile: BehaviorProfile): Promise<void> {
    this.profile = profile;
  }

  async setAlertEnabled(_enabled: boolean): Promise<void> {
    // The simulator has no physical LED/buzzer to mute; app-side alerting is
    // driven by the controller. No-op kept for interface parity.
  }

  private step(): void {
    if (this._connection !== DeviceConnection.connected) return;
    this.clock += MockTwitchDevice.tick;

    // --- Synthesize a raw reading -----------------------------------------
    let targetMotion: number;
    let targetPitch: number;
    if (this.performingGesture) {
      // Fidgety, repetitive movement with the hand up near the face.
      targetMotion = 2.2 + Math.random() * 1.3;
      targetPitch = 45 + Math.random() * 20;
    } else {
      targetMotion = 0.15 + Math.random() * 0.25;
      targetPitch = -8 + Math.random() * 10;
    }
    // Smooth toward the target, like the firmware's low-pass filters.
    this.motion += (targetMotion - this.motion) * 0.35;
    this.pitch += (targetPitch - this.pitch) * 0.1;
    const roll = 8 + Math.random() * 6;

    // --- Detection (only meaningful in RUN with a profile) ----------------
    const p = this.profile;
    let flaggedNow = false;
    if (this.mode === DeviceMode.run && p != null) {
      const motionActive = this.motion > p.motionThreshold;
      const inZone = this.pitch >= p.pitchMin && this.pitch <= p.pitchMax;
      // Entry needs a deliberate move; staying flagged only needs the hand to
      // remain in the face zone (matches the firmware).
      const entry = p.orientationGate ? motionActive && inZone : motionActive;
      const hold = p.orientationGate ? inZone : motionActive;
      this.runDebounce(entry, hold);
      flaggedNow = this.flagged;
    }

    this.sampleEmitter.emit({
      pitch: this.pitch,
      roll,
      motion: this.motion,
      flagged: flaggedNow,
    });
  }

  private runDebounce(entry: boolean, hold: boolean): void {
    // How long entry has been continuously true.
    if (entry) {
      if (!this.candidateTrue) {
        this.candidateTrue = true;
        this.trueSince = this.clock;
      }
    } else {
      this.candidateTrue = false;
    }

    // How long hold has been continuously false.
    if (hold) {
      this.falseSince = 0;
    } else if (this.falseSince === 0) {
      this.falseSince = this.clock;
    }

    if (!this.flagged) {
      if (
        this.candidateTrue &&
        this.clock - this.trueSince >= MockTwitchDevice.flagOnTime
      ) {
        this.flagged = true;
        this.flaggedSince = this.clock;
        this.flagCount++;
        this.eventEmitter.emit({
          count: this.flagCount,
          pitch: this.pitch,
          motion: this.motion,
          time: Date.now(),
        });
      }
    } else {
      const heldRed = this.clock - this.flaggedSince;
      const cleared =
        this.falseSince !== 0 &&
        this.clock - this.falseSince >= MockTwitchDevice.flagOffTime;
      if (cleared && heldRed >= MockTwitchDevice.minRedTime) this.flagged = false;
    }
  }

  dispose(): void {
    if (this.timer != null) clearInterval(this.timer);
    this.timer = null;
    this.connectionEmitter.clear();
    this.sampleEmitter.clear();
    this.eventEmitter.clear();
  }
}
