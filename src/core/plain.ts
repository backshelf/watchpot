import { createCells } from "./cells";
import { readClock, writeClock } from "./clock-feature";
import { isDecimal } from "./decimal";
import type {
  FeatureApi,
  FeatureSpec,
  IdleStoreApi,
  InitialContext,
  ResetRunContext,
  StateOf,
} from "./feature";
import type { Game } from "./game";
import { type RngState, randomSeed, seedRng } from "./rng";
import { type RootActions, runReset } from "./store";
import { runPass } from "./tick";

/**
 * The plain store: a game run on plain data. The same features, steps, actions and derived values as
 * `createIdleStore`, over one mutable state object, with no immer, no zustand and no save. It is for running a
 * game fast and headless (the sim, a fit): a pass costs what the game's own code costs and little else.
 *
 * What differs from the real store, and nothing else does:
 * - The state is changed in place. `getState()` hands back the same object every time, so a value read from it is
 *   live, not a snapshot: copy what must be kept (a Decimal is safe to keep; it is never changed in place).
 * - A recipe that throws leaves what it had already written (the real store drops the whole recipe).
 * - Nothing is saved or loaded, and `subscribe` never calls back.
 * - A profile cannot be exported or imported.
 *
 * `plainParity` (`watchpot/test`) plays one seed through both stores and compares them; a game runs it once in its
 * tests to know its sim is the game.
 */
export interface PlainStore<S extends object> {
  /** The game's state and actions: one object, changed in place. Derived values read through it are current. */
  getState(): S & RootActions;
  /** Runs a recipe over the state, as an action's `api.set` does. */
  setState(recipe: (state: S) => void): void;
  /** Runs something and puts the state back as it was: how the auto-player tries a purchase to see what it is worth. */
  trial<T>(run: () => T): T;
  /** Present so the plain store stands in where a store is expected; it never calls back. */
  subscribe(listener: () => void): () => void;
  /** Settled already: there is no save to load. */
  readonly hydrated: Promise<void>;
  /** Profile resets so far. */
  profileSwaps(): number;
}

/** Options for `createPlainStore`: the required `now`, the seed and entropy, as `createIdleStore` takes them. */
export interface PlainStoreOptions {
  /** The wall clock, the store's one wall read. */
  now: () => number;
  /** Seeds a new profile's draws, and each run reset's; without it they draw from entropy. */
  seed?: string | number;
  /** The entropy behind unseeded draws. Default `Math.random`. */
  entropy?: () => number;
}

type Slices = Record<string, Record<string, unknown>>;

/**
 * A copy of plain data (objects and arrays), every level its own: an `initial` may hand back a shared constant,
 * which the real store never writes to (immer copies it first) and a state changed in place must not either.
 * Decimals and anything that is not a plain object or an array are kept as they are.
 */
function own<T>(value: T): T {
  if (Array.isArray(value)) return value.map(own) as T;
  if (typeof value !== "object" || value === null || isDecimal(value)) return value;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = own(v);
  return out as T;
}

/** Builds a plain store over a game: its features' state, actions, passes and derived values, on plain data. */
export function createPlainStore<F extends readonly FeatureSpec[], R extends object>(
  game: Game<F, R>,
  options: PlainStoreOptions,
): PlainStore<StateOf<F> & R> {
  type State = StateOf<F> & R & RootActions;
  const { features, clock } = game;
  const wall = options.now;
  const random = options.entropy ?? Math.random;
  const entropy = (): RngState => randomSeed(wall(), random);
  const rng = (label: string): RngState =>
    options.seed === undefined ? entropy() : seedRng(`${options.seed}:${label}`);
  const firstRng = options.seed === undefined ? entropy() : seedRng(options.seed);
  const cells = createCells(features);
  let swaps = 0;
  let drafting = false;

  const state = {} as Slices & Record<string, unknown>;
  /** The state as everything outside a recipe reads it: derived values current, a read only a read. */
  const reader = cells.view(state, { precise: true });
  cells.record(false);

  const runRng = (): RngState => rng(`run:${readClock(state, clock).createdAt}`);
  const gameNow = (): number => wall() + readClock(state, clock).offsetMs;

  /** Runs a recipe over the state; the slices it took count as written once it ends. */
  const mutate = <T>(recipe: (s: never) => T): T => {
    if (drafting)
      throw new Error(
        "watchpot: an action was called inside a recipe (a `set` or a step), where its change would be lost under the outer one's. Call the draft helper on the draft in hand instead (`wallet.draft.credit(draft, …)`), or call the action once the recipe has returned.",
      );
    drafting = true;
    cells.record(true);
    try {
      return recipe(reader as never);
    } finally {
      cells.close();
      cells.record(false);
      drafting = false;
    }
  };

  const resetRun = (now: number, next: RngState, depth?: number): void => {
    const before = features.map((f) => state[f.key]);
    runReset(features, clock, state, now, next, depth);
    // A reset assigns each fresh `initial` over its slice: give the slice its own copy of what it now holds.
    features.forEach((_f, i) => {
      const slice = before[i];
      if (slice) for (const [k, v] of Object.entries(slice)) if (typeof v !== "function") slice[k] = own(v);
    });
    cells.touchAll();
  };

  const store = {
    getState: () => reader as unknown as State,
    setState: (recipe: (s: State) => void) => mutate((s) => recipe(s)),
    subscribe: () => () => {},
    trial: <T>(run: () => T): T => {
      const data = (slice: Record<string, unknown>) =>
        Object.fromEntries(Object.entries(slice).filter(([, v]) => typeof v !== "function"));
      const before = features.map((f) => own(data(state[f.key] ?? {})));
      try {
        return run();
      } finally {
        features.forEach((f, i) => {
          const slice = state[f.key];
          const was = before[i];
          if (!slice || !was) return;
          for (const k of Object.keys(data(slice))) if (!(k in was)) delete slice[k];
          Object.assign(slice, was);
        });
        cells.touchAll();
      }
    },
    hydrated: Promise.resolve(),
    profileSwaps: () => swaps,
  };

  const featureApi: FeatureApi<State> = {
    set: mutate as FeatureApi<State>["set"],
    get: () => reader as unknown as State,
    now: gameNow,
    rng,
    resetRun: (_draft, ctx = {}) => resetRun(ctx.now ?? gameNow(), ctx.rng ?? runRng(), ctx.depth),
    // The plain store stands in for the real one where an action or a move is handed `store`.
    store: store as unknown as IdleStoreApi<State>,
  };

  const born = wall();
  const initial: InitialContext = { now: born, wallNow: born, rng: firstRng, reason: "new" };
  for (const f of features) state[f.key] = { ...own(f.initial(initial)), ...f.actions(featureApi as never) };
  const stepReset =
    (at: number) =>
    (_draft: object, ctx: ResetRunContext = {}): void =>
      resetRun(ctx.now ?? at, ctx.rng ?? runRng(), ctx.depth);
  const root: RootActions = {
    gameNow,
    tick: (dtMs, at = gameNow()) =>
      mutate((s) => runPass(game, s, { pass: "tick", now: at, dtMs, resetRun: stepReset(at) }, cells.close)),
    catchUp: (at = gameNow()) =>
      mutate((s) => {
        const last = readClock(state, clock).lastSeen;
        runPass(
          game,
          s,
          { pass: "catchUp", now: at, dtMs: last > 0 ? at - last : 0, resetRun: stepReset(at) },
          cells.close,
        );
      }),
    resetProfile: (at = wall()) => {
      swaps += 1;
      const ctx: InitialContext = { now: at, wallNow: at, rng: entropy(), reason: "reset" };
      for (const f of features) Object.assign(state[f.key] ?? {}, own(f.initial(ctx)));
      writeClock(state, clock, { createdAt: at, lastSeen: at, offsetMs: 0 });
      cells.touchAll();
    },
    resetRun: (ctx = {}) => resetRun(ctx.now ?? gameNow(), ctx.rng ?? runRng(), ctx.depth),
    exportProfile: () => {
      throw new Error("watchpot: a plain store has no save to export; use createIdleStore");
    },
    importProfile: () => {
      throw new Error("watchpot: a plain store has no save to import into; use createIdleStore");
    },
  };
  Object.assign(state, game.actions(featureApi as never), root);
  cells.touchAll();
  return store as PlainStore<StateOf<F> & R>;
}
