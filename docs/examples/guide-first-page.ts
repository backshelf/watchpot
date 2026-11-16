/**
 * Chapter 6 of the guide, "The first page": Simmer's opening page, grown from chapter 4's game with the engine's
 * factories. A spoon that stirs the pot and sometimes crits (`clicker`), the foam the stirring raises (`gauge`), a
 * shelf of kettles beside the stove (`generators`), a kitchen shop (`upgradeTree`), big bubbles that rise to be
 * caught (`spawns`) and the rolling boil one of them starts (`buffs`).
 *
 * Run it with `bun docs/examples/guide-first-page.ts`: it stirs, buys a burner and a kettle, lets a minute pass on a
 * fake clock and prints what the page would show.
 */
import {
  type BuffsState,
  buffActive,
  buffs,
  busOf,
  type ClickerState,
  clicker,
  clickShare,
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  type Draft,
  defineGame,
  type Effect,
  fmt,
  type GaugeState,
  type GeneratorsState,
  type GraphNode,
  gauge,
  gaugeFill,
  gaugeLocked,
  generators,
  HOUR_MS,
  reach,
  type SpawnsState,
  type StateOf,
  spawns,
  statValue,
  type TreeState,
  upgradeTree,
  ZERO,
} from "watchpot/core";
import type { BuyMode } from "watchpot/ui";
import { SIMMER, type Simmer, WORDS, wallet } from "./simmer/game-wallet";

/** What the callbacks below read: chapter 4's Simmer, plus the slices this page adds. Written by hand: they read each other. */
export type Page = Simmer & {
  kitchen: TreeState;
  foam: GaugeState;
  kettles: GeneratorsState;
  spoon: ClickerState;
  boosts: BuffsState;
  surface: SpawnsState;
};

// ---------------------------------------------------------------------------------------------------------------
// The kitchen: an upgrade tree used as a shop

type Upgrade = GraphNode<Effect, "bubbles">;

const UPGRADES: readonly Upgrade[] = [
  {
    id: "salt",
    name: "A pinch of salt",
    line: "Every stir brings up twice the bubbles.",
    cost: [{ currency: "bubbles", amount: 25 }],
    maxLevel: 1,
    requires: [],
    effects: [{ stat: "stir", mult: 2 }],
  },
  {
    id: "whisk",
    name: "A whisk",
    line: "One more bubble a stir, each rank.",
    cost: [{ currency: "bubbles", amount: 100 }],
    costGrowth: 2,
    maxLevel: 5,
    requires: ["salt"],
    effects: [{ stat: "stir", add: 1 }],
  },
  {
    id: "copper",
    name: "Copper kettles",
    line: "The kettles boil twice as fast.",
    cost: [{ currency: "bubbles", amount: 400 }],
    maxLevel: 1,
    requires: [],
    effects: [{ stat: "kettle", mult: 2 }],
  },
  {
    id: "ladle",
    name: "A ladle",
    line: "Now and then a big bubble rises. Catch it.",
    cost: [{ currency: "bubbles", amount: 500 }],
    maxLevel: 1,
    requires: [],
    effects: [],
  },
];

export const kitchen = upgradeTree({
  key: "kitchen",
  nodes: UPGRADES,
  wallet,
  reach: reach<{ kettles: GeneratorsState }>(),
  // The copper waits until there is a kettle to put it on.
  open: (s, node) => node.id !== "copper" || (s.kettles.owned.kettle ?? 0) > 0,
});

/** Whether an upgrade is bought. */
const has = (s: Pick<Page, "kitchen">, id: string): boolean => (s.kitchen.ranks[id] ?? 0) > 0;

/** A stat's value from the kitchen's ranks: 1, plus its adds, times its mults. Chapter 8 does this properly. */
export const statOf = (s: Pick<Page, "kitchen">, stat: "stir" | "kettle"): number =>
  statValue(busOf(kitchen.tree.contributions(s.kitchen.ranks)), stat, 1);

// ---------------------------------------------------------------------------------------------------------------
// The foam: a gauge

export const FOAM = { max: 100, perStir: 4, settle: 6, spillMs: 10_000 };

/** Foam on the pot, 0 to 100. Stirring raises it; it settles on its own; at the top it spills and sits flat a while. */
export const foam = gauge({
  key: "foam",
  max: FOAM.max,
  rate: () => -FOAM.settle,
  trip: { lockMs: FOAM.spillMs, dropTo: 0 },
});

// ---------------------------------------------------------------------------------------------------------------
// Big bubbles and the rolling boil: spawns and buffs

export const ROLLING_BOIL = { seconds: 30, mult: 3 };

/** The rolling boil is a timer: the kettles ask whether it is running, where they work out their rate. */
export const boosts = buffs({
  key: "boosts",
  list: [{ id: "rolling-boil", durationMs: ROLLING_BOIL.seconds * 1000, stack: "refresh" }],
});

// ---------------------------------------------------------------------------------------------------------------
// The kettles: generators

const DOUBLINGS = [10, 25, 50, 100].map((at) => ({ at, gives: { mult: 2 } }));

export const kettles = generators({
  key: "kettles",
  wallet,
  reach: () => [kitchen, boosts],
  list: [
    {
      id: "kettle",
      name: "Kettle",
      cost: { base: 100, growth: 1.15 },
      pays: "bubbles",
      makes: "bubbles",
      rate: 5,
      milestones: DOUBLINGS,
    },
    {
      id: "cauldron",
      name: "Cauldron",
      cost: { base: 1500, growth: 1.15 },
      pays: "bubbles",
      makes: "bubbles",
      rate: 40,
      milestones: DOUBLINGS,
    },
  ],
  global: [{ at: 25, gives: { mult: 3 } }], // once every kettle and cauldron reaches 25
  // The copper, and three times over while a rolling boil runs.
  mult: (s, _def, { now }) =>
    statOf(s, "kettle") * (buffActive(s.boosts, "rolling-boil", now) ? ROLLING_BOIL.mult : 1),
  away: () => ({ rate: 0.5, capMs: 8 * HOUR_MS }), // half pay while you are gone, for up to 8 hours
});

/** Everything the pot makes a second on its own: the stove (lid and all) and the kettles. */
const income = (s: Page) => s.stove.perSecond.add(s.kettles.perSecond.bubbles ?? ZERO);

// ---------------------------------------------------------------------------------------------------------------
// The spoon: a clicker

export const spoon = clicker({
  key: "spoon",
  wallet,
  currency: "bubbles",
  // The stir stat, plus 2% of what the pot makes a second, up to twice that on a full head of foam.
  power: (s: Page, { now }) => {
    const base = clickShare(statOf(s, "stir"), income(s), 0.02);
    return gaugeLocked(s.foam, now) ? base : base.mul(1 + gaugeFill(s.foam, FOAM.max));
  },
  crit: () => ({ chance: 0.03, mult: 10 }),
  maxPerSecond: 20,
  // A stir raises the foam, through the gauge's draft helper: a stir that takes it to the top spills it.
  onClick: (d: Draft<Page>, _paid, now) => {
    foam.nudge(d, FOAM.perStir, now);
  },
});

export const surface = spawns({
  key: "surface",
  kinds: [
    {
      id: "big-bubble",
      wait: { minMs: 45_000, maxMs: 150_000, ramp: { power: 3, stepMs: 1000 } },
      lifeMs: 12_000,
      active: (s: Page) => has(s, "ladle"),
      outcomes: [
        { id: "splash", weight: 60 },
        { id: "rolling-boil", weight: 40, noRepeat: true },
      ],
    },
  ],
  onCatch: (d: Draft<Page>, outcome, now) => {
    if (outcome === "splash") {
      wallet.draft.credit(d, "bubbles", income(d).mul(60).max(25)); // a minute of everything, 25 at least
      return;
    }
    boosts.start(d, outcome, now);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// The game

export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  vocab: WORDS,
  features: [...SIMMER, kitchen, foam, kettles, spoon, boosts, surface],
});

// ---------------------------------------------------------------------------------------------------------------
// What the screen reads: plain functions over the state, no React

/** One kettle row: what it shows and what its button would buy, for the chosen buy mode. */
export function kettleRow(s: StateOf<typeof game.features>, id: string, mode: BuyMode, now: number) {
  const { count, price, canBuy } = kettles.rules.row(s, id, mode, now);
  return {
    owned: kettles.rules.owned(s, id),
    perSecond: fmt(kettles.rules.rate(s, id, now)).text,
    untilNext: kettles.rules.untilMilestone(s, id),
    count,
    price: fmt(price).text,
    canBuy,
  };
}

/** The kitchen shelf: what is on offer, what the next rank costs, and whether it can be bought now. */
export function shelf(s: Page) {
  return kitchen.tree.nodes
    .filter((node) => kitchen.open(s, node.id))
    .map((node) => {
      const owned = s.kitchen.ranks[node.id] ?? 0;
      const next = kitchen.tree.price(node, owned)?.[0];
      return {
        id: node.id,
        name: node.name,
        owned,
        price: next ? fmt(next.amount).text : null, // null: bought out
        canBuy: kitchen.check(s, node.id) === null,
      };
    });
}

if (import.meta.main) {
  let t = Date.UTC(2026, 0, 1);
  // Seeded, so the crits land on the same stirs every run; the save stays in memory.
  const store = createIdleStore(game, {
    now: () => t,
    seed: "simmer",
    storage: createGameStorage(createMemoryBackend()),
  });
  for (let i = 0; i < 30; i++) {
    t += 100;
    const paid = store.getState().spoon.click();
    if (paid?.crit) console.log("a crit:", fmt(paid.amount).text);
  }
  const stirred = store.getState();
  console.log(
    "after 30 stirs:",
    fmt(stirred.wallet.bubbles).text,
    "bubbles, foam spilled",
    stirred.foam.trips,
    "time",
  );
  console.log("bought a burner:", store.getState().stove.buyBurner());
  for (let i = 0; i < 60; i++) {
    t += 1000;
    store.getState().tick(1000);
  }
  console.log("bought a kettle:", store.getState().kettles.buy("kettle"));
  const s = store.getState();
  console.log("bubbles:", fmt(s.wallet.bubbles).text, "foam:", s.foam.level);
  console.log("kettle row (x1):", kettleRow(s, "kettle", 1, t));
  console.log("kettle row (next):", kettleRow(s, "kettle", "next", t));
  console.log("shelf:", shelf(s));
}
