import {
  clickShare,
  D,
  type Decimal,
  defineClicker,
  defineCurrencies,
  defineFeature,
  defineGame,
  fmt,
} from "watchpot/core";
import { TOY } from "./vocab";

const wallet = defineCurrencies({ key: "wallet", vocab: TOY });

/** What the game makes a second without pressing: here a stand-in, a mine whose rate is its drills. */
const mine = defineFeature({
  key: "mine",
  initial: () => ({ drills: 4 }),
  derived: { perSecond: (s) => D(s.mine.drills) },
});

export const tap = defineClicker({
  key: "tap",
  wallet,
  currency: "gold",
  reach: [mine],
  power: (s) => clickShare(1, s.mine.perSecond, 0.05), // 1 gold plus 5% of income a second
  crit: () => ({ chance: 0.02, mult: 10 }),
  combo: { windowMs: 800, step: 0.1, max: 3 },
  maxPerSecond: 20,
});
// store.getState().tap.click() → { amount, crit, combo }, or null past the cap

export const game = defineGame({
  id: "tap",
  save: { key: "tap.save", version: 1 },
  features: [wallet, mine, tap],
  vocab: TOY,
});

/** The line under the button: this press's combo and the lifetime total. */
export function tapLine(s: { tap: { combo: number; lastAt: number; earned: Decimal } }, now: number): string {
  return `×${tap.select.comboShown(s, now).toFixed(1)} · ${fmt(s.tap.earned).text} gold by hand`;
}
