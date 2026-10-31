import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppCard, OutlineButton, ScreenScrollView } from '../components/ui';
import { HabitBadgesCard } from '../components/HabitBadgesCard';
import { HabitCoachCard } from '../components/HabitCoachCard';
import { ShieldReportCard } from '../components/ShieldReportCard';
import { useAppController } from '../state/useAppController';
import { AppColors } from '../theme';
import type { Nav } from '../navigation';

export function DashboardScreen() {
  const c = useAppController();
  const nav = useNavigation<Nav<'Dashboard'>>();
  const [, setClock] = useState(0);
  const connected = c.isConnected;
  const active = c.activeProfile;
  useEffect(() => {
    const timer = setInterval(() => { c.updateHabitProgress(); setClock((tick) => tick + 1); }, 1000);
    return () => clearInterval(timer);
  }, [c]);
  return (
    <ScreenScrollView includeTopInset>
      <View style={styles.header}>
        <Image source={require('../../assets/icon.png')} style={styles.appIcon} accessibilityLabel="HabitBuster app icon" />
        <View style={styles.brand}><Text style={styles.appName}>HabitBuster</Text><Text style={styles.tagline}>A little better, every day.</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel={connected ? 'Manage connected wearable' : 'Connect your wearable'} onPress={() => nav.navigate('DeviceHub')} style={styles.connectionButton}>
          <View style={[styles.connectionDot, { backgroundColor: connected ? AppColors.green : '#99a69f' }]} />
          <Text style={styles.connectionText}>{connected ? 'Connected' : 'Connect'}</Text>
        </Pressable>
      </View>
      <View style={styles.hero}>
        <View pointerEvents="none" style={styles.orbit} /><View pointerEvents="none" style={styles.innerOrbit} />
        <View style={styles.heroHeading}>
          <Text style={styles.heroEyebrow}>YOUR DAILY RESET</Text>
          <View style={styles.livePill}><View style={[styles.liveDot, !c.monitoring && styles.pausedDot]} /><Text style={styles.liveText}>{c.monitoring ? c.silentTracking ? 'Tracking silently' : 'Tracking live' : 'Ready when you are'}</Text></View>
        </View>
        <Text style={styles.heroTitle}>Small steps.{'\n'}Stronger habits.</Text>
        <Text style={styles.heroDescription}>Build awareness. Celebrate progress.{'\n'}Make space for the habits you want.</Text>
        <View style={styles.heroStats}>
          <View style={styles.heroStat}><Text style={styles.heroNumber}>{c.todayCount}</Text><Text style={styles.heroLabel}>Touches today</Text></View>
          <View style={styles.statDivider} />
          <View style={styles.heroStat}><Text style={styles.heroNumber}>{c.streakDays()}<Text style={styles.heroUnit}> days</Text></Text><Text style={styles.heroLabel}>At or below 10 touches</Text></View>
        </View>
        <Pressable accessibilityRole="button" onPress={() => connected && active ? nav.navigate('Monitor') : nav.navigate('DeviceHub')} style={({ pressed }) => [styles.heroButton, { opacity: pressed ? 0.8 : 1 }]}>
          <Text style={styles.heroButtonText}>{connected && active ? 'Open live monitor' : connected ? 'Set up a behavior' : 'Connect your wearable'}</Text><Text style={styles.heroButtonArrow}>↗</Text>
        </Pressable>
      </View>
      <AppCard style={styles.wearable}>
        <View style={styles.wearableHeading}>
          <View style={styles.watchIcon}><Text style={styles.watchEmoji}>⌚</Text></View>
          <View style={styles.wearableCopy}><Text style={styles.wearableTitle}>{connected ? 'Your wearable is ready' : 'Bring your wearable along'}</Text><Text style={styles.sub}>{active ? `${active.emoji} ${active.name}` : 'Connect, calibrate, and find your rhythm.'}</Text></View>
        </View>
        <View style={styles.actions}>
          <View style={styles.action}><OutlineButton label={connected ? 'Manage device' : 'Find my watch'} color={AppColors.greenDark} onPress={() => nav.navigate('DeviceHub')} /></View>
          <View style={styles.action}><OutlineButton label="Calibrate" color={AppColors.greenDark} onPress={() => nav.navigate('DeviceHub')} /></View>
        </View>
      </AppCard>
      <ShieldReportCard />
      <HabitBadgesCard />
      <HabitCoachCard profileId={active?.id} behaviorName={active?.name} />
      <View style={styles.footer}><Text style={styles.footerText}>Progress takes practice, not perfection.</Text><Text style={styles.footerMark}>HABITBUSTER</Text></View>
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 24, gap: 10, flexWrap: 'wrap' },
  appIcon: { width: 46, height: 46, borderRadius: 14 },
  brand: { flex: 1, minWidth: 140 },
  appName: { fontSize: 19, fontWeight: '800', letterSpacing: -0.6, color: AppColors.ink },
  tagline: { fontSize: 10, color: AppColors.sub, marginTop: 4 },
  connectionButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 10, borderRadius: 22, backgroundColor: '#e5eee8' },
  connectionDot: { width: 6, height: 6, borderRadius: 3 },
  connectionText: { fontSize: 10, fontWeight: '700', color: AppColors.greenDark },
  hero: { backgroundColor: '#123f35', padding: 24, borderRadius: 28, overflow: 'hidden' },
  orbit: { position: 'absolute', right: -95, top: 30, width: 260, height: 260, borderWidth: 1, borderRadius: 130, borderColor: '#2c584c' },
  innerOrbit: { position: 'absolute', right: -60, top: 65, width: 190, height: 190, borderWidth: 1, borderRadius: 95, borderColor: '#2c584c' },
  heroHeading: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  heroEyebrow: { fontSize: 9, letterSpacing: 1.7, color: '#afd0be', fontWeight: '600' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#29594b', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 12 },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#ade4b6' },
  pausedDot: { backgroundColor: '#cfdbd3' },
  liveText: { fontSize: 9, color: '#e7f1e9' },
  heroTitle: { fontSize: 32, lineHeight: 38, fontWeight: '600', letterSpacing: -1, color: '#f5f9ed', marginTop: 22 },
  heroDescription: { fontSize: 12, lineHeight: 20, color: '#b9d0c3', marginTop: 12 },
  heroStats: { flexDirection: 'row', alignItems: 'center', gap: 22, marginTop: 24, marginBottom: 22 },
  heroStat: { flex: 1 },
  heroNumber: { fontSize: 30, fontWeight: '600', color: '#f5f9ed', fontVariant: ['tabular-nums'] },
  heroUnit: { fontSize: 14, fontWeight: '400' },
  heroLabel: { color: '#b9d0c3', fontSize: 10, marginTop: 5 },
  statDivider: { width: 1, height: 40, backgroundColor: '#3a6252' },
  heroButton: { minHeight: 48, backgroundColor: '#d9edb5', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  heroButtonText: { flex: 1, fontSize: 13, fontWeight: '700', color: '#173e2c' },
  heroButtonArrow: { fontSize: 22, color: '#173e2c' },
  wearable: { marginTop: 16 },
  wearableHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  watchIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#eef4ef', alignItems: 'center', justifyContent: 'center' },
  watchEmoji: { fontSize: 23 },
  wearableCopy: { flex: 1 },
  wearableTitle: { fontSize: 14, fontWeight: '700', color: AppColors.ink },
  sub: { fontSize: 11, lineHeight: 17, color: AppColors.sub, marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  action: { flex: 1, minWidth: 110 },
  footer: { alignItems: 'center', marginTop: 28, gap: 12, marginBottom: 8 },
  footerText: { fontSize: 11, color: AppColors.sub },
  footerMark: { fontSize: 9, letterSpacing: 2, fontWeight: '700', color: '#8b9e92' },
});
