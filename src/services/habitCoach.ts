import AsyncStorage from '@react-native-async-storage/async-storage';

/** A small contextual bandit: rank curated actions, then learn from feedback. */
export const COACH_MOMENTS = [
  { id: 'focused', label: 'Studying / working' },
  { id: 'restless', label: 'Feeling restless' },
  { id: 'stressed', label: 'Feeling stressed' },
] as const;

export type CoachMoment = typeof COACH_MOMENTS[number]['id'];

export const COACH_ACTIONS = [
  {
    id: 'hands', emoji: '✋', title: 'Give your hands a job',
    step: 'Hold a pen or a soft object for one minute. Give your hands somewhere else to go when you notice the habit.',
    moments: ['restless', 'focused'],
  },
  {
    id: 'pause', emoji: '🌿', title: 'Take a tiny reset',
    step: 'Pause for a minute, relax your shoulders, and take a few easy breaths. Then choose one small thing to do next.',
    moments: ['stressed'],
  },
  {
    id: 'anchor', emoji: '🛡️', title: 'Find a resting spot',
    step: 'Rest your hands comfortably on your lap or desk for one minute. Each time you notice the habit, gently return them there.',
    moments: ['focused', 'stressed'],
  },
  {
    id: 'cue', emoji: '💡', title: 'Make a friendly reminder',
    step: 'Put a small note near you: “Notice, pause, reset.” Use it as a gentle cue to choose a different action.',
    moments: ['restless'],
  },
] as const;

export type CoachAction = typeof COACH_ACTIONS[number];
export interface CoachRating { helpful: number; tried: number }
export type CoachHistory = Record<string, CoachRating>;

function ratingKey(scope: string, moment: CoachMoment, actionId: string): string {
  return JSON.stringify([scope, moment, actionId]);
}

/** Ignore damaged/old entries rather than letting invalid numbers bias the model. */
export function parseCoachHistory(raw: string | null): CoachHistory {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const history: CoachHistory = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object') continue;
      const { helpful, tried } = value as Partial<CoachRating>;
      if (typeof helpful === 'number' && typeof tried === 'number' &&
          Number.isSafeInteger(helpful) && Number.isSafeInteger(tried) &&
          helpful >= 0 && tried > 0 && helpful <= tried) {
        history[key] = { helpful, tried };
      }
    }
    return history;
  } catch { return {}; }
}

export function recommendCoachAction(
  history: CoachHistory,
  scope: string,
  moment: CoachMoment,
  excluded: readonly string[] = [],
): { action: CoachAction; learned: boolean } {
  const candidates = COACH_ACTIONS.filter((action) => !excluded.includes(action.id));
  const pool = candidates.length ? candidates : [...COACH_ACTIONS];
  const total = COACH_ACTIONS.reduce((sum, action) =>
    sum + (history[ratingKey(scope, moment, action.id)]?.tried ?? 0), 0);
  const score = (action: CoachAction) => {
    const rating = history[ratingKey(scope, moment, action.id)];
    // Beta prior favors context-suited actions before the user has rated anything.
    const suited = (action.moments as readonly string[]).includes(moment);
    const alpha = suited ? 3 : 1;
    const beta = 1;
    const tried = rating?.tried ?? 0;
    const mean = (alpha + (rating?.helpful ?? 0)) / (alpha + beta + tried);
    // Explore under-tried actions so one early rating does not lock in a choice.
    return mean + 0.15 * Math.sqrt(Math.log(1 + total) / (1 + tried));
  };
  pool.sort((a, b) => score(b) - score(a));
  return { action: pool[0], learned: total > 0 };
}

export function recordCoachFeedback(
  history: CoachHistory, scope: string, moment: CoachMoment,
  actionId: string, helpful: boolean,
): CoachHistory {
  const key = ratingKey(scope, moment, actionId);
  const previous = history[key] ?? { helpful: 0, tried: 0 };
  return {
    ...history,
    [key]: { helpful: previous.helpful + (helpful ? 1 : 0), tried: previous.tried + 1 },
  };
}

const STORAGE_KEY = 'habitCoach.learning.v1';
let pendingStorage: Promise<unknown> = Promise.resolve();

// Serialize reads/writes when a behavior changes during an in-flight rating.
function withStorage<T>(operation: () => Promise<T>): Promise<T> {
  const result = pendingStorage.then(operation);
  pendingStorage = result.catch(() => {});
  return result;
}

export function loadCoachHistory(): Promise<CoachHistory> {
  return withStorage(async () => parseCoachHistory(await AsyncStorage.getItem(STORAGE_KEY)));
}

export function saveCoachFeedback(
  scope: string, moment: CoachMoment, actionId: string, helpful: boolean,
): Promise<CoachHistory> {
  return withStorage(async () => {
    const history = parseCoachHistory(await AsyncStorage.getItem(STORAGE_KEY));
    const next = recordCoachFeedback(history, scope, moment, actionId, helpful);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  });
}

export function resetCoachHistory(): Promise<void> {
  return withStorage(() => AsyncStorage.removeItem(STORAGE_KEY));
}
