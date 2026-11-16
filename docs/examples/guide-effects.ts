/**
 * Chapter 8 of the guide, "Effects": four things that change how hard Simmer's stove works (an upgrade, a timed buff,
 * a medal and a milestone), declared as effects on one stat, `heat`, served by the engine's `stats` feature, with a
 * tooltip that says where the rate comes from, and an effect whose amount reads the state.
 *
 * Run it with `bun docs/examples/guide-effects.ts`: it buys 25 burners and three copper ranks, starts a rolling boil,
 * and prints the stove's rate on two passes and the tooltip's lines.
 */
import {
  achievements,
  buffs,
  type Contribution,
  D,
  type Decimal,
  defineGame,
  defineStats,
  type Effect,
  feature,
  fmtPlus,
  fmtRate,
  fmtTimes,
  type GraphNode,
  type StatCaps,
  type StateOf,
  statIndex,
  upgradeTree,
} from "watchpot/core";
import { SIMMER, type Simmer, scriptStore, WORDS, wallet } from "./simmer/game-wallet";

// --- 1. Four sources, each saying what it does to "heat" -----------------------------------------------------------

/** An upgrade: a copper base for the stove. Each rank multiplies heat by 1.25. */
const COPPER: GraphNode<Effect<"heat">, "bubbles"> = {
  id: "copper",
  name: "Copper base",
  line: "Spreads the heat.",
  cost: [{ currency: "bubbles", amount: 100 }],
  costGrowth: 3,
  maxLevel: 5,
  requires: [],
  effects: [{ stat: "heat", mul: 1.25 }],
};
export const kitchen = upgradeTree({ key: "kitchen", nodes: [COPPER], wallet });

/** A buff: a rolling boil, three times the heat for thirty seconds. Starting it again restarts the clock. */
export const boosts = buffs<"boosts", Effect<"heat">>({
  key: "boosts",
  list: [
    { id: "rolling-boil", durationMs: 30_000, stack: "refresh", effects: () => [{ stat: "heat", mul: 3 }] },
  ],
});

/** An achievement: ten burners lit. While it is earned, heat is 10% higher. */
export const medals = achievements<"medals", Simmer, Effect<"heat">>({
  key: "medals",
  columns: 5,
  list: [
    {
      id: "ten-burners",
      name: "Full stove",
      line: "Light ten burners.",
      effects: [{ stat: "heat", mul: 1.1 }],
      when: (s: Simmer) => s.stove.burners >= 10,
    },
  ],
});

/** A milestone the game writes itself: every 25 burners lit adds 0.5 to heat's base. */
function milestones(s: Pick<Simmer, "stove">): Contribution<"heat">[] {
  const reached = Math.floor(s.stove.burners / 25);
  return reached > 0 ? [{ source: "milestone", effect: { stat: "heat", add: 0.5 * reached } }] : [];
}

/** The state the stats read: chapter 4's Simmer and the three features above. */
const SOURCES = [...SIMMER, kitchen, boosts, medals] as const;
export type Cooking = StateOf<typeof SOURCES>;

// --- 2. The stats: every contribution in one list, one value per stat ----------------------------------------------

/** Past 20, a softcap slows heat down. */
export const HEAT: StatCaps = { softcap: { start: 20, power: 0.5, label: "The pot spits over the rim" } };

/** The names a player reads, by the contributions' source ids (`<feature key>:<id>`). */
const NAMES: Record<string, string> = {
  "kitchen:copper": "Copper base",
  "boosts:rolling-boil": "Rolling boil",
  "medals:ten-burners": "Full stove",
  milestone: "Burner milestones",
};

/** Heat, on the state as `s.stats.heat`: a base of 1, every source's effects, worked out again when one changes. */
export const heat = defineStats({
  key: "stats",
  vocab: WORDS,
  reach: () => SOURCES,
  stats: { heat: { base: 1, ...HEAT } },
  contributions: (s) => [
    ...kitchen.tree.contributions(s.kitchen.ranks),
    // The buffs' own step ends a buff whose time is up at the start of every pass, so each one listed is running.
    ...boosts.select.contributions(s, Number.NEGATIVE_INFINITY),
    ...medals.board.contributions(s.medals.earned),
    ...milestones(s),
  ],
  label: (source) => NAMES[source] ?? source,
});

// --- 3. The one number every source changed ------------------------------------------------------------------------

/** The fire: multiplies the stove's rate by heat, right after the lid. It knows no copper, buff or medal. */
export const fire = feature({
  key: "fire",
  reach: [...SOURCES, heat],
  initial: () => ({}),
  steps: {
    rates: {
      stoke: {
        after: "lid.rates.trap",
        run: (s) => {
          s.stove.perSecond = s.stove.perSecond.mul(s.stats.heat);
        },
      },
    },
  },
});

export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  vocab: WORDS,
  features: [...SOURCES, heat, fire],
});

// --- 4. The tooltip: where the rate comes from ---------------------------------------------------------------------

/** The lines of a tooltip over the stove's rate: one per source, its ranks already counted together. */
export function whyHeat(s: StateOf<typeof game.features>): string[] {
  const b = heat.select.explain(s, "heat");
  const lines = b.parts.map((p) => `${p.op === "add" ? fmtPlus(p.value) : fmtTimes(p.value)}  ${p.label}`);
  lines.push(`= ${fmtTimes(b.value)}${b.softcapped ? `  (${b.softcapped})` : ""}`);
  return lines;
}

// --- 5. An effect that reads the state -----------------------------------------------------------------------------

/** One graph by hand, over any state: copper counted by its ranks, and a pot whose worth is the log of its bubbles. */
const POT = statIndex<"heat", never, Cooking>({ base: () => 1, caps: { heat: HEAT } });
POT.add(
  { effects: [{ stat: "heat", mul: 1.25 }] },
  { label: "Copper base", owner: "kitchen", times: (s) => s.kitchen.ranks.copper ?? 0 },
);
POT.add(
  // Multiplied by the log of the bubbles held: it changes every tick, so no fixed number could carry it.
  { effects: [{ stat: "heat", mul: (s) => s.wallet.bubbles.add(1).log10() }] },
  { label: "A full pot", owner: "wallet", active: (s) => s.wallet.bubbles.gte(1000) },
);

/** Heat and its breakdown over one state, worked out on first read. */
export function potHeat(s: Cooking): { value: Decimal; lines: string[] } {
  const b = POT.over(s).explain("heat");
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
  for (const line of whyHeat(s)) console.log("  ", line);

  const live = potHeat({ ...s, wallet: { ...s.wallet, bubbles: D(1e6) } });
  console.log("live heat", fmtTimes(live.value), live.lines);
}
