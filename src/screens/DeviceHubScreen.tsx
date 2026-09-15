import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { AppCard, OutlineButton, PrimaryButton, ScreenScrollView, StatusPill } from '../components/ui';
import type { BehaviorProfile } from '../models/behaviorProfile';
import { DeviceConnection } from '../services/twitchDevice';
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

  function addBehavior() {
    if (!c.isConnected) {
      Alert.alert('Connect first', 'Connect your wearable first.');
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
    <ScreenScrollView>
      {/* Connection card */}
      <AppCard borderColor={connected ? AppColors.greenBorder : AppColors.blueBorder}>
        <View style={styles.row}>
          <Text style={styles.bigIcon}>{connected ? '⌚' : '⌚'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>
              {connected ? c.deviceName : 'No wearable connected'}
            </Text>
            <Text style={styles.sub}>
              {connecting
                ? c.connectionStatus
                  : connected
                    ? 'Connected over Bluetooth'
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
              label={
                c.connection === DeviceConnection.connecting
                  ? 'Connecting…'
                  : c.searching
                    ? 'Searching…'
                    : 'Find my watch'
              }
              loading={connecting}
              disabled={connecting}
              onPress={findWatch}
            />
            <View style={{ height: 8 }} />
            <OutlineButton
              label="Choose a nearby device manually"
              onPress={() => nav.navigate('Scan')}
              disabled={connecting}
            />
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
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  bigIcon: { fontSize: 26, marginRight: 12 },
  title: { fontSize: 15, fontWeight: '800', color: AppColors.ink },
  sub: { fontSize: 11, lineHeight: 16, color: AppColors.sub, flexShrink: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: AppColors.ink },
  addLink: { fontSize: 14, fontWeight: '700', color: AppColors.green },
  useLink: { fontSize: 14, fontWeight: '700', color: AppColors.blue },
  emptyEmoji: { fontSize: 30, textAlign: 'center', marginBottom: 8 },
  emptyText: { fontSize: 12, color: AppColors.sub, textAlign: 'center', lineHeight: 17 },
  behaviorName: { fontSize: 14, fontWeight: '700', color: AppColors.ink },
});
