/**
 * Chapter 8 of the guide, "Effects": four things that change how hard Simmer's stove works (an upgrade, a timed buff,
 * a medal and a milestone), folded into one stat, `heat`, on the engine's stat bus, with a tooltip that says where the
 * rate comes from, and the same stat on the live graph.
 *
 * Run it with `bun docs/examples/guide-effects.ts`: it buys 25 burners and three copper ranks, starts a rolling boil,
 * and prints the stove's rate on two passes and the tooltip's lines.
 */
import {
  achievements,
  buffs,
  busOf,
  type Contribution,
  D,
  type Decimal,
  defineGame,
  type Effect,
  explainStat,
  feature,
  fmtPlus,
  fmtRate,
  fmtTimes,
  type GraphNode,
  liveIndex,
  type StatBus,
  type StatDef,
  type StateOf,
  statValue,
  upgradeTree,
} from "watchpot/core";
import { SIMMER, type Simmer, scriptStore, WORDS, wallet } from "./simmer/game-wallet";

// --- 1. Four sources, each saying what it does to "heat" -----------------------------------------------------------

/** An upgrade: a copper base for the stove. Each rank multiplies heat by 1.25. */
const COPPER: GraphNode<Effect, "bubbles"> = {
  id: "copper",
  name: "Copper base",
  line: "Spreads the heat.",
  cost: [{ currency: "bubbles", amount: 100 }],
  costGrowth: 3,
  maxLevel: 5,
  requires: [],
  effects: [{ stat: "heat", mult: 1.25 }],
};
export const kitchen = upgradeTree({ key: "kitchen", nodes: [COPPER], wallet });

/** A buff: a rolling boil, three times the heat for thirty seconds. Starting it again restarts the clock. */
export const boosts = buffs<"boosts", Effect>({
  key: "boosts",
  list: [
    { id: "rolling-boil", durationMs: 30_000, stack: "refresh", effects: () => [{ stat: "heat", mult: 3 }] },
  ],
});

/** An achievement: ten burners lit. While it is earned, heat is 10% higher. */
export const medals = achievements({
  key: "medals",
  columns: 5,
  list: [
    {
      id: "ten-burners",
      name: "Full stove",
      line: "Light ten burners.",
      effects: [{ stat: "heat", mult: 1.1 }],
      when: (s: Simmer) => s.stove.burners >= 10,
    },
  ],
});

/** A milestone the game writes itself: every 25 burners lit adds 0.5 to heat's base. */
function milestones(s: Pick<Simmer, "stove">): Contribution[] {
  const reached = Math.floor(s.stove.burners / 25);
  return reached > 0 ? [{ source: "milestone", effect: { stat: "heat", add: 0.5 * reached } }] : [];
}

/** The state the bus reads: chapter 4's Simmer and the three features above. */
const SOURCES = [...SIMMER, kitchen, boosts, medals] as const;
export type Cooking = StateOf<typeof SOURCES>;

// --- 2. The bus: every contribution in one list, folded ------------------------------------------------------------

/** Heat starts at 1. Past 20 a softcap slows it down. */
export const HEAT: StatDef = { softcap: { start: 20, power: 0.5, label: "The pot spits over the rim" } };

/** Every contribution to every stat, from every source, at game time `now`. */
export function busFor(s: Cooking, now: number): StatBus {
  return busOf([
    ...kitchen.tree.contributions(s.kitchen.ranks),
    ...boosts.contributions(s.boosts, now),
    ...medals.board.contributions(s.medals.earned),
    ...milestones(s),
  ]);
}

// --- 3. The one number every source changed ------------------------------------------------------------------------

/** Heat as the stove reads it: the bus folded at `now`, with a base of 1 and the softcap. */
export const heatAt = (s: Cooking, now: number): number => statValue(busFor(s, now), "heat", 1, HEAT);

/** The fire: works heat out where it applies, and multiplies the stove's rate by it. It knows no copper, buff or medal. */
export const fire = feature({
  key: "fire",
  reach: SOURCES,
  initial: () => ({}),
  // A fresh state (a new store, a load, a reset) gets the stove's full rate before the first pass.
  steps: {
    rates: {
      stoke: {
        after: "lid.rates.trap",
        run: (s, ctx) => {
          s.stove.perSecond = s.stove.perSecond.mul(heatAt(s, ctx.now));
        },
      },
    },
  },
});

export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  vocab: WORDS,
  features: [...SOURCES, fire],
});

// --- 4. The tooltip: where the rate comes from ---------------------------------------------------------------------

/** The names a player reads, by the bus's source ids (`<feature key>:<id>`). */
const NAMES: Record<string, string> = {
  "kitchen:copper": "Copper base",
  "boosts:rolling-boil": "Rolling boil",
  "medals:ten-burners": "Full stove",
  milestone: "Burner milestones",
};

/** The lines of a tooltip over the stove's rate: one per source, its ranks multiplied together. */
export function whyHeat(s: Cooking, now: number): string[] {
  const b = explainStat(busFor(s, now), "heat", 1, HEAT);
  const bySource = new Map<string, { add: number; mult: number }>();
  for (const { source, effect } of b.sources) {
    const row = bySource.get(source) ?? { add: 0, mult: 1 };
    row.add += effect.add ?? 0;
    row.mult *= effect.mult ?? 1;
    bySource.set(source, row);
  }
  const lines = [...bySource].map(([source, row]) => {
    const amount = row.add !== 0 ? fmtPlus(row.add) : fmtTimes(row.mult);
    return `${amount}  ${NAMES[source] ?? source}`;
  });
  lines.push(`= ${fmtTimes(b.value)}${b.softcapped ? `  (${b.softcapped})` : ""}`);
  return lines;
}

// --- 5. The live graph: an effect that reads the state -------------------------------------------------------------

/** Indexed once, from content. Each effect's value is a function of the state, worked out in Decimals. */
const LIVE = liveIndex<"heat", never, Cooking>({ caps: { heat: HEAT } });
LIVE.add(
  { effects: [{ stat: "heat", op: "mul", value: (s) => 1.25 ** (s.kitchen.ranks.copper ?? 0) }] },
  { label: "Copper base", owner: "kitchen", active: (s) => (s.kitchen.ranks.copper ?? 0) > 0 },
);
LIVE.add(
  // Multiplied by the log of the bubbles held: it changes every tick, so no fixed effect could carry it.
  { effects: [{ stat: "heat", op: "mul", value: (s) => s.wallet.bubbles.add(1).log10() }] },
  { label: "A full pot", owner: "wallet", active: (s) => s.wallet.bubbles.gte(1000) },
);

/** The live heat and its breakdown, for one state. Make a new graph whenever the state changes. */
export function liveHeat(s: Cooking): { value: Decimal; lines: string[] } {
  const b = LIVE.over(s).explain("heat");
  return { value: b.value, lines: b.parts.map((p) => `${fmtTimes(p.value)}  ${p.label}`) };
}

if (import.meta.main) {
  let now = Date.UTC(2026, 0, 1);
  const store = scriptStore(game, () => now);
  const play = (ms: number) => {
    now += ms;
    store.getState().tick(ms, now);
  };

  store.getState().wallet.credit("bubbles", 5000);
  for (let i = 0; i < 25; i++) store.getState().stove.buyBurner();
  store.getState().kitchen.buyMax("copper");
  store.getState().boosts.start("rolling-boil");
  play(100); // the medal is earned at the end of this pass...
  console.log("first pass: the stove makes", fmtRate(store.getState().stove.perSecond));
  play(100); // ...and counts from this one
  const s = store.getState();
  console.log("second pass: the stove makes", fmtRate(s.stove.perSecond));
  for (const line of whyHeat(s, now)) console.log("  ", line);

  const live = liveHeat({ ...s, wallet: { ...s.wallet, bubbles: D(1e6) } });
  console.log("live heat", fmtTimes(live.value), live.lines);
}
