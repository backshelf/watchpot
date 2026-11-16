# Words and numbers

By the end of this chapter you will know why an idle game's numbers are not plain JavaScript numbers, how to print
them for a player, and where a game writes down the names of its currencies. Simmer's bubbles will have moved out of
the pot and into a wallet, the engine's ready-made home for money, and you will see the same two pieces in VOID IF
REMOVED.

Everything here comes from `watchpot/core`. Two files go with the chapter:

- [`docs/examples/simmer/game-wallet.ts`](../examples/simmer/game-wallet.ts) is Simmer at the end of this chapter:
  your `game.ts` once the bubbles are in a wallet. It is also the Simmer every later chapter builds on.
- [`docs/examples/guide-words-and-numbers.ts`](../examples/guide-words-and-numbers.ts) plays it and prints every
  value this chapter quotes. Run it with `bun docs/examples/guide-words-and-numbers.ts`.

## Why the numbers get big

An idle game grows by multiplying. A burner that costs 10 bubbles costs 15% more for each one you own, so with
fifty owned the next costs about 10,800, and with two hundred owned about 14 trillion. Income multiplies the same way. A few hours into
a good idle game, the numbers on screen have dozens of digits, and a long one goes far past that.

A JavaScript `number` holds values up to about 1.8 × 10^308. Past that it becomes `Infinity`, and well before that it
stops being exact. An idle game reaches 10^308 sooner than you would think, and once a balance is `Infinity`, every
price is affordable and every comparison is wrong.

So the engine keeps money in a [Decimal](../glossary.md#decimal): a number type from the
[break_eternity.js](https://github.com/Patashu/break_eternity.js) library that stores a value as a sign, a layer and
a magnitude, so it can reach 10^(10^308) and beyond. You do not need to know how it stores anything. You need to know
four habits.

## Four habits with Decimals

<!-- example-code: guide-words-and-numbers.ts -->

```ts
const price = D(10); // from a number
const huge = D("1e500"); // from a string: far past what a JS number holds
const more = price.add(5); // a new Decimal, 15; `price` is still 10

let balance = D(25);
balance.sub(price); // does nothing: the result is thrown away
balance = balance.sub(price); // 15: keep the result by assigning it

const enough = balance.gte(price); // compare with methods, never with < or >
const after = take(balance, price); // the balance after paying, or null when it cannot cover it
```

From `docs/examples/guide-words-and-numbers.ts`.

**Make them with `D`.** `D(value)` turns a number, a string or a Decimal into a Decimal. A Decimal passes through
untouched, so you can call `D` on anything that might already be one. Use a string for a value a plain number cannot
hold, such as `D("1e500")`. The engine also exports `ZERO` and `ONE`, which you will see in `initial` state.

**Decimals never change.** `price.add(5)` does not touch `price`. It returns a new Decimal, and if you do not keep
it, the sum is gone. This is the mistake everyone makes once: `balance.sub(price)` on a line of its own compiles,
runs, and does nothing. Inside a [feature](../glossary.md#feature)'s state you always reassign:
`s.pot.bubbles = s.pot.bubbles.add(1)`. The engine relies on this. A Decimal can sit in saved state and be shared
between snapshots because nothing ever edits one.

**Compare with methods.** `lt`, `lte`, `gt`, `gte` and `eq` are the comparisons. JavaScript's operators look like
they work, and TypeScript accepts them, but they compare the wrong thing: `D(3) < D(20)` is `false`, and
`D(1) === D(1)` is `false` because they are two different objects. There is no warning. Every comparison between
Decimals is a method call.

**`take` is a price check and a payment in one.** `take(balance, amount)` returns the balance after paying, or
`null` when the balance cannot cover it. It is handy when you hold a balance yourself. Once your money is in a
wallet (below), the wallet's `debit` does the same job and keeps its books too.

The other helpers are small: `sum(values)` adds a list, `wholeNonNegative(d)` floors and clamps at zero (the shape a
counter shows), `isDecimal(x)` tells you whether something is one, and `toSafeNumber(d)` converts back to a `number`
with a fallback for when the value is too big to be one.

### When a plain number is fine

Not everything has to be a Decimal. Ask whether the value can grow by multiplying. A balance, a rate, a price, a
multiplier and a lifetime total all can, so they are Decimals. A count of things owned, a tap count, a level, a
duration in milliseconds, a chance between 0 and 1: these grow by adding, stay small, and are plain `number`s.

Simmer's stove shows both. Its `burners` count is a `number`, because you buy burners one at a time. A burner's
price is a Decimal, because `costAt` multiplies it by 1.15 per burner:

<!-- example-code: simmer/game-wallet.ts -->

```ts
/** The first burner costs 10 bubbles; each one after costs 15% more than the last, rounded up to whole bubbles. */
export const BURNER_COST = { base: 10, growth: 1.15 } as const;

/** The price of the next burner when `owned` are lit. */
export function burnerPrice(owned: number) {
  return costAt(BURNER_COST, owned);
}
```

From `docs/examples/simmer/game-wallet.ts`, the same lines as in your chapter 2 `game.ts`.

You do not have to do anything special to save a Decimal. The save writes each one in a tagged form and reads it
back as a Decimal, and a saved plain number becomes a Decimal on load wherever the fresh state has one. Chapter 9
covers the save.

## Printing a number

A player cannot read `1.5234e+21`. The engine's printers turn a Decimal into text a person can scan, and the ones
for amounts share one rule: they floor, never round up. A balance of 9.999 prints as 9, so the screen never promises money the player
does not have.

The main printer is `fmt`, and the first thing to know about it is that **it returns an object, not a string**:

<!-- example-code: guide-words-and-numbers.ts -->

```ts
const shown = fmt(1_520_000); // an object, not a string
console.log(shown.text, shown.mantissa, shown.suffix); // "1.52M" 1.52 "M"

console.log(fmt(12_480).text); // "12,480": plain digits below 100,000
console.log(fmt(D("1e500")).text); // "1.00e500": scientific past the last suffix
console.log(fmt(2.5, { decimals: 1 }).text); // "2.5"
console.log(fmtFull(1_520_000)); // "1,520,000": every digit, no suffix
```

From `docs/examples/guide-words-and-numbers.ts`.

`fmt(value)` gives you a `Formatted`: the full `text`, the `mantissa` (the number in front of the suffix, as a plain
`number`), the `suffix` itself and whether it is `negative`. Most of the time you want `.text`. The pieces are there
so a page can style them apart, setting the suffix smaller than the digits, or animating the mantissa as it counts up.
If you write `{fmt(balance)}` in a React component, TypeScript stops you (a `Formatted` is not something React can
render), and in plain JavaScript React throws at runtime; add `.text`.

By default `fmt` prints plain digits with separators below 100,000, then two decimals and a suffix (`K`, `M`, `B`,
`T`, `Qa` and on to `Dc`), then scientific notation from 10^36, where the suffixes run out. The option `decimals`
sets how many decimals to show in the plain range, which suits small rates: 2.5 bubbles a second reads better than 2.
`fmtFull` is for the one figure you want in every digit, such as a headline balance: it never uses a suffix and
takes no options.

### The small printers

Most numbers on an idle game's page are one of a few kinds: a plain amount, a rate, a multiplier, a bonus, a count
of something with its name. Each has a printer: `fmtRate` (`"2.5/s"`), `fmtTimes` (`"×3.20"`), `fmtPlus`
(`"+0.50"`) and `fmtCounted` (`"1 bubble"`, `"2 bubbles"`). There are also printers for time (`fmtPlayed`,
`fmtTimer`, `fmtWait`) and odds (`fmtPercent`).

### One formatter for the whole game

A [notation](../glossary.md#notation) is the way numbers read past the plain range. Many idle game players have a
favourite, so games often let them choose. The engine has five: `suffix` (the default), `scientific`, `engineering`,
`letters` and `logarithm`, listed in `NOTATIONS` for a settings screen. [Notations](../notations.md) shows each one
printing the same values.

Passing `{ notation }` to every call would be tiresome, so `formatter(options)` binds a set of options once and
hands back the printers, and these return strings:

<!-- example-code: guide-words-and-numbers.ts -->

```ts
const say = formatter({ notation: "scientific" });
console.log(say.num(1_520_000)); // "1.52e6"
console.log(say.full(1_520_000)); // "1,520,000"
console.log(say.rate(2.5)); // "2.5/s"
console.log(say.times(3.2)); // "×3.20"
console.log(say.counted(1, ["bubble", "bubbles"])); // "1 bubble"
```

From `docs/examples/guide-words-and-numbers.ts`.

A game builds its [formatter](../glossary.md#formatter) from the player's saved choice and passes it down to the
page. Simmer has no notation setting yet, so a `const say = formatter({})` at the top of a module is all it needs.
For a game with the setting, [Notations](../notations.md) builds one formatter per notation up front, and the page
picks the one the player chose. `say.num` is `fmt(...).text` with the bound options, `say.full` is `fmtFull`, and
`times`, `plus`, `rate` and `counted` are the small printers. The time printers are not on a formatter, so you call
them directly.

## The game's words

Simmer has one currency so far. Most idle games have several: the main one, a prestige currency, perhaps a premium
one. Several engine systems need to know their names. A shop's prices are in one of them, a reward pays one of them,
a time-away report lists what each one earned.

The engine itself names none. Instead a game declares its words once, in a
[vocabulary](../glossary.md#vocabulary), and every engine type that names a currency reads it from there:

<!-- example-code: simmer/game-wallet.ts -->

```ts
/** The game's words: one currency, and the stat chapter 8 adds up. */
export const WORDS = vocab({ currencies: ["bubbles"], stats: ["heat"] });

export type Currency = CurrencyOf<typeof WORDS>; // "bubbles"
```

From `docs/examples/simmer/game-wallet.ts`.

Line by line:

- `vocab({ ... })` takes up to three lists. `currencies` is the one Simmer needs now. The other two are optional:
  `stats` names the ids of the numbers the game's stats add up (Simmer's `heat`, from chapter 8), and `rarities` is a
  ladder of rarities, lowest first, for systems that draw things at random. A game that leaves `rarities` out has an
  empty ladder, and a system that draws rarities refuses it, with a message, when you define that system.
- Written inline like this, `vocab` keeps the exact names, so the type of `WORDS` remembers that the only currency is
  `"bubbles"`. A list declared on its own line first is different: `const names = ["bubbles"]` is a `string[]`, and
  a vocabulary built from it has forgotten the names. Write `as const` on such a list.
- `CurrencyOf<typeof WORDS>` reads the union of currency names back out. `RarityOf` and `StatOf` do the same for the
  other two lists.

Why one place? Because the names then type-check everywhere. Ask a wallet for `"bubbels"` and TypeScript stops you.
Add a second currency to the list and every system built over the vocabulary can use it, while the compiler points
you at each table that now needs an entry for it. `vocab` also throws at start-up if a name appears twice.

## The wallet

So far Simmer's bubbles have lived in the pot, as `s.pot.bubbles`, and the stove reached into the pot to pay for
each burner and to burn. That works for one currency. With more, you would write the same three things for each: add
to a balance, refuse a payment that cannot be covered, and keep a running total for later.

A [wallet](../glossary.md#wallet) is a feature that does that for every currency in a vocabulary. You make one with
`defineCurrencies`:

<!-- example-code: simmer/game-wallet.ts -->

```ts
/** The wallet: a balance per currency, and `earned`, every bubble credited since the last reset. */
export const wallet = defineCurrencies({
  key: "wallet",
  vocab: WORDS,
  earnedThisRun: { bubbles: "earned" },
});
```

From `docs/examples/simmer/game-wallet.ts`.

- `key` is the slice's name in the store, like any feature's. The state reads `s.wallet.bubbles`: a Decimal balance
  per currency, at the top of the slice.
- `vocab` is the vocabulary. The wallet holds one balance for each of its currencies, starting at zero.
- `earnedThisRun` asks for a running total. `{ bubbles: "earned" }` means "keep a field called `earned` that adds up
  every bubble credited this run". There is also `spentThisRun`, which adds up every debit, their twins
  `earnedEver` and `spentEver`, which no reset of the run touches, and `start`, which sets opening balances
  (`start: { bubbles: 5 }`).

The wallet has two ways in, and which one you use depends on where you are.

**From outside, the actions.** `store.getState().wallet.credit("bubbles", 70)` adds 70.
`store.getState().wallet.debit("bubbles", 10)` takes 10 and returns `true`, or returns `false` and touches nothing
when the balance is short. These are ordinary [actions](../glossary.md#action), like the pot's `tap`.

**From inside a recipe or a step, the draft helpers.** Recall from chapter 3 that an action changes state inside
`api.set((s) => { ... })`, that `s` is a draft you edit in place, and that calling another action from in there
throws. So the wallet also offers [draft helpers](../glossary.md#draft-helper): functions on the wallet feature
itself that take the draft as their first argument. `wallet.draft.credit(s, "bubbles", 1)` adds one bubble to the draft you
are already editing. The helpers under `wallet.draft` are `credit`, `debit` and `purse`; the last one wraps the
draft's balances as a `Purse`, the shape the engine's upgrade trees pay from. Questions that change nothing are under
`wallet.select`: `balance(state, currency)` and `canAfford(state, currency, amount)`, which work on a draft or on the
store's state alike. Every engine factory splits its helpers this way: `select` reads, `draft` writes, and `def`
holds the fixed setup (`wallet.def.currencies`).

The two kinds share the names `credit` and `debit`, so read which object you are calling on. On
`store.getState().wallet` it is the action; on `wallet.draft` it is the helper and wants the draft first.

Both kinds follow the same rules. A credit of zero or less does nothing. A debit that the balance cannot cover, or
a negative one, is refused and changes nothing. A credit adds to the `earned` total, a debit adds to the `spent`
total, and only a reset ever lowers them (more on that below).

### Moving Simmer's bubbles into the wallet

Open your `game.ts`. Five changes move the bubbles; the lid does not change at all.

**1. Import `defineCurrencies`, `vocab` and `type CurrencyOf`** from `watchpot/core`, and add `WORDS`, `Currency` and
`wallet` (the two blocks above) after `flameOf`.

**2. The pot.** Before, from chapter 2, it held the bubbles:

<!-- example-code: simmer/game.ts -->

```ts
export const pot = feature({
  key: "pot",
  initial: () => ({ bubbles: ZERO }),
  actions: (api) => ({
    tap: () =>
      api.set((s) => {
        s.pot.bubbles = s.pot.bubbles.add(1);
      }),
  }),
  steps: {
    produce: {
      // Runs on every live tick and on the catch-up after time away.
      simmer: {
        pass: "both",
        run: (s, ctx) => {
          s.pot.bubbles = s.pot.bubbles.add((SIMMER_PER_SECOND * ctx.dtMs) / 1000);
        },
      },
    },
  },
});
```

From `docs/examples/simmer/game.ts`.

After, it reaches the wallet, keeps a count of taps, and credits every bubble it makes:

<!-- example-code: simmer/game-wallet.ts -->

```ts
/** The pot: the tap that makes a bubble, how many taps, and the simmer that makes them over time. */
export const pot = feature({
  key: "pot",
  reach: [wallet],
  initial: () => ({ taps: 0 }),
  actions: (api) => ({
    tap: () =>
      api.set((s) => {
        wallet.draft.credit(s, "bubbles", 1);
        s.pot.taps += 1;
      }),
  }),
  steps: {
    produce: {
      // Runs on every live tick and on the catch-up after time away.
      simmer: {
        pass: "both",
        run: (s, ctx) => {
          wallet.draft.credit(s, "bubbles", (SIMMER_PER_SECOND * ctx.dtMs) / 1000);
        },
      },
    },
  },
});
```

From `docs/examples/simmer/game-wallet.ts`.

Because the pot now reaches the wallet, move the pot below `wallet` in the file: a feature can only reach one
declared before it.

**3. The stove.** Its `reach` becomes `() => [wallet, lid]`. Before, from chapter 3, `buyBurner` compared, subtracted and
reassigned:

<!-- example-code: guide-mental-model.ts -->

```ts
buyBurner: () =>
  api.set((s) => {
    const price = burnerPrice(s.stove.burners);
    if (s.pot.bubbles.lt(price)) return false;
    s.pot.bubbles = s.pot.bubbles.sub(price);
    s.stove.burners += 1;
    return true;
  }),
```

From `docs/examples/guide-mental-model.ts`.

After, one `wallet.draft.debit` checks and pays together, and answers whether it did:

<!-- example-code: simmer/game-wallet.ts -->

```ts
buyBurner: () =>
  api.set((s) => {
    if (!wallet.draft.debit(s, "bubbles", burnerPrice(s.stove.burners))) return false;
    s.stove.burners += 1;
    return true;
  }),
```

From `docs/examples/simmer/game-wallet.ts`.

And the two payments credit the wallet instead of adding to the pot:

<!-- example-code: simmer/game-wallet.ts -->

```ts
produce: {
  // Live play pays in full.
  burn: {
    pass: "tick",
    run: (s, ctx) => {
      wallet.draft.credit(s, "bubbles", s.stove.perSecond.mul(ctx.dtMs / 1000));
    },
  },
  // Time away pays half, for two hours at most.
  away: {
    pass: "catchUp",
    run: (s, ctx) => {
      const credited = Math.min(ctx.dtMs, AWAY_CAP_MS) * OFFLINE_RATE;
      wallet.draft.credit(s, "bubbles", s.stove.perSecond.mul(credited / 1000));
    },
  },
},
```

From `docs/examples/simmer/game-wallet.ts`.

Everything else in the stove (`off`, `perSecond`, `toggle` and the guard) stays as chapter 3 left it.

**4. The game** takes the vocabulary and lists the wallet first:

<!-- example-code: simmer/game-wallet.ts -->

```ts
/** The game: the wallet first, then the pot, the stove and the lid. */
export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  vocab: WORDS,
  features: [wallet, pot, stove, lid],
});
```

From `docs/examples/simmer/game-wallet.ts`.

`vocab: WORDS` is required: `defineGame` throws if a feature built over a vocabulary (the wallet) is in a game that
does not declare the same one. It must be the same object, not an equal copy, so declare `WORDS` in one module and
import it everywhere. Listing money first reads well; a feature that reaches another needs that one somewhere in the
list.

**5. The page.** In `main.tsx`, read `s.wallet.bubbles` wherever you read `s.pot.bubbles`: in `Pot`, in `Stove`'s
`canAfford`, and in `summarize`.

Your `game.ts` now matches [`docs/examples/simmer/game-wallet.ts`](../examples/simmer/game-wallet.ts) down to
`game`, and still ends with chapter 2's `store` line. (The example file leaves the store out, and adds a few helpers
for the guide's later chapters at the end.)

### What happens to your save

Your save still has the old shape, with the bubbles under `pot`. The new pot has no `bubbles` field, so the engine
drops that value when it loads: you keep your burners and the lid, and your bubbles start again from zero. Nobody
plays Simmer yet, so that is fine.

A real game moving state like this bumps its save version and writes a migration that carries the old value across;
chapter 9 shows how. While you are building, know what a bump without a migration does: the engine cannot bring the
old save forward, so it sets it aside under a second key (`simmer.save.kept`), warns on the console, and starts a
fresh game. `saveSetAside(store)` from `watchpot/core` answers why (`"old-version"`, or `"migration-failed"` when a
migration threw), so a page can tell the player their old save is kept. To start over by hand, use the `clearSave`
button from chapter 2's "Things that bite".

### What "earned" means across a reset

The `earned` total sounds like a lifetime figure. It is not, unless you make it one. Here is the wallet in use, then
a [reset](../glossary.md#reset):

<!-- example-code: guide-words-and-numbers.ts -->

```ts
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
```

From `docs/examples/guide-words-and-numbers.ts`. `scriptStore`, from `game-wallet.ts`, makes a store on a clock you
pass (here, always 0) with its save kept in memory, so the script touches nothing on disk.

A reset (chapter 7) starts a new run: it puts features back to their fresh state. Each currency says how deep a reset
must be to wipe it (`depth`, default 1: every reset), and its this-run totals go with it. That is what a prestige
formula usually wants: pay the player for this run.

When you also want a total that survives, ask for the other kind:

<!-- example-code: guide-words-and-numbers.ts -->

```ts
export const keepingWallet = defineCurrencies({
  key: "wallet",
  vocab: WORDS,
  earnedThisRun: { bubbles: "earned" },
  earnedEver: { bubbles: "earnedEver" },
});
```

From `docs/examples/guide-words-and-numbers.ts`.

`earnedEver` adds up every credit and no run reset touches it; only a profile reset clears it. The option says which
kind you asked for, so name the field to match.

## In VOID IF REMOVED

VOID IF REMOVED is the game you meet from chapter 5 on: a thermal label printer that has woken up, and you, the temp
who presses FEED. In its first hour you earn labels, buy stations that print more, and eventually start a new roll,
its reset, which pays in cores. Here are its words:

```ts
/** The currency the stations make and the supplies cost. */
export const MAIN = "labels";

export const WORDS = vocab({
  currencies: [
    MAIN,
    "cores",
    // ...
  ],
  stats: [],
  rarities: ["common"],
} as const);

export type Currency = CurrencyOf<typeof WORDS>;
// ...

export interface CurrencyWords {
  name: string;
  plural: string;
  /** The reset depth that wipes the balance (a reset at this depth or deeper). */
  depth: number;
}

export const CURRENCY: Record<Currency, CurrencyWords> = {
  labels: { name: "label", plural: "labels", depth: 1 },
  cores: { name: "core", plural: "cores", depth: 2 },
  // ...
};
```

VOID IF REMOVED, `src/content/words.ts`

Three things to notice. The main currency's id is a constant, `MAIN`, so the code that pays labels says `MAIN` and a
rename touches one line. The vocabulary holds only ids; the words the page prints (`"label"`, `"labels"`) live in a
table beside it, `CURRENCY`, typed `Record<Currency, CurrencyWords>`, so adding a currency to `WORDS` without its
words is a compile error. And that table carries a game fact the vocabulary has no room for: how deep a reset has to
be to wipe each balance ([depth](../glossary.md#depth) is chapter 7's subject).

The game writes out `stats: []` and `rarities: ["common"]` because the engine version it is built on, 0.17, asked
for both lists. On the current engine both are optional, and you leave them out as Simmer does.

The game's wallet (`src/game/wallet.ts`) is the engine's wallet factory over `WORDS`, and its reset rule reads that
table: a new roll wipes labels and keeps cores, which is the point of earning them. [Chapter 7](07-the-first-reset.md#depth-what-survives-which-reset)
quotes that rule, once it has introduced depth. One thing it does not carry over is `earned`, and that is on purpose:
the game's own comment on the wallet says `earned` totals "the labels made this roll", and a new roll pays cores on
that figure. It is the default behaviour you saw in Simmer, used deliberately.

Inside a step, the game credits through the draft helper exactly as Simmer's stove does. This is the step that pays
while you hold FEED down:

```ts
hold: {
  pass: "tick",
  run: (d: Draft<Reads>, ctx) => {
    if (!holding(d)) return;
    const presses = (holdRate(d) * ctx.dtMs) / 1000;
    const clean = 1 + critChance(d) * (CRIT.mult - 1);
    wallet.draft.credit(d, MAIN, pressPower(d).mul(presses * clean));
    d.feed.presses += presses;
  },
},
```

VOID IF REMOVED, `src/game/feed.ts`

`presses` is a plain number (a count that only adds); the payment is a Decimal, built from `pressPower(d)`, and it
goes into the wallet with `wallet.draft.credit(d, MAIN, ...)`. (`pass: "tick"`, from chapter 3, limits the step to live play;
chapter 9 shows why that matters for time away.)

And here is why `fmt` returns an object. The game prints its figures through one component, which sets the suffix
a size smaller than the digits:

```tsx
export function num(value: DecimalSource, small = 0): string {
  const d = D(value);
  if (d.lt(1e6)) {
    const n = d.toNumber();
    return n.toLocaleString("en-US", { maximumFractionDigits: n < 100 ? small : 0 });
  }
  return fmt(d, { decimals: 2 }).text;
}
// ...
export function Num({ v, small = 0, className }: NumProps) {
  const d = D(v);
  if (d.lt(1e6)) return <span className={cx("num", className)}>{num(d, small)}</span>;
  const { text, suffix } = fmt(d, { decimals: 2 });
  return (
    <span className={cx("num", className)}>
      {text.slice(0, text.length - suffix.length)}
      <span className={s.suffix}>{suffix}</span>
    </span>
  );
}
```

VOID IF REMOVED, `src/app/format.tsx`

`Num` takes `text` and `suffix` from one `fmt` call and wraps the suffix in its own span. Notice also the branch
under a million. The game wanted plain digits up to 1,000,000, not the default 100,000. `fmt` has a `plainBelow`
option for that, but the default `suffix` notation ignores it, so the game wrote its own plain branch. And the
`decimals: 2` passed to `fmt` does nothing here: `decimals` only applies in the plain range, and above it the suffix
form always shows two.

## Things that bite

- **A Decimal method whose result you drop.** `s.x.add(n)` alone does nothing, with no error. Every change to a
  Decimal is an assignment: `s.x = s.x.add(n)`.
- **`<`, `>` and `===` on Decimals.** TypeScript accepts them and they give wrong answers (`D(3) < D(20)` is
  `false`). Use `lt`, `gt`, `eq` and friends.
- **Rendering `fmt(...)` directly.** It is an object. Use `.text`, or a formatter's `num`.
- **`plainBelow` with the default notation.** It is ignored under `suffix`, which always switches at 100,000. It
  works for the other four notations.
- **`decimals` only reaches the plain range.** Past 100,000 the suffix form shows two decimals whatever you pass.
- **A currency list declared on its own without `as const`.** `const names = ["bubbles"]` widens to `string[]`, so a
  vocabulary built from it checks nothing. Inline lists keep their names either way.
- **Two copies of the vocabulary.** `defineGame` compares the object itself, so a vocabulary declared twice, even
  identically, is refused. Declare it in one module and import it.
- **A wallet total named "lifetime" that is not.** The default reset wipes `earned` and `spent` totals with the
  balances. Add `reset: { keep: [...] }` for a total that should survive.
- **Calling an action inside a recipe.** It throws. Inside `api.set` or a step, use the wallet's draft helpers
  (`wallet.draft.credit(s, ...)`), not `store.getState().wallet.credit(...)`.
- **The names `credit` and `debit` are taken.** The wallet's actions sit beside its balances in the slice, so no
  currency, total or extra field can be called `credit`, `debit` or `__proto__`. `defineCurrencies` throws on any of them
  when you define the wallet.

## Next

[Chapter 5, A real game](05-a-real-game.md), turns from Simmer to VOID IF REMOVED and the shape of a game built to
be played for hours.

## Reference

- [Add a currency](../add-a-currency.md): every `currencies` option, the reserved names, `extra` fields.
- [Notations](../notations.md): the five notations side by side, and a settings-screen formatter table.
- `api/core/decimal.d.ts`: `D`, `ZERO`, `ONE`, `take`, `sum`, `wholeNonNegative`, `toSafeNumber`, `isDecimal`.
- `api/core/fmt.d.ts`: `fmt`, `fmtFull`, `Formatted`, `FmtOptions`, `formatter`, `Formatter`, `NOTATIONS` and the
  small printers.
- `api/core/vocab.d.ts`: `vocab`, `Vocab`, `CurrencyOf`, `StatOf`, `RarityOf`, `ladder`.
- `api/core/currencies.d.ts`: `defineCurrencies`, `CurrenciesDef`, `CurrencySelect`, `CurrencyDraftHelpers`, `CurrencyActions`, `Purse`.
- `api/core/persist.d.ts`: `saveSetAside`, `clearSave`.
- `api/core/feature.d.ts`: `ResetRule`, for the reset rules a wallet takes.
