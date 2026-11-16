import type { Draft } from "immer";
import { offlineCredit } from "./clock";
import { D, Decimal, type DecimalSource, ZERO } from "./decimal";
import type { DimensionAway } from "./dimensions";
import {
  type Feature,
  type FeatureApi,
  feature,
  type NeedsOf,
  type ReachOf,
  type ReachShape,
  type ResetRule,
} from "./feature";

/**
 * Stages: a track of walls, each with more resistance than the last, worn down by a force. The stage in front takes
 * `force` a second; when what it has taken reaches its resistance it falls and the next one stands. Zones, floors,
 * waves, a front line on a map. A stretch of any length is exact: one long step clears what many short ones would.
 * `advanceTrack` is the kernel; `stages({ key, tracks, force })` is a feature with a track state each, and `select`,
 * `def` and `draft` beside it. What a fallen
 * stage pays is the game's (`onClear`).
 */

/** One track: how its resistance climbs, its bosses, and an optional time limit per stage. */
export interface StageTrack {
  readonly id: string;
  /** Stage `n`'s resistance (from 0): `base × growth ^ n`, or the game's own function. */
  readonly resistance:
    | { readonly base: DecimalSource; readonly growth: number }
    | ((stage: number) => DecimalSource);
  /** Every `every`th stage (the 10th, the 20th) has its resistance multiplied by `mult`. */
  readonly boss?: { readonly every: number; readonly mult: number };
  /**
   * A stage must fall inside this long. One the force cannot wear down in time stands (nothing builds up against it),
   * so the track is a wall until the force grows, not a wait.
   */
  readonly limitMs?: number;
  /** How many stages the track has (default: no end). */
  readonly length?: number;
}

/** A track's saved state: the stage in front (the count cleared), what it has taken, and the furthest reached. */
export interface TrackState {
  stage: number;
  worn: Decimal;
  best: number;
}

/** The most stages one step clears; past it the rest of the step's force is dropped. */
export const STAGE_WALK_LIMIT = 10_000;

/** Stage `stage`'s resistance on a track. */
export function resistanceAt(track: StageTrack, stage: number): Decimal {
  const n = Math.max(0, Math.floor(stage));
  const base =
    typeof track.resistance === "function"
      ? D(track.resistance(n))
      : D(track.resistance.base).mul(Decimal.pow(track.resistance.growth, n));
  const boss = track.boss;
  return boss && boss.every > 0 && (n + 1) % boss.every === 0 ? base.mul(boss.mult) : base;
}

/** Whether the track has no stage left. */
export const trackEnded = (track: StageTrack, state: Pick<TrackState, "stage">): boolean =>
  track.length !== undefined && state.stage >= track.length;

/** Whether `force` a second can bring the stage in front down at all (always, without a time limit). */
export function passable(track: StageTrack, state: Pick<TrackState, "stage">, force: DecimalSource): boolean {
  if (trackEnded(track, state) || !D(force).gt(0)) return false;
  if (track.limitMs === undefined) return true;
  return D(force)
    .mul(track.limitMs / 1000)
    .gte(resistanceAt(track, state.stage));
}

/** One step's result: the state after, and how many stages fell. */
export interface TrackStep {
  readonly state: TrackState;
  readonly cleared: number;
}

/**
 * Wears a track for `dtMs` at `force` a second. The stage in front takes the force until it falls, the next takes
 * what is left, and so on (at most `STAGE_WALK_LIMIT` in one step). With a time limit, a stage the force could not
 * bring down in time takes nothing. Pure; returns a new state.
 */
export function advanceTrack(
  state: TrackState,
  force: DecimalSource,
  dtMs: number,
  track: StageTrack,
): TrackStep {
  const perSecond = D(force);
  let left = perSecond.mul(Math.max(0, dtMs) / 1000);
  let { stage, worn } = state;
  let cleared = 0;
  while (left.gt(0) && cleared < STAGE_WALK_LIMIT) {
    if (!passable(track, { stage }, perSecond)) {
      // A wall: nothing builds up against a stage that cannot fall in time.
      if (track.limitMs !== undefined) worn = ZERO;
      break;
    }
    const need = resistanceAt(track, stage).sub(worn);
    if (left.lt(need)) {
      worn = worn.add(left);
      break;
    }
    left = left.sub(need);
    stage += 1;
    worn = ZERO;
    cleared += 1;
  }
  return { state: { stage, worn, best: Math.max(state.best, stage) }, cleared };
}

/** How far the stage in front is worn, 0 to 1. */
export function trackFill(track: StageTrack, state: TrackState): number {
  if (trackEnded(track, state)) return 1;
  const need = resistanceAt(track, state.stage);
  return need.gt(0) ? Math.min(1, state.worn.div(need).toNumber()) : 1;
}

/** Seconds until the stage in front falls at `force`, or null when it cannot. */
export function secondsToClear(track: StageTrack, state: TrackState, force: DecimalSource): number | null {
  if (!passable(track, state, force)) return null;
  return resistanceAt(track, state.stage).sub(state.worn).div(force).toNumber();
}

/** A stages feature's saved state: a track state per track id. */
export interface StagesState {
  tracks: Record<string, TrackState>;
}

/** The stages feature's actions. */
export interface StagesActions {
  /** Stands in front of an earlier stage again (never past the furthest reached). Returns whether it moved. */
  enter(track: string, stage: number): boolean;
}

/** The read-only questions over state, for recipes, steps, callbacks and screens. */
export interface StageSelect<G> {
  /** The wear a second the game's `force` gives the track now (never below zero). */
  force(state: G, id: string): Decimal;
  /** How far the stage in front is worn, 0 to 1. */
  fill(state: G, id: string): number;
  /** Whether the force can bring the stage in front down at all. */
  passable(state: G, id: string): boolean;
  /** Seconds until the stage in front falls, or null when it cannot. */
  secondsToClear(state: G, id: string): number | null;
  /** Whether the track has no stage left (true for an unknown track). */
  ended(state: G, id: string): boolean;
}

/** The fixed configuration of a stages feature. */
export interface StageDefs {
  readonly tracks: readonly StageTrack[];
  /** One track of the list by id. */
  track(id: string): StageTrack | undefined;
  /** Stage `stage`'s resistance on the track (zero for an unknown track). */
  resistance(id: string, stage: number): Decimal;
}

/** The helpers that take a draft first and change it. Stages has none: its changes are its step and its action. */
export type StageDraftHelpers = Record<never, never>;

/** The three namespaces of a stages feature. */
export interface StageHelpers<G> {
  readonly select: StageSelect<G>;
  readonly def: StageDefs;
  readonly draft: StageDraftHelpers;
}

/** A `stages` feature: the feature plus `select`, `def` and `draft`. */
export type StagesFeature<K extends string, G> = Feature<K, StagesState, StagesActions> & StageHelpers<G>;

/**
 * Stages as a feature. It saves a `TrackState` per track under `key` and wears every open track in
 * `<key>.produce.advance`: over a tick for its length, over an absence for what `away(state)` credits (default: all
 * of it). `force(state, track)` is the wear a second, read off the whole game state; `open(state, track)` holds a
 * track still until it is unlocked. `onClear(draft, track, from, to, now)` runs in the same recipe as a step that
 * cleared stages `from` up to (not including) `to`. A prestige reset starts every track over and keeps `best`, unless
 * `reset` says otherwise. The callbacks read the game state: the feature's own slice and whatever `reach` names.
 *
 * `select`: `force`, `fill`, `passable`, `secondsToClear`, `ended`. `def`: `tracks`, `track(id)`, `resistance(id,
 * stage)`. `draft`: empty.
 */
export function stages<
  const K extends string,
  const R extends ReachShape = readonly [],
  G extends object = Record<K, StagesState> & ReachOf<R>,
>(def: {
  readonly key: K;
  /** The features the callbacks read, as `feature`'s `reach`. */
  readonly reach?: R | (() => R);
  readonly tracks: readonly StageTrack[];
  readonly force: (state: G, track: StageTrack) => DecimalSource;
  readonly open?: (state: G, track: StageTrack) => boolean;
  readonly onClear?: (draft: Draft<G>, track: string, from: number, to: number, now: number) => void;
  readonly away?: (state: G) => DimensionAway;
  readonly reset?: ResetRule<StagesState>;
}): StagesFeature<K, G> & { readonly needs?: NeedsOf<R> } {
  const byId = new Map<string, StageTrack>();
  for (const t of def.tracks) {
    if (byId.has(t.id)) throw new Error(`stages "${def.key}": the track "${t.id}" appears twice`);
    byId.set(t.id, t);
  }
  type Own = Record<K, StagesState>;
  const slice = (state: unknown): StagesState => (state as Own)[def.key];
  const fresh = (): TrackState => ({ stage: 0, worn: ZERO, best: 0 });
  const stateOf = (state: unknown, id: string): TrackState => slice(state).tracks[id] ?? fresh();
  const forceOf = (state: G, t: StageTrack): Decimal => Decimal.max(0, D(def.force(state, t)));
  const withTrack = <T>(id: string, none: T, read: (t: StageTrack) => T): T => {
    const t = byId.get(id);
    return t ? read(t) : none;
  };

  const helpers: StageHelpers<G> = {
    select: {
      force: (state, id) => withTrack(id, ZERO, (t) => forceOf(state, t)),
      fill: (state, id) => withTrack(id, 0, (t) => trackFill(t, stateOf(state, id))),
      passable: (state, id) =>
        withTrack(id, false, (t) => passable(t, stateOf(state, id), forceOf(state, t))),
      secondsToClear: (state, id) =>
        withTrack(id, null, (t) => secondsToClear(t, stateOf(state, id), forceOf(state, t))),
      ended: (state, id) => withTrack(id, true, (t) => trackEnded(t, stateOf(state, id))),
    },
    def: {
      tracks: def.tracks,
      track: (id) => byId.get(id),
      resistance: (id, stage) => withTrack(id, ZERO, (t) => resistanceAt(t, stage)),
    },
    draft: {},
  };

  const made = feature<K, StagesState, StagesActions, ReachShape, Record<never, never>, Own>({
    reach: def.reach,
    key: def.key,
    initial: (): StagesState => ({ tracks: Object.fromEntries(def.tracks.map((t) => [t.id, fresh()])) }),
    reset:
      def.reset ??
      ((before, after) => ({
        tracks: Object.fromEntries(
          def.tracks.map((t) => [
            t.id,
            { ...(after.tracks[t.id] ?? fresh()), best: before.tracks[t.id]?.best ?? 0 },
          ]),
        ),
      })),
    actions: (api: FeatureApi<Own>): StagesActions => ({
      enter: (track, stage) => {
        let moved = false;
        api.set((d) => {
          const s = slice(d).tracks[track];
          const to = Math.floor(stage);
          if (!s || !byId.has(track) || !(to >= 0) || to > s.best || to === s.stage) return;
          s.stage = to;
          s.worn = ZERO;
          moved = true;
        });
        return moved;
      },
    }),
    steps: {
      produce: {
        advance: {
          pass: "both",
          run: (d: Draft<Own>, ctx) => {
            const state = d as unknown as G;
            let dtMs = ctx.dtMs;
            if (ctx.pass === "catchUp") {
              const away = def.away?.(state) ?? { rate: 1 };
              dtMs = offlineCredit(ctx.dtMs, away.rate, away.capMs ?? Number.POSITIVE_INFINITY).creditedMs;
            }
            if (dtMs <= 0) return;
            const all = slice(d).tracks;
            for (const t of def.tracks) {
              if (def.open && !def.open(state, t)) continue;
              const was = all[t.id] ?? fresh();
              const step = advanceTrack(was, forceOf(state, t), dtMs, t);
              all[t.id] = step.state;
              if (step.cleared > 0)
                def.onClear?.(d as unknown as Draft<G>, t.id, was.stage, step.state.stage, ctx.now);
            }
          },
        },
      },
    },
  });
  return Object.assign(made, helpers) as StagesFeature<K, G> & { readonly needs?: NeedsOf<R> };
}
