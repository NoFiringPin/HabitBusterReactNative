import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { Device } from 'react-native-ble-plx';

import { AppCard, PrimaryButton, ScreenScrollView } from '../components/ui';
import {
  BleScanner,
  ensureBlePermissions,
  formatBleError,
  isOurWatch,
} from '../services/bleTwitchDevice';
import { UartProtocol } from '../services/twitchDevice';
import { appController } from '../state/appController';
import { AppColors } from '../theme';
import type { Nav } from '../navigation';

/**
 * Lets the user connect to a wearable over BLE.
 */
export function ScanScreen() {
  const nav = useNavigation<Nav<'Scan'>>();
  const scannerRef = useRef(new BleScanner());
  const stopRef = useRef<null | (() => void)>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deviceCountRef = useRef(0);
  const [devices, setDevices] = useState<Record<string, Device>>({});
  const [connecting, setConnecting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void beginScan();
    return () => {
      stopRef.current?.();
      scannerRef.current.stop();
      if (timeoutRef.current != null) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function beginScan() {
    stopRef.current?.();
    scannerRef.current.stop();
    if (timeoutRef.current != null) clearTimeout(timeoutRef.current);
    setError(null);
    setDevices({});
    deviceCountRef.current = 0;
    setScanning(true);
    const granted = await ensureBlePermissions();
    if (!granted) {
      setScanning(false);
      setError('Bluetooth permission is needed to scan. Enable it in Settings and try again.');
      return;
    }
    const ready = await scannerRef.current.isReady();
    if (!ready.ok) {
      setScanning(false);
      setError(ready.reason ?? 'Bluetooth is not ready.');
      return;
    }
    // Fold in any watch iOS already considers connected (a scan won't surface it).
    const known = await scannerRef.current.connectedWatches();
    if (known.length > 0) {
      setDevices((prev) => {
        const next = { ...prev };
        for (const d of known) next[d.id] = d;
        deviceCountRef.current = Object.keys(next).length;
        return next;
      });
    }
    stopRef.current = scannerRef.current.startBroad(
      (d) => {
        // Show named devices, plus any device advertising our UART service even
        // if it comes through unnamed (common for the watch on iOS).
        const hasUart = d.serviceUUIDs?.some(
          (uuid) => uuid.toLowerCase() === UartProtocol.service,
        );
        if (!d.name && !d.localName && !hasUart) return;
        setDevices((prev) => {
          const next = { ...prev, [d.id]: d };
          deviceCountRef.current = Object.keys(next).length;
          return next;
        });
      },
      (msg) => {
        setScanning(false);
        setError(`Scan error: ${msg}`);
      },
    );
    timeoutRef.current = setTimeout(() => {
      stopRef.current?.();
      setScanning(false);
      if (deviceCountRef.current === 0) {
        setError(
          `No devices found. Confirm the watch says “Advertising as '${UartProtocol.deviceName}'”, then scan again.`,
        );
      }
    }, 8000);
  }

  async function connectTo(device: Device) {
    setConnecting(true);
    setScanning(false);
    if (timeoutRef.current != null) clearTimeout(timeoutRef.current);
    scannerRef.current.stop();
    try {
      await appController.useBleDevice(device);
      await appController.connect();
      nav.goBack();
    } catch (e) {
      setConnecting(false);
      setError(`Connection failed: ${formatBleError(e)}`);
    }
  }

  if (connecting) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={AppColors.green} />
        <Text style={[styles.sub, { marginTop: 12 }]}>Connecting and verifying the data link…</Text>
      </View>
    );
  }

  const sorted = Object.values(devices).sort((a, b) => {
    // Pin our watch to the top, then sort by signal strength.
    const aw = isOurWatch(a) ? 1 : 0;
    const bw = isOurWatch(b) ? 1 : 0;
    if (aw !== bw) return bw - aw;
    return (b.rssi ?? -999) - (a.rssi ?? -999);
  });

  return (
    <ScreenScrollView>
      <Text style={styles.heading}>Nearby Bluetooth devices</Text>
      <Text style={styles.sub}>Choose FaceDefense. Other Adafruit UART devices may belong to your other apps.</Text>

      {error && (
        <AppCard style={{ marginTop: 10 }} borderColor="#ffc9d7" color="#fff2f6">
          <Text style={{ fontSize: 12, color: AppColors.red }}>{error}</Text>
        </AppCard>
      )}

      <View style={{ height: 10 }} />
      {sorted.length === 0 ? (
        <Text style={[styles.sub, { textAlign: 'center', marginTop: 24 }]}>
          {scanning ? 'Scanning…' : 'No nearby devices yet.'}
        </Text>
      ) : (
        sorted.map((r) => {
          const isWatch = isOurWatch(r);
          return (
            <AppCard
              key={r.id}
              style={{ marginBottom: 10 }}
              borderColor={isWatch ? AppColors.green : AppColors.greenBorder}
              borderWidth={isWatch ? 2 : 1.5}
            >
              <View style={styles.row}>
                <Text style={{ fontSize: 22, marginRight: 12 }}>⌚</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.deviceName}>
                    {r.localName || r.name || 'Unnamed UART device'}
                  </Text>
                  <Text style={styles.sub}>
                    {isWatch ? 'Your watch · ' : ''}signal {r.rssi ?? '?'} dBm
                  </Text>
                </View>
                <View style={{ width: 110 }}>
                  <PrimaryButton label="Connect" onPress={() => connectTo(r)} />
                </View>
              </View>
            </AppCard>
          );
        })
      )}

      <View style={{ height: 12 }} />
      <PrimaryButton
        label={scanning ? 'Scanning…' : 'Scan again'}
        loading={scanning}
        disabled={scanning}
        onPress={() => void beginScan()}
      />
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.bg },
  row: { flexDirection: 'row', alignItems: 'center' },
  deviceName: { fontSize: 14, fontWeight: '700', color: AppColors.ink },
  sub: { fontSize: 11, lineHeight: 16, color: AppColors.sub, flexShrink: 1 },
  heading: { fontSize: 16, fontWeight: '800', color: AppColors.ink },
});
