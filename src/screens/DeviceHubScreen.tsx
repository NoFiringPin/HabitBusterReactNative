import { useNavigation } from '@react-navigation/native';
import React, { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { AppCard, OutlineButton, PrimaryButton, ScreenScrollView, StatusPill } from '../components/ui';
import type { BehaviorProfile } from '../models/behaviorProfile';
import { SOUND_LIBRARY } from '../services/soundLibrary';
import { DeviceConnection } from '../services/twitchDevice';
import { useAppController } from '../state/useAppController';
import { AppColors } from '../theme';
import type { Nav } from '../navigation';

export function DeviceHubScreen() {
  const c = useAppController();
  const nav = useNavigation<Nav<'DeviceHub'>>();
  const [operation, setOperation] = useState<string | null>(null);
  const [showPreferences, setShowPreferences] = useState(false);
  const [details, setDetails] = useState<string | null>(null);
  const lock = useRef(false);
  const connected = c.isConnected;
  const connecting = c.searching || c.connection === DeviceConnection.connecting;
  const busy = operation !== null || connecting;
  const active = c.activeProfile;
  const canTrack = connected && active !== null;

  async function run(name: string, action: () => Promise<void> | void) {
    if (lock.current) return;
    lock.current = true; setOperation(name);
    try { await action(); }
    catch (error) { Alert.alert('Could not complete that action', error instanceof Error ? error.message : String(error)); }
    finally { lock.current = false; setOperation(null); }
  }

  function findWatch() {
    void run('connect', async () => {
      const error = await c.connectToWatch();
      if (error) Alert.alert('Could not connect', error, [
        { text: 'Choose manually', onPress: () => nav.navigate('Scan') },
        { text: 'OK', style: 'cancel' },
      ]);
    });
  }

  function disconnect() {
    if (!c.monitoring) { void run('disconnect', () => c.disconnect()); return; }
    Alert.alert('Disconnect your wearable?', 'Your tracking session will pause. Saved activity and earned badges stay on your phone.', [
      { text: 'Keep tracking', style: 'cancel' },
      { text: 'Disconnect', onPress: () => void run('disconnect', () => c.disconnect()) },
    ]);
  }

  function remove(profile: BehaviorProfile) {
    Alert.alert(`Remove ${profile.name}?`, 'This removes its calibration. If this behavior is being tracked, tracking will pause.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void run('profile', () => c.deleteProfile(profile.id)) },
    ]);
  }

  return (
    <ScreenScrollView>
      <Text style={styles.eyebrow}>YOUR TRACKING TOOLKIT</Text>
      <Text style={styles.pageTitle}>Set up your rhythm</Text>
      <Text style={styles.intro}>One wearable. One behavior. A little more awareness.</Text>
      <View style={styles.steps}>
        {[{ label: 'Connect', done: connected }, { label: 'Choose', done: !!active }, { label: 'Track', done: c.monitoring }].map((step, index) => (
          <View key={step.label} style={[styles.step, step.done && styles.stepDone]}>
            <Text style={[styles.stepNumber, step.done && styles.stepDoneText]}>{step.done ? '✓' : index + 1}</Text>
            <Text style={[styles.stepLabel, step.done && styles.stepDoneText]}>{step.label}</Text>
          </View>
        ))}
      </View>

      <AppCard>
        <View style={styles.sectionHeading}><Text style={styles.sectionEyebrow}>01 / YOUR WEARABLE</Text>
          <StatusPill label={connecting ? 'Connecting' : connected ? 'Connected' : 'Offline'} bg={connected ? AppColors.pillGreen : '#edf1ee'} fg={AppColors.greenDark} dot />
        </View>
        <View style={styles.deviceHeading}>
          <View style={[styles.deviceIcon, connected && styles.deviceReady]}><Text style={styles.watch}>⌚</Text></View>
          <View style={styles.flex}><Text style={styles.deviceTitle}>{connected ? c.deviceName : connecting ? 'Finding your wearable' : 'Your watch, your companion'}</Text>
            <Text accessibilityLiveRegion="polite" style={styles.sub}>{connecting ? c.connectionStatus : connected ? 'Bluetooth link ready. Your next step is below.' : 'Power on your FaceDefense watch and keep it nearby.'}</Text></View>
        </View>
        {connected ? (
          <Pressable accessibilityRole="button" disabled={busy} onPress={disconnect} style={styles.textButton}>
            <Text style={[styles.secondaryLink, busy && styles.dim]}>{operation === 'disconnect' ? 'Disconnecting…' : 'Disconnect wearable'}</Text>
          </Pressable>
        ) : <>
          <PrimaryButton label={connecting ? 'Connecting to your watch…' : 'Find my watch'} loading={connecting || operation === 'connect'} disabled={busy} onPress={findWatch} />
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => nav.navigate('Scan')} style={styles.textButton}><Text style={[styles.secondaryLink, busy && styles.dim]}>Choose a nearby device manually →</Text></Pressable>
        </>}
      </AppCard>

      <View style={styles.behaviorsHeading}>
        <View><Text style={styles.sectionEyebrow}>02 / YOUR BEHAVIORS</Text><Text style={styles.sectionTitle}>What are you working on?</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Calibrate a new behavior" disabled={busy || !connected}
          onPress={() => nav.navigate('Calibrate')} style={[styles.addButton, (busy || !connected) && styles.dim]}><Text style={styles.addText}>＋ Add</Text></Pressable>
      </View>
      <Text style={styles.selectionHint}>{!connected ? 'Saved behaviors stay here. Connect your watch to add a new one.' : c.monitoring ? 'Switching behaviors pauses the current session.' : 'Choose one behavior to track. You can change it anytime.'}</Text>
      {c.profiles.length === 0 ? <AppCard>
        <View style={styles.empty}><Text style={styles.emptyIcon}>🌱</Text><Text style={styles.emptyTitle}>Start with one small change</Text>
          <Text style={styles.emptyText}>Calibrate a gesture, like nail biting or face touching, so your watch learns what to notice.</Text></View>
        <PrimaryButton label={connected ? 'Calibrate your first behavior' : 'Connect your watch to begin'} disabled={busy}
          onPress={connected ? () => nav.navigate('Calibrate') : findWatch} />
      </AppCard> : <View accessibilityRole="radiogroup" accessibilityLabel="Behavior to track" style={styles.profileList}>
        {c.profiles.map((profile) => {
          const selected = profile.id === c.activeProfileId;
          const expanded = details === profile.id;
          return <AppCard key={profile.id} style={selected ? styles.selectedProfile : undefined} borderColor={selected ? '#82b79c' : AppColors.greenBorder} color={selected ? '#f0f7f2' : '#fff'}>
            <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: busy }} disabled={busy || selected}
              onPress={() => void run('profile', () => c.setActiveProfile(profile.id))} style={styles.profileRow}>
              <View style={styles.profileEmoji}><Text style={styles.profileSymbol}>{profile.emoji}</Text></View>
              <View style={styles.flex}><Text style={styles.profileName}>{profile.name}</Text><Text style={styles.sub}>{selected ? 'Selected for tracking' : 'Tap to select this behavior'}</Text></View>
              <View style={[styles.radio, selected && styles.radioSelected]}>{selected && <View style={styles.radioDot} />}</View>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setDetails(expanded ? null : profile.id)} style={styles.detailButton}>
              <Text style={styles.detailLink}>Calibration details {expanded ? '−' : '+'}</Text>
            </Pressable>
            {expanded && <View style={styles.details}>
              <Text style={styles.sub}>Motion threshold: {profile.motionThreshold.toFixed(2)} rad/s</Text>
              <Text style={styles.sub}>{profile.orientationGate ? `Pitch range: ${profile.pitchMin.toFixed(0)}° to ${profile.pitchMax.toFixed(0)}°` : 'Detects at any wrist position'}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${profile.name}`} disabled={busy} onPress={() => remove(profile)} style={styles.textButton}><Text style={styles.removeText}>Remove behavior</Text></Pressable>
            </View>}
          </AppCard>;
        })}
      </View>}

      <AppCard style={styles.trackingCard} color="#123f35" borderColor="#123f35">
        <Text style={styles.trackingEyebrow}>03 / YOUR SESSION</Text>
        <Text style={styles.trackingTitle}>{c.monitoring ? 'You’re building awareness.' : canTrack ? 'Ready for a fresh start?' : 'A few small steps to go.'}</Text>
        <Text style={styles.trackingDescription}>{active ? `${active.emoji} ${active.name} · ${c.silentTracking ? 'Silent tracking' : 'Tracking with alerts'}` : 'Choose a calibrated behavior above to begin.'}</Text>
        <PrimaryButton label={c.monitoring ? 'Pause tracking' : !connected ? 'Connect your watch first' : !active ? 'Choose a behavior first' : 'Start tracking'}
          loading={operation === 'tracking'} disabled={busy || !canTrack}
          onPress={() => void run('tracking', () => c.monitoring ? c.stopMonitoring() : c.startMonitoring())} />
        <Pressable accessibilityRole="button" disabled={!canTrack || busy} onPress={() => nav.navigate('Monitor')}
          style={[styles.textButton, (!canTrack || busy) && styles.dim]}><Text style={styles.liveLink}>View live movement ↗</Text></Pressable>
        <Text style={styles.trackingNote}>Tracking continues across app screens. Keep your watch connected to record activity.</Text>
      </AppCard>

      <AppCard style={styles.preferences}>
        <Pressable accessibilityRole="button" accessibilityLabel="Alert preferences" accessibilityState={{ expanded: showPreferences }} onPress={() => setShowPreferences(!showPreferences)} style={styles.preferenceHeading}>
          <View style={styles.flex}><Text style={styles.sectionTitle}>Make it feel right</Text><Text style={styles.sub}>{c.silentTracking ? 'Silent tracking' : 'Watch & vibration alerts'} · {c.passiveMode ? 'Background alerts on' : 'Background alerts off'}</Text></View>
          <Text style={styles.expand}>{showPreferences ? '−' : '+'}</Text>
        </Pressable>
        {!showPreferences && <Text style={styles.collapsedHint}>Tap to customize sound, vibration, and notifications.</Text>}
        {showPreferences && <View style={styles.preferenceBody}>
          <Toggle label="Silent tracking" description="Record detections without phone vibration, sound, or the watch’s red alert light."
            value={c.silentTracking} disabled={busy} onChange={(value) => void run('settings', () => c.setSilentTracking(value))} />
          <Toggle label="Phone sound" description={c.silentTracking ? 'Muted while silent tracking is on. Your preference stays saved.' : 'Play a short sound when your watch detects a gesture.'}
            value={c.alerts.soundEnabled} disabled={busy || c.silentTracking} onChange={(value) => void run('settings', () => c.setSoundEnabled(value))} />
          {c.alerts.soundEnabled && !c.silentTracking && <View accessibilityRole="radiogroup" accessibilityLabel="Detection sound" style={styles.soundOptions}>
            {SOUND_LIBRARY.map((option) => <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ checked: c.alerts.soundId === option.id, disabled: busy }} disabled={busy}
              onPress={() => void run('settings', () => c.setAlertSoundId(option.id))} style={[styles.soundChip, c.alerts.soundId === option.id && styles.selectedSound]}>
              <Text style={styles.soundText}>{c.alerts.soundId === option.id ? '✓ ' : ''}{option.label}</Text></Pressable>)}
          </View>}
          <View style={styles.previewActions}>
            <View style={styles.flex}><OutlineButton label="Test sound" disabled={busy} color={AppColors.greenDark} onPress={() => void run('sound', () => c.alerts.testSound())} /></View>
            <View style={styles.flex}><OutlineButton label="Test vibration" disabled={busy} color={AppColors.greenDark} onPress={() => void run('vibration', () => c.testAlert())} /></View>
          </View>
          <Text style={styles.previewNote}>Tests play once, even during silent tracking. Sound uses your phone’s volume and can play with its silent switch on.</Text>
          <Toggle label="Background notifications" description="Get a notification when a gesture is detected with the app in the background or your phone locked."
            value={c.passiveMode} disabled={busy} onChange={(value) => void run('settings', async () => {
              const error = await c.setPassiveMode(value); if (error) throw new Error(error);
            })} />
          <Text style={styles.previewNote}>Independent of silent tracking. Background delivery depends on your phone’s operating system and Bluetooth connection.</Text>
        </View>}
      </AppCard>
    </ScreenScrollView>
  );
}

function Toggle({ label, description, value, disabled, onChange }: { label: string; description: string; value: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return <View style={styles.toggleRow}><View style={styles.flex}><Text style={styles.toggleLabel}>{label}</Text><Text style={styles.sub}>{description}</Text></View>
    <Switch value={value} disabled={disabled} accessibilityLabel={label} accessibilityHint={description} trackColor={{ true: AppColors.green }} onValueChange={onChange} />
  </View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  eyebrow: { fontSize: 10, letterSpacing: 1.5, fontWeight: '700', color: AppColors.sub, marginBottom: 8 },
  pageTitle: { fontSize: 28, letterSpacing: -0.8, fontWeight: '700', color: AppColors.ink },
  intro: { fontSize: 13, lineHeight: 21, color: AppColors.sub, marginTop: 8 },
  steps: { flexDirection: 'row', gap: 8, marginVertical: 22 },
  step: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, minHeight: 38, borderRadius: 12, backgroundColor: '#e9efeb' },
  stepDone: { backgroundColor: '#deeee3' },
  stepNumber: { fontSize: 11, fontWeight: '800', color: AppColors.sub },
  stepLabel: { fontSize: 11, fontWeight: '600', color: AppColors.sub },
  stepDoneText: { color: AppColors.greenDark },
  sectionHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sectionEyebrow: { fontSize: 9, fontWeight: '700', letterSpacing: 1.3, color: AppColors.sub },
  deviceHeading: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, marginBottom: 18 },
  deviceIcon: { width: 58, height: 58, borderRadius: 19, backgroundColor: '#edf2ee', alignItems: 'center', justifyContent: 'center' },
  deviceReady: { backgroundColor: AppColors.pillGreen },
  watch: { fontSize: 30 },
  deviceTitle: { fontSize: 16, fontWeight: '700', color: AppColors.ink, marginBottom: 5 },
  sub: { fontSize: 11, lineHeight: 17, color: AppColors.sub, marginTop: 3 },
  textButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  secondaryLink: { fontSize: 11, fontWeight: '600', color: AppColors.sub },
  dim: { opacity: 0.4 },
  behaviorsHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 26 },
  sectionTitle: { fontSize: 18, fontWeight: '700', letterSpacing: -0.4, color: AppColors.ink, marginTop: 5 },
  addButton: { minHeight: 44, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#deeee3' },
  addText: { fontSize: 12, fontWeight: '700', color: AppColors.greenDark },
  selectionHint: { fontSize: 11, color: AppColors.sub, lineHeight: 17, marginTop: 8, marginBottom: 14 },
  empty: { alignItems: 'center', gap: 10, paddingBottom: 20, paddingTop: 8 },
  emptyIcon: { fontSize: 30 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: AppColors.ink },
  emptyText: { fontSize: 12, lineHeight: 19, textAlign: 'center', color: AppColors.sub, maxWidth: 280 },
  profileList: { gap: 10 },
  selectedProfile: { borderWidth: 1.5 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  profileEmoji: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#edf3ee', alignItems: 'center', justifyContent: 'center' },
  profileSymbol: { fontSize: 24 },
  profileName: { fontSize: 15, fontWeight: '700', color: AppColors.ink },
  radio: { width: 22, height: 22, borderWidth: 1.5, borderRadius: 11, borderColor: '#b7c9bd', alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: AppColors.green },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: AppColors.green },
  detailButton: { minHeight: 44, justifyContent: 'center', alignItems: 'flex-start', paddingTop: 8 },
  detailLink: { fontSize: 10, fontWeight: '600', color: AppColors.sub },
  details: { paddingTop: 10, borderTopWidth: 1, borderColor: '#dae7de' },
  removeText: { fontSize: 12, fontWeight: '600', color: '#a12c4b' },
  trackingCard: { marginTop: 24 },
  trackingEyebrow: { fontSize: 9, color: '#b9d0c3', fontWeight: '600', letterSpacing: 1.5 },
  trackingTitle: { color: '#f4f8ef', fontSize: 22, fontWeight: '600', lineHeight: 29, letterSpacing: -0.6, marginTop: 12 },
  trackingDescription: { color: '#bed6c8', fontSize: 12, lineHeight: 19, marginTop: 10, marginBottom: 20 },
  liveLink: { fontSize: 12, color: '#d9edb5', fontWeight: '700' },
  trackingNote: { fontSize: 10, lineHeight: 16, color: '#bed6c8', marginTop: 4 },
  preferences: { marginTop: 20 },
  preferenceHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56 },
  expand: { fontSize: 24, color: AppColors.greenDark, width: 30, textAlign: 'center' },
  collapsedHint: { fontSize: 10, lineHeight: 16, color: AppColors.sub, marginTop: 10 },
  preferenceBody: { marginTop: 10 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, borderTopWidth: 1, borderColor: '#e6eee8' },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: AppColors.ink },
  soundOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  soundChip: { minHeight: 44, borderRadius: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: '#d6e4da', alignItems: 'center', justifyContent: 'center' },
  selectedSound: { backgroundColor: AppColors.pillGreen, borderColor: AppColors.green },
  soundText: { color: AppColors.greenDark, fontSize: 12, fontWeight: '600' },
  previewActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  previewNote: { fontSize: 10, lineHeight: 16, color: AppColors.sub, marginTop: 10, marginBottom: 12 },
});
