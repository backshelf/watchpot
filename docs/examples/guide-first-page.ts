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
  buffActive,
  clickShare,
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  type Decimal,
  defineBuffs,
  defineClicker,
  defineGame,
  defineGauge,
  defineGenerators,
  defineSpawns,
  defineUpgradeTree,
  type Effect,
  fmt,
  foldContributions,
  type GeneratorsState,
  type GraphNode,
  gaugeFill,
  gaugeLocked,
  HOUR_MS,
  reach,
  type StateOf,
  type TreeState,
  ZERO,
} from "watchpot/core";
import type { BuyMode } from "watchpot/ui";
import { SIMMER, stats, stove, WORDS, wallet } from "./simmer/game-wallet";

// ---------------------------------------------------------------------------------------------------------------
// The kitchen: an upgrade tree used as a shop

/** The two numbers the kitchen raises. */
type Stat = "stir" | "kettle";
type Upgrade = GraphNode<Effect<Stat>, "bubbles">;

const UPGRADES: readonly Upgrade[] = [
  {
    id: "salt",
    name: "A pinch of salt",
    line: "Every stir brings up twice the bubbles.",
    cost: [{ currency: "bubbles", amount: 25 }],
    maxLevel: 1,
    requires: [],
    effects: [{ stat: "stir", mul: 2 }],
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
    effects: [{ stat: "kettle", mul: 2 }],
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

export const kitchen = defineUpgradeTree({
  key: "kitchen",
  nodes: UPGRADES,
  wallet,
  // The kettles reach the kitchen, so the kitchen names the kettles by their state type: one side of a pair does.
  reach: reach<{ kettles: GeneratorsState }>(),
  // The copper waits until there is a kettle to put it on.
  open: (s, node) => node.id !== "copper" || (s.kettles.owned.kettle ?? 0) > 0,
});

type Kitchen = { kitchen: TreeState };

/** Whether an upgrade is bought. */
const has = (s: Kitchen, id: string): boolean => (s.kitchen.ranks[id] ?? 0) > 0;

/** A stat's value from the kitchen's ranks: 1, plus its adds, times its muls. Chapter 8 serves stats as a feature. */
export const statOf = (s: Kitchen, stat: Stat): number =>
  foldContributions(kitchen.select.contributions(s), { base: () => 1 })
    .stat(stat)
    .toNumber();

// ---------------------------------------------------------------------------------------------------------------
// The foam: a gauge

export const FOAM = { max: 100, perStir: 4, settle: 6, spillMs: 10_000 };

/** Foam on the pot, 0 to 100. Stirring raises it; it settles on its own; at the top it spills and sits flat a while. */
export const foam = defineGauge({
  key: "foam",
  max: FOAM.max,
  rate: () => -FOAM.settle,
  trip: { lockMs: FOAM.spillMs, dropTo: 0 },
});

// ---------------------------------------------------------------------------------------------------------------
// Big bubbles and the rolling boil: spawns and buffs

export const ROLLING_BOIL = { seconds: 30, mult: 3 };

/** The rolling boil is a timer: the kettles ask whether it is running, where they work out their rate. */
export const boosts = defineBuffs({
  key: "boosts",
  list: [{ id: "rolling-boil", durationMs: ROLLING_BOIL.seconds * 1000, stack: "refresh" }],
});

// ---------------------------------------------------------------------------------------------------------------
// The kettles: generators

const DOUBLINGS = [10, 25, 50, 100].map((at) => ({ at, gives: { mult: 2 } }));

export const kettles = defineGenerators({
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
const income = (s: { stove: { perSecond: Decimal }; kettles: GeneratorsState }) =>
  s.stove.perSecond.add(s.kettles.perSecond.bubbles ?? ZERO);

// ---------------------------------------------------------------------------------------------------------------
// The spoon: a clicker

export const spoon = defineClicker({
  key: "spoon",
  wallet,
  currency: "bubbles",
  reach: () => [stove, kitchen, kettles, foam],
  // The stir stat, plus 2% of what the pot makes a second, up to twice that on a full head of foam.
  power: (s, { now }) => {
    const base = clickShare(statOf(s, "stir"), income(s), 0.02);
    return gaugeLocked(s.foam, now) ? base : base.mul(1 + gaugeFill(s.foam, FOAM.max));
  },
  crit: () => ({ chance: 0.03, mult: 10 }),
  maxPerSecond: 20,
  // A stir raises the foam, through the gauge's draft helper: a stir that takes it to the top spills it.
  onClick: (d, _paid, now) => {
    foam.draft.nudge(d, FOAM.perStir, now);
  },
});

export const surface = defineSpawns({
  key: "surface",
  reach: () => [wallet, stove, kitchen, kettles, boosts],
  kinds: [
    {
      id: "big-bubble",
      wait: { minMs: 45_000, maxMs: 150_000, ramp: { power: 3, stepMs: 1000 } },
      lifeMs: 12_000,
      active: (s) => has(s, "ladle"),
      outcomes: [
        { id: "splash", weight: 60 },
        { id: "rolling-boil", weight: 40, noRepeat: true },
      ],
    },
  ],
  onCatch: (d, outcome, now) => {
    if (outcome === "splash") {
      wallet.draft.credit(d, "bubbles", income(d).mul(60).max(25)); // a minute of everything, 25 at least
      return;
    }
    boosts.draft.start(d, outcome, now);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// The game

export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  vocab: WORDS,
  features: [...SIMMER, stats, kitchen, foam, kettles, spoon, boosts, surface],
});

// ---------------------------------------------------------------------------------------------------------------
// What the screen reads: plain functions over the state, no React

/** One kettle row: what it shows and what its button would buy, for the chosen buy mode. */
export function kettleRow(s: StateOf<typeof game.features>, id: string, mode: BuyMode, now: number) {
  const { count, price, canBuy } = kettles.select.row(s, id, mode, now);
  return {
    owned: kettles.select.owned(s, id),
    perSecond: fmt(kettles.select.rate(s, id, now)).text,
    untilNext: kettles.select.untilMilestone(s, id),
    count,
    price: fmt(price).text,
    canBuy,
  };
}

/** The kitchen shelf: what is on offer, what the next rank costs, and whether it can be bought now. */
export function shelf(s: StateOf<typeof game.features>) {
  return kitchen.def.nodes
    .filter((node) => kitchen.select.open(s, node.id))
    .map((node) => {
      const owned = s.kitchen.ranks[node.id] ?? 0;
      const next = kitchen.def.tree.price(node, owned)?.[0];
      return {
        id: node.id,
        name: node.name,
        owned,
        price: next ? fmt(next.amount).text : null, // null: bought out
        canBuy: kitchen.select.check(s, node.id) === null,
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
