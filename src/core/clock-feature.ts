import type { Clock, ClockOptions } from "./clock";
import { AWAY_AFTER_MS, createClock } from "./clock";
import { type FeatureSpec, type FeatureSteps, feature, type SavedOf } from "./feature";
import { flushSave, storeMeta } from "./persist";
import type { RootActions } from "./store";

/**
 * The engine's clock: when the profile was made, when it was last seen, and the offset that turns the wall into
 * game time. A game that says nothing gets `clockFeature` under the key `clock`; a game that already saves the
 * three fields points the engine at them with a `ClockSpec`, and nothing moves in its save.
 */
export interface ClockState {
  lastSeen: number;
  createdAt: number;
  offsetMs: number;
}

/** The key the built-in clock feature saves under. */
export const CLOCK_KEY = "clock";

/** The built-in clock. A run reset keeps the offset; a profile reset zeroes it. */
export const clockFeature = feature({
  key: CLOCK_KEY,
  initial: (): ClockState => ({ lastSeen: 0, createdAt: 0, offsetMs: 0 }),
  reset: { keep: ["offsetMs"] },
});
/** The type of the built-in clock feature. */
export type ClockFeature = typeof clockFeature;

type NumberKeys<T> = { [P in keyof T]: T[P] extends number ? P & string : never }[keyof T];

/** Where a game that already saves them keeps the clock's three fields: a feature's key and three of its number keys. */
export type ClockSpec<F extends readonly FeatureSpec[]> = {
  [K in keyof SavedOf<F> & string]: {
    readonly feature: K;
    readonly lastSeen: NumberKeys<SavedOf<F>[K]>;
    readonly createdAt: NumberKeys<SavedOf<F>[K]>;
    readonly offset: NumberKeys<SavedOf<F>[K]>;
  };
}[keyof SavedOf<F> & string];

/** The resolved spec: plain strings, the same for the built-in feature and a game's own fields. */
export interface ClockLens {
  readonly feature: string;
  readonly lastSeen: string;
  readonly createdAt: string;
  readonly offset: string;
}

/** The lens onto the built-in clock feature's fields. */
export const BUILT_IN_CLOCK: ClockLens = {
  feature: CLOCK_KEY,
  lastSeen: "lastSeen",
  createdAt: "createdAt",
  offset: "offsetMs",
};

type Slices = Record<string, Record<string, unknown>>;

const slice = (state: object, lens: ClockLens): Record<string, unknown> => {
  const s = (state as Slices)[lens.feature];
  if (!s) throw new Error(`clock: no feature "${lens.feature}" in the state`);
  return s;
};

const numberAt = (state: object, lens: ClockLens, field: string): number => {
  const v = slice(state, lens)[field];
  return typeof v === "number" ? v : 0;
};

/** Reads the clock's `createdAt`, `lastSeen` and offset from a state through its lens. */
export const readClock = (state: object, lens: ClockLens): ClockState => ({
  lastSeen: numberAt(state, lens, lens.lastSeen),
  createdAt: numberAt(state, lens, lens.createdAt),
  offsetMs: numberAt(state, lens, lens.offset),
});

/** Writes some of the clock's fields into a draft through its lens. */
export function writeClock(draft: object, lens: ClockLens, next: Partial<ClockState>): void {
  const s = slice(draft, lens);
  if (next.lastSeen !== undefined) s[lens.lastSeen] = next.lastSeen;
  if (next.createdAt !== undefined) s[lens.createdAt] = next.createdAt;
  if (next.offsetMs !== undefined) s[lens.offset] = next.offsetMs;
}

/**
 * The clock's steps, run under the id prefix `clock` whichever feature holds the fields. A live tick with no time
 * (the hide flush) does nothing but commit; a catch-up always syncs to `now` (the first load brings the calendar,
 * the windows and the rates up to date) and produces only over a gap.
 */
export const clockSteps = (lens: ClockLens): FeatureSteps<object> => ({
  guard: {
    dt: { pass: "tick", run: (_s, ctx) => (ctx.dtMs > 0 ? undefined : "stop") },
    createdAt: {
      pass: "catchUp",
      run: (s, ctx) => {
        if (!(readClock(s, lens).createdAt > 0)) writeClock(s, lens, { createdAt: ctx.now });
      },
    },
  },
  produce: {
    gap: { pass: "catchUp", run: (_s, ctx) => (ctx.dtMs > 0 ? undefined : "stop") },
  },
  commit: {
    lastSeen: (s, ctx) => {
      writeClock(s, lens, { lastSeen: ctx.now });
    },
  },
});

/** Handler throws in a row the clock survives: about a second of live ticks. At the limit it stops. */
export const CLOCK_FAILURE_LIMIT = 10;

/**
 * An absence the clock is about to credit with a catch-up, as `GameClockOptions.away` is told of it: the opening one
 * (the save was last seen more than `awayAfterMs` ago) or a hidden spell or stalled frame longer than that.
 */
export interface AwayGap {
  /** How long the game was not running, ms. */
  readonly elapsedMs: number;
  /** Game time the absence ends at: what the catch-up would be run to. */
  readonly at: number;
  /** True for the absence between the save and this load; false for one inside the session. */
  readonly opening: boolean;
  /**
   * Ends a hold taken on this absence: the clock ticks again from now. Does nothing for an absence that was not
   * held, or a second time.
   */
  release(): void;
}

/** Options for `startGameClock`: the engine clock's, plus `onFail` when it gives up and `away` to take an absence. */
export interface GameClockOptions extends Partial<ClockOptions> {
  /** Called once when the clock stops at `CLOCK_FAILURE_LIMIT` throws in a row. */
  onFail?: (error: unknown) => void;
  /**
   * Told of each absence before the clock credits it. Return `"hold"` to take it: the clock runs no catch-up for
   * it, and neither ticks nor flushes until `gap.release()`, so the store stays exactly as the absence left it
   * (its `lastSeen` still at the moment the player left, in memory and in the save). The game then owns the
   * absence: it brings the store forward itself (its own `catchUp(gap.at)`, an import, an adopted branch) and
   * releases. Time that passes while held is not credited. Anything else returned lets the catch-up run as ever.
   */
  away?: (gap: AwayGap) => unknown;
}

/**
 * Binds the engine clock to a store: live ticks, and a hidden spell up to `awayAfterMs`, call `tick`; a longer gap
 * calls the store's `catchUp` and flushes the save; hiding the tab flushes the save. The shell calls this once at
 * start; the returned clock stops it. It runs on the store's game clock, read on every call so an offset that moves
 * is seen at the next step. Every handler runs through one guard: a
 * throw is logged and counted, a success resets the count, and at the limit the clock stops and `onFail` is told.
 * The first catch-up and flush stay unguarded, so the caller sees their throw. `away` may hold an absence instead
 * (`GameClockOptions.away`).
 */
export function startGameClock(store: { getState(): RootActions }, options: GameClockOptions = {}): Clock {
  const { onFail, away, ...clockOptions } = options;
  const now = clockOptions.now ?? (() => store.getState().gameNow());
  const awayAfterMs = clockOptions.awayAfterMs ?? AWAY_AFTER_MS;
  let failures = 0;
  /** The absence being held, if any: while it is, the handlers do nothing. */
  let held: object | null = null;
  const guard = (run: () => void) => {
    if (!clock.running || held) return;
    try {
      run();
      failures = 0;
    } catch (error) {
      console.error("watchpot clock step failed", error);
      failures += 1;
      if (failures < CLOCK_FAILURE_LIMIT) return;
      clock.stop();
      onFail?.(error);
    }
  };
  /** Offers an absence to `away`; true when the game holds it. */
  const offered = (elapsedMs: number, at: number, opening: boolean): boolean => {
    if (!away) return false;
    const token = {};
    const gap: AwayGap = {
      elapsedMs,
      at,
      opening,
      release: () => {
        if (held === token) held = null;
      },
    };
    // Held from before the call, so a game that releases inside it is not left held.
    held = token;
    if (away(gap) === "hold") return true;
    if (held === token) held = null;
    return false;
  };
  const clock: Clock = createClock(
    {
      onTick: (dt, at) => guard(() => store.getState().tick(dt, at)),
      onAway: (elapsed, at) =>
        guard(() => {
          if (offered(elapsed, at, false)) return;
          store.getState().catchUp(at);
          flushSave(store);
        }),
      onHide: (at) =>
        guard(() => {
          store.getState().tick(0, at);
          flushSave(store);
        }),
    },
    { ...clockOptions, now },
  );
  const start = now();
  const lens = storeMeta(store)?.game.clock ?? BUILT_IN_CLOCK;
  const last = away ? readClock(store.getState(), lens).lastSeen : 0;
  if (!(last > 0 && start - last > awayAfterMs && offered(start - last, start, true))) {
    store.getState().catchUp(start);
    flushSave(store);
  }
  clock.start();
  return clock;
}
