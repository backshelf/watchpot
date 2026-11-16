import type { Draft } from "immer";
import {
  type Feature,
  type FeatureApi,
  feature,
  type Move,
  type NeedsOf,
  type ReachOf,
  type ReachShape,
  type ResetRule,
} from "./feature";
import type { CallbackContext } from "./gauge";
import { nextFloat, pickWeighted, type RngState, seedRng } from "./rng";

/**
 * Spawns: random clickable arrivals. Something appears after a random wait, lives a few seconds, and pays one of a
 * weighted table of outcomes when caught; one not caught in time is missed and pays nothing. The usual
 * random-arrival model: the wait is at least `minMs` and at most `maxMs`, and past the minimum the chance it comes
 * rises steeply (`ramp`), so most arrive late in the window. Every draw is on the kind's own saved rng stream.
 *
 * `drawSpawnWait`, `drawOutcome` and `advanceSpawn` are the pure kernel; `defineSpawns({ key, kinds })` is the feature.
 */

/**
 * How long until the next arrival. Without `ramp` the wait is uniform from `minMs` to `maxMs`. With it: past `minMs`
 * every `stepMs` it arrives with chance `u^power`, where `u = (t - minMs) / (maxMs - minMs)`, and at `maxMs` it
 * arrives for sure.
 */
export interface SpawnWait {
  readonly minMs: number;
  readonly maxMs: number;
  readonly ramp?: { readonly power: number; readonly stepMs: number };
}

/** One outcome of a catch: its weight, an optional gate on the game state, and whether it may come twice in a row. */
export interface SpawnOutcome<G> {
  readonly id: string;
  readonly weight: number;
  /** Open only while this holds, read at the game time the outcome is drawn. */
  readonly when?: (state: G, ctx: CallbackContext) => boolean;
  /** Never the same outcome as the last catch of this kind. */
  readonly noRepeat?: boolean;
}

/** The one arrival live now. */
export interface LiveSpawn {
  /** `<kind>:<n>`, n counting every arrival of the kind. */
  id: string;
  bornAt: number;
  diesAt: number;
  /** The outcome, when the kind draws it at arrival (`drawAt: "birth"`). */
  outcome?: string;
}

/** One kind's saved state. */
export interface SpawnState {
  /** When the next one arrives; 0 until the feature has scheduled one. */
  nextAt: number;
  live: LiveSpawn | null;
  caught: number;
  missed: number;
  /** Arrivals, ever: the `n` of the next live id. */
  born: number;
  /** The last outcome caught, for `noRepeat`. */
  last: string | null;
  rng: RngState;
}

/**
 * Draws a wait. Uniform: `minMs + r × (maxMs - minMs)`. With a ramp the chance per step is a hazard of
 * `u^p / stepMs` per millisecond, so the chance it has not come by `u` is `exp(-span / stepMs × u^(p+1) / (p+1))`,
 * `span = maxMs - minMs`. Inverse-transform sampling makes that one draw: with `e = -ln(r)`, `u = ((p+1) × e × stepMs /
 * span)^(1/(p+1))`, capped at 1 (the forced arrival at `maxMs`). Pure.
 */
export function drawSpawnWait(rng: RngState, wait: SpawnWait): [number, RngState] {
  const min = Math.max(0, wait.minMs);
  const span = Math.max(0, wait.maxMs - min);
  const [r, next] = nextFloat(rng);
  if (span === 0) return [min, next];
  if (!wait.ramp) return [min + r * span, next];
  const p = Math.max(0, wait.ramp.power);
  const e = -Math.log(1 - r); // 1 - r is in (0, 1]
  const u = Math.min(1, (((p + 1) * e * Math.max(1e-9, wait.ramp.stepMs)) / span) ** (1 / (p + 1)));
  return [min + u * span, next];
}

/**
 * Draws an outcome among those open (`when` holds at `ctx`, default game time 0, and not a `noRepeat` repeat of
 * `last`); null when none is. Pure.
 */
export function drawOutcome<G>(
  rng: RngState,
  outcomes: readonly SpawnOutcome<G>[],
  state: G,
  last: string | null,
  ctx: CallbackContext = { now: 0 },
): [string | null, RngState] {
  const weights = outcomes.map((o) =>
    (o.when?.(state, ctx) ?? true) && !(o.noRepeat && o.id === last) ? Math.max(0, o.weight) : 0,
  );
  if (!weights.some((w) => w > 0)) return [null, rng];
  const [i, next] = pickWeighted(rng, weights);
  return [outcomes[i]?.id ?? null, next];
}

/** What `advanceSpawn` needs: the wait, the life, and the outcome drawn at an arrival when the kind draws at birth. */
export interface SpawnTiming {
  readonly kind: string;
  readonly wait: SpawnWait;
  readonly lifeMs: number;
  /** Draws the outcome at an arrival (`drawAt: "birth"`); left out to draw at the catch. */
  readonly atBirth?: (rng: RngState, last: string | null) => [string | null, RngState];
}

/** The most arrivals one pass walks through; past it the wait starts over from `now`. */
export const SPAWN_WALK_LIMIT = 10_000;

/**
 * Brings a kind up to `now`: the live one dies at `diesAt` (missed), the next arrives at `nextAt` and its wait from
 * the moment the last one died or was caught, as often as fit; at most one is left live. Pure: returns the state (`state`
 * itself when nothing happened) and how many arrived and were missed.
 */
export function advanceSpawn(
  state: SpawnState,
  now: number,
  timing: SpawnTiming,
): { state: SpawnState; born: number; missed: number } {
  const s: SpawnState = { ...state };
  let born = 0;
  let missed = 0;
  let changed = false;
  const schedule = (from: number) => {
    changed = true;
    const [wait, rng] = drawSpawnWait(s.rng, timing.wait);
    s.rng = rng;
    s.nextAt = from + wait;
  };
  if (s.nextAt <= 0 && !s.live) schedule(now);
  for (let i = 0; i < SPAWN_WALK_LIMIT; i++) {
    if (s.live && s.live.diesAt <= now) {
      const diedAt = s.live.diesAt;
      s.live = null;
      s.missed += 1;
      missed += 1;
      schedule(diedAt);
      continue;
    }
    if (!s.live && s.nextAt <= now) {
      const live: LiveSpawn = {
        id: `${timing.kind}:${s.born}`,
        bornAt: s.nextAt,
        diesAt: s.nextAt + Math.max(0, timing.lifeMs),
      };
      if (timing.atBirth) {
        const [outcome, rng] = timing.atBirth(s.rng, s.last);
        s.rng = rng;
        if (outcome !== null) live.outcome = outcome;
      }
      s.live = live;
      s.born += 1;
      born += 1;
      continue;
    }
    return { state: changed || born > 0 ? s : state, born, missed };
  }
  s.live = null;
  schedule(now);
  return { state: s, born, missed };
}

/** One kind of arrival: its wait, its life, its outcome table and when the outcome is drawn. */
export interface SpawnKind<G> {
  readonly id: string;
  /** The wait between arrivals, fixed or read off the game state (upgrades that bring them sooner). */
  readonly wait: SpawnWait | ((state: G, ctx: CallbackContext) => SpawnWait);
  /** How long one stays catchable. */
  readonly lifeMs: number | ((state: G, ctx: CallbackContext) => number);
  readonly outcomes: readonly SpawnOutcome<G>[];
  /** `"catch"` (default): the outcome is drawn when caught. `"birth"`: drawn at arrival and shown on `live.outcome`. */
  readonly drawAt?: "catch" | "birth";
  /** While this is false nothing arrives, and the wait starts over once it holds. Default: always. */
  readonly active?: (state: G, ctx: CallbackContext) => boolean;
  /** What catching it is worth to the auto-player (default 1). */
  readonly worth?: (state: G, ctx: CallbackContext) => number;
}

/** The spawns feature's saved state: each kind's, by id. */
export interface SpawnsState {
  kinds: Record<string, SpawnState>;
}

/** The spawns feature's actions. */
export interface SpawnsActions {
  /** Catches the kind's live arrival at game time now: the outcome's id, or null when none is live or none is open. */
  catch(kind: string): string | null;
}

/** Any state or draft holding the spawns' state under its key. */
export type SpawnsHost<K extends string> = { readonly [P in K]: SpawnsState };

/** The read-only questions over state. A spawns feature has none of its own: the live arrival is `state[key].kinds[id].live`. */
export type SpawnsSelect = Record<never, never>;

/** The fixed configuration of a spawns feature. */
export interface SpawnsFixed<G> {
  /** The kinds the feature was given. */
  readonly kinds: readonly SpawnKind<G>[];
}

/** The helpers that take a draft first and change it, named like the actions they mirror. */
export interface SpawnsDraftHelpers<K extends string> {
  /** The catch inside a recipe or a step of the game's (an automatic catcher): the outcome's id, or null. */
  catch(draft: SpawnsHost<K>, kind: string, now: number): string | null;
}

/** A `spawns` feature: the feature plus `select`, `def` and `draft`. */
export type SpawnsFeature<K extends string, G> = Feature<K, SpawnsState, SpawnsActions> & {
  readonly select: SpawnsSelect;
  readonly def: SpawnsFixed<G>;
  readonly draft: SpawnsDraftHelpers<K>;
};

/**
 * Random arrivals as a feature. It saves `{ kinds: { [id]: SpawnState } }` under `key`; its step `<key>.sync.arrive`
 * brings every kind up to the pass's end on game time (over a catch-up the arrivals in the gap are walked through and
 * the missed ones counted, never paid; at most one is left live). `catch(kind)` draws the outcome (or takes the one
 * drawn at birth) and runs `onCatch(draft, outcome, now, kind)` in the same recipe; the next wait starts then. A run
 * reset clears what is live and starts the waits over, and keeps the counts and streams unless `reset` says otherwise.
 * The auto-player catches whatever is live. The kinds' callbacks and `onCatch` see the feature's own slice and what
 * `reach` names; `draft.catch` is the same catch inside a recipe.
 */
export function defineSpawns<
  const K extends string,
  const R extends ReachShape = readonly [],
  G extends object = Record<K, SpawnsState> & ReachOf<R>,
>(def: {
  readonly key: K;
  /** The features the callbacks read, as `feature`'s `reach`. */
  readonly reach?: R | (() => R);
  readonly kinds: readonly SpawnKind<G>[];
  readonly onCatch?: (draft: Draft<G>, outcome: string, now: number, kind: string) => void;
  readonly reset?: ResetRule<SpawnsState>;
}): SpawnsFeature<K, G> & { readonly needs?: NeedsOf<R> } {
  const byId = new Map<string, SpawnKind<G>>();
  for (const k of def.kinds) {
    if (byId.has(k.id)) throw new Error(`spawns "${def.key}": the kind "${k.id}" appears twice`);
    byId.set(k.id, k);
  }
  type Own = Record<K, SpawnsState>;
  const kindsOf = (draft: unknown): Record<string, SpawnState> => (draft as Own)[def.key].kinds;
  const waitOf = (k: SpawnKind<G>, state: G, at: CallbackContext): SpawnWait =>
    typeof k.wait === "function" ? k.wait(state, at) : k.wait;
  const lifeOf = (k: SpawnKind<G>, state: G, at: CallbackContext): number =>
    typeof k.lifeMs === "function" ? k.lifeMs(state, at) : k.lifeMs;
  /** The store's game time, read where a move is valued (0 off a store). */
  const gameNowOf = (st: object): number => (st as { gameNow?: () => number }).gameNow?.() ?? 0;
  const fresh = (k: SpawnKind<G>, rng: RngState): SpawnState => ({
    nextAt: 0,
    live: null,
    caught: 0,
    missed: 0,
    born: 0,
    last: null,
    rng: seedRng(`${rng.join(".")}:${def.key}:${k.id}`),
  });

  /** The catch itself, in a recipe: the outcome's id, or null when none is live or none is open. */
  const take = (d: unknown, kind: string, now: number): string | null => {
    const k = byId.get(kind);
    const s = kindsOf(d)[kind];
    const live = s?.live;
    if (!k || !s || !live || now >= live.diesAt || now < live.bornAt) return null;
    const state = d as unknown as G;
    let outcome = live.outcome ?? null;
    if (outcome === null) {
      const [drawn, rng] = drawOutcome(s.rng, k.outcomes, state, s.last, { now });
      s.rng = rng;
      outcome = drawn;
    }
    if (outcome === null) return null;
    s.live = null;
    s.caught += 1;
    s.last = outcome;
    const [wait, rng] = drawSpawnWait(s.rng, waitOf(k, state, { now }));
    s.rng = rng;
    s.nextAt = now + wait;
    def.onCatch?.(d as Draft<G>, outcome, now, kind);
    return outcome;
  };

  const made = feature<K, SpawnsState, SpawnsActions, ReachShape, Record<never, never>, Own>({
    reach: def.reach,
    key: def.key,
    initial: (ctx): SpawnsState => ({
      kinds: Object.fromEntries(def.kinds.map((k) => [k.id, fresh(k, ctx.rng)])),
    }),
    reset:
      def.reset ??
      ((before, after) => ({
        kinds: Object.fromEntries(
          def.kinds.map((k) => {
            const was = before.kinds[k.id];
            const next = after.kinds[k.id] as SpawnState;
            return [k.id, was ? { ...was, live: null, nextAt: 0 } : next];
          }),
        ),
      })),
    actions: (api: FeatureApi<Own>): SpawnsActions => ({
      catch: (kind) => {
        let got: string | null = null;
        const now = api.now();
        api.set((d) => {
          got = take(d, kind, now);
        });
        return got;
      },
    }),
    steps: {
      sync: {
        arrive: (d: Draft<Own>, ctx) => {
          const state = d as unknown as G;
          const at: CallbackContext = { now: ctx.now };
          const all = kindsOf(d);
          for (const k of def.kinds) {
            const s = all[k.id];
            if (!s) continue;
            if (k.active && !k.active(state, at)) {
              if (s.nextAt !== 0 || s.live) all[k.id] = { ...s, nextAt: 0, live: null };
              continue;
            }
            const atBirth =
              k.drawAt === "birth"
                ? (rng: RngState, last: string | null) => drawOutcome(rng, k.outcomes, state, last, at)
                : undefined;
            const step = advanceSpawn(s, ctx.now, {
              kind: k.id,
              wait: waitOf(k, state, at),
              lifeMs: lifeOf(k, state, at),
              atBirth,
            });
            if (step.state !== s) all[k.id] = step.state;
          }
        },
      },
    },
    moves: (s) =>
      def.kinds
        .filter((k) => kindsOf(s)[k.id]?.live)
        .map(
          (k): Move<typeof s> => ({
            id: `${def.key}:${k.id}`,
            worth: (st) => k.worth?.(st as unknown as G, { now: gameNowOf(st) }) ?? 1,
            apply: (store) => (store.getState() as Record<K, SpawnsActions>)[def.key].catch(k.id) !== null,
          }),
        ),
  });
  const helpers: Pick<SpawnsFeature<K, G>, "select" | "def" | "draft"> = {
    select: {},
    def: { kinds: def.kinds },
    draft: { catch: take },
  };
  return Object.assign(made, helpers) as SpawnsFeature<K, G> & { readonly needs?: NeedsOf<R> };
}
