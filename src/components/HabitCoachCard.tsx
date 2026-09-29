import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  COACH_ACTIONS, COACH_MOMENTS, loadCoachHistory, recommendCoachAction,
  resetCoachHistory, saveCoachFeedback,
  type CoachAction, type CoachHistory, type CoachMoment,
} from '../services/habitCoach';
import { AppColors } from '../theme';
import { AppCard, OutlineButton, PrimaryButton, StatusPill } from './ui';

export function HabitCoachCard({ profileId, behaviorName }: {
  profileId?: string; behaviorName?: string;
}) {
  // Switching tracked behaviors starts a fresh interaction, retaining saved learning.
  return <CoachSession key={profileId ?? 'general'} scope={profileId ?? 'general'} behaviorName={behaviorName} />;
}

function CoachSession({ scope, behaviorName }: { scope: string; behaviorName?: string }) {
  const [history, setHistory] = useState<CoachHistory>({});
  const [moment, setMoment] = useState<CoachMoment>('focused');
  const [suggestion, setSuggestion] = useState<{ action: CoachAction; learned: boolean } | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [rated, setRated] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const saving = useRef(false);

  useEffect(() => {
    let mounted = true;
    void loadCoachHistory().then((saved) => {
      if (mounted) { setHistory(saved); setReady(true); }
    }).catch(() => {
      if (mounted) setError('Saved learning could not be loaded. Tap below to try again.');
    });
    return () => { mounted = false; };
  }, [loadAttempt]);

  function suggest(another = false) {
    let excluded = another && suggestion ? [...skipped, suggestion.action.id] : [];
    if (excluded.length >= COACH_ACTIONS.length) excluded = [];
    setSuggestion(recommendCoachAction(history, scope, moment, excluded));
    setSkipped(excluded);
    setRated(null);
    setError(null);
  }

  async function rate(helpful: boolean) {
    if (!suggestion || rated !== null || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      const next = await saveCoachFeedback(scope, moment, suggestion.action.id, helpful);
      setHistory(next);
      setRated(helpful);
    } catch {
      setError('Feedback could not be saved. Please try again.');
    } finally { saving.current = false; setBusy(false); }
  }

  async function resetLearning() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      await resetCoachHistory();
      setHistory({}); setSuggestion(null); setSkipped([]); setRated(null); setError(null);
    } catch {
      setError('Learning could not be reset. Please try again.');
    } finally { saving.current = false; setBusy(false); }
  }

  return (
    <AppCard style={{ marginTop: 16 }} color={AppColors.blueTintBg} borderColor={AppColors.blueBorder}>
      <View style={styles.heading}>
        <Text style={styles.title}>✨ AI Habit Coach</Text>
        <StatusPill label="On your phone" bg={AppColors.pillBlue} fg="#1766c8" />
      </View>
      <Text style={styles.description}>
        {behaviorName ? `Working on ${behaviorName.toLowerCase()}? ` : 'One small step can interrupt a habit. '}
        Choose your moment for a quick suggestion.
      </Text>
      <View accessibilityRole="radiogroup" style={styles.moments}>
        {COACH_MOMENTS.map((item) => (
          <Pressable
            key={item.id} accessibilityRole="radio"
            accessibilityState={{ checked: moment === item.id, disabled: busy }}
            disabled={busy}
            onPress={() => {
              setMoment(item.id); setSuggestion(null); setSkipped([]); setRated(null);
              if (ready) setError(null);
            }}
            style={({ pressed }) => [styles.chip, moment === item.id && styles.selectedChip, { opacity: pressed || busy ? 0.6 : 1 }]}
          >
            <Text style={[styles.chipText, moment === item.id && styles.selectedText]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      {!suggestion ? (
        <PrimaryButton label={ready ? 'Suggest a small step' : error ? 'Coach unavailable' : 'Loading coach…'}
          color={AppColors.greenDark} disabled={!ready || busy} onPress={() => suggest()} />
      ) : (
        <View style={styles.suggestion}>
          <Text style={styles.actionTitle}>{suggestion.action.emoji} {suggestion.action.title}</Text>
          <Text style={styles.step}>{suggestion.action.step}</Text>
          <Text style={styles.reason}>
            {suggestion.learned ? 'Chosen using your feedback for this habit and moment.' : 'A starting idea for this moment. Your feedback helps me learn.'}
          </Text>
          {rated === null ? (
            <>
              <Text style={styles.question}>After trying it, did it help?</Text>
              <View style={styles.feedback}>
                <View style={styles.flex}><OutlineButton label="Yes, helpful" color={AppColors.greenDark} disabled={busy} onPress={() => void rate(true)} /></View>
                <View style={styles.flex}><OutlineButton label="Not this time" color={AppColors.sub} disabled={busy} onPress={() => void rate(false)} /></View>
              </View>
            </>
          ) : (
            <Text accessibilityLiveRegion="polite" style={styles.saved}>
              {rated ? 'Saved! I’ll favor ideas like this for this moment.' : 'Saved. Let’s try a different idea next time.'}
            </Text>
          )}
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => suggest(true)} style={styles.textButton}>
            <Text style={styles.link}>Try another idea →</Text>
          </Pressable>
        </View>
      )}
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!ready && error && <OutlineButton label="Retry loading coach" onPress={() => {
        setError(null); setLoadAttempt((attempt) => attempt + 1);
      }} />}
      <Text style={styles.privacy}>A small learning model ranks ready-made ideas using your feedback. Works offline; feedback stays on this phone.</Text>
      {ready && Object.keys(history).length > 0 && (
        <Pressable accessibilityRole="button" disabled={busy} style={styles.textButton} onPress={() => {
          Alert.alert('Reset coach learning?', 'This clears coach feedback for all habits. Your tracking history and calibration stay saved.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Reset', style: 'destructive', onPress: () => void resetLearning() },
          ]);
        }}><Text style={styles.reset}>Reset coach learning</Text></Pressable>
      )}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  title: { fontSize: 17, fontWeight: '700', color: AppColors.ink },
  description: { fontSize: 13, lineHeight: 20, color: AppColors.ink, marginTop: 10 },
  moments: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 14 },
  chip: { minHeight: 44, justifyContent: 'center', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: AppColors.blueBorder },
  selectedChip: { backgroundColor: AppColors.greenTintBg, borderColor: AppColors.greenDark },
  chipText: { fontSize: 12, color: AppColors.ink },
  selectedText: { color: AppColors.greenDark, fontWeight: '700' },
  suggestion: { backgroundColor: '#fff', padding: 14, borderRadius: 14 },
  actionTitle: { fontSize: 16, fontWeight: '700', color: AppColors.greenDark },
  step: { marginTop: 8, fontSize: 14, lineHeight: 22, color: AppColors.ink },
  reason: { fontSize: 12, lineHeight: 18, color: AppColors.sub, marginTop: 10 },
  question: { fontSize: 13, fontWeight: '600', color: AppColors.ink, marginTop: 14, marginBottom: 8 },
  feedback: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  flex: { flexGrow: 1, flexBasis: 120 },
  saved: { fontSize: 13, lineHeight: 20, color: AppColors.greenDark, marginTop: 14 },
  textButton: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingVertical: 10 },
  link: { fontSize: 13, fontWeight: '700', color: '#1766c8' },
  privacy: { fontSize: 11, lineHeight: 17, color: AppColors.sub, marginTop: 12 },
  reset: { fontSize: 12, color: AppColors.sub },
  error: { fontSize: 13, lineHeight: 20, color: '#b3244c', marginTop: 10 },
});
