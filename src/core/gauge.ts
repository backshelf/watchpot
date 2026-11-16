import type { Draft } from "immer";
import { type Feature, type FeatureApi, feature, type ResetRule } from "./feature";

/**
 * Gauges: a bounded level that a rate fills or drains over time, and that trips at the top. A trip locks the gauge
 * for a while and drops the level; what a lock means (no output, a closed shop) is the game's to read. The risk
 * meter of a push-your-luck loop: heat, pressure, suspicion, strain. `stepGauge` is the pure kernel; `gauge({ key,
 * max, rate, trip })` is a feature that steps its level every tick and over an absence.
 */

/** A gauge's saved state: its level and the game time its lock ends (0 when it never tripped). */
export interface GaugeState {
  level: number;
  lockedUntil: number;
  /** Trips, ever (or since the last reset that cleared the gauge). */
  trips: number;
}

/** What a trip does: how long the gauge locks and the level it drops to. */
export interface GaugeTrip {
  /** How long the lock lasts. */
  readonly lockMs: number;
  /** The level after the trip, as a share of `max` (default 0). */
  readonly dropTo?: number;
  /** The rate while locked, per second (default 0: the level holds). */
  readonly lockedRate?: number;
}

/** The bounds and the trip `stepGauge` works to. */
export interface GaugeRules {
  readonly max: number;
  readonly trip?: GaugeTrip;
}

/** One step's result: the state after, and whether the gauge tripped inside the step. */
export interface GaugeStep {
  readonly state: GaugeState;
  readonly tripped: boolean;
}

/** Whether the gauge is locked at `now`. */
export function gaugeLocked(state: Pick<GaugeState, "lockedUntil">, now: number): boolean {
  return now < state.lockedUntil;
}

/** The level as a share of `max`, 0 to 1. */
export function gaugeFill(state: Pick<GaugeState, "level">, max: number): number {
  return max > 0 ? Math.min(1, Math.max(0, state.level / max)) : 0;
}

/** Seconds until the level reaches the top at `perSecond`, or null when it is not rising. */
export function secondsToTrip(
  state: Pick<GaugeState, "level">,
  perSecond: number,
  max: number,
): number | null {
  return perSecond > 0 ? Math.max(0, (max - state.level) / perSecond) : null;
}

/**
 * Steps a gauge over `dtMs` ending at `now` with the level moving `perSecond`. The part of the step that falls
 * inside a lock moves at the trip's `lockedRate`; the rest at `perSecond`. A level that reaches `max` trips once:
 * the lock starts at the moment it got there, the level drops, and what is left of the step runs locked. Without a
 * `trip` the level just holds at `max`. Pure; returns a new state.
 */
export function stepGauge(
  state: GaugeState,
  perSecond: number,
  dtMs: number,
  now: number,
  rules: GaugeRules,
): GaugeStep {
  const clamp = (v: number) => Math.min(rules.max, Math.max(0, v));
  const lockedRate = rules.trip?.lockedRate ?? 0;
  const start = now - Math.max(0, dtMs);
  let level = state.level;
  let lockedUntil = state.lockedUntil;
  let trips = state.trips;
  let tripped = false;

  // The stretch still inside an earlier lock.
  const lockedMs = Math.min(Math.max(0, lockedUntil - start), Math.max(0, dtMs));
  level = clamp(level + (lockedRate * lockedMs) / 1000);
  let freeMs = Math.max(0, dtMs) - lockedMs;

  if (freeMs > 0 && perSecond !== 0) {
    const toTop = perSecond > 0 ? ((rules.max - level) / perSecond) * 1000 : Number.POSITIVE_INFINITY;
    if (rules.trip && toTop <= freeMs) {
      const at = now - freeMs + toTop;
      tripped = true;
      trips += 1;
      lockedUntil = at + rules.trip.lockMs;
      level = clamp(rules.max * (rules.trip.dropTo ?? 0));
      freeMs = Math.min(freeMs - toTop, rules.trip.lockMs);
      level = clamp(level + (lockedRate * freeMs) / 1000);
    } else {
      level = clamp(level + (perSecond * freeMs) / 1000);
    }
  }
  return { state: { level, lockedUntil, trips }, tripped };
}

/** The gauge feature's actions. */
export interface GaugeActions {
  /** Moves the level by `amount` (clamped); a rise to the top trips it. Returns whether it tripped. */
  nudge(amount: number): boolean;
}

/** A `gauge` feature, carrying its rules as `.rules`. */
export type GaugeFeature<K extends string> = Feature<K, GaugeState, GaugeActions> & {
  readonly rules: GaugeRules;
};

/**
 * A gauge as a feature. `rate(state)` is the level's change per second with the tab open, read off the whole game
 * state each tick; `awayRate(state)` the same over an absence (default: the gauge drains at `max` per hour, so a
 * player comes back to a cool one). `onTrip(draft, now)` runs in the same recipe as a trip. Its step is
 * `<key>.rates.level`, before `produce`, so a game's income step already sees a lock. A prestige reset starts the
 * gauge over unless `reset` says otherwise.
 */
export function gauge<const K extends string, G extends object = object>(def: {
  readonly key: K;
  readonly max: number;
  readonly trip?: GaugeTrip;
  readonly rate: (state: G) => number;
  readonly awayRate?: (state: G) => number;
  readonly onTrip?: (draft: Draft<G>, now: number) => void;
  readonly reset?: ResetRule<GaugeState>;
}): GaugeFeature<K> {
  const rules: GaugeRules = { max: def.max, trip: def.trip };
  type Own = Record<K, GaugeState>;
  const slice = (draft: unknown): GaugeState => (draft as Own)[def.key];
  const land = (draft: unknown, step: GaugeStep, now: number) => {
    Object.assign(slice(draft), step.state);
    if (step.tripped) def.onTrip?.(draft as Draft<G>, now);
  };
  const made = feature({
    key: def.key,
    initial: (): GaugeState => ({ level: 0, lockedUntil: 0, trips: 0 }),
    reset: def.reset ?? "run",
    actions: (api: FeatureApi<Own>): GaugeActions => ({
      nudge: (amount) => {
        let tripped = false;
        const now = api.now();
        api.set((d) => {
          const s = slice(d);
          if (gaugeLocked(s, now)) return;
          // A nudge is a step of one second at `amount` per second, ending now.
          const step = stepGauge({ ...s, lockedUntil: 0 }, amount, 1000, now, rules);
          if (step.tripped && rules.trip) step.state.lockedUntil = now + rules.trip.lockMs;
          tripped = step.tripped;
          land(d, step, now);
        });
        return tripped;
      },
    }),
    steps: {
      rates: {
        level: (d: Draft<Own>, ctx) => {
          if (ctx.dtMs <= 0) return;
          const state = d as unknown as G;
          const away = def.awayRate ? def.awayRate(state) : -def.max / 3600;
          const perSecond = ctx.pass === "tick" ? def.rate(state) : away;
          land(d, stepGauge({ ...slice(d) }, perSecond, ctx.dtMs, ctx.now, rules), ctx.now);
        },
      },
    },
  });
  return Object.assign(made, { rules });
}
