import { clicker, clickShare, comboShown, currencies, type Decimal, defineGame, fmt } from "watchpot/core";
import { TOY } from "./vocab";

type State = { wallet: { gold: Decimal; gems: Decimal }; mine: { perSecond: Decimal } };

const wallet = currencies({ key: "wallet", vocab: TOY });

export const tap = clicker({
  key: "tap",
  wallet,
  currency: "gold",
  power: (s: State) => clickShare(1, s.mine.perSecond, 0.05), // 1 gold plus 5% of income a second
  crit: () => ({ chance: 0.02, mult: 10 }),
  combo: { windowMs: 800, step: 0.1, max: 3 },
  maxPerSecond: 20,
});

export const game = defineGame({
  id: "tap",
  save: { key: "tap.save", version: 1 },
  features: [wallet, tap],
  vocab: TOY,
});

/** The line under the button: this press's combo and the lifetime total. */
export function tapLine(s: { tap: { combo: number; lastAt: number; earned: Decimal } }, now: number): string {
  return `×${comboShown(s.tap, now, tap.combo).toFixed(1)} · ${fmt(s.tap.earned).text} gold by hand`;
}
