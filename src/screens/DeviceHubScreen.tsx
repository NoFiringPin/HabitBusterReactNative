import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { AppCard, OutlineButton, PrimaryButton, StatusPill } from '../components/ui';
import type { BehaviorProfile } from '../models/behaviorProfile';
import { DeviceConnection, UartProtocol } from '../services/twitchDevice';
import { appController } from '../state/appController';
import { useAppController } from '../state/useAppController';
import { AppColors } from '../theme';
import type { Nav } from '../navigation';

/**
 * The control center for the wearable: connect, manage calibrated behaviors,
 * and jump into live monitoring. Ported from `lib/screens/device_hub.dart`.
 */
export function DeviceHubScreen() {
  const c = useAppController();
  const nav = useNavigation<Nav<'DeviceHub'>>();

  const connected = c.isConnected;
  const connecting = c.connection === DeviceConnection.connecting || c.searching;

  async function findWatch() {
    const error = await appController.connectToWatch();
    if (error == null) return;
    Alert.alert('Could not connect', error, [
      { text: 'Choose manually', onPress: () => nav.navigate('Scan') },
      { text: 'OK', style: 'cancel' },
    ]);
  }

  async function useSimulator() {
    await appController.useSimulator();
    await appController.connect();
  }

  function addBehavior() {
    if (!c.isConnected) {
      Alert.alert('Connect first', 'Connect a device (or the simulator) first.');
      return;
    }
    nav.navigate('Calibrate');
  }

  function confirmDelete(p: BehaviorProfile) {
    Alert.alert(`Delete "${p.name}"?`, 'This removes the calibrated profile.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void appController.deleteProfile(p.id),
      },
    ]);
  }

  const canMonitor = c.isConnected && c.activeProfile != null;

  return (
    <ScrollView
      style={{ backgroundColor: AppColors.bg }}
      contentContainerStyle={styles.container}
    >
      {/* Connection card */}
      <AppCard borderColor={connected ? AppColors.greenBorder : AppColors.blueBorder}>
        <View style={styles.row}>
          <Text style={styles.bigIcon}>{connected ? '⌚' : '⌚'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>
              {connected ? c.deviceName : 'No wearable connected'}
            </Text>
            <Text style={styles.sub}>
              {c.searching
                ? `Searching for your ${UartProtocol.deviceName} watch…`
                : connecting
                  ? 'Connecting…'
                  : connected
                    ? c.isSimulated
                      ? 'Simulated device'
                      : 'Connected over Bluetooth'
                    : 'Connect to calibrate and detect'}
            </Text>
          </View>
          {connected && <StatusPill label="Live" bg={AppColors.pillGreen} fg={AppColors.greenDark} dot />}
        </View>

        <View style={{ height: 14 }} />

        {connected ? (
          <OutlineButton label="Disconnect" color={AppColors.red} onPress={() => void appController.disconnect()} />
        ) : (
          <>
            <PrimaryButton
              label={c.searching ? 'Searching…' : 'Find my watch'}
              loading={c.searching}
              disabled={connecting}
              onPress={findWatch}
            />
            <View style={{ height: 8 }} />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <OutlineButton label="Use simulator" onPress={useSimulator} disabled={connecting} />
              </View>
              <View style={{ width: 10 }} />
              <View style={{ flex: 1 }}>
                <OutlineButton label="Choose manually" onPress={() => nav.navigate('Scan')} disabled={connecting} />
              </View>
            </View>
          </>
        )}
      </AppCard>

      {/* Behaviors header */}
      <View style={[styles.row, { marginTop: 18, marginBottom: 10 }]}>
        <Text style={styles.sectionTitle}>Your behaviors</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={addBehavior}>
          <Text style={styles.addLink}>＋ Add</Text>
        </Pressable>
      </View>

      {c.profiles.length === 0 ? (
        <AppCard>
          <Text style={styles.emptyEmoji}>🧠</Text>
          <Text style={styles.emptyText}>
            No behaviors yet. Calibrate the first one so the watch knows what to
            watch for — nail biting, face scratching, hair pulling, anything.
          </Text>
        </AppCard>
      ) : (
        c.profiles.map((p) => {
          const active = p.id === c.activeProfileId;
          return (
            <AppCard
              key={p.id}
              style={{ marginBottom: 10 }}
              borderColor={active ? AppColors.green : '#e4e8ee'}
              borderWidth={active ? 2 : 1}
            >
              <View style={styles.row}>
                <Text style={{ fontSize: 26 }}>{p.emoji}</Text>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.behaviorName}>{p.name}</Text>
                  <Text style={styles.sub}>
                    {`motion > ${p.motionThreshold} `}
                    {p.orientationGate
                      ? `· face zone ${p.pitchMin.toFixed(0)}–${p.pitchMax.toFixed(0)}°`
                      : '· any position'}
                  </Text>
                </View>
                {active ? (
                  <StatusPill label="Active" bg={AppColors.pillGreen} fg={AppColors.greenDark} />
                ) : (
                  <Pressable onPress={() => void appController.setActiveProfile(p.id)}>
                    <Text style={styles.useLink}>Use</Text>
                  </Pressable>
                )}
                <Pressable onPress={() => confirmDelete(p)} style={{ marginLeft: 12 }}>
                  <Text style={{ fontSize: 18, color: AppColors.sub }}>🗑</Text>
                </Pressable>
              </View>
            </AppCard>
          );
        })
      )}

      <View style={{ height: 18 }} />
      <PrimaryButton
        label={
          canMonitor
            ? 'Start live monitoring'
            : c.isConnected
              ? 'Pick a behavior to monitor'
              : 'Connect a device to monitor'
        }
        color={AppColors.blue}
        disabled={!canMonitor}
        onPress={() => nav.navigate('Monitor')}
      />

      <View style={{ height: 12 }} />
      <AppCard>
        <View style={styles.row}>
          <Text style={{ fontSize: 20, marginRight: 12 }}>
            {c.alerts.enabled ? '🔊' : '🔇'}
          </Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.behaviorName}>Annoying alert</Text>
            <Text style={styles.sub}>Vibrate the phone when a twitch is caught.</Text>
          </View>
          <Switch
            value={c.alerts.enabled}
            trackColor={{ true: AppColors.green }}
            onValueChange={(v) => void appController.setAlertsEnabled(v)}
          />
        </View>
        <View style={{ height: 10 }} />
        <OutlineButton
          label="Test vibration"
          onPress={() => appController.testAlert()}
        />
      </AppCard>
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center' },
  bigIcon: { fontSize: 26, marginRight: 12 },
  title: { fontSize: 15, fontWeight: '800', color: AppColors.ink },
  sub: { fontSize: 11, color: AppColors.sub },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: AppColors.ink },
  addLink: { fontSize: 14, fontWeight: '700', color: AppColors.green },
  useLink: { fontSize: 14, fontWeight: '700', color: AppColors.blue },
  emptyEmoji: { fontSize: 30, textAlign: 'center', marginBottom: 8 },
  emptyText: { fontSize: 12, color: AppColors.sub, textAlign: 'center', lineHeight: 17 },
  behaviorName: { fontSize: 14, fontWeight: '700', color: AppColors.ink },
});
