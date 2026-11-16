import { defineGame, feature, fmtPlayed, records } from "watchpot/core";

export const stats = records({
  key: "stats",
  track: {
    presses: { kind: "sum", scope: ["run", "life"] },
    gold: { kind: "sum", scope: ["run", "life"], decimal: true },
    richest: { kind: "max", scope: ["run", "life"], decimal: true },
    gemsHeld: { kind: "last", scope: ["life"] },
  },
});

/** A game's step counts through the draft helper; an action would call `store.getState().stats.add(...)`. */
export const mine = feature({
  key: "mine",
  reach: [stats],
  initial: () => ({ perSecond: 2 }),
  steps: {
    produce: {
      income: { pass: "both", run: (d, ctx) => stats.add(d, "gold", (d.mine.perSecond * ctx.dtMs) / 1000) },
    },
  },
});

export const game = defineGame({
  id: "stats",
  save: { key: "stats.save", version: 1 },
  features: [stats, mine],
});

/** The "last runs" table: each finished run's length and gold. */
export function lastRuns(s: { stats: Parameters<typeof stats.value>[0] }): string[] {
  return s.stats.runs.map((r) => `${fmtPlayed(r.lengthMs)} · ${String(r.values.gold ?? 0)} gold`);
}
