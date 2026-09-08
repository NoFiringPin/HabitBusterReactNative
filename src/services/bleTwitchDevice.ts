import { PermissionsAndroid, Platform, type Permission } from 'react-native';
import {
  BleManager,
  Device,
  State as BleState,
  Subscription,
  type Characteristic,
} from 'react-native-ble-plx';
import base64 from 'base64-js';

import type { BehaviorProfile } from '../models/behaviorProfile';
import { utf8Decode, utf8Encode } from './utf8';
import {
  DeviceConnection,
  DeviceMode,
  Emitter,
  UartProtocol,
  isEvent,
  isSample,
  type DeviceSample,
  type Listener,
  type TwitchDevice,
  type TwitchEvent,
  type Unsubscribe,
} from './twitchDevice';

/**
 * A single shared BLE manager for the whole app. react-native-ble-plx keeps one
 * central manager; creating several fights over the radio.
 */
let sharedManager: BleManager | null = null;
export function bleManager(): BleManager {
  if (sharedManager == null) sharedManager = new BleManager();
  return sharedManager;
}

function toBase64(bytes: Uint8Array): string {
  return base64.fromByteArray(bytes);
}

function fromBase64(value: string): Uint8Array {
  return base64.toByteArray(value);
}

/**
 * Scans for wearables advertising the Nordic UART service, mirroring the
 * Flutter `BleScanner`. Consumers call `start`/`stop` and subscribe to results.
 */
export class BleScanner {
  private manager = bleManager();

  /** Whether BLE is available and powered on. */
  async isReady(): Promise<{ ok: boolean; reason?: string }> {
    const state = await this.manager.state();
    if (state === BleState.Unsupported) {
      return { ok: false, reason: 'Bluetooth is not available on this device.' };
    }
    if (state === BleState.PoweredOff) {
      return { ok: false, reason: 'Bluetooth is turned off. Turn it on and try again.' };
    }
    return { ok: true };
  }

  /**
   * Scan and report matching devices. `filterToService` narrows results to the
   * UART service when the peripheral advertises the 128-bit UUID; some
   * CircuitPython builds omit it, so `startBroad` scans everything.
   *
   * Returns an unsubscribe that also stops the scan.
   */
  start(
    onDevice: Listener<Device>,
    filterToService = true,
    onError?: Listener<string>,
  ): Unsubscribe {
    // Make sure we're not already scanning (leftover from another screen), or
    // startDeviceScan can no-op / error on iOS.
    this.manager.stopDeviceScan();
    this.manager.startDeviceScan(
      filterToService ? [UartProtocol.service] : null,
      { allowDuplicates: false },
      (error, device) => {
        if (error) {
          onError?.(error.message);
          return;
        }
        if (device) onDevice(device);
      },
    );
    return () => this.manager.stopDeviceScan();
  }

  startBroad(onDevice: Listener<Device>, onError?: Listener<string>): Unsubscribe {
    return this.start(onDevice, false, onError);
  }

  /**
   * Peripherals iOS/Android already consider connected that expose the UART
   * service. A scan will NOT surface a device the OS thinks is still connected
   * (a common state after a previous, not-cleanly-closed session), so we ask
   * for these explicitly and fold them into the results.
   */
  async connectedWatches(): Promise<Device[]> {
    try {
      return await this.manager.connectedDevices([UartProtocol.service]);
    } catch {
      return [];
    }
  }

  stop(): void {
    this.manager.stopDeviceScan();
  }
}

/** Whether a scanned name looks like our wearable. */
export function isWatchName(name: string | null | undefined): boolean {
  if (!name) return false;
  return name.toLowerCase().startsWith(UartProtocol.deviceName.toLowerCase());
}

/** The advertised-service shape we care about (a subset of ble-plx's Device). */
export interface ScannedLike {
  name?: string | null;
  localName?: string | null;
  serviceUUIDs?: string[] | null;
}

/**
 * Whether a scan result is our wearable — matched by name OR by the Nordic UART
 * service UUID in its advertisement. The UUID match matters on iOS, where a
 * peripheral can advertise the service without a readable name in the initial
 * packet (which would otherwise make the watch invisible).
 */
export function isOurWatch(device: ScannedLike): boolean {
  if (isWatchName(device.name) || isWatchName(device.localName)) return true;
  const svcs = device.serviceUUIDs ?? [];
  return svcs.some(
    (u) => u.toLowerCase() === UartProtocol.service.toLowerCase(),
  );
}

/**
 * A `TwitchDevice` backed by a real BLE peripheral speaking the UART protocol.
 * Ported from `lib/services/ble_twitch_device.dart`.
 */
export class BleTwitchDevice implements TwitchDevice {
  private manager = bleManager();
  private device: Device;

  private connectionEmitter = new Emitter<DeviceConnection>();
  private sampleEmitter = new Emitter<DeviceSample>();
  private eventEmitter = new Emitter<TwitchEvent>();

  private rxUuid: string | null = null; // app -> device (write)
  private txSub: Subscription | null = null;
  private disconnectSub: Subscription | null = null;
  private rxSupportsWriteWithoutResponse = false;

  private _connection = DeviceConnection.disconnected;
  private rxBuffer = '';

  constructor(device: Device) {
    this.device = device;
  }

  get name(): string {
    return this.device.name && this.device.name.length > 0
      ? this.device.name
      : this.device.localName ?? 'Wearable';
  }

  get isSimulated(): boolean {
    return false;
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

    // Watch for the peer dropping the link.
    this.disconnectSub?.remove();
    this.disconnectSub = this.manager.onDeviceDisconnected(
      this.device.id,
      () => this.setConnection(DeviceConnection.disconnected),
    );

    this.device = await this.device.connect({ timeout: 15000 });
    await this.device.discoverAllServicesAndCharacteristics();
    await this.discover();
    this.setConnection(DeviceConnection.connected);
  }

  private async discover(): Promise<void> {
    const services = await this.device.services();
    const svc = services.find(
      (s) => s.uuid.toLowerCase() === UartProtocol.service.toLowerCase(),
    );
    if (!svc) {
      throw new Error('This device does not expose the UART service.');
    }
    const chars = await svc.characteristics();
    let tx: Characteristic | undefined;
    let rx: Characteristic | undefined;
    for (const c of chars) {
      const u = c.uuid.toLowerCase();
      if (u === UartProtocol.rxCharacteristic.toLowerCase()) rx = c;
      if (u === UartProtocol.txCharacteristic.toLowerCase()) tx = c;
    }
    if (!tx || !rx) {
      throw new Error('This device does not expose the UART service.');
    }
    this.rxUuid = rx.uuid;
    this.rxSupportsWriteWithoutResponse = rx.isWritableWithoutResponse;

    // Subscribe to notifications on TX (device -> app).
    this.txSub = this.device.monitorCharacteristicForService(
      svc.uuid,
      tx.uuid,
      (error, characteristic) => {
        if (error || !characteristic?.value) return;
        this.onData(fromBase64(characteristic.value));
      },
    );
  }

  private onData(bytes: Uint8Array): void {
    this.rxBuffer += utf8Decode(bytes);
    let nl = this.rxBuffer.indexOf('\n');
    while (nl >= 0) {
      const line = this.rxBuffer.substring(0, nl);
      const parsed = UartProtocol.parseLine(line);
      if (isSample(parsed)) this.sampleEmitter.emit(parsed);
      else if (isEvent(parsed)) this.eventEmitter.emit(parsed);
      this.rxBuffer = this.rxBuffer.substring(nl + 1);
      nl = this.rxBuffer.indexOf('\n');
    }
  }

  private async write(line: string): Promise<void> {
    if (this.rxUuid == null) return;
    const bytes = utf8Encode(line);
    // Chunk to a conservative 20-byte payload for broad stack compatibility,
    // matching the Flutter client and the firmware's RX handling.
    const chunk = 20;
    for (let i = 0; i < bytes.length; i += chunk) {
      const end = Math.min(i + chunk, bytes.length);
      const payload = toBase64(bytes.slice(i, end));
      if (this.rxSupportsWriteWithoutResponse) {
        await this.device.writeCharacteristicWithoutResponseForService(
          UartProtocol.service,
          this.rxUuid,
          payload,
        );
      } else {
        await this.device.writeCharacteristicWithResponseForService(
          UartProtocol.service,
          this.rxUuid,
          payload,
        );
      }
    }
  }

  setMode(mode: DeviceMode): Promise<void> {
    return this.write(UartProtocol.modeCommand(mode));
  }

  pushProfile(profile: BehaviorProfile): Promise<void> {
    return this.write(UartProtocol.configCommand(profile));
  }

  setAlertEnabled(enabled: boolean): Promise<void> {
    return this.write(UartProtocol.alertCommand(enabled));
  }

  async disconnect(): Promise<void> {
    this.txSub?.remove();
    this.txSub = null;
    try {
      await this.device.cancelConnection();
    } catch {
      // peer may already be gone
    }
    this.setConnection(DeviceConnection.disconnected);
  }

  dispose(): void {
    this.txSub?.remove();
    this.disconnectSub?.remove();
    this.connectionEmitter.clear();
    this.sampleEmitter.clear();
    this.eventEmitter.clear();
  }
}

/**
 * On Android 12+ the OS gates BLE scan/connect behind runtime permissions.
 * react-native-ble-plx can't request these itself, so the caller asks first.
 * (On iOS the Info.plist usage strings drive the system prompt automatically.)
 */
export async function ensureBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const sdk = Platform.Version as number;
  const perms: Permission[] =
    sdk >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const granted = await PermissionsAndroid.requestMultiple(perms);
  return Object.values(granted).every(
    (v) => v === PermissionsAndroid.RESULTS.GRANTED,
  );
}
