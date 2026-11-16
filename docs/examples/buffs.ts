import { buffs, busOf, defineGame, type Effect, feature, overlapMs } from "watchpot/core";

export const boosts = buffs<"boosts", Effect>({
  key: "boosts",
  list: [
    { id: "rush", durationMs: 77_000, stack: "refresh", effects: () => [{ stat: "speed", mult: 7 }] },
    {
      id: "focus",
      durationMs: 30_000,
      stack: "stack",
      maxStacks: 5,
      effects: (stacks) => [{ stat: "speed", add: stacks }],
    },
  ],
});

/** Income of 1 gold a second, ×7 for the part of a tick or an absence the rush covered. */
export const mine = feature({
  key: "mine",
  reach: [boosts],
  initial: () => ({ gold: 0 }),
  steps: {
    produce: {
      income: (d, ctx) => {
        const rushed = overlapMs(d.boosts, "rush", ctx.now - ctx.dtMs, ctx.now);
        d.mine.gold += (ctx.dtMs + 6 * rushed) / 1000;
      },
    },
  },
});

export const game = defineGame({
  id: "boosts",
  save: { key: "boosts.save", version: 1 },
  features: [boosts, mine],
});

/** What the running buffs do now, on the stat bus. */
export const boostBus = (s: { boosts: Parameters<typeof boosts.contributions>[0] }, now: number) =>
  busOf(boosts.contributions(s.boosts, now));
