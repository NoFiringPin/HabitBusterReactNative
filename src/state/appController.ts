import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Device } from 'react-native-ble-plx';

import {
  profileFromJson,
  profileToJson,
  type BehaviorProfile,
} from '../models/behaviorProfile';
import { AlertService } from '../services/alertService';
import {
  BleScanner,
  BleTwitchDevice,
  ensureBlePermissions,
  isOurWatch,
} from '../services/bleTwitchDevice';
import { MockTwitchDevice } from '../services/mockTwitchDevice';
import {
  DeviceConnection,
  DeviceMode,
  UartProtocol,
  type DeviceSample,
  type TwitchDevice,
  type TwitchEvent,
  type Unsubscribe,
} from '../services/twitchDevice';

interface DayLog {
  total: number;
  hours: number[]; // length 24
}

function emptyDayLog(): DayLog {
  return { total: 0, hours: new Array(24).fill(0) };
}

function dayKey(d: Date): string {
  const y = d.getFullYear().toString().padStart(4, '0');
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * App-wide state: the connected wearable, the user's calibrated behaviors, live
 * readings, and the activity log. A single instance is shared through
 * `appController` and rebuilds the UI via a subscribe/notify registry (the
 * React analogue of Flutter's `ChangeNotifier`).
 *
 * Ported from `lib/services/app_controller.dart`.
 */
export class AppController {
  private static _instance: AppController | null = null;
  static get instance(): AppController {
    if (AppController._instance == null) {
      AppController._instance = new AppController();
    }
    return AppController._instance;
  }

  readonly alerts = new AlertService();

  private device: TwitchDevice | null = null;
  private connSub: Unsubscribe | null = null;
  private sampleSub: Unsubscribe | null = null;
  private eventSub: Unsubscribe | null = null;

  // ---- Connection / live state --------------------------------------------
  connection = DeviceConnection.disconnected;
  lastSample: DeviceSample | null = null;
  monitoring = false;
  /** True while auto-discovering the watch by name. */
  searching = false;

  // ---- Behaviors ----------------------------------------------------------
  profiles: BehaviorProfile[] = [];
  activeProfileId: string | null = null;

  // ---- Activity log -------------------------------------------------------
  private log = new Map<string, DayLog>();
  recentEvents: TwitchEvent[] = [];

  // ---- Change notification (useSyncExternalStore) -------------------------
  private listeners = new Set<() => void>();
  private version = 0;

  subscribe = (cb: () => void): Unsubscribe => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };
  getSnapshot = (): number => this.version;

  private notify(): void {
    this.version++;
    for (const l of [...this.listeners]) l();
  }

  // ---- Derived getters ----------------------------------------------------
  get isSimulated(): boolean {
    return this.device?.isSimulated ?? false;
  }
  get isConnected(): boolean {
    return this.connection === DeviceConnection.connected;
  }
  get deviceName(): string {
    return this.device?.name ?? 'No device';
  }
  get activeProfile(): BehaviorProfile | null {
    return this.profiles.find((p) => p.id === this.activeProfileId) ?? null;
  }
  get todayCount(): number {
    return this.log.get(dayKey(new Date()))?.total ?? 0;
  }
  get todayHours(): number[] {
    return this.log.get(dayKey(new Date()))?.hours ?? new Array(24).fill(0);
  }

  // =========================================================================
  //  Lifecycle
  // =========================================================================

  async init(): Promise<void> {
    await this.loadProfiles();
    await this.loadLog();
    this.alerts.enabled = (await getBool('alertEnabled')) ?? true;
    this.notify();
  }

  // =========================================================================
  //  Device wiring
  // =========================================================================

  async useSimulator(): Promise<void> {
    await this.attach(new MockTwitchDevice());
  }

  async useBleDevice(bleDevice: Device): Promise<void> {
    await this.attach(new BleTwitchDevice(bleDevice));
  }

  /**
   * One-tap connect: scan for the wearable by its hardcoded name and connect to
   * the first match. Returns null on success, or a user-facing error message.
   */
  async connectToWatch(): Promise<string | null> {
    if (this.searching) return null;
    this.searching = true;
    this.notify();
    const scanner = new BleScanner();
    let stopScan: Unsubscribe = () => {};
    try {
      const granted = await ensureBlePermissions();
      if (!granted) {
        return 'Bluetooth permission is needed to find your watch. Enable it in Settings and try again.';
      }
      const ready = await scanner.isReady();
      if (!ready.ok) {
        return `${ready.reason} You can use the simulator instead.`;
      }

      const device = await new Promise<Device | null>((resolve) => {
        const timeout = setTimeout(() => resolve(null), 13000);
        stopScan = scanner.startBroad((d) => {
          if (isOurWatch(d)) {
            clearTimeout(timeout);
            resolve(d);
          }
        });
      });
      scanner.stop();

      if (device == null) {
        return (
          `Couldn't find your ${UartProtocol.deviceName} watch. ` +
          `Make sure it's powered on and nearby.`
        );
      }
      await this.useBleDevice(device);
      await this.connect();
      return null;
    } catch (e) {
      return `Connection failed: ${String(e)}`;
    } finally {
      stopScan();
      this.searching = false;
      this.notify();
    }
  }

  private async attach(next: TwitchDevice): Promise<void> {
    await this.detach();
    this.device = next;
    this.connSub = next.onConnection((c) => {
      this.connection = c;
      if (c === DeviceConnection.disconnected) this.monitoring = false;
      this.notify();
    });
    this.sampleSub = next.onSample((s) => {
      this.lastSample = s;
      this.notify();
    });
    this.eventSub = next.onEvent((e) => this.onEvent(e));
    this.notify();
  }

  private async detach(): Promise<void> {
    this.connSub?.();
    this.sampleSub?.();
    this.eventSub?.();
    this.connSub = this.sampleSub = this.eventSub = null;
    const d = this.device;
    this.device = null;
    if (d != null) {
      await d.disconnect();
      d.dispose();
    }
    this.connection = DeviceConnection.disconnected;
    this.lastSample = null;
    this.monitoring = false;
  }

  async connect(): Promise<void> {
    await this.device?.connect();
    // Re-push the active profile so the device is ready to run standalone.
    const active = this.activeProfile;
    if (active != null) await this.device?.pushProfile(active);
  }

  async disconnect(): Promise<void> {
    await this.device?.disconnect();
  }

  /** Drives the simulator's "wearer is doing the behavior" flag; no-op on BLE. */
  setSimulatedGesture(performing: boolean): void {
    const d = this.device;
    if (d instanceof MockTwitchDevice) d.performingGesture = performing;
  }

  /** The live sample subscription helper for screens that need a stream. */
  onSample(listener: (s: DeviceSample) => void): Unsubscribe {
    return this.device?.onSample(listener) ?? (() => {});
  }

  // =========================================================================
  //  Modes
  // =========================================================================

  async enterCalibration(): Promise<void> {
    await this.device?.setMode(DeviceMode.calibrate);
  }

  async startMonitoring(): Promise<void> {
    const active = this.activeProfile;
    if (active != null) await this.device?.pushProfile(active);
    await this.device?.setMode(DeviceMode.run);
    this.monitoring = true;
    this.notify();
  }

  async stopMonitoring(): Promise<void> {
    await this.device?.setMode(DeviceMode.idle);
    this.monitoring = false;
    this.notify();
  }

  /**
   * Push a not-yet-saved profile and run it, so the calibration wizard can let
   * the user test the behavior live before committing to save.
   */
  async startProfilePreview(p: BehaviorProfile): Promise<void> {
    await this.device?.pushProfile(p);
    await this.device?.setMode(DeviceMode.run);
  }

  /** End a live preview and return the device to calibration streaming. */
  async endProfilePreview(): Promise<void> {
    this.setSimulatedGesture(false);
    await this.device?.setMode(DeviceMode.calibrate);
  }

  /** Fire a one-off test buzz so the user can confirm the phone vibrates. */
  testAlert(): void {
    this.alerts.test();
  }

  // =========================================================================
  //  Behaviors
  // =========================================================================

  async addProfile(p: BehaviorProfile, makeActive = true): Promise<void> {
    this.profiles.push(p);
    if (makeActive) this.activeProfileId = p.id;
    await this.saveProfiles();
    if (makeActive && this.isConnected) await this.device?.pushProfile(p);
    this.notify();
  }

  async deleteProfile(id: string): Promise<void> {
    this.profiles = this.profiles.filter((p) => p.id !== id);
    if (this.activeProfileId === id) {
      this.activeProfileId = this.profiles.length === 0 ? null : this.profiles[0].id;
    }
    await this.saveProfiles();
    this.notify();
  }

  async setActiveProfile(id: string): Promise<void> {
    this.activeProfileId = id;
    await this.saveProfiles();
    const active = this.activeProfile;
    if (active != null && this.isConnected) await this.device?.pushProfile(active);
    this.notify();
  }

  async setAlertsEnabled(enabled: boolean): Promise<void> {
    this.alerts.enabled = enabled;
    await AsyncStorage.setItem('alertEnabled', enabled ? '1' : '0');
    await this.device?.setAlertEnabled(enabled);
    this.notify();
  }

  // =========================================================================
  //  Event handling + activity log
  // =========================================================================

  private onEvent(e: TwitchEvent): void {
    this.recentEvents = [e, ...this.recentEvents].slice(0, 50);

    const key = dayKey(new Date(e.time));
    const day = this.log.get(key) ?? emptyDayLog();
    day.total += 1;
    day.hours[new Date(e.time).getHours()] += 1;
    this.log.set(key, day);

    void this.alerts.trigger();
    void this.saveLog();
    this.notify();
  }

  /** Touch totals for the current week, Monday..Sunday. */
  weekTotals(): number[] {
    const now = new Date();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // getDay(): 0 = Sunday..6 = Saturday; convert to ISO weekday 1..7.
    const isoWeekday = now.getDay() === 0 ? 7 : now.getDay();
    monday.setDate(monday.getDate() - (isoWeekday - 1));
    return Array.from({ length: 7 }, (_unused, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return this.log.get(dayKey(d))?.total ?? 0;
    });
  }

  get weeklyAverage(): number {
    const totals = this.weekTotals();
    const active = totals.filter((t) => t > 0).length;
    if (active === 0) return 0;
    return Math.round(totals.reduce((a, b) => a + b, 0) / active);
  }

  /** Consecutive days (ending today) that stayed at or under `dailyGoal`. */
  streakDays(dailyGoal = 10): number {
    let streak = 0;
    const day = new Date();
    for (let i = 0; i < 365; i++) {
      const entry = this.log.get(dayKey(day));
      if (entry == null) break; // device not worn -> streak ends
      if (entry.total > dailyGoal) break;
      streak++;
      day.setDate(day.getDate() - 1);
    }
    return streak;
  }

  // =========================================================================
  //  Persistence
  // =========================================================================

  private async loadProfiles(): Promise<void> {
    const raw = await AsyncStorage.getItem('profiles');
    const list: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    this.profiles = list.map(profileFromJson);
    this.activeProfileId = (await AsyncStorage.getItem('activeProfileId')) ?? null;
    if (this.activeProfileId == null && this.profiles.length > 0) {
      this.activeProfileId = this.profiles[0].id;
    }
  }

  private async saveProfiles(): Promise<void> {
    await AsyncStorage.setItem(
      'profiles',
      JSON.stringify(this.profiles.map(profileToJson)),
    );
    if (this.activeProfileId != null) {
      await AsyncStorage.setItem('activeProfileId', this.activeProfileId);
    }
  }

  private async loadLog(): Promise<void> {
    const raw = await AsyncStorage.getItem('log');
    if (raw == null) return;
    const map = JSON.parse(raw) as Record<string, { total: number; hours: number[] }>;
    this.log.clear();
    for (const [k, v] of Object.entries(map)) {
      this.log.set(k, {
        total: v.total ?? 0,
        hours: (v.hours ?? new Array(24).fill(0)).map((n) => Number(n)),
      });
    }
  }

  private async saveLog(): Promise<void> {
    const obj: Record<string, DayLog> = {};
    for (const [k, v] of this.log) obj[k] = v;
    await AsyncStorage.setItem('log', JSON.stringify(obj));
  }
}

async function getBool(key: string): Promise<boolean | null> {
  const v = await AsyncStorage.getItem(key);
  if (v == null) return null;
  return v === '1' || v === 'true';
}

export const appController = AppController.instance;
