// What a game's own mechanic looks like on the 1.0 engine: a feature of its own (`kiln`) beside the engine's factories.
// It declares a derived value instead of a hand-written fold, feeds the stats through a source, earns in a `produce`
// step that names its pass, orders a second step with `after`, offers the sim a move, and reaches the wallet and the
// stats lazily. The prestige layer pays its currency into the wallet (`payInto`) and keeps the reset pace itself.
//
// This file is type-checked with the engine (`bun check`); it is the shape to copy, not a game.
import {
  costAt,
  D,
  type Decimal,
  defineCurrencies,
  defineFeature,
  defineGame,
  definePrestige,
  defineStats,
  powerGain,
  type StateOf,
  vocab,
} from "watchpot/core";

const WORDS = vocab({ currencies: ["ash", "cinders"], stats: ["output", "gain"] });

/** Every balance. `cinders` is the prestige currency: it outlives a run reset (`depth: "never"`), which `payInto` needs. */
export const wallet = defineCurrencies({
  key: "wallet",
  vocab: WORDS,
  start: { ash: D(0), cinders: D(0) },
  depth: { cinders: "never" },
  earnedThisRun: { ash: "earned" },
});

/**
 * The game's own mechanic: not an engine system, so a `defineFeature()`. `glaze` is a derived value: never saved, never
 * written, worked out again only when `fired` changes. Nothing keeps a second copy of it in a step.
 */
export const kiln = defineFeature({
  key: "kiln",
  initial: () => ({ fired: 0 }),
  derived: { glaze: (s) => D(1).add(s.kiln.fired * 0.25) },
  actions: (api) => ({
    fire: () =>
      api.set((s) => {
        s.kiln.fired += 1;
      }),
  }),
});

/** Every contribution to a stat, declared once. The kiln's glaze multiplies output; it reads the derived value. */
export const numbers = defineStats({
  key: "stats",
  vocab: WORDS,
  reach: () => [kiln],
  stats: { output: { base: 1 }, gain: { base: 1 } },
  sources: [{ label: "Kiln", owner: "kiln", effects: [{ stat: "output", mul: (q) => q.kiln.glaze }] }],
});

/** Ash a second at one stoke, before the stats. */
const PER_STOKE = D(2);
/** What the next stoke costs: the engine's price curve, not a hand-written loop. `round` defaults to up. */
const STOKE_PRICE = (stoked: number): Decimal => costAt({ base: 10, growth: 1.15 }, stoked);
/** The most ash the hearth holds. */
const HEARTH = D("1e12");

/** The core's income, as the invention reads it: reaches the wallet and the stats, lazily. */
export const furnace = defineFeature({
  key: "furnace",
  reach: () => [wallet, numbers],
  initial: () => ({ stoked: 1 }),
  derived: { perSecond: (s) => PER_STOKE.mul(s.furnace.stoked).mul(s.stats.output) },
  actions: (api) => ({
    // Says whether it went through, which a move's `apply` must.
    stoke: () =>
      api.set((s) => {
        if (s.wallet.ash.lt(STOKE_PRICE(s.furnace.stoked))) return false;
        s.wallet.ash = s.wallet.ash.sub(STOKE_PRICE(s.furnace.stoked));
        s.furnace.stoked += 1;
        return true;
      }),
  }),
  steps: {
    produce: {
      // An earning step names its pass: "both" pays the whole time away as well, with no cap. Say "tick" and add a
      // "catchUp" twin to pay an away rate instead.
      burn: {
        pass: "both",
        run: (s, ctx) => {
          wallet.draft.credit(s, "ash", s.furnace.perSecond.mul(ctx.dtMs / 1000));
        },
      },
      // Orders itself against another step of the same phase; a derived value would need no order at all.
      cap: {
        pass: "both",
        after: "furnace.produce.burn",
        run: (s) => {
          s.wallet.ash = s.wallet.ash.min(HEARTH);
        },
      },
    },
  },
  // What the sim's auto-player may buy. No `worth`: it is worked out from the objective (see `sim-and-tests.ts`).
  moves: (s) => [
    {
      id: "stoke",
      cost: { currency: "ash", amount: STOKE_PRICE(s.furnace.stoked) },
      apply: (store) => store.getState().furnace.stoke(),
    },
  ],
});

/** The prestige layer: pays `cinders` into the wallet, keeps its own run start and peak pace (`s.ascension.pace`). */
export const ascension = definePrestige({
  key: "ascension",
  action: "ascend",
  reach: [wallet, numbers],
  payInto: { wallet, currency: "cinders" },
  gain: (s) => powerGain(s.wallet.earned, { k: 1, exp: 0.5, per: 1000, mult: s.stats.gain }),
  // A reset the sim should take: once it would pay at least one and as much again as is held.
  worth: (s) => {
    const gain = powerGain(s.wallet.earned, { k: 1, exp: 0.5, per: 1000, mult: s.stats.gain });
    return gain.gte(1) && gain.gte(s.wallet.cinders) ? gain.toNumber() : 0;
  },
});

export const game = defineGame({
  id: "kiln-example",
  save: { key: "kiln-example.save", version: 1 },
  vocab: WORDS,
  features: [wallet, kiln, numbers, furnace, ascension],
});

export type GameState = StateOf<typeof game.features>;

/** A Decimal read off the state is compared with `.gte()` and friends, never `>=`: `bun check` and the test kit catch it. */
export const rich = (s: GameState): boolean => (s.wallet.ash as Decimal).gte(1000);
