import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppCard, OutlineButton, PrimaryButton } from '../components/ui';
import {
  CalibrationSession,
  resultToProfile,
  type CalibrationResult,
} from '../services/calibration';
import type { DeviceSample, Unsubscribe } from '../services/twitchDevice';
import { appController } from '../state/appController';
import { AppColors } from '../theme';
import type { Nav } from '../navigation';

type Step = 'name' | 'rest' | 'gesture' | 'review';
const STEPS: Step[] = ['name', 'rest', 'gesture', 'review'];

const EMOJIS = ['✋', '💅', '😬', '🤏', '💇', '👃', '👀', '🧔', '🦷'];

const REST_MS = 3000;
const GESTURE_TARGET_MS = 2500;
const GESTURE_MIN_MS = 1000;
const TICK_MS = 60;

/**
 * Guided flow: name the behavior, capture a resting baseline, capture the
 * behavior itself, then review the auto-computed thresholds and save.
 * Ported from `lib/screens/calibration_wizard.dart`.
 */
export function CalibrationWizard() {
  const nav = useNavigation<Nav<'Calibrate'>>();
  const c = appController;
  const sessionRef = useRef(new CalibrationSession());

  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('✋');
  const [capturing, setCapturing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [result, setResult] = useState<CalibrationResult | null>(null);
  const [live, setLive] = useState<{ motion: number; pitch: number }>({ motion: 0, pitch: 0 });

  // Mutable refs so timer callbacks read current values.
  const elapsedRef = useRef(0);
  const restTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const gestureTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const captureSub = useRef<Unsubscribe | null>(null);
  const liveSub = useRef<Unsubscribe | null>(null);

  // Lifecycle: enter calibration streaming, subscribe to live readout.
  useEffect(() => {
    void c.enterCalibration();
    liveSub.current = c.onSample((s: DeviceSample) =>
      setLive({ motion: s.motion, pitch: s.pitch }),
    );
    return () => {
      captureSub.current?.();
      liveSub.current?.();
      if (restTimer.current) clearInterval(restTimer.current);
      if (gestureTimer.current) clearInterval(gestureTimer.current);
      c.setSimulatedGesture(false);
      if (!c.monitoring) void c.stopMonitoring();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setElapsed(ms: number) {
    elapsedRef.current = ms;
    setElapsedMs(ms);
  }

  // ---- Rest capture: auto-collect for a fixed duration --------------------
  function startRestCapture() {
    if (capturing) return;
    setCapturing(true);
    setProgress(0);
    setElapsed(0);
    captureSub.current?.();
    captureSub.current = c.onSample((s) => sessionRef.current.addRest(s));
    restTimer.current = setInterval(() => {
      const next = elapsedRef.current + TICK_MS;
      setElapsed(next);
      setProgress(Math.min(next / REST_MS, 1));
      if (next >= REST_MS) {
        if (restTimer.current) clearInterval(restTimer.current);
        captureSub.current?.();
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setCapturing(false);
        setProgress(0);
        setElapsed(0);
        setStep('gesture');
      }
    }, TICK_MS);
  }

  // ---- Gesture capture: collect while the button is held ------------------
  function gestureDown() {
    if (capturing) return;
    setCapturing(true);
    setProgress(0);
    setElapsed(0);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    c.setSimulatedGesture(true);
    captureSub.current?.();
    captureSub.current = c.onSample((s) => sessionRef.current.addGesture(s));
    gestureTimer.current = setInterval(() => {
      const next = elapsedRef.current + TICK_MS;
      setElapsed(next);
      setProgress(Math.min(next / GESTURE_TARGET_MS, 1));
      if (next >= GESTURE_TARGET_MS) finishGesture();
    }, TICK_MS);
  }

  function gestureUp() {
    if (!capturing) return;
    c.setSimulatedGesture(false);
    if (elapsedRef.current >= GESTURE_MIN_MS && sessionRef.current.gestureCount >= 10) {
      finishGesture();
      return;
    }
    // Released too soon — discard this attempt and let them try again.
    if (gestureTimer.current) clearInterval(gestureTimer.current);
    captureSub.current?.();
    setCapturing(false);
    setProgress(0);
    setElapsed(0);
  }

  function finishGesture() {
    if (gestureTimer.current) clearInterval(gestureTimer.current);
    captureSub.current?.();
    c.setSimulatedGesture(false);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCapturing(false);
    setProgress(0);
    setElapsed(0);
    setResult(sessionRef.current.compute());
    setStep('review');
  }

  async function save() {
    if (result == null) return;
    const finalName = name.trim() === '' ? 'My behavior' : name.trim();
    const profile = resultToProfile(result, {
      id: Date.now().toString() + Math.floor(Math.random() * 1000),
      name: finalName,
      emoji,
    });
    await c.addProfile(profile);
    nav.goBack();
  }

  const stepIndex = STEPS.indexOf(step);

  return (
    <ScrollView style={{ backgroundColor: AppColors.bg }} contentContainerStyle={styles.container}>
      {/* Step dots */}
      <View style={styles.dots}>
        {STEPS.map((s, i) => (
          <View
            key={s}
            style={[styles.dot, { backgroundColor: i <= stepIndex ? AppColors.green : '#d6f5e6' }]}
          />
        ))}
      </View>

      {step === 'name' && (
        <NameStep
          name={name}
          setName={setName}
          emoji={emoji}
          setEmoji={setEmoji}
          onContinue={() => setStep('rest')}
        />
      )}

      {step === 'rest' && (
        <View>
          <StepHeader
            title="1 · Hold still"
            body='Rest your wrist naturally for a few seconds. This teaches the watch what "calm" looks like for you.'
          />
          <CaptureVisual
            emoji="🧘"
            color={AppColors.blue}
            capturing={capturing}
            progress={progress}
            centerText={`${Math.ceil((REST_MS - elapsedMs) / 1000)}`}
            label={capturing ? 'Recording your resting baseline…' : 'Ready when you are'}
            live={live}
          />
          {capturing ? (
            <Text style={styles.hint}>Keep your wrist still until the ring fills…</Text>
          ) : (
            <PrimaryButton label="Record 3 seconds of stillness" onPress={startRestCapture} />
          )}
        </View>
      )}

      {step === 'gesture' && (
        <View>
          <StepHeader
            title="2 · Do the behavior"
            body={
              c.isSimulated
                ? 'No hardware connected, so press and HOLD the button below to simulate performing the behavior. Keep holding until the ring fills.'
                : 'Press and HOLD the button while you actually perform the behavior with the watch on. Keep holding until the ring fills (~3 s).'
            }
          />
          <CaptureVisual
            emoji="🖐"
            color={AppColors.red}
            capturing={capturing}
            progress={progress}
            centerText={`${(elapsedMs / 1000).toFixed(1)}s`}
            label={
              capturing
                ? `Capturing… ${(elapsedMs / 1000).toFixed(1)}s of ${(GESTURE_TARGET_MS / 1000).toFixed(1)}s`
                : `Samples collected: ${sessionRef.current.gestureCount}`
            }
            live={live}
          />
          <Pressable
            onPressIn={gestureDown}
            onPressOut={gestureUp}
            style={[
              styles.holdBtn,
              { backgroundColor: capturing ? AppColors.red : '#ffe1e9' },
            ]}
          >
            <Text style={[styles.holdBtnText, { color: capturing ? '#fff' : AppColors.red }]}>
              {capturing ? 'Hold… keep doing it' : 'Press & HOLD while you do it'}
            </Text>
          </Pressable>
        </View>
      )}

      {step === 'review' && result != null && (
        <View>
          <StepHeader
            title="3 · Review & save"
            body="Here is the detection profile the app built from your samples. It will run on the watch so it works even when your phone is away."
          />
          <AppCard style={{ marginTop: 4 }}>
            <View style={styles.reviewHead}>
              <Text style={{ fontSize: 26, marginRight: 10 }}>{emoji}</Text>
              <Text style={styles.reviewName}>{name.trim() === '' ? 'My behavior' : name.trim()}</Text>
            </View>
            <View style={styles.divider} />
            <ReviewRow
              label="Motion threshold"
              value={`${result.motionThreshold} rad/s`}
              detail={`Resting ${result.restMotion} → gesture ${result.gestureMotion}`}
            />
            <ReviewRow
              label="Orientation gate"
              value={result.orientationGate ? 'On' : 'Off'}
              detail={
                result.orientationGate
                  ? `Also needs the wrist tilted ${result.pitchMin.toFixed(0)}°–${result.pitchMax.toFixed(0)}°`
                  : 'Detects the motion anywhere'
              }
            />
          </AppCard>
          <View style={[styles.row, { marginTop: 16 }]}>
            <View style={{ flex: 1 }}>
              <OutlineButton label="Redo" onPress={() => { setProgress(0); setStep('gesture'); }} />
            </View>
            <View style={{ width: 12 }} />
            <View style={{ flex: 2 }}>
              <PrimaryButton label="Save behavior" onPress={save} />
            </View>
          </View>
        </View>
      )}
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

function NameStep(props: {
  name: string;
  setName: (v: string) => void;
  emoji: string;
  setEmoji: (v: string) => void;
  onContinue: () => void;
}) {
  return (
    <View>
      <Text style={styles.bigTitle}>What behavior do you want to catch?</Text>
      <Text style={styles.bodyText}>
        Name it so it feels personal — nail biting, cheek scratching, hair
        pulling, whatever yours is.
      </Text>
      <AppCard style={{ marginTop: 20 }}>
        <TextInput
          value={props.name}
          onChangeText={props.setName}
          placeholder="e.g. Nail biting"
          placeholderTextColor={AppColors.sub}
          style={styles.input}
        />
      </AppCard>
      <Text style={[styles.sub, { marginTop: 16 }]}>Pick an icon</Text>
      <View style={styles.emojiWrap}>
        {EMOJIS.map((e) => {
          const selected = e === props.emoji;
          return (
            <Pressable
              key={e}
              onPress={() => props.setEmoji(e)}
              style={[
                styles.emojiBox,
                {
                  backgroundColor: selected ? '#d8f9e6' : '#fff',
                  borderColor: selected ? AppColors.green : '#e0e0e0',
                  borderWidth: selected ? 2 : 1,
                },
              ]}
            >
              <Text style={{ fontSize: 22 }}>{e}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ height: 28 }} />
      <PrimaryButton label="Continue" onPress={props.onContinue} />
    </View>
  );
}

function StepHeader(props: { title: string; body: string }) {
  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={styles.bigTitle}>{props.title}</Text>
      <Text style={styles.bodyText}>{props.body}</Text>
    </View>
  );
}

function CaptureVisual(props: {
  emoji: string;
  color: string;
  capturing: boolean;
  progress: number;
  centerText: string;
  label: string;
  live: { motion: number; pitch: number };
}) {
  return (
    <View style={{ alignItems: 'center', marginBottom: 24 }}>
      <View style={[styles.ring, { borderColor: props.color + '33' }]}>
        <View
          style={[
            styles.ringInner,
            { backgroundColor: props.color + (props.capturing ? '2e' : '14') },
          ]}
        >
          <Text style={[styles.ringText, { color: props.color }]}>
            {props.capturing ? props.centerText : props.emoji}
          </Text>
        </View>
      </View>
      {/* Linear progress under the ring (RN-friendly stand-in for the arc). */}
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${Math.round((props.capturing ? props.progress : 0) * 100)}%`, backgroundColor: props.color },
          ]}
        />
      </View>
      <Text style={styles.captureLabel}>{props.label}</Text>
      <Text style={styles.sub}>
        live · motion {props.live.motion.toFixed(2)}  pitch {props.live.pitch.toFixed(0)}°
      </Text>
    </View>
  );
}

function ReviewRow(props: { label: string; value: string; detail: string }) {
  return (
    <View style={styles.reviewRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.reviewLabel}>{props.label}</Text>
        <Text style={styles.sub}>{props.detail}</Text>
      </View>
      <Text style={styles.reviewValue}>{props.value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center' },
  dots: { flexDirection: 'row', marginBottom: 18 },
  dot: { flex: 1, height: 6, borderRadius: 4, marginHorizontal: 3 },
  bigTitle: { fontSize: 19, fontWeight: '800', color: AppColors.ink },
  bodyText: { fontSize: 12, color: AppColors.sub, lineHeight: 17, marginTop: 6 },
  sub: { fontSize: 11, color: AppColors.sub },
  input: { fontSize: 15, color: AppColors.ink, paddingVertical: 4 },
  emojiWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  emojiBox: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  hint: { fontSize: 12, color: AppColors.sub, textAlign: 'center', marginTop: 4 },
  ring: {
    width: 132, height: 132, borderRadius: 66, borderWidth: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  ringInner: {
    width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center',
  },
  ringText: { fontSize: 34, fontWeight: '800' },
  progressTrack: {
    width: 160, height: 8, borderRadius: 4, backgroundColor: '#eef4f9', marginTop: 14, overflow: 'hidden',
  },
  progressFill: { height: 8, borderRadius: 4 },
  captureLabel: { fontSize: 13, color: AppColors.ink, marginTop: 12 },
  holdBtn: {
    width: '100%', paddingVertical: 20, alignItems: 'center', borderRadius: 16,
    borderWidth: 2, borderColor: AppColors.red,
  },
  holdBtnText: { fontSize: 15, fontWeight: '700' },
  reviewHead: { flexDirection: 'row', alignItems: 'center' },
  reviewName: { fontSize: 16, fontWeight: '800', color: AppColors.ink, flex: 1 },
  divider: { height: 1, backgroundColor: '#eef1f4', marginVertical: 14 },
  reviewRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6 },
  reviewLabel: { fontSize: 13, fontWeight: '700', color: AppColors.ink },
  reviewValue: { fontSize: 14, fontWeight: '800', color: AppColors.green },
});
