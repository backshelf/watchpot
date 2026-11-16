/**
 * Simmer as it stands at the end of chapter 4: chapter 2's game, with chapter 3's stove, lid and stats, and the
 * bubbles moved into a wallet. This is the Simmer every later chapter builds on: import its features and list them in a
 * bigger game beside your own.
 *
 * Your own `game.ts` matches this file down to `game`, and then ends with chapter 2's
 * `export const store = createIdleStore(game, { now: Date.now })`. This file leaves that store out, so importing it
 * makes no store and touches no save; a script or test makes its own with `scriptStore`. The last section holds
 * helpers for the guide's own examples.
 */
import {
  type CurrencyOf,
  costAt,
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  D,
  type Decimal,
  defineCurrencies,
  defineGame,
  defineStats,
  type FeatureSpec,
  feature,
  type Game,
  reach,
  type StateOf,
  vocab,
} from "watchpot/core";

/** Bubbles a second the pot makes on its own, and each burner adds. */
export const SIMMER_PER_SECOND = 1;
export const BURNER_PER_SECOND = 1;

/** What the whole stove makes a second with `burners` lit. Chapter 2's page reads it; it does not count the lid. */
export function perSecond(burners: number): number {
  return SIMMER_PER_SECOND + burners * BURNER_PER_SECOND;
}

/** The first burner costs 10 bubbles; each one after costs 15% more than the last, rounded up to whole bubbles. */
export const BURNER_COST = { base: 10, growth: 1.15 } as const;

/** The price of the next burner when `owned` are lit. */
export function burnerPrice(owned: number) {
  return costAt(BURNER_COST, owned);
}

/** How much of an absence the stove pays for, and for how long at most. */
export const OFFLINE_RATE = 0.5;
export const AWAY_CAP_MS = 2 * 60 * 60 * 1000;

/** The stove's own rate, in bubbles a second, before anything multiplies it. */
export const flameOf = (burners: number) => D(burners * BURNER_PER_SECOND);

/** The game's words: one currency, and the one stat every multiplier on the stove goes into. */
export const WORDS = vocab({ currencies: ["bubbles"], stats: ["heat"] });

export type Currency = CurrencyOf<typeof WORDS>; // "bubbles"

/** The wallet: a balance per currency, and `earned`, every bubble credited since the last reset. */
export const wallet = defineCurrencies({
  key: "wallet",
  vocab: WORDS,
  earnedThisRun: { bubbles: "earned" },
});

/** The pot: the tap that makes a bubble, how many taps, and the simmer that makes them over time. */
export const pot = feature({
  key: "pot",
  reach: [wallet],
  initial: () => ({ taps: 0 }),
  actions: (api) => ({
    tap: () =>
      api.set((s) => {
        wallet.draft.credit(s, "bubbles", 1);
        s.pot.taps += 1;
      }),
  }),
  steps: {
    produce: {
      // Runs on every live tick and on the catch-up after time away.
      simmer: {
        pass: "both",
        run: (s, ctx) => {
          wallet.draft.credit(s, "bubbles", (SIMMER_PER_SECOND * ctx.dtMs) / 1000);
        },
      },
    },
  },
});

/** The stove: its burners, a switch, the price of the next burner and the rate they burn at. */
export const stove = feature({
  key: "stove",
  // The stats by their state type, so any game that lists a stats feature with a `heat` stat can hold this stove.
  reach: () => [wallet, reach<{ stats: { heat: Decimal } }>()],
  initial: () => ({ burners: 0, off: false }),
  derived: [
    {
      // The price of the next burner, worked out from how many are lit. Never saved.
      nextPrice: (s) => burnerPrice(s.stove.burners),
      // The burners' flame, times heat: the one number every multiplier on the stove goes into.
      perSecond: (s) => flameOf(s.stove.burners).mul(s.stats.heat),
    },
    // A second layer sees the first: whether the wallet holds enough for the next burner.
    { canBuy: (s) => s.wallet.bubbles.gte(s.stove.nextPrice) },
  ],
  actions: (api) => ({
    buyBurner: () =>
      api.set((s) => {
        if (!wallet.draft.debit(s, "bubbles", s.stove.nextPrice)) return false;
        s.stove.burners += 1;
        return true;
      }),
    toggle: () =>
      api.set((s) => {
        s.stove.off = !s.stove.off;
      }),
  }),
  steps: {
    // A stove that is off heats nothing: stop the pass before any work phase runs.
    guard: { cold: (s) => (s.stove.off ? "stop" : undefined) },
    produce: {
      // Live play pays in full.
      burn: {
        pass: "tick",
        run: (s, ctx) => {
          wallet.draft.credit(s, "bubbles", s.stove.perSecond.mul(ctx.dtMs / 1000));
        },
      },
      // Time away pays half, for two hours at most.
      away: {
        pass: "catchUp",
        run: (s, ctx) => {
          const credited = Math.min(ctx.dtMs, AWAY_CAP_MS) * OFFLINE_RATE;
          wallet.draft.credit(s, "bubbles", s.stove.perSecond.mul(credited / 1000));
        },
      },
    },
  },
});

/** The lid: on or off. It knows nothing of the stove; the heat counts it. */
export const lid = feature({
  key: "lid",
  initial: () => ({ on: false }),
  actions: (api) => ({
    toggle: () =>
      api.set((s) => {
        s.lid.on = !s.lid.on;
      }),
  }),
});

/**
 * A second source of heat, for the getting-started page on stats (not in this game's sources): a thick base under
 * the pot adds half a heat, always.
 */
export const THICK_BASE_HEAT = {
  label: "A thick base",
  owner: "pot",
  effects: [{ stat: "heat", add: 0.5 }],
} as const;

/** The lid as a source of heat: twice the heat while it is on. */
export const LID_HEAT = {
  label: "The lid",
  owner: "lid",
  active: (q: { lid: { on: boolean } }) => q.lid.on,
  effects: [{ stat: "heat", mul: 2 }],
} as const;

/** The stats: `s.stats.heat`, a base of 1 and every source multiplied in. So far the one source is the lid. */
export const stats = defineStats({
  key: "stats",
  vocab: WORDS,
  reach: [lid],
  stats: { heat: { base: 1 } },
  sources: [LID_HEAT],
});

/** The game: the wallet first, then the pot, the stove, the lid and the stats. */
export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  vocab: WORDS,
  features: [wallet, pot, stove, lid, stats],
});

// ---------------------------------------------------------------------------------------------------------------
// For the guide's later examples, not part of your own game.ts

/**
 * Simmer's features in their order, the stats aside: a later chapter's game spreads these and lists a stats feature
 * of its own beside them (`LID_HEAT` and its new sources), or this file's `stats` when it adds none.
 */
export const SIMMER = [wallet, pot, stove, lid] as const;

/** The whole state of this game, as a recipe's draft or `store.getState()` sees it, actions aside. */
export type Simmer = StateOf<typeof game.features>;
/** A store for a script or a test: the clock is yours to move, and the save stays in memory, never on disk. */
export function scriptStore<F extends readonly FeatureSpec[], R extends object>(
  g: Game<F, R>,
  now: () => number,
) {
  return createIdleStore(g, { now, storage: createGameStorage(createMemoryBackend()) });
}
