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

The factories built on `feature` pick their own defaults. `achievements` and `prestige` default to `"never"`, because a
medal and a prestige currency are the things a reset exists to keep. `currencies` and `upgradeTree` use the plain
default, `"run"`.

### Simmer's pot keeps one number

This chapter's Simmer lives in its own file and reshapes the pot a little. Chapter 2 kept the burners in a separate
`stove` feature and let the pot simmer on its own; here the burners move into the pot's slice, so one feature holds the
whole run, and the only bubbles are the ones taps and burners make. The pot also gains three fields: `made`, which
counts every bubble this run, `taps`, which counts every tap the player has ever made, and `startedAt`.

```ts
/** The pot's saved state. `made` counts every bubble this run; `taps` counts every tap ever. */
interface PotState {
  bubbles: Decimal;
  made: Decimal;
  burners: number;
  taps: number;
  startedAt: number;
}

// ...

export const pot = feature({
  key: "pot",
  initial: (ctx): PotState => ({ bubbles: ZERO, made: ZERO, burners: 0, taps: 0, startedAt: ctx.now }),
  // A boil-over starts the run again, but the count of taps is the player's for good.
  reset: { keep: ["taps"] },
  // ...
});
```

`docs/examples/guide-first-reset.ts`

Line by line:

- `made` is the number the prestige will pay on. It belongs to the run, so it goes back to zero with the run. Keep it
  apart from `bubbles`, which the player spends: paying on the balance would punish the player for buying burners.
- `startedAt: ctx.now` records when the run began. `initial` is called again on every reset, and on a run reset
  `ctx.now` is the game time of the reset, so this field always holds the start of the current run. Section "Is it
  worth pressing" below uses it.
- `reset: { keep: ["taps"] }` says: start over, but copy `taps` back. Everything else in the slice gets its fresh value.

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

All the balances live in one `currencies` feature, so one rule has to treat each currency differently. A function rule
can, because the reset's depth is on its `ctx`:

```ts
export const wallet = currencies({
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

Start fresh, then copy back every balance whose depth is deeper than this reset reaches. Notice what is not copied
back: `earned`, the total of every label credited. It comes from `fresh`, so it counts labels this run only, which is
exactly what NEW ROLL pays on. The option is called `earned` and the engine's own comment calls these "lifetime totals",
but under any rule that does not keep it, it is a per-run total. Name it for what your rule makes it.

Shops follow the same idea with the shorthand form. The game builds every shop on the engine's `upgradeTree`, passing
the shop's depth straight through:

```ts
  const tree = upgradeTree({
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
prestige currency spent in a shop that stays. If Simmer grows a steam shop, it is an `upgradeTree` with
`reset: "never"` (or `{ depth: 2 }` if you already suspect a second layer). The shelf page
[An upgrade tree](../upgrade-tree.md) covers `upgradeTree` itself.

## `resetRun`: the reset itself

The store has a root action that runs a reset: `store.getState().resetRun(ctx?)`. It walks every feature, applies its
rule, starts the clock's run anchors at the reset's moment (the game-time offset stays), and recomputes every feature's
derived state. `ctx` may carry `depth` (default 1), `now` (default the game's current time) and `rng`.

You will rarely call it yourself. The prestige below calls it for you, inside the same update that pays the player, so
nothing can happen between "paid" and "reset". Inside a step there is `ctx.resetRun(draft)`, and inside an action
`api.resetRun(draft)`, for the same reason: they run the reset in the update you are already in.

## `prestige`: a reset that pays

`prestige` is a feature factory. It gives you a feature that holds three numbers and one action:

- `runs`: how many resets so far (the first run has 0);
- `currency`: the prestige currency not yet spent;
- `lifetime`: every unit ever paid;
- the reset action, called `reset` unless you name it with `action`.

When the action runs it checks `canReset`, reads `gain`, adds the gain to `currency` and `lifetime`, calls `resetRun` at
its `depth`, counts the run, then calls `afterReset`. All of that is one update. It returns `true` if it ran.

Simmer's prestige is the pot boiling over. It pays steam:

```ts
/** Steam a boil-over pays: none under 1,000 bubbles this run, then the square root of how many thousands. */
export const steamGain = (s: Kitchen): Decimal => powerGain(s.pot.made, { k: 1, exp: 0.5, per: 1000 });

// ...

export const boil = prestige({
  key: "boil",
  action: "boilOver",
  reach: [pot],
  initial: () => ({ peak: 0 }),
  gain: (s) => steamGain(s),
  afterReset: (s) => {
    s.boil.peak = 0; // a new run, a new best pace
  },
  steps: {
    settle: {
      peak: (s, ctx) => {
        const pace = boilPace(s, ctx.now);
        if (pace > s.boil.peak) s.boil.peak = pace;
      },
    },
  },
});
```

`docs/examples/guide-first-reset.ts`

- `action: "boilOver"` names the button's action: `store.getState().boil.boilOver()`.
- `reach: [pot]` lets the callbacks read `s.pot`. Chapter 3 covered `reach`.
- `initial` adds the feature's own fields beside `runs`, `currency` and `lifetime`. Here, the best pace seen this run.
- `gain` must be pure: the button's preview and the reset both call it, and they have to agree.
- There is no `canReset`. The default is "the gain is above zero", which is right for Simmer.
- `afterReset` runs after the run is reset, so anything it writes lands in the new run.

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
about that), and `mult` lets upgrades raise the payout without touching the curve.

### What the prestige currency does

A currency the player cannot use is not a reason to reset. Simmer spends nothing yet: each steam ever made adds a tenth
to every bubble, through the engine's `lifetimeMultiplier(lifetime, { k, exp })`, which is `1 + k × lifetime ^ exp`
and exactly 1 before the first reset:

```ts
/** Every steam ever made adds a tenth to every bubble: 1 + 0.1 x lifetime steam. */
const boost = (s: Kitchen): number => lifetimeMultiplier(s.boil.lifetime, { k: 0.1, exp: 1 });
```

`docs/examples/guide-first-reset.ts`

It reads `lifetime`, not `currency`, so a future steam shop can spend steam without taking the boost away.

VOID IF REMOVED does both: every core paid raises print by `(1 + cores) ^ 0.6`, and the spindle sells upgrades for them. Its
prestige credits the cores into the wallet in `afterReset`, so they sit beside labels and every shop pays from one
place. Its `prestige` feature still adds the gain to its own `currency` and `lifetime`, which the game never reads.

### A note on the pot reading the boil

The pot's tap and burners need `boost`, which reads `s.boil`. But `boil` reaches `pot`, so `pot` cannot reach `boil`
back: the constant does not exist yet when `pot` is declared. Simmer names the shape it needs by hand and annotates the
action's `api` with it:

```ts
/** The slices the pot reads. The boil is declared below the pot, so the pot names its shape by hand. */
interface Kitchen {
  pot: PotState;
  boil: PrestigeCore & { peak: number };
}
```

`docs/examples/guide-first-reset.ts`

`PrestigeCore` is the engine's type for `runs`, `currency` and `lifetime`. The pot's actions take
`api: FeatureApi<Kitchen>` and its step takes `s: Kitchen`, and from then on `s.boil.lifetime` is typed. VOID IF REMOVED
does the same at scale: one hand-written `Reads` type that every feature's callbacks use.

## Is it worth pressing?

The hardest thing a player does in a prestige game is decide when. Too early and the reset pays nothing; too late and
the run has been crawling for ten minutes. A good game shows the answer.

`resetPace(gain, kept, seconds, floorS?)` turns the question into one number: how fast a reset now would grow what the
player keeps, in orders of magnitude a second. It is `log10(1 + gain / kept) / seconds`. While the run speeds up, the
pace rises. Once the run slows down, it falls. The best moment to reset is shortly after its peak.

So the recipe is: track the best pace this run, and call the run "past its peak" when the pace falls below a share of
that best. Simmer's version:

```ts
/** Seconds since this run began. */
const runSeconds = (s: Kitchen, now: number): number => Math.max(0, (now - s.pot.startedAt) / 1000);

/** How fast boiling over now would grow the steam held, in orders of magnitude a second. */
export const boilPace = (s: Kitchen, now: number): number =>
  resetPace(steamGain(s), s.boil.currency, runSeconds(s, now), 10);

/** Past its peak: the pot pays, and its pace has fallen under 85% of this run's best. */
export const pastPeak = (s: Kitchen, now: number): boolean =>
  steamGain(s).gte(1) && boilPace(s, now) < s.boil.peak * 0.85;
```

`docs/examples/guide-first-reset.ts`

- `runSeconds` reads the `startedAt` the pot's `initial` wrote. That is why the pot records it.
- `kept` is the steam the player already holds. The first reset has nothing kept; `resetPace` treats anything under 1 as
  1, so the first pace is still a finite number.
- The last argument, `floorS`, is the fewest seconds the pace divides by. In a run's first moments the pace only rises,
  so nothing can look past its peak before ten seconds.
- The `settle.peak` step in `boil` (above) keeps `s.boil.peak` up to date every pass, and `afterReset` zeroes it.

VOID IF REMOVED shows this on the roll page as its pace meter, and its own check reads:

```ts
export const ROLL_PACE = { past: 0.85, floorS: 10 };
```

VOID IF REMOVED, `src/content/roll.ts`

```ts
export function pastPeak(s: Reads, now: number): boolean {
  // ...
  return rollPace(s, now) < rollPeak(s) * ROLL_PACE.past;
}
```

VOID IF REMOVED, `src/game/roll.ts`

The game's `roll` feature holds the peak the same way Simmer's does, in a `settle` step. It tags the peak with the start
time of the run it belongs to, where Simmer zeroes it in `afterReset`. Either works, since the prestige feature itself
never resets; Simmer's is shorter. The roll page reads the gain, the pace and the peak while it renders and calls
`store.getState().roll.change()` from the button. Chapter 10 builds pages like that one.

In VOID IF REMOVED the sim's player resets on the same `pastPeak`, so the meter the player sees and the pacing the game
proves (chapter 12) rest on one number.

## `resetProfile`: starting over for real

A run reset keeps what the rules say. A profile reset keeps nothing: `store.getState().resetProfile(now?)` sends every
feature back to `initial`, whatever its rule, including prestige, medals and the clock's offset. It is the "delete my
save" button. `now` here is wall time, not game time, and defaults to the store's wall.

```ts
  store.getState().resetProfile(wall); // the "delete my save" button: everything, steam and medals too
```

`docs/examples/guide-first-reset.ts`

Put it behind a confirmation. Nothing in the engine asks the player twice.

## Achievements

A medal wall gives the player small goals between resets and a reason to look back at the run. Each medal is an
[achievement](../glossary.md#achievement), and the engine's `achievements` factory is a feature that owns a record of what is earned and when, and checks the list for you.

```ts
const MEDALS: Achievement<Kitchen>[] = [
  { id: "first-bubble", name: "First bubble", line: "Tap the pot.", when: (s) => s.pot.taps >= 1 },
  { id: "lit", name: "Lit", line: "Buy a burner.", when: (s) => s.pot.burners >= 1 },
  { id: "boiled", name: "Boiled over", line: "Boil the pot over once.", when: (s) => s.boil.runs >= 1 },
  {
    id: "cold-start",
    name: "Cold start",
    line: "Reach 1,000 bubbles in a run without a burner.",
    secret: true,
    when: (s) => s.pot.made.gte(1000) && s.pot.burners === 0,
  },
];

/** The medal wall: earned once, kept through every boil-over (the default for achievements). */
export const medals = achievements({ key: "medals", columns: 4, list: MEDALS });
```

`docs/examples/guide-first-reset.ts`

- `Achievement<Kitchen>` types each `when` against the game's state. Annotating the list is the easy way to give
  `achievements` that type; its own type parameters are covered under "Things that bite".
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
export const stamps = achievements<"stamps", Reads, never>({
  key: "stamps",
  columns: STAMP_COLUMNS,
  list: STAMPS.map((s) => ({ id: s.id, name: s.name, line: s.line, secret: s.secret, when: s.when })),
});
```

VOID IF REMOVED, `src/game/stamps.ts`

## The same factory opens pages

A game that shows every page from the first second overwhelms a new player. VOID IF REMOVED opens with one page, adds
the stamp wall when the first stamp lands, and adds the roll page as its prestige comes into reach. A page, once
open, must never close again, even when the reset wipes whatever opened it.

"True once, then kept for good, across every reset" is exactly what an achievement is. So the game declares its pages
as a second `achievements` feature:

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
export const pages = achievements<"pages", Reads, never>({
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

```ts
const PAGES: Achievement<Kitchen>[] = [
  { id: "pot", name: "Pot", line: "", when: () => true },
  { id: "medals", name: "Medals", line: "", when: (s) => s.pot.taps >= 1 },
  { id: "boil", name: "Boil", line: "", when: (s) => s.boil.runs > 0 || s.pot.made.gte(1000) },
];

/** The pages, on the same factory: a page opens the first pass its condition holds and never shuts. */
export const pages = achievements({ key: "pages", columns: PAGES.length, list: PAGES });
```

`docs/examples/guide-first-reset.ts`

Then the game lists all four features:

```ts
export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  features: [pot, boil, medals, pages],
});
```

`docs/examples/guide-first-reset.ts`

The file ends with a short script that taps, buys burners, runs ten minutes of ticks, boils over and prints what
survived. Run it with `bun docs/examples/guide-first-reset.ts`.

## Beyond the first reset

Many games stack resets: a second prestige above the first, then a third. On the engine that is another `prestige` with
`depth: 2`, and the first prestige's own feature takes `reset: { depth: 2 }` so the higher layer starts it over. The
shelf page [A prestige layer](../prestige-layer.md) walks through it on the engine's own example.

Two other systems are built on the same reset and live on the shelf: [layers](../layers.md), a whole tree of stacked
layers in one feature, and [challenges](../challenges.md), runs under a restriction that reset the run on entry and pay
something permanent on completion. Both are taught there on the engine's examples.

## Things that bite

- **A feature with no `reset` is wiped on every prestige.** The default is `"run"`. A tally, a setting or a "seen the
  tutorial" flag added without a rule disappears the first time the player resets, and nothing warns you.
- **`currencies` resets everything by default, prestige currency included.** If your prestige currency lives in the
  wallet, as it does in VOID IF REMOVED, the wallet needs a rule that keeps it (a depth-aware function, as above), or the
  second reset takes away what the first paid.
- **The `earned` totals in `currencies` are per-run unless your rule keeps them.** The option's documentation calls them
  lifetime totals. Under the default rule they start at zero every run. Pick the meaning and name the field for it.
- **`prestige` always pays into its own `currency` and `lifetime`.** If you credit the payout elsewhere in `afterReset`,
  those two fields still count it. Read one ledger and ignore the other on purpose.
- **`initial` runs again on every reset.** Anything it computes from `ctx.now` gets the reset's game time. That is what
  makes `startedAt` work; it also means an `initial` with side effects runs them again.
- **`achievements` takes its type parameters as key, effect, state** (`achievements<K, E, G>`), while `Achievement` takes
  state, effect (`Achievement<G, E>`). Written out by hand they are easy to swap: the game's
  `achievements<"stamps", Reads, never>` sets the effect type to `Reads` and the state type to `never`, which turns off
  the type check on every `when`. Annotate the list as `Achievement<YourState>[]` instead and let the factory infer.
- **`resetProfile` ignores every rule.** It is not a bigger run reset; it is a new player.

## Next

[Chapter 8, Effects](08-effects.md): how bonuses like steam, upgrades and medals become numbers the rest of the game
reads, without a hand-written `boost` function for each.

## Reference

- [A prestige layer](../prestige-layer.md): `prestige`, `powerGain`, `lifetimeMultiplier`, `resetPace`, stacking with
  `depth`.
- [Achievements](../achievements.md): `achievements`, `achievementBoard`, `forMs`, `on` and `notify`, row effects.
- [An upgrade tree](../upgrade-tree.md): a shop with its own `reset` rule.
- [Add a currency](../add-a-currency.md): `currencies`, `earned` and `spent` totals.
- [Layers](../layers.md) and [Challenges](../challenges.md): resets beyond the first.
- `api/core/feature.d.ts`: `ResetRule`, `ReachedRule`, `ResetRunContext`, `InitialContext`.
- `api/core/store.d.ts`: `RootActions.resetRun`, `RootActions.resetProfile`.
- `api/core/prestige/prestige.d.ts`: `prestige`, `PrestigeDef`, `PrestigeCore`, `powerGain`, `lifetimeMultiplier`,
  `resetPace`.
- `api/core/achievements.d.ts`: `achievements`, `Achievement`, `AchievementsState`, `AchievementsActions`.
