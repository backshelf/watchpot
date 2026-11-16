# The first reset

By the end of this chapter Simmer has a reset button: the pot boils over, the run starts again, and the player keeps
something that makes the next run faster. You will know which parts of a game survive a reset and how to say so, how
to tell the player when a reset is worth pressing, and how the same piece that keeps medals also opens new pages.

## What a run is

Play an idle game for twenty minutes and the numbers stop feeling like progress. The next burner costs more than an
hour of bubbles. Every idle game answers this the same way: it lets the player throw the run away for something that
lasts.

A [run](../glossary.md#run) is everything the player builds between two of those throw-aways: the balance, the
generators, the upgrades bought with the run's own currency. A [reset](../glossary.md#reset) ends the run. Most of the
state goes back to where a new player starts, and some of it stays. The reset that pays the player for what the run
reached is called a [prestige](../glossary.md#prestige), and what it pays is the prestige currency.

The whole design question of this chapter is "what stays?" The engine asks every feature that question, one feature at
a time, and you answer it where you declare the feature.

## Reset rules

Every feature takes a `reset` option. It is a [reset rule](../glossary.md#reset-rule): what happens to this feature's
state when a run ends. There are five shapes.

| Rule | What the run reset does to the feature |
|---|---|
| `"run"` | Back to `initial`. This is the default. |
| `"never"` | Nothing. The state is above the run. |
| `{ keep: ["taps"] }` | Back to `initial`, then the named keys copied back from before. |
| `(before, fresh, ctx) => state` | Your function decides, given the old state and a fresh `initial`. |
| `{ depth: 2, rule }` | Untouched by a shallower reset; follows `rule` (default `"run"`) from that depth on. |

Read the first row twice. A feature that says nothing is wiped on every reset. That is the right default for most of a
run (the balance, the generators, the run's shop) and the wrong one for anything the player is meant to keep, so
whenever you add a feature to a game that has a reset, decide its rule on purpose.

The factories built on `feature` pick their own defaults. `defineAchievements` and `definePrestige` default to
`"never"`, because a medal and a prestige currency are the things a reset exists to keep. `defineCurrencies` and
`defineUpgradeTree` use the plain default, `"run"`.

### Simmer's pot keeps one number

This chapter's Simmer starts from chapter 4's game, `docs/examples/simmer/game-wallet.ts`, and adds a reset to it.
Look first at what that game says about resets: nothing. Every feature in it takes the default, so a reset would send
the wallet, the pot's taps, the stove's burners and the lid back to their `initial`. For the wallet, the burners and
the lid that is right; they are the run. The count of taps is different: it is a record of the player, and it should
stay.

To change one feature of the core, you define a feature under the same key and list it in place of the old one.
Chapter 4's pot was:

<!-- example-code: simmer/game-wallet.ts -->

```ts
export const pot = feature({
  key: "pot",
  reach: [wallet],
  initial: () => ({ taps: 0 }),
  // ...
});
```

`docs/examples/simmer/game-wallet.ts`

This chapter's pot is the same feature with one change:

<!-- example-code: guide-first-reset.ts -->

```ts
export const pot = feature({
  key: "pot",
  reach: [wallet],
  initial: () => ({ taps: 0 }),
  // A boil-over starts the run again, but the count of taps is the player's for good.
  reset: { keep: ["taps"] },
  // ...
});
```

`docs/examples/guide-first-reset.ts`

The trimmed lines are chapter 4's `tap` action and `simmer` step, unchanged. `reset: { keep: ["taps"] }` says: start
over, but copy `taps` back. Everything else in the slice gets its fresh value. (`initial` is called again on every
reset, and on a run reset `ctx.now` is the game time of the reset, so a field written from `ctx.now` always holds the
start of the current run. The prestige below keeps one for you, `runStart`.)

The number the reset will pay on is already in the core: the wallet's `earned` total, every bubble credited this run.
It belongs to the run, so it goes back to zero with the run. Keep it apart from `bubbles`, the balance the player
spends: paying on the balance would punish the player for buying burners.

### The real game keeps tallies with a function

VOID IF REMOVED keeps a feature called `progress` for the numbers that describe the player's whole history: the best
run, every label ever made, how long each run took. Its rule is a function, because "keep everything, except reset the
start of the run and work out how long the run just was" is not a list of keys.

```ts
  reset: (before, fresh, ctx) => {
    const depth = ctx.depth ?? 1;
    const lengthMs = Math.max(0, fresh.rollAt - before.rollAt);
    const quicker = before.fastestRollMs === 0 || lengthMs < before.fastestRollMs;
    const out: ProgressState = {
      ...before,
      rollAt: fresh.rollAt,
      seenEarned: ZERO,
      fastestRollMs: quicker && lengthMs > 0 ? lengthMs : before.fastestRollMs,
      lastRollMs: lengthMs,
    };
    // ...
    return out;
  },
```

VOID IF REMOVED, `src/game/progress.ts`

`before` is the slice as the run left it and `fresh` is what `initial` returns now, so `fresh.rollAt` is the moment of
the reset. The function starts from `before` (keep everything) and overwrites only what a new run changes. The game's
run is a "roll", which is where the names come from.

The same file shows how a per-run number becomes a lifetime one. The wallet's `earned` total starts over each run, so a
step in the `settle` phase adds whatever is new since it last looked:

```ts
      track: (d: Reads, ctx) => {
        const p = d.progress;
        const earned = d.wallet.earned;
        if (earned.gt(p.seenEarned)) {
          p.labelsEver = p.labelsEver.add(earned.sub(p.seenEarned));
          p.seenEarned = earned;
        }
        if (earned.gt(p.bestRoll)) p.bestRoll = earned;
        // ...
```

VOID IF REMOVED, `src/game/progress.ts`

That is why the reset rule above sets `seenEarned` back to zero: the wallet's count has just gone back to zero too.
This is the game's code on an older engine; on the current one a wallet keeps such a total itself, with
`earnedEver: { labels: "labelsEver" }`, which no run reset touches.

## Depth: what survives which reset

A game with one reset needs only the rules above. A game that will one day have a reset above its reset needs a way to
say "this survives the ordinary reset, but not the bigger one". That is [depth](../glossary.md#depth).

Every run reset has a depth, a whole number that defaults to 1. A feature whose rule is `{ depth: 2 }` sits out any
reset shallower than 2. Under the hood, `"never"` is a depth of infinity, `{ depth, rule }` is its own depth, and
every other rule is a depth of 1.

VOID IF REMOVED writes its depths down from the first day, on the currencies themselves:

```ts
export const CURRENCY: Record<Currency, CurrencyWords> = {
  labels: { name: "label", plural: "labels", depth: 1 },
  cores: { name: "core", plural: "cores", depth: 2 },
  // ...
};
```

VOID IF REMOVED, `src/content/words.ts`

Labels are the run's currency: the stations make them and the supplies shop sells for them. Cores are what NEW ROLL,
the game's prestige, pays. NEW ROLL resets at depth 1, so labels go and cores stay.

All the balances live in one wallet feature, so one rule has to treat each currency differently. A function rule
can, because the reset's depth is on its `ctx`:

```ts
export const wallet = defineCurrencies({
  key: "wallet",
  vocab: WORDS,
  earned: { [MAIN]: "earned" },
  extra: () => ({}),
  reset: (before, fresh, ctx) => {
    const out = { ...fresh };
    for (const c of WORDS.currencies) if (CURRENCY[c].depth > (ctx.depth ?? 1)) out[c] = before[c];
    return out;
  },
});
```

VOID IF REMOVED, `src/game/wallet.ts`

That is the game's code on its older engine, where the total was called `earned` and depth was the game's own idea.
Start fresh, then copy back every balance whose depth is deeper than this reset reaches. The engine now says the same
thing in one option: `depth: { cores: 2 }` on `defineCurrencies` wipes each currency only at its own depth, so the function
rule is no longer needed. The totals say which kind they are: `earnedThisRun` goes back to zero with its currency (what
a prestige pays on), and `earnedEver` is never touched by a run reset.

Shops follow the same idea with the shorthand form. The game builds every shop on the engine's `defineUpgradeTree`, passing
the shop's depth straight through:

```ts
  const tree = defineUpgradeTree({
    key,
    nodes,
    wallet,
    reset: { depth: def.depth },
    // ...
```

VOID IF REMOVED, `src/game/shops.ts`

The supplies shop, which sells for labels, says `depth: 1` and empties on every roll. The cores shop, the spindle, says
`depth: 2`, so what the player buys there with cores is still theirs after a roll:

```ts
export const SPINDLE: Shop = {
  id: "spindle",
  area: "roll",
  currency: "cores",
  depth: 2,
  items: [
    item("second-core", "Second core", "i am of two minds. both are mine.", 0.52, [print(3)], { fixed: 1 }),
    item("requisition", "Requisition form", "tick every box. i ticked them.", 0.56, [], {
      flags: ["buy-all"],
      fixed: 1,
    }),
    item("winding", "Tighter winding", "more label per label.", 0.62, [print(1.5)], { max: 50, growth: 2.2 }),
    // ...
  ],
};
```

VOID IF REMOVED, `src/content/roll.ts`

This is the shape of a first prestige in almost every idle game: a run currency spent in a run shop, both wiped, and a
prestige currency spent in a shop that stays. In your own game, that shop is a `defineUpgradeTree` with
`reset: "never"` (or `{ depth: 2 }` if you already suspect a second layer). The shelf page
[An upgrade tree](../upgrade-tree.md) covers the upgrade tree itself.

## `resetRun`: the reset itself

The store has a root action that runs a reset: `store.getState().resetRun(ctx?)`. It walks every feature, applies its
rule, starts the clock's run anchors at the reset's moment (the game-time offset stays), and recomputes every feature's
derived state. `ctx` may carry `depth` (default 1), `now` (default the game's current time) and `rng`.

You will rarely call it yourself. The prestige below calls it for you, inside the same update that pays the player, so
nothing can happen between "paid" and "reset". Inside a step there is `ctx.resetRun(draft)`, and inside an action
`api.resetRun(draft)`, for the same reason: they run the reset in the update you are already in.

## `definePrestige`: a reset that pays

`definePrestige` is a feature factory. It gives you a feature that holds a few numbers and one action:

- `runs`: how many resets so far (the first run has 0);
- `currency`: the prestige currency not yet spent (unless it pays into a wallet, below);
- `lifetime`: every unit ever paid;
- `runStart` and `peak`: when this run began, and its best reset pace (section "Is it worth pressing");
- the reset action, called `reset` unless you name it with `action`.

When the action runs it checks `canReset`, reads `gain`, adds the gain to `currency` and `lifetime`, calls `resetRun` at
its `depth`, counts the run, then calls `afterReset`. All of that is one update. It returns `true` if it ran.

Simmer's prestige is the pot boiling over. It pays steam:

<!-- example-code: guide-first-reset.ts -->

```ts
export const steam = definePrestige({
  key: "steam",
  action: "boilOver",
  reach: [wallet],
  // None under 1,000 bubbles this run, then the square root of how many thousands.
  gain: (s) => powerGain(s.wallet.earned, { k: 1, exp: 0.5, per: 1000 }),
  // Past its peak once the pace falls under 85% of this run's best; never in a run's first ten seconds.
  pace: { past: 0.85, floorS: 10 },
});
```

`docs/examples/guide-first-reset.ts`

- `key: "steam"` is where the layer saves, so steam held is `s.steam.currency` and every steam ever paid is
  `s.steam.lifetime`. Steam is not one of the wallet's currencies: it lives in the prestige feature.
- `action: "boilOver"` names the button's action: `store.getState().steam.boilOver()`.
- `reach: [wallet]` lets the callbacks read the wallet. Chapter 3 covered `reach`.
- `gain` must be pure: the button's preview, the reset and the pace all call it, and they have to agree. A page reads
  the same number with `steam.select.gain(state)`.
- There is no `canReset`. The default is "the gain is above zero", which is right for Simmer.
- `pace` tunes the "is it worth pressing" reading, below.

A game whose prestige currency belongs in the wallet, beside the others, says `payInto: { wallet, currency }`: the reset
credits the wallet after the run is reset, and the layer keeps no `currency` of its own, so there is one ledger.
`steam.select.held(state)` reads what is held either way. The wallet must keep that currency through the reset
(`depth: { steam: "never" }`), or the next reset would take it back; the factory refuses it otherwise.

### `powerGain`: the usual curve

`powerGain(amount, { k, exp, per, mult? })` is `floor(k × (amount / per) ^ exp × mult)`, and never negative. `per` is
the amount that pays `k`. With `per: 1000` and `k: 1`, a run that made 1,000 bubbles pays 1 steam; below that it pays 0,
which is why the default `canReset` keeps the button shut until the first thousand.

`exp` below 1 is what makes the curve worth thinking about. With `exp: 0.5`, a run that makes four times the bar pays
2 steam, not 4. The player who resets earlier and more often comes out ahead, up to a point, and finding that point is
the game.

Here is the same factory in VOID IF REMOVED, where NEW ROLL pays cores on the cube root:

```ts
/** Cores a roll change pays now: nothing under the bar, then a root of how far past it the roll got. */
export function rollGain(s: Pick<Reads, "wallet" | "stats">): Decimal {
  const bar = gate("roll.open");
  if (s.wallet.earned.lt(bar)) return ZERO;
  return powerGain(s.wallet.earned, { k: 1, exp: ROLL_GAIN.exp, per: bar, mult: mulOf(s, "gain.cores") });
}
```

VOID IF REMOVED, `src/game/roll.ts`

`ROLL_GAIN.exp` is `1 / 3`. The bar comes from the game's fitted pacing table rather than a constant (chapter 12 is
about that), and `mult` lets upgrades raise the payout without touching the curve. It pays on the wallet's `earned`,
as Simmer does.

### What the prestige currency does

A currency the player cannot use is not a reason to reset. Simmer spends nothing yet: each steam ever made adds a tenth
to the heat, through the engine's `lifetimeMultiplier(lifetime, { k, exp })`, which is `1 + k × lifetime ^ exp` and
exactly 1 before the first reset. The stove does not change. Steam is one more source of heat, beside chapter 3's
lid, so this chapter's game lists a stats feature with both:

<!-- example-code: guide-first-reset.ts -->

```ts
export const stats = defineStats({
  key: "stats",
  vocab: WORDS,
  reach: [lid, steam],
  stats: { heat: { base: 1 } },
  sources: [
    LID_HEAT,
    {
      label: "Steam",
      owner: "steam",
      // 1 + 0.1 x lifetime steam: exactly 1 before the first boil-over.
      effects: [{ stat: "heat", mul: (q) => lifetimeMultiplier(q.steam.lifetime, { k: 0.1, exp: 1 }) }],
    },
  ],
});
```

`docs/examples/guide-first-reset.ts`

The source's amount is a function of the state, so it changes as steam is paid; `reach: [lid, steam]` types `q`. The
stove reads `s.stats.heat` as before and never learns that steam exists. The game lists its features:

<!-- example-code: guide-first-reset.ts -->

```ts
export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  vocab: WORDS,
  features: [wallet, pot, stove, lid, steam, stats, medals, pages],
});
```

`docs/examples/guide-first-reset.ts`

The wallet, the stove and the lid are chapter 4's own, imported. The list cannot spread chapter 4's `SIMMER`, because
that holds the old pot (listing two features under one key is an error), and it lists this chapter's `stats` in place
of chapter 4's: the stove names the stats by their state type, so it takes whichever stats feature the game lists.

The steam itself reads only the wallet: it knows nothing of the stove. That is the usual way to add a layer: what it
is worth is a source on the stat it raises, so the layer can be added, tuned or taken out without touching anything
it pays into.
The boost reads `lifetime`, not `currency`, so a future shop that spends steam would not take the boost away.

VOID IF REMOVED does both: every core paid raises print by `(1 + cores) ^ 0.6`, and the spindle sells upgrades for them. Its
cores sit in the wallet beside labels, so every shop pays from one place; on the engine today that is `payInto`.

## Is it worth pressing?

The hardest thing a player does in a prestige game is decide when. Too early and the reset pays nothing; too late and
the run has been crawling for ten minutes. A good game shows the answer.

`resetPace(gain, kept, seconds, floorS?)` turns the question into one number: how fast a reset now would grow what the
player keeps, in orders of magnitude a second. It is `log10(1 + gain / kept) / seconds`. While the run speeds up, the
pace rises. Once the run slows down, it falls. The best moment to reset is shortly after its peak.

So the recipe is: track the best pace this run, and call the run "past its peak" when the pace falls below a share of
that best. Every `definePrestige` layer does this for you. Simmer's line, from the steam above:

<!-- example-code: guide-first-reset.ts -->

```ts
  // Past its peak once the pace falls under 85% of this run's best; never in a run's first ten seconds.
  pace: { past: 0.85, floorS: 10 },
```

`docs/examples/guide-first-reset.ts`

- The layer reads the seconds since `s.steam.runStart`, which lands on the moment of every reset.
- `kept` is what the reset grows. By default it is `s.steam.lifetime`, every steam paid (here the same as what is held,
  since Simmer spends none); `pace: { kept: (s) => s.steam.currency }` measures against what is held instead. The
  first reset has nothing kept; `resetPace` treats anything under 1 as 1, so the first pace is still a finite number.
- `floorS` is the fewest seconds the pace divides by. In a run's first moments the pace only rises, so nothing can look
  past its peak before ten seconds.
- The layer's own `settle.pace` step keeps `s.steam.peak` up to date every pass, and a reset puts it back to zero.
- The slice serves three derived values (chapter 3): `s.steam.pace`, `s.steam.peakShare` (the pace over the best, 1 at
  the peak) and `s.steam.pastPeak`. `steam.select.pace(state, now)` is the pace at any moment, for a page that redraws
  between passes.

A page's meter, an autobuyer that resets for the player and the sim's player all read the same `pastPeak`, so the
meter the player sees and the pacing the game proves (chapter 12) rest on one number. VOID IF REMOVED built this
recipe by hand around `resetPace` before the engine kept it; the shape of `pace` is taken from it.

## `resetProfile`: starting over for real

A run reset keeps what the rules say. A profile reset keeps nothing: `store.getState().resetProfile(now?)` sends every
feature back to `initial`, whatever its rule, including prestige, medals and the clock's offset. It is the "delete my
save" button. `now` here is wall time, not game time, and defaults to the store's wall.

<!-- example-code: guide-first-reset.ts -->

```ts
  store.getState().resetProfile(wall); // the "delete my save" button: everything, steam and medals too
```

`docs/examples/guide-first-reset.ts`

Put it behind a confirmation. Nothing in the engine asks the player twice.

## Achievements

A medal wall gives the player small goals between resets and a reason to look back at the run. Each medal is an
[achievement](../glossary.md#achievement), and the engine's `defineAchievements` factory is a feature that owns a record of what is earned and when, and checks the list for you.

<!-- example-code: guide-first-reset.ts -->

```ts
/** The medal wall: earned once, kept through every boil-over (the default for achievements). */
export const medals = defineAchievements({
  key: "medals",
  columns: 4,
  reach: () => [wallet, pot, stove, steam],
  list: [
    { id: "first-bubble", name: "First bubble", line: "Tap the pot.", when: (s) => s.pot.taps >= 1 },
    { id: "lit", name: "Lit", line: "Light a burner.", when: (s) => s.stove.burners >= 1 },
    { id: "boiled", name: "Boiled over", line: "Boil the pot over once.", when: (s) => s.steam.runs >= 1 },
    {
      id: "cold-start",
      name: "Cold start",
      line: "Make 1,000 bubbles in a run without a burner.",
      secret: true,
      when: (s) => s.wallet.earned.gte(1000) && s.stove.burners === 0,
    },
  ],
});
```

`docs/examples/guide-first-reset.ts`

- `reach` names what the medals read, as a feature's `reach` does, and types every `when` from it: no annotation.
- `when(state, now)` is checked by the feature at the end of every pass, in a step called `medals.settle.check`. The
  first pass it returns `true`, the medal is earned at that game time and never checked again.
- `secret: true` hides the name and line until it is earned. The board's tiles carry `hidden`, so a page can draw a
  blank tile.
- `columns` lays the wall out in rows. Rows matter if completed rows pay something; see the shelf page.
- `reset` is `"never"` unless you say otherwise. Earned is earned.

The saved state is `{ earned, fresh, holding }`. `earned` maps an id to when it was earned. `fresh` is the queue of ones
the player has not been shown yet: a toast reads it and calls `store.getState().medals.acknowledge()` once shown.
Two more kinds exist and are on the shelf page: one that must hold for a while (`forMs`), and one checked only when the game says a moment came
(`on` with `notify`). A medal with no `when` at all is one the game awards itself with `award(id)`.

VOID IF REMOVED calls its achievements stamps, and its wall starts like this:

```ts
const PAID: readonly StampDef[] = [
  stamp("hello-temp", "Hello, temp", "you pressed it. we are colleagues now.", "feed", presses(1)),
  stamp("spooled", "Spooled", "a spare roll. i have a spine.", "feed", own(1, 1)),
  stamp("armed", "Armed", "tape counts as armed.", "feed", own(2, 1)),
  // ...
  stamp("first-seal", "Warranty void", "you peeled it. i felt that.", "roll", rolls(1)),
  // ...
];
```

VOID IF REMOVED, `src/content/stamps.ts`

The game keeps its own `StampDef` (with the page each stamp belongs to, for drawing it redacted until that page opens)
and maps it to the engine's shape in one line:

```ts
export const stamps = defineAchievements<"stamps", Reads, never>({
  key: "stamps",
  columns: STAMP_COLUMNS,
  list: STAMPS.map((s) => ({ id: s.id, name: s.name, line: s.line, secret: s.secret, when: s.when })),
});
```

VOID IF REMOVED, `src/game/stamps.ts`

That is the game's code on its older engine, which had no `reach` on its factories, so it passed its hand-written
`Reads` as a type argument. On the current engine the call is `defineAchievements({ key: "stamps", reach, ... })`, as
Simmer writes it, and the list's `when`s are typed from the reach.

## The same factory opens pages

A game that shows every page from the first second overwhelms a new player. VOID IF REMOVED opens with one page, adds
the stamp wall when the first stamp lands, and adds the roll page as its prestige comes into reach. A page, once
open, must never close again, even when the reset wipes whatever opened it.

"True once, then kept for good, across every reset" is exactly what an achievement is. So the game declares its pages
as a second achievements feature:

```ts
export const PAGES: readonly PageDef[] = [
  { id: "feed", name: "Feed", line: "hello temp.", tier: 0, opens: () => true },
  {
    id: "stamps",
    name: "Stamps",
    line: "i keep a record. of you.",
    tier: 0,
    opens: (s) => Object.keys(s.stamps.earned).length > 0,
  },
  {
    id: "roll",
    name: "Roll",
    line: "the roll is nearly out. there is a sticker on my case. read it.",
    tier: 1,
    opens: (s) => s.roll.runs > 0 || s.wallet.earned.gte(gate("roll.open")),
  },
  // ...
];
```

VOID IF REMOVED, `src/content/pages.ts`

```ts
export const pages = defineAchievements<"pages", Reads, never>({
  key: "pages",
  columns: PAGES.length,
  list: PAGES.map((p) => ({ id: p.id, name: p.name, line: p.line, when: p.opens })),
});

/** Whether a page is open. */
export const opened = (s: Pick<Reads, "pages">, id: string): boolean => s.pages.earned[id] !== undefined;
```

VOID IF REMOVED, `src/game/stamps.ts`

Look at the roll page's condition. After the first roll the labels are gone and `earned` is back under the bar, so a
condition checked fresh every frame would close the tab again. This one is not: the page was earned the moment the bar
was crossed, and earned is kept. (`s.roll.runs > 0` is a second way in.) The `fresh` queue does a second job here: it is
the list of pages to announce.

Simmer does the same in a few lines:

<!-- example-code: guide-first-reset.ts -->

```ts
/** The pages, on the same factory: a page opens the first pass its condition holds and never shuts. */
export const pages = defineAchievements({
  key: "pages",
  columns: 3,
  reach: () => [wallet, pot, steam],
  list: [
    { id: "pot", name: "Pot", line: "", when: () => true },
    { id: "medals", name: "Medals", line: "", when: (s) => s.pot.taps >= 1 },
    { id: "steam", name: "Steam", line: "", when: (s) => s.steam.runs > 0 || s.wallet.earned.gte(1000) },
  ],
});
```

`docs/examples/guide-first-reset.ts`

The game's `features` list, quoted above under the prestige, ends with `medals` and `pages`.

The file ends with a short script that taps, buys burners for ten minutes of ticks, boils over and prints what
survived. Run it with `bun docs/examples/guide-first-reset.ts`:

<!-- example-output: guide-first-reset.ts -->

```
made this run: 18481 steam on offer: 4
burners: 40 pages open: pot, medals, steam
boiled over: true
bubbles: 0 burners: 0 taps kept: 12 steam: 4
after a profile reset, runs: 0 taps: 0
```

The wallet, the burners and the run's `earned` went back to zero; the twelve taps stayed, by the pot's rule; the steam
stayed, because a prestige feature is above the run. The profile reset at the end takes everything.

## Beyond the first reset

Many games stack resets: a second prestige above the first, then a third. On the engine that is another `definePrestige` with
`depth: 2`, and the first prestige's own feature takes `reset: { depth: 2 }` so the higher layer starts it over. The
shelf page [A prestige layer](../prestige-layer.md) walks through it on the engine's own example.

Two other systems are built on the same reset and live on the shelf: [layers](../layers.md), a whole tree of stacked
layers in one feature, and [challenges](../challenges.md), runs under a restriction that reset the run on entry and pay
something permanent on completion. Both are taught there on the engine's examples.

## Things that bite

- **A feature with no `reset` is wiped on every prestige.** The default is `"run"`. A tally, a setting or a "seen the
  tutorial" flag added without a rule disappears the first time the player resets, and nothing warns you.
- **A currency's default depth is 1: every reset wipes it.** If your prestige currency lives in the wallet, give it
  `depth: { shards: "never" }` (or the depth of the layer above); `payInto` refuses a currency its own reset would take
  back.
- **Pick the kind of total you mean.** `earnedThisRun` starts at zero whenever its currency is wiped; `earnedEver`
  never does. A prestige formula usually wants the first, a "made in total" readout the second.
- **`initial` runs again on every reset.** Anything it computes from `ctx.now` gets the reset's game time. That is what
  makes a run-start field work (prestige's `runStart` is one); it also means an `initial` with side effects runs them
  again.
- **`resetProfile` ignores every rule.** It is not a bigger run reset; it is a new player.

## Next

[Chapter 8, Effects](08-effects.md): how bonuses like steam, upgrades and medals become numbers the rest of the game
reads, without a hand-written `boost` function for each.

## Reference

- [A prestige layer](../prestige-layer.md): `definePrestige`, `powerGain`, `lifetimeMultiplier`, `resetPace`, stacking with
  `depth`.
- [Achievements](../achievements.md): `defineAchievements`, `achievementBoard`, `forMs`, `on` and `notify`, row effects.
- [An upgrade tree](../upgrade-tree.md): a shop with its own `reset` rule.
- [Add a currency](../add-a-currency.md): `defineCurrencies`, `depth`, this-run and ever totals.
- [Layers](../layers.md) and [Challenges](../challenges.md): resets beyond the first.
- `api/core/feature.d.ts`: `ResetRule`, `ReachedRule`, `ResetRunContext`, `InitialContext`.
- `api/core/store.d.ts`: `RootActions.resetRun`, `RootActions.resetProfile`.
- `api/core/prestige/prestige.d.ts`: `definePrestige`, `PrestigeDef`, `PrestigeSelect`, `PrestigeCore`, `PrestigePaceDef`,
  `PrestigePaceValues`, `powerGain`, `lifetimeMultiplier`, `resetPace`.
- `api/core/achievements.d.ts`: `defineAchievements`, `Achievement`, `AchievementsState`, `AchievementsActions`.
