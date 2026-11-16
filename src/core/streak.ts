import type { Draft } from "immer";
import { type Feature, type FeatureApi, feature, type ResetRule } from "./feature";
import { dayKey, nextLocalMidnight, previousDayKey } from "./time";

/**
 * The daily streak: one claim a local calendar day, and a run of consecutive days that a missed day breaks. Days are
 * the player's local calendar days (`dayKey`), so a day of 23 or 25 hours across a daylight-saving change is still one
 * day. `grace` lets a run survive that many missed days; `keep` lets a game charge to save a run that would break.
 * The kernel is pure over the state and the `now` it is handed; `streak({ key, rewards })` is the feature.
 */

/** The streak's saved state: the day last claimed, the current run, the longest run and the claims ever. */
export interface StreakState {
  /** The local day key of the last claim, or null before the first. */
  lastDay: string | null;
  /** Consecutive days claimed, the last one included. */
  count: number;
  best: number;
  total: number;
}

/** The streak at a moment: whether today can be claimed, the run that is still alive, and the wait to the next day. */
export interface StreakStatus {
  readonly canClaim: boolean;
  /** The run as it stands: 0 once broken. */
  readonly count: number;
  /** More days were missed than `grace` allows: the next claim starts a new run (unless kept). */
  readonly broken: boolean;
  /** Days missed since the last claim (0 when it was yesterday or today), 366 at most. */
  readonly missed: number;
  /** Until the next local midnight when today is claimed; 0 when it can be claimed now. */
  readonly msUntilNext: number;
}

/** The rules a claim follows: missed days a run survives, and the game's offer to save one that would break. */
export interface StreakRules {
  /** Missed days a run survives (default 0). */
  readonly grace?: number;
  /** Called when a claim would break the run: true keeps it (the game charged for it). */
  readonly keep?: (missed: number) => boolean;
}

/** A fresh streak. */
export const NO_STREAK: StreakState = { lastDay: null, count: 0, best: 0, total: 0 };

/** The most missed days counted: past it, the count stops (the run is long broken). */
const MISSED_LIMIT = 366;

/** Whole local days missed between `lastDay` and `today` (0 when it was yesterday), walked by the calendar. */
function missedSince(lastDay: string, today: string): number {
  let missed = 0;
  for (let k = previousDayKey(today); k > lastDay && missed < MISSED_LIMIT; k = previousDayKey(k))
    missed += 1;
  return missed;
}

/**
 * The streak at `now`. A claim from a later day than today (a clock set back) blocks claiming until that day comes,
 * and breaks nothing.
 */
export function streakStatus(
  state: StreakState,
  now: number,
  rules: Pick<StreakRules, "grace"> = {},
): StreakStatus {
  const today = dayKey(now);
  const wait = nextLocalMidnight(now) - now;
  if (state.lastDay !== null && state.lastDay >= today)
    return { canClaim: false, count: state.count, broken: false, missed: 0, msUntilNext: wait };
  if (state.lastDay === null) return { canClaim: true, count: 0, broken: false, missed: 0, msUntilNext: 0 };
  const missed = missedSince(state.lastDay, today);
  const broken = missed > Math.max(0, Math.floor(rules.grace ?? 0));
  return { canClaim: true, count: broken ? 0 : state.count, broken, missed, msUntilNext: 0 };
}

/**
 * Claims today at `now`: the run goes up by one, or starts again at one when it broke and `keep` did not save it.
 * Pure: returns the new state and the day of the run claimed (1 the first), or null when today is claimed already.
 */
export function claimStreak(
  state: StreakState,
  now: number,
  rules: StreakRules = {},
): { state: StreakState; day: number; kept: boolean } | null {
  const status = streakStatus(state, now, rules);
  if (!status.canClaim) return null;
  const kept = status.broken && (rules.keep?.(status.missed) ?? false);
  const count = status.broken && !kept ? 1 : state.count + 1;
  return {
    state: { lastDay: dayKey(now), count, best: Math.max(state.best, count), total: state.total + 1 },
    day: count,
    kept,
  };
}

/** What a claim gave: the day of the run and its reward. */
export interface StreakClaim<R> {
  readonly day: number;
  readonly reward: R;
  /** The run would have broken and the game's `keep` saved it. */
  readonly kept: boolean;
}

/** The streak feature's actions. */
export interface StreakActions<R> {
  /** Claims today at game time now: the day and its reward, or null when today is claimed already. */
  claim(): StreakClaim<R> | null;
}

/** A `streak` feature, carrying its status read as `.status`. */
export type StreakFeature<K extends string, R> = Feature<K, StreakState, StreakActions<R>> & {
  /** The streak at `now`, by the feature's grace. */
  status(state: StreakState, now: number): StreakStatus;
};

/**
 * The daily return as a feature. It saves `StreakState` under `key` and never resets with a run (unless `reset` says
 * otherwise). `claim()` claims today, reads `rewards(day)` for the day of the run claimed and runs `onClaim(draft,
 * reward, day, now)` in the same recipe. When the run would break, `keep(draft, missed)` may charge and return true to
 * save it. No steps: nothing happens until the player claims.
 */
export function streak<const K extends string, R, G extends object = object>(def: {
  readonly key: K;
  readonly rewards: (day: number) => R;
  readonly onClaim?: (draft: Draft<G>, reward: R, day: number, now: number) => void;
  readonly grace?: number;
  readonly keep?: (draft: Draft<G>, missed: number) => boolean;
  readonly reset?: ResetRule<StreakState>;
}): StreakFeature<K, R> {
  type Own = Record<K, StreakState>;
  const own = (draft: unknown): StreakState => (draft as Own)[def.key];
  const made = feature({
    key: def.key,
    initial: (): StreakState => ({ ...NO_STREAK }),
    reset: def.reset ?? "never",
    actions: (api: FeatureApi<Own>): StreakActions<R> => ({
      claim: () => {
        let got: StreakClaim<R> | null = null;
        const now = api.now();
        api.set((d) => {
          const draft = d as unknown as Draft<G>;
          const keep = def.keep;
          const step = claimStreak({ ...own(d) }, now, {
            grace: def.grace,
            keep: keep ? (missed) => keep(draft, missed) : undefined,
          });
          if (!step) return;
          Object.assign(own(d), step.state);
          const reward = def.rewards(step.day);
          got = { day: step.day, reward, kept: step.kept };
          def.onClaim?.(draft, reward, step.day, now);
        });
        return got;
      },
    }),
  });
  return Object.assign(made, {
    status: (state: StreakState, now: number) => streakStatus(state, now, { grace: def.grace }),
  });
}
