import { allocation, busOf, defineGame, type Effect, feature } from "watchpot/core";

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
      effects: (level): Effect[] => [{ stat: "toy.speed", add: level }],
    },
    { id: "study", cost: (level) => 100 * (level + 1), speed: () => 2, maxLevel: 20 }, // walked
  ],
});

export const game = defineGame({
  id: "jobs",
  save: { key: "jobs.save", version: 1 },
  features: [crew, jobs],
});
// store.getState().jobs.assign("forge", 4) · .unassign("forge", 1) · .fill("study") · .clear()
// jobs.rules.bar(state, "forge") → { level, into, need, share } · jobs.rules.free(state)
export const jobBus = (s: { jobs: { level: Record<string, number> } }) =>
  busOf(jobs.rules.contributions(s.jobs));
