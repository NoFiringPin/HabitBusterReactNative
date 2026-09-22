import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { AppCard, OutlineButton, PrimaryButton, ScreenScrollView, StatusPill } from '../components/ui';
import type { BehaviorProfile } from '../models/behaviorProfile';
import { SOUND_LIBRARY } from '../services/soundLibrary';
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
  const [busy, setBusy] = useState(false);

  async function updateTracking(action: () => Promise<void>) {
    setBusy(true);
    try { await action(); }
    catch (error) {
      Alert.alert('Could not update tracking', error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  }

  async function testSound() {
    setBusy(true);
    try { await c.alerts.testSound(); }
    catch (error) {
      Alert.alert('Could not play sound', error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  }

  async function updatePassiveMode(next: boolean) {
    setBusy(true);
    try {
      const error = await appController.setPassiveMode(next);
      if (error != null) Alert.alert('Could not enable Passive mode', error);
    } finally { setBusy(false); }
  }

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
          c.monitoring
            ? 'Pause tracking'
            : canMonitor
              ? c.silentTracking ? 'Start silent tracking' : 'Start tracking with alerts'
            : c.isConnected
              ? 'Pick a behavior to monitor'
              : 'Connect a device to monitor'
        }
        color={AppColors.blue}
        disabled={busy || (!canMonitor && !c.monitoring)}
        onPress={() => void updateTracking(() => c.monitoring ? c.stopMonitoring() : c.startMonitoring())}
      />
      <Text style={[styles.sub, { marginTop: 8 }]}>
        {c.monitoring
          ? c.silentTracking ? 'Tracking silently. You can leave this screen.' : 'Tracking with alerts. You can leave this screen.'
          : 'Tracking paused.'}
        {' Keep the app open and the watch connected to record events.'}
      </Text>
      <View style={{ height: 8 }} />
      <OutlineButton label="Open live monitor" disabled={!canMonitor} onPress={() => nav.navigate('Monitor')} />

      <View style={{ height: 12 }} />
      <AppCard>
        <View style={styles.row}>
          <Text style={{ fontSize: 20, marginRight: 12 }}>
            {c.silentTracking ? '🔇' : '🔔'}
          </Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.behaviorName}>Silent tracking</Text>
            <Text style={styles.sub}>Count habits without vibration, sound, or the watch&apos;s red alert light.</Text>
          </View>
          <Switch
            value={c.silentTracking}
            disabled={busy}
            accessibilityLabel="Silent tracking"
            trackColor={{ true: AppColors.green }}
            onValueChange={(v) => void updateTracking(() => c.setSilentTracking(v))}
          />
        </View>
        <Text style={[styles.sub, { marginTop: 8 }]}>Turn off silent tracking for vibration and watch alerts.</Text>
        <View style={[styles.row, { marginTop: 14 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.behaviorName}>Phone sound</Text>
            <Text style={styles.sub}>
              {c.silentTracking ? 'Muted during silent tracking.' : 'Add a short chime when a habit is detected.'}
            </Text>
          </View>
          <Switch
            value={c.alerts.soundEnabled}
            disabled={busy || c.silentTracking}
            accessibilityLabel="Phone sound alerts"
            trackColor={{ true: AppColors.green }}
            onValueChange={(v) => void updateTracking(() => c.setSoundEnabled(v))}
          />
        </View>
        <View style={[styles.row, { marginTop: 10, flexWrap: 'wrap' }]}>
          {SOUND_LIBRARY.map((opt) => {
            const active = c.alerts.soundId === opt.id;
            return (
              <Pressable
                key={opt.id}
                disabled={busy || !c.alerts.soundEnabled}
                onPress={() => void updateTracking(() => c.setAlertSoundId(opt.id))}
                style={[
                  styles.soundChip,
                  active && styles.soundChipActive,
                  !c.alerts.soundEnabled && { opacity: 0.5 },
                ]}
              >
                <Text style={[styles.soundChipText, active && styles.soundChipTextActive]}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[styles.sub, { marginTop: 8 }]}>Sound follows your phone&apos;s volume; it plays even in silent mode. Test buttons play once, even during silent tracking.</Text>
        <View style={{ height: 10 }} />
        <OutlineButton label="Test sound" disabled={busy} onPress={() => void testSound()} />
        <View style={{ height: 8 }} />
        <OutlineButton
          label="Test vibration"
          onPress={() => appController.testAlert()}
        />
      </AppCard>

      <View style={{ height: 12 }} />
      <AppCard>
        <View style={styles.row}>
          <Text style={{ fontSize: 20, marginRight: 12 }}>{c.passiveMode ? '📳' : '🔕'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.behaviorName}>Passive mode</Text>
            <Text style={styles.sub}>
              Sends a phone notification when a habit is detected while HabitBuster is backgrounded or the phone is locked.
            </Text>
          </View>
          <Switch
            value={c.passiveMode}
            disabled={busy}
            accessibilityLabel="Passive mode"
            trackColor={{ true: AppColors.green }}
            onValueChange={(v) => void updatePassiveMode(v)}
          />
        </View>
        <Text style={[styles.sub, { marginTop: 8 }]}>
          Works independently of silent tracking. Delivery while backgrounded isn&apos;t fully guaranteed by iOS.
        </Text>
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
  soundChip: {
    borderWidth: 1, borderColor: '#e4e8ee', borderRadius: 16,
    paddingVertical: 6, paddingHorizontal: 14, marginRight: 8, marginTop: 4,
  },
  soundChipActive: { borderColor: AppColors.green, backgroundColor: AppColors.pillGreen },
  soundChipText: { fontSize: 12, fontWeight: '600', color: AppColors.sub },
  soundChipTextActive: { color: AppColors.greenDark },
});
