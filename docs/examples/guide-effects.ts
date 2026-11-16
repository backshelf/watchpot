import type { Draft } from "immer";
import {
  type AchievementsState,
  achievements,
  type BuffsState,
  buffs,
  busOf,
  type Contribution,
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  currencies,
  D,
  type Decimal,
  defineGame,
  type Effect,
  explainStat,
  feature,
  fmtPlus,
  fmtRate,
  fmtTimes,
  type GeneratorsState,
  type GraphNode,
  generators,
  liveIndex,
  type StatBus,
  type StatDef,
  statValue,
  type TreeState,
  upgradeTree,
  vocab,
} from "watchpot/core";

/** Simmer's words. `vocab` needs at least one rarity, even in a game that has none. */
const WORDS = vocab({ currencies: ["bubbles"], stats: ["boil"], rarities: ["common"] } as const);

/** The pot holds the bubbles. */
export const pot = currencies({ key: "pot", vocab: WORDS, start: { bubbles: 50 } });

/** The state the effects read, written out by hand because `stats` and `burners` read each other. */
export interface Simmer {
  pot: { bubbles: Decimal };
  kitchen: TreeState;
  boosts: BuffsState;
  medals: AchievementsState;
  burners: GeneratorsState;
  stats: { boil: number };
}

// --- 1. Four sources, each saying what it does to "boil" -----------------------------------------------------------

/** An upgrade: a copper base for the pot. Each rank multiplies boil by 1.25. */
const COPPER: GraphNode<Effect, "bubbles"> = {
  id: "copper",
  name: "Copper base",
  line: "Spreads the heat.",
  cost: [{ currency: "bubbles", amount: 100 }],
  costGrowth: 3,
  maxLevel: 5,
  requires: [],
  effects: [{ stat: "boil", mult: 1.25 }],
};
export const kitchen = upgradeTree({ key: "kitchen", nodes: [COPPER], wallet: pot });

/** A buff: a rolling boil, three times the boil for thirty seconds. Starting it again restarts the clock. */
export const boosts = buffs<"boosts", Effect>({
  key: "boosts",
  list: [{ id: "rolling", durationMs: 30_000, stack: "refresh", effects: () => [{ stat: "boil", mult: 3 }] }],
});

/** An achievement: ten burners lit. While it is earned, boil is 10% higher. */
export const medals = achievements({
  key: "medals",
  columns: 5,
  list: [
    {
      id: "ten-burners",
      name: "Full stove",
      line: "Light ten burners.",
      effects: [{ stat: "boil", mult: 1.1 }],
      when: (s: Simmer) => (s.burners.owned.burner ?? 0) >= 10,
    },
  ],
});

/** A milestone the game writes itself: every 25 burners owned adds 0.5 to boil's base. */
function milestones(s: Simmer): Contribution[] {
  const reached = Math.floor((s.burners.owned.burner ?? 0) / 25);
  return reached > 0 ? [{ source: "milestone", effect: { stat: "boil", add: 0.5 * reached } }] : [];
}

// --- 2. The bus: every contribution in one list, folded ------------------------------------------------------------

/** Boil starts at 1. Past 20 a softcap slows it down. */
export const BOIL: StatDef = { softcap: { start: 20, power: 0.5, label: "The pot spits over the rim" } };

/** Every contribution to every stat, from every source, at game time `now`. */
export function busFor(s: Simmer, now: number): StatBus {
  return busOf([
    ...kitchen.tree.contributions(s.kitchen.ranks),
    ...boosts.contributions(s.boosts, now),
    ...medals.board.contributions(s.medals.earned),
    ...milestones(s),
  ]);
}

/** Folds boil into the state once a pass, and again whenever a load or a reset makes the state fresh. */
const fold = (d: Draft<Simmer>, ctx: { now: number }) => {
  d.stats.boil = statValue(busFor(d, ctx.now), "boil", 1, BOIL);
};
export const stats = feature({
  key: "stats",
  initial: () => ({ boil: 1 }),
  transient: ["boil"],
  reset: "never",
  derive: fold,
  steps: { rates: { fold } },
});

// --- 3. The one number every source changed ------------------------------------------------------------------------

/** The burner reads the folded boil and nothing else: it knows no copper, buff or achievement. */
export const burners = generators({
  key: "burners",
  wallet: pot,
  list: [{ id: "burner", cost: { base: 10, growth: 1.15 }, pays: "bubbles", makes: "bubbles", rate: 1 }],
  mult: (s: Simmer) => s.stats.boil,
});

export const game = defineGame({
  id: "simmer-effects",
  save: { key: "simmer-effects.save", version: 1 },
  // Order matters: `stats` folds in `rates` before the burners read it in theirs.
  features: [pot, kitchen, boosts, medals, stats, burners],
  vocab: WORDS,
});

// --- 4. The tooltip: where the rate comes from ---------------------------------------------------------------------

/** The names a player reads, by the bus's source ids (`<feature key>:<id>`). */
const NAMES: Record<string, string> = {
  "kitchen:copper": "Copper base",
  "boosts:rolling": "Rolling boil",
  "medals:ten-burners": "Full stove",
  milestone: "Burner milestones",
};

/** The lines of a tooltip over the burner's rate: one per source, its ranks multiplied together. */
export function whyBoil(s: Simmer, now: number): string[] {
  const b = explainStat(busFor(s, now), "boil", 1, BOIL);
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
const LIVE = liveIndex<"boil", never, Simmer>({ caps: { boil: BOIL } });
LIVE.add(
  { effects: [{ stat: "boil", op: "mul", value: (s) => 1.25 ** (s.kitchen.ranks.copper ?? 0) }] },
  { label: "Copper base", owner: "kitchen", active: (s) => (s.kitchen.ranks.copper ?? 0) > 0 },
);
LIVE.add(
  // Multiplied by the log of the bubbles held: it changes every tick, so no fixed effect could carry it.
  { effects: [{ stat: "boil", op: "mul", value: (s) => s.pot.bubbles.add(1).log10() }] },
  { label: "A full pot", owner: "pot", active: (s) => s.pot.bubbles.gte(1000) },
);

/** The live boil and its breakdown, for one state. Make a new graph whenever the state changes. */
export function liveBoil(s: Simmer): { value: Decimal; lines: string[] } {
  const b = LIVE.over(s).explain("boil");
  return { value: b.value, lines: b.parts.map((p) => `${fmtTimes(p.value)}  ${p.label}`) };
}

if (import.meta.main) {
  let now = Date.UTC(2026, 0, 1);
  const store = createIdleStore(game, {
    storage: createGameStorage(createMemoryBackend(), { debounceMs: 0 }),
    now: () => now,
  });
  const play = (ms: number) => {
    now += ms;
    store.getState().tick(ms, now);
  };

  store.getState().pot.credit("bubbles", 5000);
  store.getState().burners.buy("burner", 25);
  store.getState().kitchen.buyMax("copper");
  store.getState().boosts.start("rolling");
  play(100); // the achievement is earned at the end of this pass...
  console.log("first pass: burners make", fmtRate(store.getState().burners.perSecond.bubbles ?? 0));
  play(100); // ...and counts from this one
  const s = store.getState();
  console.log("second pass: burners make", fmtRate(s.burners.perSecond.bubbles ?? 0));
  for (const line of whyBoil(s, now)) console.log("  ", line);

  const live = liveBoil({ ...s, pot: { bubbles: D(1e6) } });
  console.log("live boil", fmtTimes(live.value), live.lines);
}
