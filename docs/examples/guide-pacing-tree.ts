/**
 * Chapter 12 of the guide, "Proving the pacing": two small things the main sim (guide-pacing.ts) does not need. An
 * upgrade tree has no moves of its own, so the auto-player never buys from it until you attach some; and a sitting
 * can stop the moment something first happens, which answers "when does the player first get X?". The game is the
 * main sim's playable Simmer, plus a kitchen shop with one upgrade in it.
 *
 * Run it with `bun docs/examples/guide-pacing-tree.ts`: it prints when the sim first bought the copper base.
 */
import {
  defineGame,
  type Effect,
  feature,
  type GraphNode,
  HOUR_MS,
  type TreeState,
  treeMoves,
  upgradeTree,
  withMoves,
} from "watchpot/core";
import { autoPlayer, createSimWorld, fmtClock, playStraight, simStore } from "watchpot/sim";
import { playablePot } from "./guide-pacing";
import { lid, SIMMER_RATES, stove, WORDS, wallet } from "./simmer/game-wallet";

/** The kitchen's one upgrade. It names no stat (Simmer has none); the `copper` feature below reads its rank. */
const COPPER: GraphNode<Effect, "bubbles"> = {
  id: "copper",
  name: "A copper base",
  line: "Spreads the flame: the stove makes twice the bubbles.",
  cost: [{ currency: "bubbles", amount: 200 }],
  maxLevel: 1,
  requires: [],
  effects: [],
};

// The tree the store runs, plus the moves the sim buys from. `worth` is in the unit the burners' moves use, bubbles
// a second; it gets no state, so it is a fair guess: the copper base is worth about five burners.
const kitchen = withMoves(
  upgradeTree({ key: "kitchen", nodes: [COPPER], wallet }),
  treeMoves("kitchen", [COPPER], () => 5),
);

const hasCopper = (s: { kitchen: TreeState }) => (s.kitchen.ranks.copper ?? 0) > 0;

/** The copper base at work: once bought, it doubles the stove's rate, after the lid has had its say. */
const copper = feature({
  key: "copper",
  reach: [stove, kitchen],
  initial: () => ({}),
  derive: (s) => {
    if (hasCopper(s)) s.stove.perSecond = s.stove.perSecond.mul(2);
  },
  steps: {
    rates: {
      spread: (s) => {
        if (hasCopper(s)) s.stove.perSecond = s.stove.perSecond.mul(2);
      },
    },
  },
});

export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  vocab: WORDS,
  features: [wallet, playablePot, stove, lid, kitchen, copper],
  order: { rates: [...SIMMER_RATES, "copper.rates.spread"] },
});

/** How long the sim took to buy the copper base, in ms, or null if two hours were not enough. */
export function copperBoughtAt(seed = "simmer"): number | null {
  const start = Date.UTC(2026, 0, 1);
  const world = createSimWorld((now) => simStore(game, now, seed), start);
  const player = autoPlayer(game);
  const has = () => hasCopper(world.store.getState());

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
