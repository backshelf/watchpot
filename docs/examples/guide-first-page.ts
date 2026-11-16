/**
 * Chapter 6 of the guide, "The first page": Simmer's opening page built from the engine's factories. A tap that pays
 * and sometimes crits (`clicker`), the pot's heat (`gauge`), a row of burners (`generators`), a kitchen shop
 * (`upgradeTree`), big bubbles that rise to be caught (`spawns`) and the rolling boil one of them starts (`buffs`).
 * The wallet is chapter 4's, rebuilt here so the file stands on its own.
 *
 * Run it with `bun docs/examples/guide-first-page.ts`: it taps, buys a burner, lets a minute pass on a fake clock and
 * prints what the page would show.
 */
import type { Draft } from "immer";
import {
  type BuffsState,
  buffs,
  busOf,
  clicker,
  clickShare,
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  currencies,
  type Decimal,
  defineGame,
  type Effect,
  feature,
  fmt,
  type GaugeState,
  type GeneratorsState,
  type GraphNode,
  gauge,
  gaugeFill,
  generators,
  HOUR_MS,
  overlapMs,
  spawns,
  statValue,
  type TreeState,
  upgradeTree,
  vocab,
  ZERO,
} from "watchpot/core";
import { type BuyMode, buyCount } from "watchpot/ui";

// ---------------------------------------------------------------------------------------------------------------
// The words and the wallet (chapter 4)

const SIMMER = vocab({ currencies: ["bubbles"], stats: ["tap", "burner"], rarities: ["common"] } as const);

export const wallet = currencies({ key: "wallet", vocab: SIMMER });

/** The parts of the game the callbacks below read. Written by hand: the features read each other. */
export interface Simmer {
  wallet: { bubbles: Decimal };
  kitchen: TreeState;
  heat: GaugeState;
  burners: GeneratorsState;
  boosts: BuffsState;
}

// ---------------------------------------------------------------------------------------------------------------
// The kitchen: an upgrade tree used as a shop

type Upgrade = GraphNode<Effect, "bubbles">;

const UPGRADES: readonly Upgrade[] = [
  {
    id: "salt",
    name: "A pinch of salt",
    line: "Taps bring up twice the bubbles.",
    cost: [{ currency: "bubbles", amount: 25 }],
    maxLevel: 1,
    requires: [],
    effects: [{ stat: "tap", mult: 2 }],
  },
  {
    id: "spoon",
    name: "A wooden spoon",
    line: "One more bubble a tap, each rank.",
    cost: [{ currency: "bubbles", amount: 100 }],
    costGrowth: 2,
    maxLevel: 5,
    requires: ["salt"],
    effects: [{ stat: "tap", add: 1 }],
  },
  {
    id: "lid",
    name: "A lid",
    line: "The burners keep their heat: twice the bubbles.",
    cost: [{ currency: "bubbles", amount: 200 }],
    maxLevel: 1,
    requires: [],
    effects: [{ stat: "burner", mult: 2 }],
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

/** Whether an upgrade is on the shelf: the lid waits until there is a burner to put it on. */
export const onOffer = (s: Simmer, node: Upgrade): boolean =>
  node.id !== "lid" || (s.burners.owned.burner ?? 0) > 0;

export const kitchen = upgradeTree({ key: "kitchen", nodes: UPGRADES, wallet, open: onOffer });

/** Whether an upgrade is bought. */
const has = (s: Pick<Simmer, "kitchen">, id: string): boolean => (s.kitchen.ranks[id] ?? 0) > 0;

/** A stat's value from the kitchen's ranks: 1, plus its adds, times its mults. Chapter 8 does this properly. */
export const statOf = (s: Pick<Simmer, "kitchen">, stat: "tap" | "burner"): number =>
  statValue(busOf(kitchen.tree.contributions(s.kitchen.ranks)), stat, 1);

// ---------------------------------------------------------------------------------------------------------------
// The heat: a gauge

export const HEAT = { max: 100, perTap: 4, cooling: 6 };

/** The pot's heat, 0 to 100. Taps warm it (see `pot` below); it cools on its own. A hot pot pays up to twice a tap. */
export const heat = gauge({
  key: "heat",
  max: HEAT.max,
  rate: () => -HEAT.cooling,
});

// ---------------------------------------------------------------------------------------------------------------
// The burners: generators

const DOUBLINGS = [10, 25, 50, 100].map((at) => ({ at, gives: { mult: 2 } }));

export const burners = generators({
  key: "burners",
  wallet,
  list: [
    {
      id: "burner",
      name: "Burner",
      cost: { base: 10, growth: 1.15, round: "ceil" },
      pays: "bubbles",
      makes: "bubbles",
      rate: 0.5,
      milestones: DOUBLINGS,
    },
    {
      id: "kettle",
      name: "Kettle",
      cost: { base: 150, growth: 1.15, round: "ceil" },
      pays: "bubbles",
      makes: "bubbles",
      rate: 6,
      milestones: DOUBLINGS,
    },
  ],
  global: [{ at: 25, gives: { mult: 3 } }], // once every burner and kettle reaches 25
  mult: (s: Simmer) => statOf(s, "burner"),
  away: () => ({ rate: 0.5, capMs: 8 * HOUR_MS }), // half pay while you are gone, for up to 8 hours
});

// ---------------------------------------------------------------------------------------------------------------
// The tap: a clicker

export const pot = clicker({
  key: "pot",
  wallet,
  currency: "bubbles",
  // The tap stat, plus 2% of what the burners make a second, up to twice that on a hot pot.
  power: (s: Simmer) => {
    const base = clickShare(statOf(s, "tap"), s.burners.perSecond.bubbles ?? ZERO, 0.02);
    return base.mul(1 + gaugeFill(s.heat, HEAT.max));
  },
  crit: () => ({ chance: 0.03, mult: 10 }),
  maxPerSecond: 20,
  // The press warms the pot. Written into the draft by hand: the gauge has no draft helper.
  onClick: (d: Draft<Simmer>) => {
    d.heat.level = Math.min(HEAT.max, d.heat.level + HEAT.perTap);
  },
});

// ---------------------------------------------------------------------------------------------------------------
// Big bubbles and the rolling boil: spawns and buffs

export const ROLLING_BOIL = { seconds: 30, extra: 6 };

export const boosts = buffs({
  key: "boosts",
  list: [
    { id: "rolling-boil", durationMs: ROLLING_BOIL.seconds * 1000, stack: "refresh", effects: () => [] },
  ],
});

export const surface = spawns({
  key: "surface",
  kinds: [
    {
      id: "big-bubble",
      wait: { minMs: 45_000, maxMs: 150_000, ramp: { power: 3, stepMs: 1000 } },
      lifeMs: 12_000,
      active: (s: Simmer) => has(s, "ladle"),
      outcomes: [
        { id: "splash", weight: 60 },
        { id: "rolling-boil", weight: 40, noRepeat: true },
      ],
    },
  ],
  onCatch: (d: Draft<Simmer>, outcome, now) => {
    if (outcome === "splash") {
      const minute = (d.burners.perSecond.bubbles ?? ZERO).mul(60);
      wallet.credit(d, "bubbles", minute.max(25));
      return;
    }
    boosts.start(d, outcome, now);
  },
});

/** The rolling boil pays the burners' rate six more times over, for the part of each pass it covered. */
export const boil = feature({
  key: "boil",
  reach: [wallet, burners, boosts],
  initial: () => ({ paid: ZERO }),
  steps: {
    produce: {
      rolling: (d, ctx) => {
        const covered = overlapMs(d.boosts, "rolling-boil", ctx.now - ctx.dtMs, ctx.now);
        if (covered <= 0) return;
        const extra = (d.burners.perSecond.bubbles ?? ZERO).mul((ROLLING_BOIL.extra * covered) / 1000);
        wallet.credit(d, "bubbles", extra);
        d.boil.paid = d.boil.paid.add(extra);
      },
    },
  },
});

// ---------------------------------------------------------------------------------------------------------------
// The game

export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  // Steps of one phase run in this order (chapter 3). `boil` reads `burners.perSecond` from the earlier `rates`.
  features: [wallet, kitchen, heat, burners, pot, boosts, surface, boil],
  vocab: SIMMER,
});

// ---------------------------------------------------------------------------------------------------------------
// What the screen reads: plain functions over the state, no React

/** One burner row: what it shows and what its button would buy, for the chosen buy mode. */
export function burnerRow(s: Simmer, id: string, mode: BuyMode) {
  const affordable = burners.rules.affordable(s, id);
  const untilNext = burners.rules.untilMilestone(s, id);
  const count = Math.max(1, buyCount(mode, { affordable, untilNext: untilNext ?? 1 }));
  const price = burners.rules.price(s, id, count);
  return {
    owned: burners.rules.owned(s, id),
    perSecond: fmt(burners.rules.rate(s, id)).text,
    untilNext,
    count,
    price: fmt(price).text,
    canBuy: burners.rules.open(s, id) && price.lte(s.wallet.bubbles),
  };
}

/** The kitchen shelf: what is on offer, what the next rank costs, and whether it can be bought now. */
export function shelf(s: Simmer) {
  return kitchen.tree.nodes
    .filter((node) => onOffer(s, node))
    .map((node) => {
      const owned = s.kitchen.ranks[node.id] ?? 0;
      const next = kitchen.tree.price(node, owned)?.[0];
      return {
        id: node.id,
        name: node.name,
        line: node.line,
        owned,
        price: next ? fmt(next.amount).text : null, // null: bought out
        canBuy: kitchen.tree.check(node.id, s.kitchen.ranks, () => s.wallet.bubbles) === null,
      };
    });
}

if (import.meta.main) {
  let t = Date.UTC(2026, 0, 1);
  const store = createIdleStore(game, {
    storage: createGameStorage(createMemoryBackend(), { debounceMs: 0 }),
    now: () => t,
  });
  for (let i = 0; i < 15; i++) {
    t += 100;
    const paid = store.getState().pot.click();
    if (paid?.crit) console.log("a crit:", fmt(paid.amount).text);
  }
  console.log("heat after 15 taps:", store.getState().heat.level);
  console.log("bought a burner:", store.getState().burners.buy("burner"));
  for (let i = 0; i < 60; i++) {
    t += 1000;
    store.getState().tick(1000);
  }
  const s = store.getState();
  console.log("bubbles:", fmt(s.wallet.bubbles).text, "heat:", s.heat.level);
  console.log("burner row (x1):", burnerRow(s, "burner", 1));
  console.log("burner row (next):", burnerRow(s, "burner", "next"));
  console.log("shelf:", shelf(s));
}
