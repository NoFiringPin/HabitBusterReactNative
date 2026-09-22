import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppCard, PrimaryButton, ScreenScrollView, StatusPill } from '../components/ui';
import { appController } from '../state/appController';
import { useAppController } from '../state/useAppController';
import { AppColors } from '../theme';
import type { Nav } from '../navigation';

const WEEK_LABELS = ['M', 'T', 'W', 'TH', 'F', 'S', 'Su'];

/**
 * Home dashboard. A condensed port of `lib/main.dart`'s `DashboardPage` focused
 * on the live/functional pieces (wearable status, today's shield report, week
 * bars, streak). The static informational cards from the Flutter version are
 * deferred to the full-port follow-up.
 */
export function DashboardScreen() {
  const c = useAppController();
  const nav = useNavigation<Nav<'Dashboard'>>();

  const connected = c.isConnected;
  const active = c.activeProfile;
  const week = c.weekTotals();
  const maxWeek = Math.max(1, ...week);
  const streak = c.streakDays();

  return (
    <ScreenScrollView includeTopInset>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoBox}>
          <Text style={{ fontSize: 18 }}>🛡️</Text>
        </View>
        <Text style={styles.appName}>HabitBuster</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => nav.navigate('DeviceHub')}>
          <StatusPill
            label={connected ? 'Wearable On' : 'Connect'}
            bg={connected ? AppColors.pillGreen : '#e9eef2'}
            fg={connected ? '#17794c' : AppColors.sub}
            dot
          />
        </Pressable>
      </View>

      {/* Wearable card */}
      <AppCard
        style={{ marginTop: 12 }}
        color={connected ? AppColors.greenTintBg : AppColors.blueTintBg}
        borderColor={connected ? '#50d98c' : '#91ceff'}
      >
        <View style={styles.row}>
          <Text style={{ fontSize: 22, marginRight: 8 }}>⌚</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>
              {connected ? 'Wearable connected' : 'Wearable not connected'}
            </Text>
            <Text style={styles.sub}>
              {active != null
                ? `Watching for: ${active.emoji} ${active.name}`
                : 'No behavior calibrated yet'}
            </Text>
          </View>
        </View>
        <View style={{ height: 12 }} />
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <PrimaryButton
              label={connected ? 'Manage device' : 'Connect'}
              onPress={() => nav.navigate('DeviceHub')}
            />
          </View>
          <View style={{ width: 10 }} />
          <View style={{ flex: 1 }}>
            <PrimaryButton
              label="Calibrate"
              color={AppColors.blue}
              onPress={() => nav.navigate('DeviceHub')}
            />
          </View>
        </View>
      </AppCard>

      {/* Shield report */}
      <AppCard style={{ marginTop: 16 }}>
        <View style={styles.row}>
          <Text style={styles.shieldTitle}>🛡️ Today&apos;s Shield Report</Text>
          <View style={{ flex: 1 }} />
          <StatusPill label={c.monitoring ? c.silentTracking ? 'Silent' : 'Tracking' : 'Paused'} bg="#ffd8eb" fg="#402334" />
        </View>
        <View style={[styles.row, { alignItems: 'flex-end', marginTop: 12 }]}>
          <Text style={styles.bigCount}>{c.todayCount}</Text>
          <View style={{ width: 20 }} />
          <StatusPill
            label={c.monitoring ? 'Recording' : 'Saved today'}
            bg="#c4f5d7"
            fg="#00764b"
          />
        </View>
        <Text style={[styles.sub, { marginTop: 8 }]}>Total Touches Today</Text>
        <View style={{ alignItems: 'center', marginTop: 6 }}>
          <StatusPill label={`▯ ${streak} Day Streak`} bg={AppColors.pillBlue} fg="#1766c8" />
        </View>

        {/* Week bars */}
        <View style={styles.weekRow}>
          {week.map((total, i) => (
            <View key={i} style={{ alignItems: 'center', flex: 1 }}>
              <Text style={styles.weekNum}>{total}</Text>
              <View
                style={[
                  styles.weekBar,
                  { height: 6 + (total / maxWeek) * 70, backgroundColor: total > 0 ? AppColors.green : '#e9fbf3' },
                ]}
              />
              <Text style={styles.weekLabel}>{WEEK_LABELS[i]}</Text>
            </View>
          ))}
        </View>
      </AppCard>

      {/* Live monitor shortcut */}
      <View style={{ marginTop: 16 }}>
        <PrimaryButton
          label="Open live monitor"
          color={AppColors.blue}
          disabled={!(connected && active != null)}
          onPress={() => nav.navigate('Monitor')}
        />
      </View>
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  logoBox: {
    width: 34, height: 34, borderRadius: 12, backgroundColor: '#a8ddff',
    alignItems: 'center', justifyContent: 'center', marginRight: 9,
  },
  appName: { fontSize: 16, fontWeight: '700', color: AppColors.greenDark },
  cardTitle: { fontSize: 13, fontWeight: '700', color: AppColors.ink },
  sub: { fontSize: 11, color: AppColors.sub },
  shieldTitle: { fontSize: 15, fontWeight: '600', color: '#283040', flexShrink: 1 },
  bigCount: { fontSize: 50, lineHeight: 52, color: '#009b73', fontWeight: '500' },
  weekRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 14, gap: 4 },
  weekNum: { fontSize: 8, color: AppColors.sub },
  weekBar: { width: 26, borderRadius: 13, marginVertical: 3 },
  weekLabel: { fontSize: 10, color: '#84909f' },
});
