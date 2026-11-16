/**
 * Chapter 4 of the guide, "Words and numbers": Decimals, the printers, and what a wallet's `earned` total does
 * across a reset. Simmer with its bubbles in a wallet is `./simmer/game-wallet.ts`; this file plays it.
 *
 * Run it with `bun docs/examples/guide-words-and-numbers.ts`: it prints a few Decimals, the printers, and the
 * wallet before and after a reset.
 */
import { D, defineCurrencies, fmt, fmtFull, formatter, take } from "watchpot/core";
import { game, scriptStore, WORDS } from "./simmer/game-wallet";

// ---------------------------------------------------------------------------------------------------------------
// Decimals

export function decimals(): void {
  const price = D(10); // from a number
  const huge = D("1e500"); // from a string: far past what a JS number holds
  const more = price.add(5); // a new Decimal, 15; `price` is still 10

  let balance = D(25);
  balance.sub(price); // does nothing: the result is thrown away
  balance = balance.sub(price); // 15: keep the result by assigning it

  const enough = balance.gte(price); // compare with methods, never with < or >
  const after = take(balance, price); // the balance after paying, or null when it cannot cover it

  console.log(huge.toString(), more.toString(), balance.toString(), enough, after?.toString());
}

// ---------------------------------------------------------------------------------------------------------------
// Formatting

export function printing(): void {
  const shown = fmt(1_520_000); // an object, not a string
  console.log(shown.text, shown.mantissa, shown.suffix); // "1.52M" 1.52 "M"

  console.log(fmt(12_480).text); // "12,480": plain digits below 100,000
  console.log(fmt(D("1e500")).text); // "1.00e500": scientific past the last suffix
  console.log(fmt(2.5, { decimals: 1 }).text); // "2.5"
  console.log(fmtFull(1_520_000)); // "1,520,000": every digit, no suffix

  const say = formatter({ notation: "scientific" });
  console.log(say.num(1_520_000)); // "1.52e6"
  console.log(say.full(1_520_000)); // "1,520,000"
  console.log(say.rate(2.5)); // "2.5/s"
  console.log(say.times(3.2)); // "×3.20"
  console.log(say.counted(1, ["bubble", "bubbles"])); // "1 bubble"
}

// ---------------------------------------------------------------------------------------------------------------
// A total that outlives the reset

export const keepingWallet = defineCurrencies({
  key: "wallet",
  vocab: WORDS,
  earnedThisRun: { bubbles: "earned" },
  earnedEver: { bubbles: "earnedEver" },
});

// ---------------------------------------------------------------------------------------------------------------
// The wallet in use

function walletDemo(): void {
  const store = scriptStore(game, () => 0);
  const state = store.getState();

  for (let i = 0; i < 30; i++) state.pot.tap();
  state.wallet.credit("bubbles", 70); // from outside a recipe: the store action
  console.log("bought:", store.getState().stove.buyBurner()); // true: pays 10 bubbles

  const w = store.getState().wallet;
  console.log(w.bubbles.toString(), w.earned.toString()); // 90 100: spending does not lower `earned`

  store.getState().resetRun();
  const after = store.getState().wallet;
  console.log(after.bubbles.toString(), after.earned.toString()); // 0 0: a this-run total goes with its currency
}

if (import.meta.main) {
  decimals();
  printing();
  walletDemo();
}
