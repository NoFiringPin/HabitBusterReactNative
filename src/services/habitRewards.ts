const HOUR = 60 * 60_000;
export const HABIT_BADGES = [
  { id: '20m', label: '20 min', name: 'First steps', symbol: '🌱', ms: HOUR / 3 },
  { id: '1h', label: '1 hour', name: 'Finding flow', symbol: '🌿', ms: HOUR },
  { id: '2h', label: '2 hours', name: 'Growing strong', symbol: '🌳', ms: 2 * HOUR },
  { id: '12h', label: '12 hours', name: 'Bright momentum', symbol: '☀️', ms: 12 * HOUR },
  { id: '1d', label: '1 day', name: 'Day champion', symbol: '🏅', ms: 24 * HOUR },
  { id: '3d', label: '3 days', name: 'Steady shield', symbol: '🛡️', ms: 72 * HOUR },
  { id: '7d', label: '7 days', name: 'Habit hero', symbol: '👑', ms: 168 * HOUR },
] as const;
type BadgeId = typeof HABIT_BADGES[number]['id'];
interface Progress { cleanMs: number; earned: Partial<Record<BadgeId, number>> }

/** Pauses freeze progress. A detection resets it; previously earned badges remain. */
export class HabitRewards {
  private records = new Map<string, Progress>();
  private session: { id: string; lastAt: number } | null = null;

  progress(id: string | null): Readonly<Progress> {
    return id ? this.records.get(id) ?? { cleanMs: 0, earned: {} } : { cleanMs: 0, earned: {} };
  }

  start(id: string, now = Date.now()): void {
    this.session = { id, lastAt: now };
    if (!this.records.has(id)) this.records.set(id, { cleanMs: 0, earned: {} });
  }

  update(now = Date.now()): boolean {
    if (!this.session) return false;
    const progress = this.records.get(this.session.id)!;
    progress.cleanMs += Math.max(0, now - this.session.lastAt);
    this.session.lastAt = now;
    let awarded = false;
    for (const badge of HABIT_BADGES) {
      if (!progress.earned[badge.id] && progress.cleanMs >= badge.ms) {
        progress.earned[badge.id] = now;
        awarded = true;
      }
    }
    return awarded;
  }

  detected(now = Date.now()): void {
    this.update(now);
    if (this.session) this.records.get(this.session.id)!.cleanMs = 0;
  }

  stop(now = Date.now()): void {
    this.update(now);
    this.session = null;
  }

  serialize(): string { return JSON.stringify([...this.records]); }

  restore(raw: string | null): void {
    this.session = null;
    this.records.clear();
    if (!raw) return;
    try {
      const data: unknown = JSON.parse(raw);
      if (!Array.isArray(data)) return;
      for (const entry of data) {
        if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !entry[1]) continue;
        const value = entry[1];
        const cleanMs = typeof value.cleanMs === 'number' && Number.isFinite(value.cleanMs) ? Math.max(0, value.cleanMs) : 0;
        const earned: Progress['earned'] = {};
        for (const badge of HABIT_BADGES) {
          const time = value.earned?.[badge.id];
          if (typeof time === 'number' && Number.isFinite(time) && time > 0) earned[badge.id] = time;
        }
        this.records.set(entry[0], { cleanMs, earned });
      }
    } catch { /* Corrupt rewards must not block app startup. */ }
  }
}

export function formatHabitTime(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
