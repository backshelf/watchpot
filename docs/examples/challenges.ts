import {
  challengeRule,
  challenges,
  type Decimal,
  defineGame,
  defineStats,
  type Effect,
  feature,
} from "watchpot/core";
import { wallet } from "./add-a-currency";
import { TOY } from "./vocab";

type State = { wallet: { gold: Decimal }; trials: { active: string | null; rules: string[] } };

/** Two challenges: a run with no gem spending, then a harder one it opens. */
export const trials = challenges({
  key: "trials",
  list: [
    {
      id: "no-gems",
      goal: (s: State) => s.wallet.gold.gte(1e6),
      maxCompletions: 3,
      effects: (n): Effect<"toy.speed">[] => [{ stat: "toy.speed", mul: 1 + 0.5 * n }], // grows with each completion
      rules: ["noGems"], // the flag the game's own rules read
    },
    { id: "short", unlocked: (s) => s.wallet.gold.gte(1e3), goal: (s) => s.wallet.gold.gte(1e9) },
  ],
  onComplete: (d, _id, n) => wallet.draft.credit(d, "gems", 10 * n), // in the same recipe as the completion
});

/** The game's own rule, reading the flag: gems cannot be spent inside "no-gems". */
export const shop = feature({
  key: "shop",
  reach: [wallet, trials],
  initial: () => ({ boughtWithGems: 0 }),
  actions: (api) => ({
    buyWithGems: () =>
      api.set((s) => {
        if (challengeRule(s.trials, "noGems") || !wallet.draft.debit(s, "gems", 1)) return;
        s.shop.boughtWithGems += 1;
      }),
  }),
});

/** What the completions give, on the engine's `stats`: `s.stats["toy.speed"]`, the rewards counted as they land. */
export const rewards = defineStats({
  key: "stats",
  vocab: TOY,
  reach: () => [trials],
  stats: { "toy.speed": { base: 1 } },
  contributions: (s) => trials.rules.contributions(s.trials),
});

export const game = defineGame({
  id: "trials",
  save: { key: "trials.save", version: 1 },
  features: [wallet, shop, trials, rewards],
  vocab: TOY,
});
// store.getState().trials.enter("no-gems") → null, or "unknown" | "locked" | "maxed" | "busy"
// store.getState().trials.exit()
