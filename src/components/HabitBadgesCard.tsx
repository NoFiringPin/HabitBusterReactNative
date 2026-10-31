import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatHabitTime, HABIT_BADGES } from '../services/habitRewards';
import { useAppController } from '../state/useAppController';
import { AppColors } from '../theme';
import { AppCard } from './ui';

export function HabitBadgesCard() {
  const c = useAppController();
  const profile = c.activeProfile;
  const { cleanMs, earned } = c.habitRewards.progress(profile?.id ?? null);
  const count = HABIT_BADGES.filter((badge) => earned[badge.id]).length;
  const next = HABIT_BADGES.find((badge) => !earned[badge.id]);
  const progress = next ? Math.min(1, cleanMs / next.ms) : 1;
  const latest = [...HABIT_BADGES].reverse().find((badge) => earned[badge.id]);
  return (
    <AppCard style={styles.card}>
      <View style={styles.heading}>
        <View><Text style={styles.eyebrow}>EVERY MOMENT MATTERS</Text><Text style={styles.title}>Your little wins</Text></View>
        <View style={styles.counter}><Text style={styles.counterText}>{count} / {HABIT_BADGES.length}</Text></View>
      </View>
      <Text style={styles.description}>{profile ? `Celebrating your progress with ${profile.name.toLowerCase()}.` : 'A collection of milestones, earned one moment at a time.'}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.collection}>
        {HABIT_BADGES.map((badge) => {
          const time = earned[badge.id];
          const unlocked = !!time;
          return (
            <Pressable key={badge.id} accessibilityRole="button"
              accessibilityLabel={`${badge.name}, ${badge.label}, ${unlocked ? 'earned' : 'locked'}. Show badge details.`}
              onPress={() => Alert.alert(`${badge.symbol} ${badge.name}`, unlocked
                ? `Earned ${new Date(time).toLocaleDateString()} for ${badge.label} of touch-free tracking${profile ? ` with ${profile.name}` : ''}. This badge is yours to keep.`
                : `Reach ${badge.label} of touch-free tracking to earn this badge. Paused and disconnected time does not count. A detected touch restarts progress.`)}
              style={({ pressed }) => [styles.badge, { opacity: pressed ? 0.65 : 1 }]}>
              <View style={[styles.medallion, unlocked && styles.earnedMedallion]}>
                <View style={[styles.innerMedallion, unlocked && styles.earnedInner]}><Text style={[styles.symbol, !unlocked && styles.lockedSymbol]}>{badge.symbol}</Text></View>
                {unlocked && <View style={styles.check}><Text style={styles.checkText}>✓</Text></View>}
              </View>
              <Text style={[styles.badgeLabel, unlocked && styles.earnedLabel]}>{badge.label}</Text>
              <Text style={styles.badgeName}>{badge.name}</Text>
              <Text style={[styles.badgeStatus, unlocked && styles.earnedLabel]}>{unlocked ? 'EARNED' : 'LOCKED'}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {next ? (
        <View style={styles.nextMilestone}>
          <View style={styles.progressHeading}><Text style={styles.nextTitle}>Next up · {next.label}</Text><Text style={styles.time}>{formatHabitTime(cleanMs)} / {formatHabitTime(next.ms)}</Text></View>
          <View accessibilityRole="progressbar" accessibilityLabel={`Progress toward ${next.label} badge`}
            accessibilityValue={{ min: 0, max: 100, now: Math.floor(progress * 100) }} style={styles.track}>
            <View style={[styles.fill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.hint}>{c.monitoring ? 'You’re building momentum. Keep going.' : profile ? 'Resume tracking to keep growing your progress.' : 'Connect and calibrate a behavior to begin.'}</Text>
        </View>
      ) : <Text style={styles.complete}>A full collection. Look how far you’ve come! ✨</Text>}
      {latest && <Text accessibilityLiveRegion="polite" style={styles.latest}>Latest win: {latest.symbol} {latest.name}</Text>}
      <Text style={styles.note}>Only touch-free tracking counts. Pauses freeze your progress; a detected touch restarts it. Earned badges stay saved for each behavior.</Text>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 20 },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4, color: AppColors.sub },
  title: { fontSize: 23, fontWeight: '700', letterSpacing: -0.6, color: AppColors.ink, marginTop: 4 },
  counter: { backgroundColor: '#fff4d9', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  counterText: { color: '#886218', fontSize: 12, fontWeight: '700' },
  description: { fontSize: 12, lineHeight: 19, color: AppColors.sub, marginTop: 10 },
  collection: { gap: 16, paddingVertical: 22, paddingHorizontal: 2 },
  badge: { width: 90, alignItems: 'center' },
  medallion: { width: 74, height: 74, borderRadius: 37, padding: 5, borderWidth: 1, borderColor: '#dce4df', backgroundColor: '#f1f4f2' },
  earnedMedallion: { backgroundColor: '#fff2cd', borderColor: '#e3bf62' },
  innerMedallion: { flex: 1, borderRadius: 32, borderWidth: 1, borderColor: '#dce4df', alignItems: 'center', justifyContent: 'center' },
  earnedInner: { borderColor: '#e7ce90', backgroundColor: '#fff8e6' },
  symbol: { fontSize: 30 },
  lockedSymbol: { opacity: 0.28 },
  check: { position: 'absolute', right: -2, bottom: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: AppColors.green, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  checkText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  badgeLabel: { fontSize: 14, fontWeight: '700', color: AppColors.sub, marginTop: 10 },
  earnedLabel: { color: AppColors.greenDark },
  badgeName: { fontSize: 10, lineHeight: 15, textAlign: 'center', color: AppColors.sub, marginTop: 3, minHeight: 30 },
  badgeStatus: { fontSize: 8, letterSpacing: 1.1, fontWeight: '700', color: AppColors.sub, marginTop: 5 },
  nextMilestone: { backgroundColor: '#f0f6f2', padding: 14, borderRadius: 16 },
  progressHeading: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 },
  nextTitle: { fontSize: 12, fontWeight: '700', color: AppColors.ink },
  time: { fontSize: 11, color: AppColors.sub, fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: 3, backgroundColor: '#dbe8df', overflow: 'hidden', marginTop: 12 },
  fill: { height: '100%', backgroundColor: AppColors.green, borderRadius: 3 },
  hint: { fontSize: 11, lineHeight: 16, color: AppColors.greenDark, marginTop: 10 },
  latest: { fontSize: 12, fontWeight: '600', color: AppColors.greenDark, marginTop: 14 },
  complete: { fontSize: 14, color: AppColors.greenDark, lineHeight: 21, fontWeight: '600' },
  note: { fontSize: 10, lineHeight: 16, color: AppColors.sub, marginTop: 14 },
});
