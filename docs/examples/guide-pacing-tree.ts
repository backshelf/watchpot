/**
 * Chapter 12 of the guide, "Proving the pacing": two small things the main sim (guide-pacing.ts) does not need. An
 * upgrade tree has no moves of its own, so the auto-player never buys from it until you attach some; and a sitting
 * can stop the moment something first happens, which answers "when does the player first get X?".
 *
 * Run it with `bun docs/examples/guide-pacing-tree.ts`: it prints when the sim first bought the lid.
 */
import {
  currencies,
  type Decimal,
  defineGame,
  type Effect,
  type GraphNode,
  generators,
  HOUR_MS,
  type TreeState,
  treeMoves,
  upgradeTree,
  vocab,
  withMoves,
} from "watchpot/core";
import { autoPlayer, createSimWorld, fmtClock, playStraight, simStore } from "watchpot/sim";

const WORDS = vocab({ currencies: ["bubbles"], stats: ["burner"], rarities: ["common"] });
const wallet = currencies({ key: "wallet", vocab: WORDS, start: { bubbles: 10 } });

const LID: GraphNode<Effect, "bubbles"> = {
  id: "lid",
  name: "A lid",
  line: "The burners keep their heat: twice the bubbles.",
  cost: [{ currency: "bubbles", amount: 200 }],
  maxLevel: 1,
  requires: [],
  effects: [{ stat: "burner", mult: 2 }],
};

// The tree the store runs, plus the moves the sim buys from. `worth` is in the unit the burners' moves use, bubbles
// a second; it gets no state, so it is a fair guess: the lid is worth about five burners.
const kitchen = withMoves(
  upgradeTree({ key: "kitchen", nodes: [LID], wallet }),
  treeMoves("kitchen", [LID], () => 5),
);

const burners = generators({
  key: "burners",
  wallet,
  list: [
    {
      id: "burner",
      cost: { base: 10, growth: 1.15, round: "ceil" },
      pays: "bubbles",
      makes: "bubbles",
      rate: 1,
    },
  ],
  mult: (s: { kitchen: TreeState }) => ((s.kitchen.ranks.lid ?? 0) > 0 ? 2 : 1),
});

export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  features: [wallet, kitchen, burners],
  vocab: WORDS,
});

/** How long the sim took to buy the lid, in ms, or null if two hours were not enough. */
export function lidBoughtAt(seed = "simmer"): number | null {
  const start = Date.UTC(2026, 0, 1);
  const world = createSimWorld((now) => simStore(game, now, seed), start);
  const player = autoPlayer(game, { balance: (s: { wallet: { bubbles: Decimal } }) => s.wallet.bubbles });
  const hasLid = () => (world.store.getState().kitchen.ranks.lid ?? 0) > 0;

  playStraight({
    world,
    ms: 2 * HOUR_MS, // the longest it may take
    lookEveryMs: 10_000, // a look every ten seconds
    look: () => player.look(world.store),
    until: hasLid, // checked before each look: the sitting ends the moment it holds
  });

  return hasLid() ? world.now() - start : null;
}

if (import.meta.main) {
  const at = lidBoughtAt();
  console.log(at === null ? "no lid in two hours" : `lid at ${fmtClock(at)}`);
}
