import type { DeviceSample } from './twitchDevice';

export interface MotionPoint { time: number; motion: number; flagged: boolean }
export const MOTION_WINDOW_MS = 10_000;
export const SAMPLE_STALE_MS = 2500;

export function isFreshSample(sample: DeviceSample | null, receivedAt: number | null, now: number): boolean {
  return sample !== null && receivedAt !== null && now >= receivedAt && now - receivedAt <= SAMPLE_STALE_MS
    && [sample.pitch, sample.roll, sample.motion].every(Number.isFinite);
}

/** Shortest path avoids a full spin when roll crosses +180 / -180 degrees. */
export function angleDelta(angle: number, reference: number): number {
  return ((angle - reference + 180) % 360 + 360) % 360 - 180;
}

export function motionScale(threshold: number, points: readonly MotionPoint[]): number {
  return Math.max(0.1, Number.isFinite(threshold) ? threshold * 1.6 : 0, ...points.map((p) => Number.isFinite(p.motion) ? Math.max(0, p.motion) : 0));
}

/** Fixed time buckets preserve gaps instead of inventing motion between samples. */
export function motionBuckets(points: readonly MotionPoint[], now: number, count = 40) {
  const buckets: Array<{ motion: number; flagged: boolean } | null> = Array.from({ length: count }, () => null);
  for (const point of points) {
    const age = now - point.time;
    if (age < 0 || age >= MOTION_WINDOW_MS || !Number.isFinite(point.motion)) continue;
    const index = Math.min(count - 1, Math.floor((MOTION_WINDOW_MS - age) / MOTION_WINDOW_MS * count));
    const previous = buckets[index];
    buckets[index] = { motion: Math.max(0, point.motion, previous?.motion ?? 0), flagged: point.flagged || !!previous?.flagged };
  }
  return buckets;
}
