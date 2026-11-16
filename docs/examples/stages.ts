import { defineCurrencies, defineGame, defineStages } from "watchpot/core";
import { TOY } from "./vocab";

const wallet = defineCurrencies({ key: "wallet", vocab: TOY });

/** Two roads: one that only ever gets harder, and a short one with a clock on every stage. */
export const roads = defineStages({
  key: "roads",
  reach: [wallet],
  tracks: [
    { id: "north", resistance: { base: 10, growth: 1.6 }, boss: { every: 10, mult: 8 } },
    { id: "pass", resistance: { base: 1000, growth: 3 }, limitMs: 30_000, length: 25 },
  ],
  force: (s) => s.wallet.gold.add(1).sqrt(), // the game's own damage stat
  open: (s, track) => track.id === "north" || s.wallet.gems.gte(1),
  onClear: (d, track, from, to) =>
    wallet.draft.credit(d, "gems", track === "north" ? to - from : 5 * (to - from)),
  away: () => ({ rate: 0.5, capMs: 8 * 3_600_000 }),
});

export const game = defineGame({
  id: "roads",
  save: { key: "roads.save", version: 1 },
  features: [wallet, roads],
  vocab: TOY,
});
// roads.select.fill(state, "north") · roads.select.secondsToClear(state, "pass") (null at a wall)
// store.getState().roads.enter("north", 20) stands in front of an earlier stage again
