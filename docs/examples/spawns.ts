import { currencies, type Decimal, defineGame, MINUTE_MS, spawns } from "watchpot/core";
import { TOY } from "./vocab";

type State = { wallet: { gold: Decimal; gems: Decimal }; mine: { perSecond: Decimal } };

const wallet = currencies({ key: "wallet", vocab: TOY });

export const visitors = spawns({
  key: "visitors",
  kinds: [
    {
      id: "spark",
      // At least 5 minutes, at most 15; past 5 the chance each frame rises as u^5, so most come late.
      wait: { minMs: 5 * MINUTE_MS, maxMs: 15 * MINUTE_MS, ramp: { power: 5, stepMs: 1000 / 30 } },
      lifeMs: 13_000,
      outcomes: [
        { id: "windfall", weight: 50 },
        { id: "rush", weight: 45 },
        { id: "gem", weight: 5, noRepeat: true, when: (s: State) => s.wallet.gold.gte(1e6) },
      ],
    },
  ],
  onCatch: (draft: State, outcome) => {
    if (outcome === "windfall") wallet.credit(draft, "gold", draft.mine.perSecond.mul(900));
    if (outcome === "gem") wallet.credit(draft, "gems", 1);
    // "rush": the game starts a buff here (`boosts.start` from its own action, or its draft helper).
  },
});

export const game = defineGame({
  id: "visitors",
  save: { key: "visitors.save", version: 1 },
  features: [wallet, visitors],
  vocab: TOY,
});
// A screen draws `s.visitors.kinds.spark.live` (null or { id, bornAt, diesAt }) and calls `catch("spark")` on a click.
