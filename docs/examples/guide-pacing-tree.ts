/**
 * Chapter 12 of the guide, "Proving the pacing": two small things the main sim (guide-pacing.ts) does not need. An
 * upgrade tree offers its nodes to the sim by itself, worth what they add to the objective; and a sitting can stop
 * the moment something first happens, which answers "when does the player first get X?". The game is the main sim's
 * Simmer, plus a kitchen shop with one upgrade in it, and a stove that reads it.
 *
 * Run it with `bun docs/examples/guide-pacing-tree.ts`: it prints when the sim first bought the copper base.
 */
import { defineGame, defineUpgradeTree, type Effect, feature, type GraphNode, HOUR_MS } from "watchpot/core";
import { autoPlayer, createSimWorld, fmtClock, playStraight, simStore } from "watchpot/sim";
import {
  AWAY_CAP_MS,
  burnerPrice,
  flameOf,
  lid,
  OFFLINE_RATE,
  pot,
  WORDS,
  wallet,
} from "./simmer/game-wallet";

/** The kitchen's one upgrade. It names no stat (this Simmer has none); the stove reads its rank. */
const COPPER: GraphNode<Effect, "bubbles"> = {
  id: "copper",
  name: "A copper base",
  line: "Spreads the flame: the stove makes twice the bubbles.",
  cost: [{ currency: "bubbles", amount: 200 }],
  maxLevel: 1,
  requires: [],
  effects: [],
};

// The tree offers the sim a move per node it can buy, with no worth: the auto-player works it out from its objective.
const kitchen = defineUpgradeTree({ key: "kitchen", nodes: [COPPER], wallet });

/** Chapter 4's stove, doubled by the copper base, with its burner move written in its own definition. */
const stove = feature({
  key: "stove",
  reach: [wallet, lid, kitchen],
  initial: () => ({ burners: 0, off: false }),
  derived: {
    perSecond: (s) =>
      flameOf(s.stove.burners)
        .mul(s.lid.on ? 2 : 1)
        .mul(s.kitchen.ranks.copper ? 2 : 1),
  },
  actions: (api) => ({
    buyBurner: () =>
      api.set((s) => {
        if (!wallet.draft.debit(s, "bubbles", burnerPrice(s.stove.burners))) return false;
        s.stove.burners += 1;
        return true;
      }),
    toggle: () =>
      api.set((s) => {
        s.stove.off = !s.stove.off;
      }),
  }),
  steps: {
    guard: { cold: (s) => (s.stove.off ? "stop" : undefined) },
    produce: {
      burn: {
        pass: "tick",
        run: (s, ctx) => {
          wallet.draft.credit(s, "bubbles", s.stove.perSecond.mul(ctx.dtMs / 1000));
        },
      },
      away: {
        pass: "catchUp",
        run: (s, ctx) => {
          const credited = Math.min(ctx.dtMs, AWAY_CAP_MS) * OFFLINE_RATE;
          wallet.draft.credit(s, "bubbles", s.stove.perSecond.mul(credited / 1000));
        },
      },
    },
  },
  moves: (s) => [
    {
      id: "buy-burner",
      cost: { currency: "bubbles", amount: burnerPrice(s.stove.burners) },
      apply: (store) => store.getState().stove.buyBurner(),
    },
  ],
});

export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  vocab: WORDS,
  features: [wallet, pot, stove, lid, kitchen],
});

/** How long the sim took to buy the copper base, in ms, or null if two hours were not enough. */
export function copperBoughtAt(seed = "simmer"): number | null {
  const start = Date.UTC(2026, 0, 1);
  const world = createSimWorld((now) => simStore(game, now, seed), start);
  const player = autoPlayer(game, { objective: (s) => s.stove.perSecond.toNumber() });
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
