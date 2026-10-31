import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { angleDelta, isFreshSample, motionBuckets, motionScale, type MotionPoint } from '../services/motionVisualization';
import type { DeviceSample } from '../services/twitchDevice';
import { AppColors } from '../theme';
import { AppCard, StatusPill } from './ui';

export function MotionVisualization({ sample, receivedAt, connected, monitoring, threshold }: {
  sample: DeviceSample | null; receivedAt: number | null; connected: boolean; monitoring: boolean; threshold: number;
}) {
  const [now, setNow] = useState(Date.now());
  const [reference, setReference] = useState({ pitch: 0, roll: 0 });
  const [centered, setCentered] = useState(false);
  const [history, setHistory] = useState<MotionPoint[]>([]);
  const [reduceMotion, setReduceMotion] = useState(false);
  const pitch = useRef(new Animated.Value(0)).current;
  const roll = useRef(new Animated.Value(0)).current;
  const rollTarget = useRef(0);
  const observedNow = Math.max(now, Date.now());
  const fresh = connected && isFreshSample(sample, receivedAt, observedNow);
  const live = monitoring && fresh;
  const flagged = live && !!sample?.flagged;
  const status = !connected ? 'Disconnected' : !monitoring ? 'Paused' : !sample ? 'Waiting for data' : !fresh ? 'Signal delayed' : flagged ? 'Gesture flagged' : 'Live movement';

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);

  useEffect(() => {
    if (!monitoring || !connected) {
      setHistory([]);
      setReference({ pitch: 0, roll: 0 });
      setCentered(false);
    }
  }, [monitoring, connected]);

  useEffect(() => {
    if (!monitoring || !connected || !isFreshSample(sample, receivedAt, Date.now()) || !sample || receivedAt === null) return;
    setNow(Date.now());
    setHistory((points) => [...points.filter((p) => receivedAt - p.time < 10_000),
      { time: receivedAt, motion: Math.max(0, sample.motion), flagged: sample.flagged }].slice(-160));
  }, [sample, receivedAt, monitoring, connected]);

  useEffect(() => {
    if (!live || !sample) return;
    const nextPitch = Math.max(-85, Math.min(85, angleDelta(sample.pitch, reference.pitch)));
    const relativeRoll = angleDelta(sample.roll, reference.roll);
    rollTarget.current += angleDelta(relativeRoll, rollTarget.current);
    const animation = Animated.parallel([
      Animated.timing(pitch, { toValue: nextPitch, duration: reduceMotion ? 0 : 140, useNativeDriver: true }),
      Animated.timing(roll, { toValue: rollTarget.current, duration: reduceMotion ? 0 : 140, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [sample, live, reference, reduceMotion, pitch, roll]);

  const buckets = motionBuckets(history, observedNow);
  const scale = motionScale(threshold, history);
  const validThreshold = Number.isFinite(threshold) && threshold > 0;
  const hasReading = sample && [sample.pitch, sample.roll, sample.motion].every(Number.isFinite);
  const above = live && validThreshold && sample!.motion > threshold;
  return (
    <AppCard style={styles.card}>
      <View style={styles.heading}><Text style={styles.title}>Your movement</Text>
        <StatusPill label={status} bg={flagged ? '#fde6eb' : live ? AppColors.pillGreen : '#edf1ee'} fg={flagged ? '#a12c4b' : AppColors.greenDark} dot />
      </View>
      <View style={[styles.stage, flagged && styles.flaggedStage]}>
        <View pointerEvents="none" style={styles.orbit} /><View pointerEvents="none" style={styles.innerOrbit} />
        <Text style={styles.axisTop}>PITCH · TILT</Text><Text style={styles.axisBottom}>ROLL · SIDE TO SIDE</Text>
        <View style={styles.shadow} />
        <Animated.View accessible accessibilityLabel="Wearable orientation illustration driven by pitch and roll"
          style={[styles.wearable, { opacity: live ? 1 : 0.35, transform: [
            { perspective: 650 },
            { rotateZ: roll.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'], extrapolate: 'extend' }) },
            { rotateX: pitch.interpolate({ inputRange: [-90, 90], outputRange: ['-90deg', '90deg'] }) },
          ] }]}>
          <View style={styles.strapTop} /><View style={styles.strapBottom} />
          <View style={[styles.watchBody, flagged && styles.flaggedWatch]}>
            <View style={styles.watchFace}><Text style={styles.faceIcon}>{flagged ? '!' : '◇'}</Text><Text style={styles.faceText}>{flagged ? 'NOTICE' : 'AWARE'}</Text><View style={[styles.faceLine, flagged && styles.flaggedLine]} /></View>
            <View style={styles.crown} />
          </View>
        </Animated.View>
        {!live && <View style={styles.stageLabel}><Text style={styles.stageLabelText}>{!connected ? 'Connect your wearable' : !monitoring ? 'Start tracking to see movement' : 'Waiting for fresh sensor readings'}</Text></View>}
      </View>
      <Text style={styles.readingsCaption}>{live ? 'LIVE SENSOR READINGS' : hasReading ? 'LAST RECEIVED READINGS' : 'SENSOR READINGS'}</Text>
      <View style={styles.readings}>
        <Reading label="Pitch" value={hasReading ? `${sample.pitch.toFixed(0)}°` : '—'} />
        <Reading label="Roll" value={hasReading ? `${sample.roll.toFixed(0)}°` : '—'} />
        <Reading label="Motion · rad/s" value={hasReading ? sample.motion.toFixed(2) : '—'} />
      </View>
      <Pressable accessibilityRole="button" disabled={!live} accessibilityState={{ disabled: !live }}
        onPress={() => { if (sample) { setReference({ pitch: sample.pitch, roll: sample.roll }); setCentered(true); } }} style={[styles.centerButton, !live && styles.disabled]}>
        <Text style={styles.centerText}>{centered ? 'Recenter view' : 'Set this pose as center'}</Text>
      </Pressable>
      <Text style={styles.note}>Tilt illustration from your sensor, not a hand-position map. Centering changes this view only.</Text>
      <View style={styles.chartHeading}><Text style={styles.chartTitle}>Recent motion</Text><Text style={styles.chartSubtitle}>Last 10 seconds</Text></View>
      <View accessible accessibilityLabel={`Recent motion chart. ${live && hasReading ? `Current motion ${sample.motion.toFixed(2)} radians per second.` : status}.${validThreshold ? ` Detection threshold ${threshold.toFixed(2)}.` : ''}`} style={styles.chart}>
        <View style={styles.bars}>{buckets.map((bucket, index) => <View key={index} style={styles.barSlot}>{bucket && <View style={[styles.bar, {
          height: Math.max(3, bucket.motion / scale * 68), backgroundColor: bucket.flagged ? AppColors.red : '#73b6a0',
        }]} />}</View>)}</View>
        {validThreshold && <View style={[styles.thresholdLine, { bottom: Math.min(68, threshold / scale * 68) + 6 }]} />}
        {!buckets.some(Boolean) && <View style={styles.noChart}><Text style={styles.chartSubtitle}>{live ? 'Collecting motion…' : 'Motion history appears while tracking'}</Text></View>}
      </View>
      <View style={styles.chartLegend}><Text style={styles.legend}>{validThreshold ? `— Threshold ${threshold.toFixed(2)} rad/s` : 'No motion threshold set'}</Text>
        <Text style={[styles.legend, above && styles.overText]}>{!live ? status : above ? 'Above threshold' : 'Below threshold'}</Text></View>
      <Text style={styles.note}>A threshold crossing alone is not a confirmed detection. The watch also applies your calibrated gesture rules.</Text>
    </AppCard>
  );
}

function Reading({ label, value }: { label: string; value: string }) {
  return <View style={styles.reading}><Text style={styles.readingValue}>{value}</Text><Text style={styles.readingLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  card: { marginTop: 18 },
  heading: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '700', color: AppColors.ink },
  stage: { height: 245, marginTop: 18, borderRadius: 20, backgroundColor: '#edf5f0', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  flaggedStage: { backgroundColor: '#fff0f1' },
  orbit: { position: 'absolute', width: 210, height: 210, borderRadius: 105, borderWidth: 1, borderColor: '#d2e4da', transform: [{ scaleY: 0.55 }] },
  innerOrbit: { position: 'absolute', width: 155, height: 155, borderRadius: 78, borderWidth: 1, borderColor: '#d2e4da', transform: [{ scaleY: 0.55 }] },
  axisTop: { position: 'absolute', top: 16, fontSize: 8, letterSpacing: 1.7, color: '#5f7b6e', fontWeight: '600' },
  axisBottom: { position: 'absolute', bottom: 16, fontSize: 8, letterSpacing: 1.7, color: '#5f7b6e', fontWeight: '600' },
  shadow: { position: 'absolute', width: 100, height: 18, borderRadius: 50, bottom: 46, backgroundColor: '#c9ddd1', opacity: 0.6 },
  wearable: { width: 100, height: 174, alignItems: 'center', justifyContent: 'center' },
  strapTop: { position: 'absolute', top: 0, width: 47, height: 78, backgroundColor: '#577e71', borderRadius: 12, borderWidth: 3, borderColor: '#416858' },
  strapBottom: { position: 'absolute', bottom: 0, width: 47, height: 78, backgroundColor: '#577e71', borderRadius: 12, borderWidth: 3, borderColor: '#416858' },
  watchBody: { width: 98, height: 114, padding: 6, borderRadius: 27, backgroundColor: '#315d4e', borderWidth: 2, borderColor: '#7fa591', shadowColor: '#123a2c', shadowOpacity: 0.22, shadowRadius: 6, shadowOffset: { width: 3, height: 5 }, elevation: 4 },
  flaggedWatch: { backgroundColor: '#9e4058', borderColor: '#e5a2b3' },
  watchFace: { flex: 1, borderRadius: 19, backgroundColor: '#163e31', alignItems: 'center', justifyContent: 'center', gap: 4 },
  faceIcon: { fontSize: 32, color: '#d2eab0', fontWeight: '500' },
  faceText: { fontSize: 8, letterSpacing: 2, color: '#d2eab0' },
  faceLine: { width: 28, height: 3, borderRadius: 2, backgroundColor: '#7eb99d', marginTop: 5 },
  flaggedLine: { backgroundColor: '#ffb3bc' },
  crown: { position: 'absolute', right: -6, top: 35, width: 5, height: 16, backgroundColor: '#4f7666', borderRadius: 2 },
  stageLabel: { position: 'absolute', bottom: 42, left: 12, right: 12, alignItems: 'center', backgroundColor: '#edf5f0ee', borderRadius: 8, padding: 8 },
  stageLabelText: { fontSize: 12, fontWeight: '600', textAlign: 'center', color: AppColors.ink },
  readingsCaption: { fontSize: 8, letterSpacing: 1.2, fontWeight: '600', color: AppColors.sub, marginTop: 18 },
  readings: { flexDirection: 'row', marginTop: 8, gap: 8 },
  reading: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: '#f4f7f5' },
  readingValue: { fontSize: 20, fontWeight: '600', color: AppColors.ink, fontVariant: ['tabular-nums'] },
  readingLabel: { fontSize: 10, color: AppColors.sub, marginTop: 5 },
  centerButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  centerText: { color: AppColors.greenDark, fontSize: 12, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  note: { fontSize: 10, color: AppColors.sub, lineHeight: 16 },
  chartHeading: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 22, marginBottom: 10 },
  chartTitle: { fontSize: 13, fontWeight: '700', color: AppColors.ink },
  chartSubtitle: { fontSize: 10, color: AppColors.sub },
  chart: { height: 82, backgroundColor: '#f5f8f6', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 6, overflow: 'hidden' },
  bars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  barSlot: { flex: 1, height: 68, justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 2 },
  thresholdLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderStyle: 'dashed', borderColor: '#8d6552' },
  noChart: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  chartLegend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginTop: 8, marginBottom: 10 },
  legend: { fontSize: 10, color: AppColors.sub },
  overText: { color: '#a12c4b', fontWeight: '700' },
});
