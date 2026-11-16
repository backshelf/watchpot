import { defineGame, type Effect, levelAt, levelProgress, levels, type XpCurve } from "watchpot/core";
import { wallet } from "./add-a-currency";
import { TOY } from "./vocab";

/** Each level takes a quarter more than the last: 100, 125, 156… */
const steady: XpCurve = { kind: "geometric", base: 100, growth: 1.25 };

/** Two tracks: one on the steady curve, one on a hand-written table that tops out at level 5. */
export const skills = levels({
  key: "skills",
  tracks: [
    { id: "gather", curve: steady },
    { id: "trade", curve: { kind: "table", totals: [50, 150, 400, 1000, 2500] } },
  ],
  maxLevel: 99, // every track stops here unless its own says otherwise
  onLevel: (d: { wallet: object }, _track, from, to) => wallet.draft.credit(d, "gems", to - from), // a gem a level
  effects: (track, level): Effect[] => [
    { stat: "toy.speed", mul: 1 + (track.id === "gather" ? 0.05 : 0.1) * level },
  ],
});

export const game = defineGame({
  id: "skills",
  save: { key: "skills.save", version: 1 },
  features: [wallet, skills],
  vocab: TOY,
});
// store.getState().skills.gain("gather", 500) → levels gained · skills.gain(draft, "trade", 20) inside a recipe
// skills.rules.progress(state.skills, "gather") → { level, into, need, share } · skills.rules.contributions(...) feeds a `stats` feature
export const where = (xp: number) => ({ level: levelAt(steady, xp), bar: levelProgress(steady, xp).share });
