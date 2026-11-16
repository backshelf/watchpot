import { defineBuffs, defineGame, defineStats, type Effect, feature, vocab } from "watchpot/core";

const WORDS = vocab({ currencies: ["gold"], stats: ["speed"] });

export const boosts = defineBuffs<"boosts", Effect<"speed">>({
  key: "boosts",
  list: [
    { id: "rush", durationMs: 77_000, stack: "refresh", effects: () => [{ stat: "speed", mul: 7 }] },
    {
      id: "focus",
      durationMs: 30_000,
      stack: "stack",
      maxStacks: 5,
      effects: (stacks) => [{ stat: "speed", add: stacks }],
    },
    // A timer: no `effects`, so it adds nothing to the stats. The game asks `boosts.select.active` and decides what it means.
    { id: "cooldown", durationMs: 10_000, stack: "ignore" },
  ],
});
// store.getState().boosts.start("rush"), and boosts.draft.start(d, "rush", now) inside a recipe

/** Income of 1 gold a second, ×7 for the part of a tick or an absence the rush covered. */
export const mine = feature({
  key: "mine",
  reach: [boosts],
  initial: () => ({ gold: 0 }),
  steps: {
    produce: {
      income: {
        pass: "both",
        run: (d, ctx) => {
          const rushed = boosts.select.overlapMs(d, "rush", ctx.now - ctx.dtMs, ctx.now);
          d.mine.gold += (ctx.dtMs + 6 * rushed) / 1000;
        },
      },
    },
  },
});

/**
 * What the running buffs do, on the engine's `stats`: `s.stats.speed`. A stat is worked out from the state alone, and
 * the buffs' own step ends every buff whose time is up at the start of each pass, so every buff still listed counts.
 */
export const speed = defineStats({
  key: "stats",
  vocab: WORDS,
  reach: () => [boosts],
  stats: { speed: { base: 1 } },
  contributions: (s) => boosts.select.contributions(s),
});

export const game = defineGame({
  id: "boosts",
  save: { key: "boosts.save", version: 1 },
  vocab: WORDS,
  features: [boosts, mine, speed],
});

/** The timer buff read directly: the game's own button checks this before it lets the player press again. */
export const coolingDown = (s: Parameters<typeof boosts.select.active>[0], now: number) =>
  boosts.select.active(s, "cooldown", now);
