import { allocation, defineGame, type Effect, feature, stats } from "watchpot/core";
import { TOY } from "./vocab";

type State = { crew: { size: number } };
const crew = feature({ key: "crew", initial: () => ({ size: 12 }) });

/** Twelve workers across three sinks: one that only counts, two bars that level up as they fill. */
export const jobs = allocation({
  key: "jobs",
  pool: (s: State) => s.crew.size, // the game's number; shrink it and the newest assignments give way
  sinks: [
    { id: "haul", cap: () => 5 }, // counts: the game reads s.jobs.assigned.haul as a rate
    {
      id: "forge",
      cost: { base: 10, growth: 1.5 }, // work per level: geometric, so a long absence levels in one step
      speed: () => 1, // work per assigned worker per second
      effects: (level): Effect<"toy.speed">[] => [{ stat: "toy.speed", add: level }],
    },
    { id: "study", cost: (level) => 100 * (level + 1), speed: () => 2, maxLevel: 20 }, // walked
  ],
});

/** What the bars' levels give, on the engine's `stats`: `s.stats["toy.speed"]`, worked out as the levels move. */
export const boosts = stats({
  key: "stats",
  vocab: TOY,
  reach: () => [jobs],
  stats: { "toy.speed": { base: 1 } },
  contributions: (s) => jobs.rules.contributions(s.jobs),
});

export const game = defineGame({
  id: "jobs",
  save: { key: "jobs.save", version: 1 },
  vocab: TOY,
  features: [crew, jobs, boosts],
});
// store.getState().jobs.assign("forge", 4) · .unassign("forge", 1) · .fill("study") · .clear()
// jobs.rules.bar(state, "forge") → { level, into, need, share } · jobs.rules.free(state)
