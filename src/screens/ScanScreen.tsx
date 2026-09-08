import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { Device } from 'react-native-ble-plx';

import { AppCard, PrimaryButton } from '../components/ui';
import {
  BleScanner,
  ensureBlePermissions,
} from '../services/bleTwitchDevice';
import { appController } from '../state/appController';
import { AppColors } from '../theme';
import type { Nav } from '../navigation';

/**
 * Lets the user connect to a real wearable over BLE, or fall back to the
 * built-in simulator. Ported from `lib/screens/scan_screen.dart`.
 */
export function ScanScreen() {
  const nav = useNavigation<Nav<'Scan'>>();
  const scannerRef = useRef(new BleScanner());
  const stopRef = useRef<null | (() => void)>(null);
  const [devices, setDevices] = useState<Record<string, Device>>({});
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void beginScan();
    return () => {
      stopRef.current?.();
      scannerRef.current.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function beginScan() {
    setError(null);
    setDevices({});
    const granted = await ensureBlePermissions();
    if (!granted) {
      setError('Bluetooth permission is needed to scan. You can still use the simulator below.');
      return;
    }
    const ready = await scannerRef.current.isReady();
    if (!ready.ok) {
      setError(`${ready.reason} You can still use the simulator below.`);
      return;
    }
    stopRef.current = scannerRef.current.startBroad((d) => {
      if (!d.name && !d.localName) return; // only show named devices
      setDevices((prev) => ({ ...prev, [d.id]: d }));
    });
  }

  async function connectTo(device: Device) {
    setConnecting(true);
    scannerRef.current.stop();
    try {
      await appController.useBleDevice(device);
      await appController.connect();
      nav.goBack();
    } catch (e) {
      setConnecting(false);
      setError(`Connection failed: ${String(e)}`);
    }
  }

  async function useSimulator() {
    setConnecting(true);
    await appController.useSimulator();
    await appController.connect();
    nav.goBack();
  }

  if (connecting) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={AppColors.green} />
      </View>
    );
  }

  const sorted = Object.values(devices).sort(
    (a, b) => (b.rssi ?? -999) - (a.rssi ?? -999),
  );

  return (
    <ScrollView
      style={{ backgroundColor: AppColors.bg }}
      contentContainerStyle={styles.container}
    >
      <AppCard borderColor={AppColors.blueBorder}>
        <View style={styles.row}>
          <Text style={{ fontSize: 28, marginRight: 12 }}>💾</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Use the simulator</Text>
            <Text style={styles.sub}>
              Try the full calibrate → detect loop with no hardware.
            </Text>
          </View>
          <View style={{ width: 90 }}>
            <PrimaryButton label="Start" color={AppColors.blue} onPress={useSimulator} />
          </View>
        </View>
      </AppCard>

      <Text style={styles.heading}>Nearby Bluetooth devices</Text>
      <Text style={styles.sub}>Your wearable advertises as a Nordic UART device.</Text>

      {error && (
        <AppCard style={{ marginTop: 10 }} borderColor="#ffc9d7" color="#fff2f6">
          <Text style={{ fontSize: 12, color: AppColors.red }}>{error}</Text>
        </AppCard>
      )}

      <View style={{ height: 10 }} />
      {sorted.length === 0 ? (
        <Text style={[styles.sub, { textAlign: 'center', marginTop: 24 }]}>Scanning…</Text>
      ) : (
        sorted.map((r) => (
          <AppCard key={r.id} style={{ marginBottom: 10 }}>
            <View style={styles.row}>
              <Text style={{ fontSize: 22, marginRight: 12 }}>⌚</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.deviceName}>{r.name ?? r.localName}</Text>
                <Text style={styles.sub}>signal {r.rssi ?? '?'} dBm</Text>
              </View>
              <View style={{ width: 110 }}>
                <PrimaryButton label="Connect" onPress={() => connectTo(r)} />
              </View>
            </View>
          </AppCard>
        ))
      )}
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.bg },
  row: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '800', color: AppColors.ink },
  deviceName: { fontSize: 14, fontWeight: '700', color: AppColors.ink },
  sub: { fontSize: 11, color: AppColors.sub },
  heading: { fontSize: 13, fontWeight: '700', color: AppColors.ink, marginTop: 18 },
});
