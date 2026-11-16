import {
  type Decimal,
  defineGame,
  HOUR_MS,
  MINUTE_MS,
  missions,
  pickWeighted,
  type RngState,
} from "watchpot/core";
import { wallet } from "./add-a-currency";
import { ODDS, type Rarity, TOY } from "./vocab";

type State = { wallet: { gold: Decimal; gems: Decimal } };
type Reward = { gems: number; rarity: Rarity };
const RARITIES: readonly Rarity[] = ["common", "rare", "epic"];

/** A rarity drawn from this start's stream: the reward is fixed at the start, so a reload cannot reroll it. */
const roll =
  (gems: number) =>
  (_s: State, rng: RngState): Reward => {
    const [i] = pickWeighted(
      rng,
      RARITIES.map((r) => ODDS[r]),
    );
    return { gems, rarity: RARITIES[i] ?? "common" };
  };

/** Two slots (three at 100 gems); a short trip, a long one that costs gold, and one that opens later. */
export const trips = missions({
  key: "trips",
  slots: (s: State) => (s.wallet.gems.gte(100) ? 3 : 2),
  list: [
    { id: "scout", durationMs: () => 5 * MINUTE_MS, reward: roll(1) },
    { id: "voyage", durationMs: () => 4 * HOUR_MS, cost: { gold: 500 }, reward: roll(25) },
    { id: "deep", durationMs: () => 12 * HOUR_MS, available: (s) => s.wallet.gems.gte(50), reward: roll(80) },
  ],
  pay: (d, m) => (m.cost ? wallet.debit(d, "gold", m.cost.gold) : true), // writes nothing when it refuses
  onClaim: (d, reward) => wallet.credit(d, "gems", reward.gems),
});

export const game = defineGame({
  id: "trips",
  save: { key: "trips.save", version: 1 },
  features: [wallet, trips],
  vocab: TOY,
});
// store.getState().trips.start("scout") → null, or "unknown" | "unavailable" | "no-slot" | "cannot-pay"
// store.getState().trips.claim(entry.id) · .cancel(entry.id) · missionLeftMs(entry, store.getState().gameNow())
