import { type ChallengesState, challenges, D, type Decimal, type StatGraph, statIndex } from "watchpot/core";

type Stat = "speed";
type Group = "tools" | "helpers";

interface Kitchen {
  gold: Decimal;
  knives: number;
  cooks: number;
  trials: Pick<ChallengesState, "active" | "rules">;
}

/**
 * Challenges whose rule flags name a group of the stat graph: `mute:tools` switches every tool off for the run. A
 * new restriction is one more list entry; no rule anywhere in the game has to learn about it.
 */
export const trials = challenges({
  key: "trials",
  list: [
    { id: "bare-hands", goal: (s: Kitchen) => s.gold.gte(1e6), rules: ["mute:tools"] },
    { id: "alone", goal: (s) => s.gold.gte(1e6), rules: ["mute:helpers"] },
    { id: "nothing", goal: (s) => s.gold.gte(1e4), rules: ["mute:tools", "mute:helpers"] },
  ],
});

const INDEX = statIndex<Stat, never, Reader, Group>({ base: () => 1 });
INDEX.add(
  { effects: [{ stat: "speed", mul: (q) => 1 + q.s.knives }] },
  { label: "Knives", owner: "drawer", group: "tools", active: (q) => q.s.knives > 0 },
);
INDEX.add(
  { effects: [{ stat: "speed", add: (q) => q.s.cooks }] },
  { label: "Cooks", owner: "kitchen", group: "helpers", active: (q) => q.s.cooks > 0 },
);

/** The graph over one state, with the active challenge's mute flags read as the graph's mutes. */
class Reader {
  readonly graph: StatGraph<Stat, never>;
  constructor(readonly s: Kitchen) {
    this.graph = INDEX.over(this, { muted: (group) => trials.select.rule(s, `mute:${group}`) });
  }
}

if (import.meta.main) {
  const base = { gold: D(0), knives: 3, cooks: 2 };
  const free = new Reader({ ...base, trials: { active: null, rules: [] } });
  const bare = new Reader({ ...base, trials: { active: "bare-hands", rules: ["mute:tools"] } });
  console.log("speed:", free.graph.stat("speed").toString()); // (1 + 2) x 4 = 12
  console.log("bare hands:", bare.graph.stat("speed").toString()); // 1 + 2 = 3
}
