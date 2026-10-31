import { useNavigation } from '@react-navigation/native';
import React, { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { MotionVisualization } from '../components/MotionVisualization';
import { AppCard, OutlineButton, PrimaryButton, ScreenScrollView, StatusPill } from '../components/ui';
import { useAppController } from '../state/useAppController';
import { AppColors } from '../theme';
import type { Nav } from '../navigation';

export function MonitorScreen() {
  const c = useAppController();
  const nav = useNavigation<Nav<'Monitor'>>();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const active = c.activeProfile;

  async function updateTracking(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true; setBusy(true);
    try { await action(); }
    catch (error) { Alert.alert('Could not update tracking', error instanceof Error ? error.message : String(error)); }
    finally { pending.current = false; setBusy(false); }
  }

  if (!active) {
    return <ScreenScrollView><AppCard>
      <Text style={styles.title}>Let’s set up your first session</Text>
      <Text style={styles.description}>Connect your wearable and calibrate a behavior to see your live movement and detections here.</Text>
      <PrimaryButton label="Set up device & behavior" onPress={() => nav.navigate('DeviceHub')} />
    </AppCard></ScreenScrollView>;
  }

  return (
    <ScreenScrollView>
      <Text style={styles.eyebrow}>AWARENESS IN MOTION</Text>
      <Text style={styles.title}>Your live session</Text>
      <Text style={styles.description}>A little awareness goes a long way.</Text>
      <AppCard>
        <View style={styles.heading}>
          <View style={styles.behaviorIcon}><Text style={styles.emoji}>{active.emoji}</Text></View>
          <View style={styles.flex}><Text style={styles.behaviorName}>{active.name}</Text>
            <Text style={styles.sub}>{c.monitoring ? c.silentTracking ? 'Tracking silently · alerts muted' : 'Tracking with alerts' : c.isConnected ? 'Ready to start tracking' : 'Reconnect your wearable to continue'}</Text></View>
          <StatusPill label={c.monitoring ? 'Tracking' : 'Paused'} bg={AppColors.pillGreen} fg={AppColors.greenDark} />
        </View>
        <View style={styles.controls}>
          <View style={styles.flex}><PrimaryButton label={c.monitoring ? 'Pause tracking' : 'Start tracking'}
            disabled={busy || !c.isConnected} loading={busy}
            onPress={() => void updateTracking(() => c.monitoring ? c.stopMonitoring() : c.startMonitoring())} /></View>
          <Pressable accessibilityRole="switch" accessibilityLabel="Silent tracking" accessibilityState={{ checked: c.silentTracking, disabled: busy }}
            disabled={busy} onPress={() => void updateTracking(() => c.setSilentTracking(!c.silentTracking))}
            style={[styles.silentButton, c.silentTracking && styles.silentActive]}>
            <Text style={styles.silentIcon}>{c.silentTracking ? '🔇' : '🔔'}</Text><Text style={styles.silentLabel}>{c.silentTracking ? 'Silent' : 'Alerts'}</Text>
          </Pressable>
        </View>
        {!c.isConnected && <View style={styles.reconnect}><OutlineButton label="Reconnect wearable" onPress={() => nav.navigate('DeviceHub')} /></View>}
        <Text style={styles.sessionNote}>Tracking continues across app screens. Keep your watch connected. Today: {c.todayCount} detected touches.</Text>
      </AppCard>

      <MotionVisualization key={active.id} sample={c.lastSample} receivedAt={c.lastSampleAt}
        connected={c.isConnected} monitoring={c.monitoring} threshold={active.motionThreshold} />

      <AppCard style={styles.feed}>
        <View style={styles.heading}><Text style={styles.feedTitle}>Recent detections</Text><Text style={styles.sub}>Across behaviors</Text></View>
        {c.recentEvents.length === 0 ? <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🌿</Text><Text style={styles.emptyTitle}>A fresh start</Text>
          <Text style={styles.emptyText}>Confirmed detections will appear here as they happen during tracking.</Text>
        </View> : c.recentEvents.slice(0, 8).map((event, index) => (
          <View key={`${event.time}-${index}`} style={styles.eventRow}>
            <View style={styles.eventDot} /><View style={styles.flex}><Text style={styles.eventTitle}>Gesture detected</Text>
              <Text style={styles.sub}>{new Date(event.time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</Text></View>
            <Text style={styles.eventMotion}>{event.motion.toFixed(2)}<Text style={styles.sub}> rad/s</Text></Text>
          </View>
        ))}
      </AppCard>
      <View style={styles.settingsLink}><OutlineButton label="Manage behavior & alert preferences" onPress={() => nav.navigate('DeviceHub')} /></View>
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  eyebrow: { color: AppColors.sub, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  title: { color: AppColors.ink, fontSize: 28, fontWeight: '700', letterSpacing: -0.8 },
  description: { color: AppColors.sub, fontSize: 13, lineHeight: 21, marginTop: 8, marginBottom: 22 },
  heading: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  behaviorIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: AppColors.greenTintBg, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 23 },
  behaviorName: { fontSize: 15, fontWeight: '700', color: AppColors.ink },
  sub: { fontSize: 11, lineHeight: 17, color: AppColors.sub },
  controls: { flexDirection: 'row', alignItems: 'stretch', gap: 10, marginTop: 18 },
  silentButton: { minWidth: 68, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#f1f5f2', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#dbe7df', gap: 3 },
  silentActive: { backgroundColor: AppColors.pillGreen, borderColor: '#9fcab3' },
  silentIcon: { fontSize: 17 },
  silentLabel: { fontSize: 9, color: AppColors.greenDark, fontWeight: '700' },
  reconnect: { marginTop: 10 },
  sessionNote: { color: AppColors.sub, fontSize: 10, lineHeight: 16, marginTop: 12 },
  feed: { marginTop: 18 },
  feedTitle: { fontSize: 17, fontWeight: '700', color: AppColors.ink },
  empty: { alignItems: 'center', paddingVertical: 22, gap: 8 },
  emptyIcon: { fontSize: 28 },
  emptyTitle: { fontSize: 14, fontWeight: '600', color: AppColors.ink },
  emptyText: { fontSize: 12, lineHeight: 19, color: AppColors.sub, textAlign: 'center', maxWidth: 260 },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, borderBottomWidth: 1, borderColor: '#edf2ee' },
  eventDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#d88b76' },
  eventTitle: { fontSize: 12, fontWeight: '600', color: AppColors.ink },
  eventMotion: { fontSize: 13, fontWeight: '600', color: AppColors.ink, fontVariant: ['tabular-nums'] },
  settingsLink: { marginTop: 18 },
});
