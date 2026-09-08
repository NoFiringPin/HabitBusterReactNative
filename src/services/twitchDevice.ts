import type { BehaviorProfile } from '../models/behaviorProfile';

/** Operating mode of the wearable, mirrored in the firmware. */
export enum DeviceMode {
  /** Green LED, no detection, minimal streaming. */
  idle = 'idle',
  /** Blue LED, streams live samples fast for calibration, never buzzes. */
  calibrate = 'calibrate',
  /** Runs the active profile: detects, alerts, and notifies events. */
  run = 'run',
}

/** The wire token the firmware expects for each mode. */
export function modeWire(mode: DeviceMode): string {
  switch (mode) {
    case DeviceMode.idle:
      return 'IDLE';
    case DeviceMode.calibrate:
      return 'CALIB';
    case DeviceMode.run:
      return 'RUN';
  }
}

export enum DeviceConnection {
  disconnected = 'disconnected',
  scanning = 'scanning',
  connecting = 'connecting',
  connected = 'connected',
}

/** A single live reading streamed from the device (the `DAT` line). */
export interface DeviceSample {
  /** Wrist tilt in degrees (accelerometer-derived). */
  pitch: number;
  roll: number;
  /** Smoothed gyroscope magnitude in rad/s. */
  motion: number;
  /** Whether the device currently considers the gesture active. */
  flagged: boolean;
}

/**
 * A confirmed twitch detection (the `EVT` line): the device flagged the active
 * behavior after debouncing.
 */
export interface TwitchEvent {
  /** Cumulative flag count reported by the device since boot. */
  count: number;
  pitch: number;
  motion: number;
  /** Epoch milliseconds when the app received the event. */
  time: number;
}

/** Callback used by the streaming device abstraction. */
export type Listener<T> = (value: T) => void;
export type Unsubscribe = () => void;

/**
 * Abstraction over "the wearable", so the app can run identically against a
 * real BLE device or the built-in `MockTwitchDevice` simulator.
 *
 * Ported from the Flutter `TwitchDevice` abstract class; Dart broadcast streams
 * become simple listener registries (`onConnection` / `onSample` / `onEvent`).
 */
export interface TwitchDevice {
  /** Human-readable name shown in the UI. */
  readonly name: string;
  /** True for the simulator, so the UI can label it clearly. */
  readonly isSimulated: boolean;
  readonly connection: DeviceConnection;

  /** Subscribe to connection-state changes. Returns an unsubscribe fn. */
  onConnection(listener: Listener<DeviceConnection>): Unsubscribe;
  /** Subscribe to live samples (`DAT`), typically ~10-20 Hz while connected. */
  onSample(listener: Listener<DeviceSample>): Unsubscribe;
  /** Subscribe to confirmed detections (`EVT`). */
  onEvent(listener: Listener<TwitchEvent>): Unsubscribe;

  connect(): Promise<void>;
  disconnect(): Promise<void>;

  /** Switch the device between idle / calibrate / run. */
  setMode(mode: DeviceMode): Promise<void>;
  /** Push the active behavior's detection parameters to the device. */
  pushProfile(profile: BehaviorProfile): Promise<void>;
  /** Enable or mute the on-device LED alert. */
  setAlertEnabled(enabled: boolean): Promise<void>;

  dispose(): void;
}

/**
 * A tiny broadcast helper mirroring Dart's `StreamController.broadcast()`.
 * Concrete devices compose one per channel.
 */
export class Emitter<T> {
  private listeners = new Set<Listener<T>>();

  add(listener: Listener<T>): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(value: T): void {
    for (const l of [...this.listeners]) l(value);
  }

  clear(): void {
    this.listeners.clear();
  }
}

/**
 * The line-based protocol spoken over the Nordic UART service. Kept in one
 * place so the firmware and the app stay in lock-step.
 *
 * ```
 * App -> device:
 *   MODE IDLE|CALIB|RUN
 *   CFG gate=<0|1> mth=<f> pmin=<f> pmax=<f>
 *   ALERT <0|1>
 *   PING
 * Device -> app:
 *   HELLO fw=<int> mode=<str>
 *   DAT p=<f> r=<f> m=<f> f=<0|1>
 *   EVT n=<int> p=<f> m=<f>
 *   PONG
 * ```
 */
export const UartProtocol = {
  /**
   * The wearable advertises under this exact name so the app can find and
   * connect to it with a single tap. Must match `DEVICE_NAME` in the firmware
   * (`code.py`).
   */
  deviceName: 'FaceDefense',

  // Nordic UART Service (NUS) UUIDs — the CircuitPython UARTService default.
  service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  rxCharacteristic: '6e400002-b5a3-f393-e0a9-e50e24dcca9e', // app -> device (write)
  txCharacteristic: '6e400003-b5a3-f393-e0a9-e50e24dcca9e', // device -> app (notify)

  modeCommand(mode: DeviceMode): string {
    return `MODE ${modeWire(mode)}\n`;
  },

  alertCommand(enabled: boolean): string {
    return `ALERT ${enabled ? 1 : 0}\n`;
  },

  ping: 'PING\n',

  configCommand(p: BehaviorProfile): string {
    return (
      `CFG gate=${p.orientationGate ? 1 : 0} ` +
      `mth=${p.motionThreshold.toFixed(3)} ` +
      `pmin=${p.pitchMin.toFixed(1)} ` +
      `pmax=${p.pitchMax.toFixed(1)}\n`
    );
  },

  /**
   * Parse one device -> app line into a `DeviceSample` or `TwitchEvent`, or
   * null for handshake/keepalive lines (HELLO / PONG / unknown).
   */
  parseLine(line: string): DeviceSample | TwitchEvent | null {
    const trimmed = line.trim();
    if (trimmed.length === 0) return null;
    const parts = trimmed.split(/\s+/);
    const tag = parts[0];
    const fields: Record<string, string> = {};
    for (const kv of parts.slice(1)) {
      const eq = kv.indexOf('=');
      if (eq > 0) fields[kv.substring(0, eq)] = kv.substring(eq + 1);
    }

    const num = (k: string, fallback = 0): number => {
      const v = Number.parseFloat(fields[k] ?? '');
      return Number.isNaN(v) ? fallback : v;
    };

    switch (tag) {
      case 'DAT':
        return {
          pitch: num('p'),
          roll: num('r'),
          motion: num('m'),
          flagged: (fields['f'] ?? '0') === '1',
        } satisfies DeviceSample;
      case 'EVT':
        return {
          count: Number.parseInt(fields['n'] ?? '', 10) || 0,
          pitch: num('p'),
          motion: num('m'),
          time: Date.now(),
        } satisfies TwitchEvent;
      default:
        return null; // HELLO / PONG / unknown
    }
  },
} as const;

/** Type guards, since parseLine returns a union. */
export function isSample(x: unknown): x is DeviceSample {
  return !!x && typeof x === 'object' && 'flagged' in x;
}
export function isEvent(x: unknown): x is TwitchEvent {
  return !!x && typeof x === 'object' && 'count' in x;
}
