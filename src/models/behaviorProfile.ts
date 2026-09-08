/**
 * A single twitch/BFRB behavior the user wants the wearable to catch, together
 * with the detection parameters produced by calibration.
 *
 * The parameters mirror the heuristic knobs in the CircuitPython firmware
 * (`code.py`): a motion-energy threshold from the gyroscope and an optional
 * orientation ("face zone") gate from the accelerometer-derived pitch.
 *
 * Ported 1:1 from the Flutter app's `lib/models/behavior_profile.dart`.
 */
export interface BehaviorProfile {
  /** Stable identifier (also used to mark the active profile). */
  id: string;
  /** User-facing label, e.g. "Nail biting" or "Cheek scratching". */
  name: string;
  /** A single emoji used as the behavior's glyph in the UI. */
  emoji: string;
  /**
   * Require the "face zone" tilt as well as motion before flagging. True suits
   * hand-to-face gestures; false suits picking that can happen anywhere and
   * should rely on motion energy alone.
   */
  orientationGate: boolean;
  /** Smoothed gyroscope magnitude (rad/s) above which motion counts as active. */
  motionThreshold: number;
  /** Inclusive pitch window (degrees) that defines the face zone. */
  pitchMin: number;
  pitchMax: number;
  /** Raw calibration measurements, kept for transparency in the UI. */
  restMotion: number;
  gestureMotion: number;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
}

export function profileToJson(p: BehaviorProfile): string {
  return JSON.stringify(p);
}

export function profileFromJson(s: string): BehaviorProfile {
  const m = JSON.parse(s) as Partial<BehaviorProfile>;
  return {
    id: String(m.id),
    name: String(m.name),
    emoji: m.emoji ?? '✋',
    orientationGate: m.orientationGate ?? true,
    motionThreshold: Number(m.motionThreshold ?? 0),
    pitchMin: Number(m.pitchMin ?? 0),
    pitchMax: Number(m.pitchMax ?? 0),
    restMotion: Number(m.restMotion ?? 0),
    gestureMotion: Number(m.gestureMotion ?? 0),
    createdAt: m.createdAt ?? new Date().toISOString(),
  };
}
