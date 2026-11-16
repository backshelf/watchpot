import type { Draft } from "immer";
import { type Feature, type NeedsOf, type ReachOf, type ReachShape, type ResetRule } from "./feature";
import type { CallbackContext } from "./gauge";
import { type RngState } from "./rng";
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
    readonly ramp?: {
        readonly power: number;
        readonly stepMs: number;
    };
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
export declare function drawSpawnWait(rng: RngState, wait: SpawnWait): [number, RngState];
/**
 * Draws an outcome among those open (`when` holds at `ctx`, default game time 0, and not a `noRepeat` repeat of
 * `last`); null when none is. Pure.
 */
export declare function drawOutcome<G>(rng: RngState, outcomes: readonly SpawnOutcome<G>[], state: G, last: string | null, ctx?: CallbackContext): [string | null, RngState];
/** What `advanceSpawn` needs: the wait, the life, and the outcome drawn at an arrival when the kind draws at birth. */
export interface SpawnTiming {
    readonly kind: string;
    readonly wait: SpawnWait;
    readonly lifeMs: number;
    /** Draws the outcome at an arrival (`drawAt: "birth"`); left out to draw at the catch. */
    readonly atBirth?: (rng: RngState, last: string | null) => [string | null, RngState];
}
/** The most arrivals one pass walks through; past it the wait starts over from `now`. */
export declare const SPAWN_WALK_LIMIT = 10000;
/**
 * Brings a kind up to `now`: the live one dies at `diesAt` (missed), the next arrives at `nextAt` and its wait from
 * the moment the last one died or was caught, as often as fit; at most one is left live. Pure: returns the state (`state`
 * itself when nothing happened) and how many arrived and were missed.
 */
export declare function advanceSpawn(state: SpawnState, now: number, timing: SpawnTiming): {
    state: SpawnState;
    born: number;
    missed: number;
};
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
export type SpawnsHost<K extends string> = {
    readonly [P in K]: SpawnsState;
};
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
export declare function defineSpawns<const K extends string, const R extends ReachShape = readonly [], G extends object = Record<K, SpawnsState> & ReachOf<R>>(def: {
    readonly key: K;
    /** The features the callbacks read, as `feature`'s `reach`. */
    readonly reach?: R | (() => R);
    readonly kinds: readonly SpawnKind<G>[];
    readonly onCatch?: (draft: Draft<G>, outcome: string, now: number, kind: string) => void;
    readonly reset?: ResetRule<SpawnsState>;
}): SpawnsFeature<K, G> & {
    readonly needs?: NeedsOf<R>;
};
