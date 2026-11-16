/**
 * Chapter 4 of the guide, "Words and numbers": Decimals, formatting, a vocabulary, and Simmer's bubbles moved out of
 * the pot and into a wallet. The "before" features are a cut-down Simmer (no simmer, lid or transient rate),
 * rebuilt here so the file stands on its own.
 *
 * Run it with `bun docs/examples/guide-words-and-numbers.ts`: it prints a few Decimals, the printers, and what a
 * wallet's `earned` total does across a reset.
 */
import {
  type CurrencyOf,
  costAt,
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  currencies,
  D,
  type Decimal,
  defineGame,
  feature,
  fmt,
  formatter,
  take,
  vocab,
  ZERO,
} from "watchpot/core";

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

  const say = formatter({ notation: "scientific" });
  console.log(say.num(1_520_000)); // "1.52e6"
  console.log(say.rate(2.5)); // "2.5/s"
  console.log(say.times(3.2)); // "×3.20"
  console.log(say.counted(1, ["bubble", "bubbles"])); // "1 bubble"
}

// ---------------------------------------------------------------------------------------------------------------
// Before: the bubbles live in the pot (Simmer's pot and stove from chapters 2 and 3, cut down)

/** The price of the next burner, as chapter 2 set it: 10 bubbles, 15% more each, rounded up. */
const burnerPrice = (owned: number): Decimal => costAt({ base: 10, growth: 1.15, round: "ceil" }, owned);

const potBefore = feature({
  key: "pot",
  initial: () => ({ bubbles: ZERO }),
  actions: (api) => ({
    tap: () =>
      api.set((s) => {
        s.pot.bubbles = s.pot.bubbles.add(1);
      }),
  }),
});

const stoveBefore = feature({
  key: "stove",
  reach: [potBefore],
  initial: () => ({ burners: 0 }),
  actions: (api) => ({
    buyBurner: (): boolean => {
      let bought = false;
      api.set((s) => {
        const cost = burnerPrice(s.stove.burners);
        if (s.pot.bubbles.lt(cost)) return;
        s.pot.bubbles = s.pot.bubbles.sub(cost);
        s.stove.burners += 1;
        bought = true;
      });
      return bought;
    },
  }),
  steps: {
    produce: {
      heat: (s, ctx) => {
        s.pot.bubbles = s.pot.bubbles.add(D(s.stove.burners).mul(ctx.dtMs / 1000));
      },
    },
  },
});

export const before = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  features: [potBefore, stoveBefore],
});

// ---------------------------------------------------------------------------------------------------------------
// The words

export const WORDS = vocab({
  currencies: ["bubbles"],
  stats: [],
  rarities: ["common"],
} as const);

export type Currency = CurrencyOf<typeof WORDS>; // "bubbles"

// ---------------------------------------------------------------------------------------------------------------
// After: the bubbles live in a wallet

export const wallet = currencies({
  key: "wallet",
  vocab: WORDS,
  earned: { bubbles: "earned" },
});

const pot = feature({
  key: "pot",
  reach: [wallet],
  initial: () => ({ taps: 0 }),
  actions: (api) => ({
    tap: () =>
      api.set((s) => {
        wallet.credit(s, "bubbles", 1);
        s.pot.taps += 1;
      }),
  }),
});

const stove = feature({
  key: "stove",
  reach: [wallet],
  initial: () => ({ burners: 0 }),
  actions: (api) => ({
    buyBurner: (): boolean => {
      let bought = false;
      api.set((s) => {
        if (!wallet.debit(s, "bubbles", burnerPrice(s.stove.burners))) return;
        s.stove.burners += 1;
        bought = true;
      });
      return bought;
    },
  }),
  steps: {
    produce: {
      heat: (s, ctx) => {
        wallet.credit(s, "bubbles", D(s.stove.burners).mul(ctx.dtMs / 1000));
      },
    },
  },
});

export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  vocab: WORDS,
  features: [wallet, pot, stove],
});

// ---------------------------------------------------------------------------------------------------------------
// A total that outlives the reset

export const keepingWallet = currencies({
  key: "wallet",
  vocab: WORDS,
  earned: { bubbles: "lifetime" },
  reset: { keep: ["lifetime"] },
});

// ---------------------------------------------------------------------------------------------------------------
// The demo

function walletDemo(): void {
  const store = createIdleStore(game, { now: () => 0, storage: createGameStorage(createMemoryBackend()) });
  const state = store.getState();

  for (let i = 0; i < 30; i++) state.pot.tap();
  state.wallet.credit("bubbles", 70); // from outside a recipe: the store action
  store.getState().stove.buyBurner(); // pays 10 bubbles

  const w = store.getState().wallet;
  console.log(w.bubbles.toString(), w.earned.toString()); // 90 100: spending does not lower `earned`

  store.getState().resetRun();
  const after = store.getState().wallet;
  console.log(after.bubbles.toString(), after.earned.toString()); // 0 0: the default reset wipes the total too
}

if (import.meta.main) {
  decimals();
  printing();
  walletDemo();
}
