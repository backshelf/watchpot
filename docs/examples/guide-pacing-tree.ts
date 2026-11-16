/**
 * Chapter 12 of the guide, "Proving the pacing": two small things the main sim (guide-pacing.ts) does not need. An
 * upgrade tree offers its nodes to the sim by itself, worth what they add to the objective; and a sitting can stop
 * the moment something first happens, which answers "when does the player first get X?". The game is the main sim's
 * playable Simmer, plus a kitchen shop with one upgrade in it, which doubles the heat.
 *
 * Run it with `bun docs/examples/guide-pacing-tree.ts`: it prints when the sim first bought the copper base.
 */
import {
  defineGame,
  defineStats,
  defineUpgradeTree,
  type Effect,
  type GraphNode,
  HOUR_MS,
} from "watchpot/core";
import { autoPlayer, createSimWorld, fmtClock, playStraight, simStore } from "watchpot/sim";
import { income, playableStove } from "./guide-pacing";
import { LID_HEAT, lid, pot, WORDS, wallet } from "./simmer/game-wallet";

/** The kitchen's one upgrade: twice the heat, so the stove makes twice the bubbles. */
const COPPER: GraphNode<Effect<"heat">, "bubbles"> = {
  id: "copper",
  name: "A copper base",
  line: "Spreads the flame: the stove makes twice the bubbles.",
  cost: [{ currency: "bubbles", amount: 200 }],
  maxLevel: 1,
  requires: [],
  effects: [{ stat: "heat", mul: 2 }],
};

// The tree offers the sim a move per node it can buy, with no worth: the auto-player works it out from its objective.
const kitchen = defineUpgradeTree({ key: "kitchen", nodes: [COPPER], wallet });

/** The stats, with the kitchen's ranks beside the lid. */
const stats = defineStats({
  key: "stats",
  vocab: WORDS,
  reach: [lid, kitchen],
  stats: { heat: { base: 1 } },
  sources: [LID_HEAT],
  contributions: (s) => kitchen.select.contributions(s),
});

export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  vocab: WORDS,
  features: [wallet, pot, playableStove, lid, kitchen, stats],
});

/** How long the sim took to buy the copper base, in ms, or null if two hours were not enough. */
export function copperBoughtAt(seed = "simmer"): number | null {
  const start = Date.UTC(2026, 0, 1);
  const world = createSimWorld((now) => simStore(game, now, seed), start);
  const player = autoPlayer(game, { objective: income });
  const has = () => (world.store.getState().kitchen.ranks.copper ?? 0) > 0;

  playStraight({
    world,
    ms: 2 * HOUR_MS, // the longest it may take
    lookEveryMs: 10_000, // a look every ten seconds
    look: () => player.look(world.store),
    until: has, // checked before each look: the sitting ends the moment it holds
  });

  return has() ? world.now() - start : null;
}

if (import.meta.main) {
  const at = copperBoughtAt();
  console.log(at === null ? "no copper base in two hours" : `copper base at ${fmtClock(at)}`);
}
