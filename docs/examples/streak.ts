import {
  type Decimal,
  defineCurrencies,
  defineGame,
  defineStreak,
  fmtWait,
  type StreakState,
} from "watchpot/core";
import { TOY } from "./vocab";

type State = { wallet: { gold: Decimal; gems: Decimal } };

const wallet = defineCurrencies({ key: "wallet", vocab: TOY });

/** A week that repeats: gold rising each day, gems on the seventh. */
export const daily = defineStreak({
  key: "daily",
  rewards: (day) => (day % 7 === 0 ? { gold: 0, gems: 5 } : { gold: 100 * (day % 7), gems: 0 }),
  onClaim: (draft: State, reward) => {
    wallet.draft.credit(draft, "gold", reward.gold); // a credit of 0 does nothing
    wallet.draft.credit(draft, "gems", reward.gems);
  },
  grace: 1, // one missed day is forgiven
  keep: (draft, missed) => wallet.draft.debit(draft, "gems", missed * 10), // past that, gems save the run
});

export const game = defineGame({
  id: "daily",
  save: { key: "daily.save", version: 1 },
  features: [wallet, daily],
  vocab: TOY,
});

/** The banner's line. */
export function dailyLine(s: { daily: StreakState }, now: number): string {
  const status = daily.select.status(s, now);
  if (status.canClaim) return status.broken ? "Start a new streak" : `Claim day ${status.count + 1}`;
  return `Day ${status.count} claimed · next in ${fmtWait(status.msUntilNext)}`;
}
