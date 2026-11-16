import {
  type AnyGame,
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  createPlainStore,
  type IdleStore,
  type PlainStore,
  type StateOf,
} from "../core";

/** What the harness drives: any store with the root clock actions (`createIdleStore`'s, or a game's wrapper of it). */
export interface SimStore {
  getState(): {
    tick(dtMs: number, now?: number): void;
    catchUp(now?: number): void;
    gameNow(): number;
  };
}

/**
 * A headless profile: a store reading a clock the simulator owns, and the two ways time passes for a player. The
 * store must read `now()` as its wall (its `now` option), so every action that defaults its time sees sim time.
 */
export interface SimWorld<S extends SimStore = SimStore> {
  store: S;
  /** The longest tick `play` takes unless told otherwise: the world's quality. */
  readonly tickMs: number;
  /**
   * The sim's wall time: the day loop and the samples read it. Not the game's time: `gameNow()` adds the profile's
   * clock offset, so stamp actions with `gameNow()` and measure days and hours with `now()`.
   */
  now(): number;
  /** The store's game time (the wall plus the profile's clock offset): what every action is stamped with. */
  gameNow(): number;
  /** Plays `ms` with the tab open, in ticks of at most `stepMs` (default the world's `tickMs`). */
  play(ms: number, stepMs?: number): void;
  /** Closes the tab for `ms`, then opens it: one catch-up over the gap, as on a return. */
  away(ms: number): void;
}

/**
 * How finely a sim steps time: the length of one play tick. `exact` is a second, the grain the shell plays at and
 * the one a fit is proved on; `quick` and `rough` take longer steps, so a long game can be read for its general
 * curve and its pauses in a fraction of the time, at the cost of anything that happens inside a step (an
 * autobuyer fires once a step, a timed window is seen a step late).
 */
export const SIM_QUALITY = { exact: 1_000, quick: 10_000, rough: 60_000 } as const;
/** A named sim quality: `exact`, `quick` or `rough`. */
export type SimQuality = keyof typeof SIM_QUALITY;

/** The one default tick, everywhere in the sim: a second (`SIM_QUALITY.exact`). */
export const SIM_TICK_MS: number = SIM_QUALITY.exact;

/** Options for `createSimWorld`: the quality, or the length of one play tick outright. */
export interface SimWorldOptions {
  /** How finely time is stepped. Default `"exact"`. */
  quality?: SimQuality;
  /** The longest tick `play` takes, when a named quality will not do. Default: the quality's. */
  tickMs?: number;
}

/**
 * The harness: `build` makes the store over the clock it is handed (pass it as the store's `now`), and the world
 * opens it at `start` with one catch-up, as a first load does.
 */
export function createSimWorld<S extends SimStore>(
  build: (now: () => number) => S,
  start: number,
  { quality = "exact", tickMs = SIM_QUALITY[quality] }: SimWorldOptions = {},
): SimWorld<S> {
  let clock = start;
  const store = build(() => clock);
  store.getState().catchUp(store.getState().gameNow());
  return {
    store,
    tickMs,
    now: () => clock,
    gameNow: () => store.getState().gameNow(),
    play(ms, stepMs = tickMs) {
      const end = clock + ms;
      while (clock < end) {
        const dt = Math.min(stepMs, end - clock);
        clock += dt;
        store.getState().tick(dt, store.getState().gameNow());
      }
    },
    away(ms) {
      clock += ms;
      store.getState().catchUp(store.getState().gameNow());
    },
  };
}

/**
 * A store for the sim: the game on plain data (`createPlainStore`), reading `now`, its draws seeded so one seed
 * is one run. Nothing is saved, and a pass costs the game's own code and little else. The state it hands back is
 * changed in place: copy what a sample must keep.
 */
export function simStore<G extends AnyGame>(
  game: G,
  now: () => number,
  seed: string | number = "sim",
): PlainStore<StateOf<G["features"]>> {
  return createPlainStore(game, { now, seed }) as PlainStore<StateOf<G["features"]>>;
}

/**
 * The real store for a sim, when a run must go through the very code the browser runs (immer, zustand, the save's
 * middleware) and not only the same game: storage that never writes, reading `now`, seeded. Several times slower
 * than `simStore`, and the same in every result.
 */
export function realSimStore<G extends AnyGame>(
  game: G,
  now: () => number,
  seed: string | number = "sim",
): IdleStore<StateOf<G["features"]>> {
  const storage = createGameStorage(createMemoryBackend(), {
    debounceMs: 1,
    schedule: () => null,
    cancel: () => {},
  });
  return createIdleStore(game, { storage, now, seed, name: `${game.id}.sim` }) as IdleStore<
    StateOf<G["features"]>
  >;
}
