import {
  type AnyGame,
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  type IdleStore,
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
 * The shell's tick, which the harness plays in: a minute. `playStraight` and `runFit` tick at a second instead
 * (their own `tickMs`); pass `tickMs` to match them when a run must agree with one of theirs.
 */
export const SIM_TICK_MS = 60_000;

/** Options for `createSimWorld`: the length of one play tick. */
export interface SimWorldOptions {
  /** The longest tick `play` takes. Default `SIM_TICK_MS`. */
  tickMs?: number;
}

/**
 * The harness: `build` makes the store over the clock it is handed (pass it as the store's `now`), and the world
 * opens it at `start` with one catch-up, as a first load does.
 */
export function createSimWorld<S extends SimStore>(
  build: (now: () => number) => S,
  start: number,
  { tickMs = SIM_TICK_MS }: SimWorldOptions = {},
): SimWorld<S> {
  let clock = start;
  const store = build(() => clock);
  store.getState().catchUp(store.getState().gameNow());
  return {
    store,
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
 * A store for the sim: the game on storage that never writes (a debounce that never fires; serialising every set is
 * the slowest thing a sim could do), reading `now`, its draws seeded so one seed is one run.
 */
export function simStore<G extends AnyGame>(
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
