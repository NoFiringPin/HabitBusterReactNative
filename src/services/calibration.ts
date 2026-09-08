import type { BehaviorProfile } from '../models/behaviorProfile';
import type { DeviceSample } from './twitchDevice';

/** The computed detection parameters, ready to be named and saved. */
export interface CalibrationResult {
  motionThreshold: number;
  orientationGate: boolean;
  pitchMin: number;
  pitchMax: number;
  restMotion: number;
  gestureMotion: number;
}

export function resultToProfile(
  r: CalibrationResult,
  opts: { id: string; name: string; emoji: string },
): BehaviorProfile {
  return {
    id: opts.id,
    name: opts.name,
    emoji: opts.emoji,
    orientationGate: r.orientationGate,
    motionThreshold: r.motionThreshold,
    pitchMin: r.pitchMin,
    pitchMax: r.pitchMax,
    restMotion: r.restMotion,
    gestureMotion: r.gestureMotion,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Accumulates samples from the two calibration phases (holding still, then
 * performing the behavior) and turns them into detection thresholds.
 *
 * The math is deliberately simple and explainable: place the motion threshold
 * between the resting ceiling and the gesture level, and enable the orientation
 * gate only when the wrist tilt genuinely shifts during the gesture.
 *
 * Ported 1:1 from `lib/services/calibration.dart`.
 */
export class CalibrationSession {
  private restMotion: number[] = [];
  private gestureMotion: number[] = [];
  private gesturePitch: number[] = [];
  private restPitch: number[] = [];

  get restCount(): number {
    return this.restMotion.length;
  }
  get gestureCount(): number {
    return this.gestureMotion.length;
  }
  get hasEnough(): boolean {
    return this.restCount >= 15 && this.gestureCount >= 15;
  }

  addRest(s: DeviceSample): void {
    this.restMotion.push(s.motion);
    this.restPitch.push(s.pitch);
  }

  addGesture(s: DeviceSample): void {
    this.gestureMotion.push(s.motion);
    this.gesturePitch.push(s.pitch);
  }

  compute(): CalibrationResult {
    const restMean = mean(this.restMotion);
    const restStd = std(this.restMotion, restMean);
    const gestureMean = mean(this.gestureMotion);

    // Noise ceiling for rest, then a threshold biased toward the gesture but
    // always clear of resting jitter.
    const restCeiling = restMean + 2 * restStd;
    let threshold = Math.max(
      restCeiling * 1.1,
      restMean + 0.45 * (gestureMean - restMean),
    );
    threshold = clamp(threshold, 0.4, 6.0);

    // Orientation gate: base it on the STEADY "held at the face" portion of the
    // gesture, dropping the swing-up transient (which otherwise dilutes the
    // tilt and hides real face behaviors).
    const restPitchMean = mean(this.restPitch);
    const steadyPitch = tail(this.gesturePitch, 0.6);
    const gSteadyMean = mean(steadyPitch);
    const gSteadyStd = std(steadyPitch, gSteadyMean);
    const pitchShift = Math.abs(gSteadyMean - restPitchMean);
    const useGate = pitchShift > 10;

    // Zone centered on the held orientation, wide enough for natural wobble but
    // bounded so the RESTING orientation ("arm down") is never inside it.
    const margin = Math.max(12.0, 2.5 * gSteadyStd);
    let pitchMin = gSteadyMean - margin;
    let pitchMax = gSteadyMean + margin;
    const boundary = (restPitchMean + gSteadyMean) / 2;
    if (restPitchMean < gSteadyMean) {
      pitchMin = Math.max(pitchMin, boundary);
    } else {
      pitchMax = Math.min(pitchMax, boundary);
    }
    if (pitchMax - pitchMin < 6) {
      pitchMin = gSteadyMean - 6;
      pitchMax = gSteadyMean + 6;
    }
    pitchMin = clamp(pitchMin, -90.0, 90.0);
    pitchMax = clamp(pitchMax, -90.0, 90.0);

    return {
      motionThreshold: round2(threshold),
      orientationGate: useGate,
      pitchMin: round1(pitchMin),
      pitchMax: round1(pitchMax),
      restMotion: round2(restMean),
      gestureMotion: round2(gestureMean),
    };
  }
}

function mean(v: number[]): number {
  return v.length === 0 ? 0 : v.reduce((a, b) => a + b, 0) / v.length;
}

/**
 * The last `frac` of the samples — the steady tail of a held gesture, after the
 * initial move into position.
 */
function tail(v: number[], frac: number): number[] {
  if (v.length < 6) return v;
  const start = Math.floor(v.length * (1 - frac));
  return v.slice(start);
}

function std(v: number[], m: number): number {
  if (v.length < 2) return 0;
  const variance =
    v.map((x) => (x - m) * (x - m)).reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(variance);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}

// Match Dart's `double.parse(x.toStringAsFixed(n))` — round to n places.
function round1(x: number): number {
  return Number(x.toFixed(1));
}
function round2(x: number): number {
  return Number(x.toFixed(2));
}
