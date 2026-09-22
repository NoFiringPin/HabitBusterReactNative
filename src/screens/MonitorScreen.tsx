import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppCard, ScreenScrollView } from '../components/ui';
import { appController } from '../state/appController';
import { useAppController } from '../state/useAppController';
import { AppColors } from '../theme';

/**
 * Live view while the wearable is actively watching for the selected behavior:
 * a big calm/alert status, live sensor readouts, and an event feed.
 * Ported from `lib/screens/monitor_screen.dart`.
 */
export function MonitorScreen() {
  const c = useAppController();

  const [busy, setBusy] = useState(false);

  // Tracking belongs to the controller and continues across screen changes.
  async function updateTracking(action: () => Promise<void>) {
    setBusy(true);
    try { await action(); }
    catch (error) {
      Alert.alert('Could not update tracking', error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  }

  const active = c.activeProfile;
  if (active == null) {
    return (
      <View style={styles.center}>
        <Text style={[styles.sub, { textAlign: 'center' }]}>
          Calibrate a behavior first, then come back to watch for it.
        </Text>
      </View>
    );
  }

  const sample = c.lastSample;
  const flagged = sample?.flagged ?? false;
  const motion = sample?.motion ?? 0;
  const pitch = sample?.pitch ?? 0;
  const threshold = active.motionThreshold;
  const color = flagged ? AppColors.red : AppColors.green;

  const max = threshold * 2.2;
  const frac = Math.min(Math.max(motion / max, 0), 1);
  const threshFrac = Math.min(Math.max(threshold / max, 0), 1);
  const over = motion > threshold;

  return (
    <ScreenScrollView>
      {/* Status circle */}
      <View style={{ alignItems: 'center' }}>
        <View style={[styles.statusCircle, { borderColor: color, backgroundColor: color + '1f' }]}>
          <Text style={{ fontSize: 46 }}>{flagged ? '⚠️' : active.emoji}</Text>
          <Text style={[styles.statusText, { color }]}>{flagged ? 'Caught it!' : 'All calm'}</Text>
        </View>
        <Text style={styles.watching}>Watching: {active.name}</Text>
        <Text style={styles.sub}>
          {c.monitoring ? c.silentTracking ? 'Silent tracking · alerts muted' : 'Tracking with alerts' : 'Paused'}
        </Text>
      </View>

      {/* Live readout */}
      <AppCard style={{ marginTop: 18 }} borderColor={AppColors.blueBorder}>
        <View style={styles.barHead}>
          <Text style={styles.barLabel}>Motion energy</Text>
          <Text style={[styles.barValue, { color: over ? AppColors.red : AppColors.green }]}>
            {motion.toFixed(2)} rad/s
          </Text>
        </View>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${frac * 100}%`, backgroundColor: over ? AppColors.red : AppColors.green }]} />
          <View style={[styles.threshMark, { left: `${threshFrac * 100}%` }]} />
        </View>
        <Text style={[styles.sub, { fontSize: 9, marginTop: 2 }]}>
          The dark line is your detection threshold.
        </Text>

        <View style={[styles.row, { marginTop: 14 }]}>
          <Stat label="Wrist pitch" value={`${pitch.toFixed(0)}°`} />
          <Stat label="Threshold" value={threshold.toFixed(2)} />
          <Stat label="Today" value={`${c.todayCount}`} />
        </View>
      </AppCard>

      {/* Controls */}
      <View style={[styles.row, { marginTop: 16 }]}>
        <View style={{ flex: 1 }}>
          <Pressable
            disabled={busy || !c.isConnected}
            onPress={() =>
              void updateTracking(() => c.monitoring ? c.stopMonitoring() : c.startMonitoring())
            }
            style={[styles.ctrlBtn, { backgroundColor: c.monitoring ? '#b0b7c3' : AppColors.green }]}
          >
            <Text style={styles.ctrlBtnText}>
              {c.monitoring ? '⏸  Pause' : '▶  Start watching'}
            </Text>
          </Pressable>
        </View>
        <View style={{ width: 12 }} />
        <Pressable
          disabled={busy}
          accessibilityRole="switch"
          accessibilityLabel="Silent tracking"
          accessibilityState={{ checked: c.silentTracking, disabled: busy }}
          onPress={() => void updateTracking(() => c.setSilentTracking(!c.silentTracking))}
          style={styles.alertToggle}
        >
          <Text style={{ fontSize: 20 }}>{c.alerts.enabled ? '🔔' : '🔕'}</Text>
        </Pressable>
      </View>
      <Text style={[styles.sub, { marginTop: 8 }]}>Tracking continues when you leave this screen. Keep the app open and the watch connected.</Text>

      {/* Event feed */}
      <AppCard style={{ marginTop: 16 }}>
        <Text style={styles.feedTitle}>Recent catches</Text>
        {c.recentEvents.length === 0 ? (
          <Text style={[styles.sub, { marginTop: 8 }]}>Nothing yet — that&apos;s a good thing.</Text>
        ) : (
          c.recentEvents.slice(0, 8).map((e, i) => (
            <View key={`${e.time}-${i}`} style={styles.feedRow}>
              <Text style={{ fontSize: 14 }}>⚡</Text>
              <Text style={styles.feedTime}>{formatTime(e.time)}</Text>
              <View style={{ flex: 1 }} />
              <Text style={styles.sub}>motion {e.motion.toFixed(2)}</Text>
            </View>
          ))
        )}
      </AppCard>
    </ScreenScrollView>
  );
}

function Stat(props: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={styles.statValue}>{props.value}</Text>
      <Text style={styles.sub}>{props.label}</Text>
    </View>
  );
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: AppColors.bg },
  row: { flexDirection: 'row', alignItems: 'center' },
  sub: { fontSize: 11, lineHeight: 16, color: AppColors.sub, flexShrink: 1 },
  statusCircle: {
    width: 180, height: 180, borderRadius: 90, borderWidth: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  statusText: { fontSize: 20, fontWeight: '800', marginTop: 6 },
  watching: { fontSize: 14, fontWeight: '700', color: AppColors.ink, marginTop: 12 },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  barLabel: { fontSize: 12, fontWeight: '700', color: AppColors.ink },
  barValue: { fontSize: 12, fontWeight: '700' },
  barTrack: {
    height: 14, borderRadius: 8, backgroundColor: '#eef4f9', marginTop: 6, overflow: 'hidden',
  },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 8 },
  threshMark: { position: 'absolute', top: 0, width: 2, height: 14, backgroundColor: AppColors.ink },
  statValue: { fontSize: 18, fontWeight: '800', color: AppColors.ink },
  ctrlBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  ctrlBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  alertToggle: {
    width: 52, height: 52, borderRadius: 12, backgroundColor: '#e6f9f0',
    alignItems: 'center', justifyContent: 'center',
  },
  feedTitle: { fontSize: 13, fontWeight: '700', color: AppColors.ink },
  feedRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 8 },
  feedTime: { fontSize: 12, fontWeight: '600', color: AppColors.ink },
});
