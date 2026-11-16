# The first page

By the end of this chapter you will know the five systems that fill an idle game's opening page: a button that pays,
a meter that fills, a row of things that earn, a shop, and surprises that turn up to be caught. You will see each one
as a player meets it in VOID IF REMOVED, as the game's own code, and as a few lines added to Simmer, so that the page
you build next is made of factory calls rather than hand-written loops.

## One pattern, five times

Every system in this chapter is built the same way, so it is worth seeing the shape once before the first one.

A system has three layers.

1. **A [kernel](../glossary.md#kernel).** Pure functions that do the arithmetic and touch nothing else: what the next
   ten kettles cost, how far a meter moves in 250 milliseconds, when the next surprise arrives. You can call them from
   anywhere, including a test or a sim, because they take numbers and return numbers.
2. **A [feature](../glossary.md#feature) over the kernel.** A factory such as `defineGenerators({ ... })` returns a feature
   (chapter 3's unit of state plus behaviour) that saves the system's state under its `key`, gives the store its
   actions (`buy`, `click`, `catch`), and adds the [steps](../glossary.md#step) that move it on every tick and over a
   [catch-up](../glossary.md#catch-up). You list it in `defineGame` like any feature you wrote yourself.
3. **Something the screen reads.** The factory hangs its read-only questions on the feature it returns, so a screen
   can ask "what does the next one cost" without repeating the formula. Every factory returns the same three
   namespaces: `select` for the questions over state, `def` for what it was given, and `draft` for the helpers that
   change a draft inside a recipe.

The reason for the split is that the screen, the sim and the store all need the same answers. If the price formula
lived in a button's click handler, the sim would need its own copy, and the two would drift. With the split, the
feature's action and the screen's label both call the same kernel.

You will meet this shape five times below. The third layer is the same everywhere: `generators` and the upgrade tree
put their questions on `.select`, their list or nodes on `.def`, and a clicker or a gauge keeps its pure helpers
(`comboAt`, `comboShown`) beside them as free functions you import. The chapter points out each one as it comes.

### Where this chapter's Simmer starts

Every Simmer example from here on starts from chapter 4's game, `docs/examples/simmer/game-wallet.ts`: the wallet,
the pot you tap, the stove with its burners, and the lid. This chapter adds six features beside them and lists all of
them in one `defineGame`:

<!-- example-code: guide-first-page.ts -->

```ts
export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  vocab: WORDS,
  features: [...SIMMER, kitchen, foam, kettles, spoon, boosts, surface],
  order: { rates: [...SIMMER_RATES] },
});
```

`docs/examples/guide-first-page.ts`

`SIMMER` is chapter 4's features in their order and `SIMMER_RATES` is the step order they need pinned (the lid doubles
the stove after the stove sets its rate). Spreading both keeps the core exactly as it was and puts the new features
after it.

Several factories take callbacks such as `power`, `mult` or `open` that read the whole game state. They are called
with the store's state, typed as whatever you annotate the first parameter with. The new features read each other
(the spoon reads the kettles, the kettles read the kitchen), so no one of them can see the finished game's type, and
Simmer writes the shape down once:

<!-- example-code: guide-first-page.ts -->

```ts
/** What the callbacks below read: chapter 4's Simmer, plus the slices this page adds. Written by hand: they read each other. */
export type Page = Simmer & {
  kitchen: TreeState;
  foam: GaugeState;
  kettles: GeneratorsState;
  spoon: ClickerState;
  boosts: BuffsState;
  surface: SpawnsState;
};
```

`docs/examples/guide-first-page.ts`

The engine exports each factory's state type (`TreeState`, `GaugeState` and so on), so the hand-written part is only
the list of keys. VOID IF REMOVED does the same thing at a larger size with a type it calls `Reads`, and every excerpt
below annotates its callbacks with it.

Each of these callbacks also gets a second argument, `{ now }`: the [game time](../glossary.md#game-time) of the pass
or the press it is read in. That is how a callback asks about anything that depends on time, such as a buff that is
running or a meter that is locked. You will see it used twice below.

## The tap: `clicker`

**What the player sees.** The first thing on VOID IF REMOVED's opening page is a pad marked FEED. Every press prints a
label, and the label counter goes up. Now and then a press comes out as a "clean print" and pays ten times as much.
Hammering the pad faster than a person could is quietly ignored.

**The factory.** `defineClicker({ key, wallet, currency, power, crit?, combo?, maxPerSecond?, onClick?, reset? })` makes a
feature with one action, `click()`. A click pays `power(state, { now })` into the wallet, multiplied by the
[crit](../glossary.md#crit) multiplier when the crit roll succeeds. It returns what it paid as
`{ amount, crit, combo }`, or `null` when `maxPerSecond` dropped the press. The crit roll uses the feature's own saved
random stream, so reloading the page cannot reroll a press. The optional `combo` grows a multiplier while presses land
close together.

Here is the game's press:

```ts
/** What one press pays: a label, plus a share of what the stations make a second, times the press stat. */
export function pressPower(s: Reads): Decimal {
  // ...
  const share = PRESS.share + addOf(s, "share");
  return D(PRESS.base).add(shadowRate(s).mul(share)).mul(mulOf(s, "press"));
}

// ...

/** A tap, on the engine's `clicker`: pays a press, may print clean, warms the head. */
export const press = defineClicker({
  key: "press",
  wallet,
  currency: MAIN,
  power: (s: Reads) => pressPower(s),
  crit: (s: Reads) => ({ chance: critChance(s), mult: CRIT.mult }),
  maxPerSecond: TAPS_PER_SECOND,
  // ...
});
```

VOID IF REMOVED, `src/game/feed.ts`

`MAIN` is the game's main currency, labels. `shadowRate(s)` is what the generators make a second, and `addOf` and
`mulOf` read the game's own stat totals (chapter 8 is about those). So a press pays one label plus a small share of
the per-second income: a press stays worth making after the generators take over. The numbers live in the game's
content file, not in the feature:

```ts
/** A press: one label, plus this share of what the stations make a second. */
export const PRESS = { base: 1, share: 0.02 };
// ...
/** Taps past this many a second are dropped. */
export const TAPS_PER_SECOND = 20;
// ...
/** A clean print: the chance a press is one, and what it pays. */
export const CRIT = { chance: 0.03, mult: 10 };
```

VOID IF REMOVED, `src/content/feed.ts`

The screen does nothing clever. Pressing the pad calls the action:

```tsx
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    store.getState().press.click();
    store.getState().feed.hold(true);
  };
  const up = () => store.getState().feed.hold(false);
```

VOID IF REMOVED, `src/screens/FeedPad.tsx`

The second call, `feed.hold(true)`, is the game's own feature, not the engine's: holding FEED down keeps paying
presses at a fixed rate. It is a good example of a game adding a mechanic beside a factory instead of inside it.

**Simmer's version.** Chapter 2's tap still pays its one bubble. Beside it the page gets a spoon: a stir pays a bubble
plus 2% of everything the pot makes a second, more on a full head of foam (the foam is the next section):

<!-- example-code: guide-first-page.ts -->

```ts
export const spoon = defineClicker({
  key: "spoon",
  wallet,
  currency: "bubbles",
  // The stir stat, plus 2% of what the pot makes a second, up to twice that on a full head of foam.
  power: (s: Page, { now }) => {
    const base = clickShare(statOf(s, "stir"), income(s), 0.02);
    return gaugeLocked(s.foam, now) ? base : base.mul(1 + gaugeFill(s.foam, FOAM.max));
  },
  crit: () => ({ chance: 0.03, mult: 10 }),
  maxPerSecond: 20,
  // A stir raises the foam, through the gauge's draft helper: a stir that takes it to the top spills it.
  onClick: (d: Draft<Page>, _paid, now) => {
    foam.draft.nudge(d, FOAM.perStir, now);
  },
});
```

`docs/examples/guide-first-page.ts`

Line by line:

- `key: "spoon"` is where the clicker saves its counters (presses ever, crits ever, the best press). The action is then
  `store.getState().spoon.click()`.
- `wallet` is chapter 4's currencies feature, and `currency` is which balance a press pays into.
- `power` is the kernel's `clickShare(base, perSecond, share)`, which is `base + perSecond × share`. `statOf(s,
  "stir")` is the stir's base after the kitchen's upgrades; you will see it in the shop section. `income(s)` is the
  stove's rate plus the kettles'. The `{ now }` lets `power` ask whether the foam is spilled at the moment of the press.
- `crit` returns `{ chance, mult }`. It is a function of the state so an upgrade can raise the chance later.
- `maxPerSecond` counts presses in one-second windows of game time and drops the rest.
- `onClick` runs inside the same [draft](../glossary.md#draft) as the payment, so anything that should happen on a
  press (raising the foam here) lands in the same state change. `Draft` comes from `watchpot/core`.

The clicker's screen-side pieces are the action's return value (to flash "crit!") and two free functions,
`comboAt` and `comboShown`, for a combo meter (`tap.select.comboShown(state, now)` reads them off the state). The
feature also carries `.draft.click(draft, now)`, the same press for use inside another recipe: a [draft
helper](../glossary.md#draft-helper), like the wallet's `draft.credit` in chapter 4.

The rest of the clicker, including the combo and the reset rule, is on the shelf in [Clicker](../clicker.md).

## The meter: `gauge`

**What the player sees.** The FEED pad glows with the printhead's heat, which climbs as you press and sinks when you
stop. A hot head prints more: at full heat, up to twice as much.

**The factory.** `defineGauge({ key, max, rate, trip?, awayRate?, onTrip?, reset? })` is a bounded level, a
[gauge](../glossary.md#gauge). Every tick its step moves the level by `rate(state, { now })` per second and clamps it
between 0 and `max`. With a `trip`, reaching the top locks the gauge for a while and drops the level, which is how you
build a boiler that can blow. Without one, the level just stays at `max`, which is a meter in its own right. Over a
catch-up it uses `awayRate` instead, which by default drains the whole gauge in an hour, so a player comes back to a
cool meter.

There are two ways to move the level by hand. The action `nudge(amount)` works from outside a recipe. Inside one (a
press, a catch) the feature's draft helper `draft.nudge(draft, amount, now)` does the same with the same clamp, trip and
`onTrip`. The kernel underneath is `stepGauge` (and `nudgeGauge` for a nudge), and the readers are free functions:
`gaugeFill(state, max)` (0 to 1), `gaugeLocked(state, now)` and `secondsToTrip(state, perSecond, max)`. The feature's
`def` holds its fixed bounds, `{ max, trip }`, and `select` reads the state (`locked`, `fill`, `secondsToTrip`).

The game's heat never trips and survives the first reset:

```ts
export const heat = defineGauge({
  key: "heat",
  max: HEAT.max,
  reset: "never",
  rate: (s: Reads) => {
    // ...
    const net = (holding(s) ? holdRate(s) * warmth(s) : 0) - HEAT.decay;
    // ...
  },
});
```

VOID IF REMOVED, `src/game/feed.ts`

While FEED is held the head warms by the hold rate times a press's warmth; otherwise it cools by `HEAT.decay` a
second. A single tap warms it too: the clicker's `onClick` adds to `d.heat.level` itself, capped at `HEAT.max`. That is
safe because this gauge has no trip; on the current engine `heat.draft.nudge(d, amount, now)` is the call for it, and it
would trip a gauge that had one. Reading the level is a single selector on the screen,
`useGameState((g) => g.heat.level)`, and the game turns the level into a print multiplier in its stat bus:

```ts
    const full = HEAT.full + (add["heat.max"] ?? 0);
    const heat = 1 + (full - 1) * (s.heat.level / HEAT.max);
    if (heat > 1) mul("heat", "print", heat);
```

VOID IF REMOVED, `src/game/bus.ts`

**Simmer's version.** Stirring raises foam on the pot. It settles by six a second, and each stir raises it by four
(that was the spoon's `onClick` above). A full head of foam pays a stir up to twice over, but foam that reaches the
top spills: it drops to nothing and stays flat for ten seconds, and while it is spilled the spoon's `power` pays
without it. So stirring hard pays, up to a point.

<!-- example-code: guide-first-page.ts -->

```ts
export const FOAM = { max: 100, perStir: 4, settle: 6, spillMs: 10_000 };

/** Foam on the pot, 0 to 100. Stirring raises it; it settles on its own; at the top it spills and sits flat a while. */
export const foam = defineGauge({
  key: "foam",
  max: FOAM.max,
  rate: () => -FOAM.settle,
  trip: { lockMs: FOAM.spillMs, dropTo: 0 },
});
```

`docs/examples/guide-first-page.ts`

`trip: { lockMs, dropTo }` is the spill. Because the stir raises the foam through `foam.draft.nudge(d, ...)`, a stir that
reaches the top trips it in the same recipe as the payment. The script at the end of the file stirs thirty times in
three seconds, and the foam spills once.

The gauge's shelf page is [Gauges](../gauge.md): every option, the kernel, and the numbers to work out on paper.

## The generators: `generators`

**What the player sees.** Below the pad is a list of stations, the things in the warehouse that print labels on their
own. Each row shows how many you own, what they make a second, a small meter towards the next count at which that
station doubles, and a buy button whose price climbs with every purchase. A switch at the top of the list picks how
many a press buys: one, ten, up to the next doubling, or as many as you can afford. Only the first station you do
not own yet is shown in full; the two after it are blacked out. When every station reaches a "full shift" count, the whole
floor's output triples. Close the game, and the stations keep working at half rate, for up to eight hours.

**The factory.** `defineGenerators({ key, wallet, list, global?, mult?, open?, milestones?, automated?, away?, reset? })` is
the building list every idle game has. Each entry in `list` is a `RateGeneratorDef` (an `id`, a `cost` curve, the
currency it `pays` with and the one it `makes`, and a `rate` per one owned, per second) or a `CycleGeneratorDef`, which
pays on a timed `cycle` instead of a rate; `GeneratorDef` is either. [`milestones`](../glossary.md#milestone) on the
owned count multiply that generator's output; `global` milestones apply to all of them once the lowest owned count
reaches them. Your own fields, such as a `name`, ride along on each entry.

The callbacks take the state, the generator's definition and `{ now }`. `mult(state, def, { now })` is your game's
own multiplier, `open` holds a generator back, `milestones` can switch the milestones off by a rule of your game, and
`away(state, { now })` says what share of an absence the list is paid and for how long at most.

The actions are `buy(id, count?)`, `buyMax(id, limit?)`, `buyNext(id)` (exactly enough to reach the next milestone)
and `run(id)` for a hand-started cycle. The kernel is `costAt`, `costOfMany` and `maxAffordable` for prices, and
`cyclesIn` for cycles.

You have already read the game's stations in [chapter 5](05-a-real-game.md#1-content-the-stations-and-the-supplies):
a `STATIONS` list of plain data in `src/content/stations.ts`, each with a geometric `cost: { base, growth }` (the next
station costs `base × growth^owned`), and a `generators` feature in `src/game/feed.ts` that maps the list into the
engine's shape with its milestones, its full shifts and `away`
([chapter 5, stop 2](05-a-real-game.md#2-features-the-content-on-engine-factories)). Beside those it passes `mult`,
which reads the game's stat bus, and `open`. That is the whole station system: the
engine does the prices, the doubling, the floor-wide tripling, the per-second rate, the payout every tick and the
half-rate payout while the player is away.

The factory's questions about the state live on `.select` (the list itself on `.def`), and the game's list reads
them for every row:

```tsx
  const [mode, setMode] = useState<BuyMode>(1);
  const balance = st.wallet[MAIN];
  const list = stations.def.list;
  // Everything owned, and the first one that is not: the floor grows a station at a time.
  const firstUnowned = list.findIndex((def) => (st.stations.owned[def.id] ?? 0) === 0);
  const shown = firstUnowned < 0 ? list : list.slice(0, firstUnowned + 1);
  // ...
        {shown.map((def) => {
          const owned = st.stations.owned[def.id] ?? 0;
          const open = stations.select.open(st, def.id);
          const affordable = stations.select.affordable(st, def.id);
          const until = stations.select.untilMilestone(st, def.id) ?? 1;
          const count = Math.max(1, buyCount(mode, { affordable, untilNext: until }));
          const price: Decimal = stations.select.price(st, def.id, count);
          const can = open && price.lte(balance);
          const rate = owned > 0 ? stations.select.rate(st, def.id) : ZERO;
```

VOID IF REMOVED, `src/screens/Feed.tsx`

The buy modes come from `watchpot/ui`. `BuyMode` is `number | "max" | "next"`, the `BuyAmount` component is the
switch, and `buyCount(mode, { affordable, untilNext })` turns the chosen mode into a count, 0 when you can afford none
(hence the `Math.max(1, ...)`, so a row still shows the price of one). The count goes to `select.price` for the label
and to `stations.buy(def.id, count)` on the click. On the current engine those five lines are one call,
`select.row(state, id, mode)`, which Simmer uses below. The blacked-out rows are the game's own idea: it slices the list
after the first station you do not own.

**Simmer's version.** The stove from chapter 3 was written by hand, and it stays. Beside it Simmer puts a shelf of
kettles on the factory: a kettle and a cauldron, each doubling at 10, 25, 50 and 100, tripling together once both
reach 25, and boiling three times as fast while a rolling boil runs:

<!-- example-code: guide-first-page.ts -->

```ts
const DOUBLINGS = [10, 25, 50, 100].map((at) => ({ at, gives: { mult: 2 } }));

export const kettles = defineGenerators({
  key: "kettles",
  wallet,
  reach: () => [kitchen, boosts],
  list: [
    {
      id: "kettle",
      name: "Kettle",
      cost: { base: 100, growth: 1.15 },
      pays: "bubbles",
      makes: "bubbles",
      rate: 5,
      milestones: DOUBLINGS,
    },
    {
      id: "cauldron",
      name: "Cauldron",
      cost: { base: 1500, growth: 1.15 },
      pays: "bubbles",
      makes: "bubbles",
      rate: 40,
      milestones: DOUBLINGS,
    },
  ],
  global: [{ at: 25, gives: { mult: 3 } }], // once every kettle and cauldron reaches 25
  // The copper, and three times over while a rolling boil runs.
  mult: (s, _def, { now }) =>
    statOf(s, "kettle") * (buffActive(s.boosts, "rolling-boil", now) ? ROLLING_BOIL.mult : 1),
  away: () => ({ rate: 0.5, capMs: 8 * HOUR_MS }), // half pay while you are gone, for up to 8 hours
});
```

`docs/examples/guide-first-page.ts`

`mult` reads two things: the kitchen's `kettle` stat (the shop section) and whether the rolling boil is running at
`now` (the last section). The engine asks it once a pass, in the `rates` [phase](../glossary.md#phase), and multiplies
each kettle's base rate, its owned count and its milestones by the answer.

And the row a screen would draw, as a plain function with no React in it, so you can see every question the row asks:

<!-- example-code: guide-first-page.ts -->

```ts
/** One kettle row: what it shows and what its button would buy, for the chosen buy mode. */
export function kettleRow(s: StateOf<typeof game.features>, id: string, mode: BuyMode, now: number) {
  const { count, price, canBuy } = kettles.select.row(s, id, mode, now);
  return {
    owned: kettles.select.owned(s, id),
    perSecond: fmt(kettles.select.rate(s, id, now)).text,
    untilNext: kettles.select.untilMilestone(s, id),
    count,
    price: fmt(price).text,
    canBuy,
  };
}
```

`docs/examples/guide-first-page.ts`

`select.row` does the buy-mode arithmetic: `count` is what the mode buys, never less than 1 so the row always has a
price to show; `price` is the price of that many; `canBuy` is false when the generator is not open, when the balance
falls short, or for `"next"` past the last milestone. `untilMilestone` returns `null` past the last milestone.

The questions that read a callback take the `now` to hand it as a last argument. A question asked of the store's own state
without one uses the store's current game time, so you can leave it out on a screen; the script passes it because its
clock is a variable.

One inconsistency to know about: the callbacks you pass in (`mult`, `open`, `automated`) receive the generator's whole
definition, `(state, def, ctx)`, but the `.select` functions you call take its id, `(state, id)`. Inside `mult` you
write `def.id`; on a screen you pass `def.id`.

How time away is reported to the player, and why the half rate matters, is chapter 9. The rest of the factory,
including cycles and managers, is in [Generators](../generators.md) and
[Add a generator](../add-a-generator.md).

## The shop: `upgradeTree`

**What the player sees.** Beside the stations is a shelf of supplies, things you buy once with labels: fresh ribbon
that doubles a press, spindle tension that doubles the first station, loose labels that let labels get loose (the
next section). Most items are there from the start; some wait until you own the station they improve, and some
until the run reaches a later stage.
Everything on it is gone again after the first reset.

**The factory.** An [upgrade tree](../glossary.md#upgrade-tree) is a set of nodes, each bought one rank at a time.
`defineUpgradeTree({ key, nodes, wallet, open?, milestone?, reset? })` saves the ranks under `key`, and its actions are
`buy(id)`, `buyMax(id, limit?)` and `buyAll(limit?)`, which buys the cheapest rank on offer, then the next cheapest,
until the wallet runs dry. Each node is a `GraphNode`: an `id`, `name` and `line`, a `cost` in one or more currencies,
a `costGrowth` per rank, a `maxLevel`, the node ids it `requires`, and its `effects`. A tree does not need to look like
a tree. With `maxLevel: 1` and no requirements, it is a shop.

Why use a tree for a shop rather than a list of booleans? Because the tree already does the parts you would otherwise
write: the price per rank, the "requires", the refusal with a reason when you cannot afford it, and the
[effects](../glossary.md#effect) handed to the game's stats as contributions.

The game writes its shop items as one line each:

```ts
    item("ribbon", "Fresh ribbon", "blacker blacks.", min(0.4), [mul("press", 2)]),
    item("tension", "Spindle tension", "tighter. no, tighter.", min(1), [station(1, 2)], { own: 1 }),
    item("thumb", "A stronger thumb", "yours. i am investing in you.", min(1.8), [mul("press", 2)]),
    item("tape-refill", "Tape refill", "the good tape. the loud tape.", min(2.5), [station(2, 2)], {
      own: 2,
    }),
    item("loose-labels", "Loose labels", "some get away. catch them.", min(3.2), [], { flags: ["misfeeds"] }),
```

VOID IF REMOVED, `src/content/feed.ts`

The fourth argument, `min(0.4)`, is not a price. It is the point in play, in hours, at which the item should first be
bought: `min(0.4)` is 0.4 minutes written in hours. The game's pacing tools fit a price to that hour, which is chapter 12's subject. `{ own: 1 }` means
"only once the first station is owned", and `flags` switch a mechanic on while the item is held.

A small function, `nodeOf`, turns each item into the engine's node, and another, `shop`, hands the nodes to
`upgradeTree` with an `open` callback. Chapter 5 quotes both
([stop 2](05-a-real-game.md#2-features-the-content-on-engine-factories)), from `src/game/shops.ts`.

`open` is how a node stays off the shelf until the game says so: the game's `offered` checks that the run has reached
the stage the item's hour falls in, the item's `needs`, and the station it is for. A node that is not open refuses to sell with the code `"closed"`.

**Simmer's version.** Four things for the kitchen: salt doubles a stir, a whisk adds a bubble a stir for five ranks,
copper kettles double the kettles once you own one, and a ladle lets big bubbles rise. Two of them, and the feature:

<!-- example-code: guide-first-page.ts -->

```ts
type Stat = "stir" | "kettle";
type Upgrade = GraphNode<Effect<Stat>, "bubbles">;

const UPGRADES: readonly Upgrade[] = [
  {
    id: "salt",
    name: "A pinch of salt",
    line: "Every stir brings up twice the bubbles.",
    cost: [{ currency: "bubbles", amount: 25 }],
    maxLevel: 1,
    requires: [],
    effects: [{ stat: "stir", mul: 2 }],
  },
  {
    id: "whisk",
    name: "A whisk",
    line: "One more bubble a stir, each rank.",
    cost: [{ currency: "bubbles", amount: 100 }],
    costGrowth: 2,
    maxLevel: 5,
    requires: ["salt"],
    effects: [{ stat: "stir", add: 1 }],
  },
  // ...
];

export const kitchen = defineUpgradeTree({
  key: "kitchen",
  nodes: UPGRADES,
  wallet,
  reach: reach<{ kettles: GeneratorsState }>(),
  // The copper waits until there is a kettle to put it on.
  open: (s, node) => node.id !== "copper" || (s.kettles.owned.kettle ?? 0) > 0,
});

// ...

/** The kitchen's two stats on the engine's stat graph, from a base of 1, each node counted once per rank held. */
const KITCHEN = statIndex<Stat, never, Pick<Page, "kitchen">>({ base: () => 1 });
for (const node of UPGRADES)
  KITCHEN.add(node, { label: node.name, owner: "kitchen", times: (s) => s.kitchen.ranks[node.id] ?? 0 });

/** A stat's value from the kitchen's ranks: 1, plus its adds, times its muls. Chapter 8 serves stats as a feature. */
export const statOf = (s: Pick<Page, "kitchen">, stat: Stat): number => KITCHEN.over(s).stat(stat).toNumber();
```

`docs/examples/guide-first-page.ts`

An [effect](../glossary.md#effect) is `{ stat, add }` or `{ stat, mul }`, and `Effect<Stat>` says which stats it may
name. `statIndex` is the engine's [stat graph](../glossary.md#stat-graph): each node goes in once, counted `times`
over (the ranks held), and `over(s).stat("stir")` gives `(1 + adds) × muls` as a Decimal. That is where the spoon's
`statOf(s, "stir")` and the kettles' `statOf(s, "kettle")` came from. A graph per call is fine for four upgrades;
chapter 8 declares the stats once as a feature the whole game reads.

The screen asks the feature itself. `kitchen.select.open(state, id)` says whether a node is on offer by your `open`,
`kitchen.select.check(state, id)` says why `buy(id)` would refuse it now (`"closed"` first, then the price or a missing
requirement), or `null` when it would buy, and `kitchen.select.affordable(state, id)` counts the ranks the wallet
covers. The nodes are `kitchen.def.nodes`, and the tree's own pure rules live on `kitchen.def.tree`: `price(node,
owned)` and its `contributions`.

<!-- example-code: guide-first-page.ts -->

```ts
/** The kitchen shelf: what is on offer, what the next rank costs, and whether it can be bought now. */
export function shelf(s: Page) {
  return kitchen.def.nodes
    .filter((node) => kitchen.select.open(s, node.id))
    .map((node) => {
      const owned = s.kitchen.ranks[node.id] ?? 0;
      const next = kitchen.def.tree.price(node, owned)?.[0];
      return {
        id: node.id,
        name: node.name,
        owned,
        price: next ? fmt(next.amount).text : null, // null: bought out
        canBuy: kitchen.select.check(s, node.id) === null,
      };
    });
}
```

`docs/examples/guide-first-page.ts`

A "stock up" button that buys everything on the shelf it can afford is `store.getState().kitchen.buyAll()`. It reads
your `open` the same way `buy` does.

The rest is in [An upgrade tree](../upgrade-tree.md); the stat bus is [chapter 8](08-effects.md) and
[The stat graph](../stat-graph.md).

## Surprises and timed boosts: `spawns` and `buffs`

**What the player sees.** A few minutes in, once you have bought loose labels, a label occasionally drifts out of the
printer's slot. It stays for a few seconds. Click it in time and you get one of three things: a hot run, a whole box,
or a double feed. A box pays a lump of labels at once. The two runs are timed boosts: a chip under the pad shows the
run's name, its multiplier and the seconds left.

**The factories.** These are two systems that work as a pair.

`defineSpawns({ key, kinds, onCatch?, reset? })` is random arrivals, each a [spawn](../glossary.md#spawn). Each kind has a
`wait` between arrivals (`minMs`, `maxMs`, and an optional `ramp` that makes late arrivals likelier), a `lifeMs` it
stays catchable, an `outcomes` table of weights, and an optional `active(state, { now })` that holds it back. The
`wait` and `lifeMs` may be functions of the state too. Its step brings every kind up to the current game time, and its
action `catch(kind)` draws an outcome and runs your `onCatch(draft, outcome, now, kind)` in the same recipe. Every draw
is on the kind's own saved random stream. The screen reads `state.<key>.kinds[kind].live`, which is `null` or
`{ id, bornAt, diesAt }`.

`defineBuffs({ key, list, onEnd?, reset? })` is timed boosts, each a [buff](../glossary.md#buff). Each entry has an `id`, a
`durationMs`, a `stack` rule for starting it while it runs (`"refresh"`, `"extend"`, `"stack"` or `"ignore"`) and,
if it should feed a stat bus, its `effects`. Without `effects` a buff is a timer that your own rules ask about. The
readers are `boosts.select.active(state, id, now)`, `boosts.select.leftMs(state, id, now)` and `boosts.select.overlapMs(state, id,
from, to)`, which says how much of a stretch of time the buff covered.

The game calls its arrivals misfeeds:

```ts
export const misfeeds = defineSpawns({
  key: "misfeeds",
  kinds: [
    {
      id: MISFEED_KIND,
      wait: (s: Reads) => {
        const rate = mulOf(s, "misfeed.rate").toNumber();
        return {
          minMs: MISFEED.waitMs.min / rate,
          maxMs: MISFEED.waitMs.max / rate,
          ramp: { power: 3, stepMs: 1000 },
        };
      },
      lifeMs: MISFEED.lifeMs,
      // ...
      outcomes: [
        { id: "hot-run", weight: 50 },
        { id: "box", weight: 35 },
        { id: "double-feed", weight: 15 },
      ],
    },
  ],
  onCatch: (d: Draft<Reads>, outcome, now) => {
    if (outcome === "box") {
      wallet.draft.credit(d, MAIN, shadowRate(d).mul(MISFEED.boxSeconds).mul(mulOf(d, "misfeed.power")));
      return;
    }
    // ...
  },
});
```

VOID IF REMOVED, `src/game/misfeeds.ts`

The trimmed `onCatch` line starts the buff named by the outcome with the buffs feature's draft helper,
`boosts.draft.start(d, outcome, now, ...)`. Note that `wait` is a function of the state, so an upgrade can bring misfeeds
sooner. The buffs themselves:

```ts
export const boosts = defineBuffs<"boosts", Fx>({
  key: "boosts",
  list: [
    { id: "hot-run", durationMs: MISFEED.hotRun.seconds * 1000, stack: "refresh", effects: () => [] },
    { id: "double-feed", durationMs: MISFEED.doubleFeed.seconds * 1000, stack: "refresh", effects: () => [] },
  ],
});
```

VOID IF REMOVED, `src/game/misfeeds.ts`

Both runs are timers: their `effects` are empty (on the current engine you leave `effects` out for that). The game asks
whether a run is active while it folds its stat bus, and multiplies there:

```ts
  const power = 10 ** (log["misfeed.power"] ?? 0);
  if (buffActive(s.boosts, "hot-run", now)) mul("boosts:hot-run", "print", MISFEED.hotRun.mult * power);
  if (buffActive(s.boosts, "double-feed", now))
    mul("boosts:double-feed", "press", MISFEED.doubleFeed.mult * power);
```

VOID IF REMOVED, `src/game/bus.ts`

The game reads its buffs in its stat bus because every number it has goes through that bus (chapter 8). A smaller game
can ask where the boost applies, since every callback gets `{ now }`. Simmer does.

On the screen, catching is one call, and the chip under the pad uses `buffLeftMs`:

```tsx
      onClick={() => store.getState().misfeeds.catch(MISFEED_KIND)}
```

VOID IF REMOVED, `src/screens/Feed.tsx`

**Simmer's version.** Once you own the ladle, a big bubble rises now and then. Catch it for a splash (a minute of
everything the pot makes, at least 25 bubbles) or a rolling boil (thirty seconds of the kettles boiling three times
as fast). The rolling boil is a timer, with no `effects`:

<!-- example-code: guide-first-page.ts -->

```ts
export const ROLLING_BOIL = { seconds: 30, mult: 3 };

/** The rolling boil is a timer: the kettles ask whether it is running, where they work out their rate. */
export const boosts = defineBuffs({
  key: "boosts",
  list: [{ id: "rolling-boil", durationMs: ROLLING_BOIL.seconds * 1000, stack: "refresh" }],
});
```

`docs/examples/guide-first-page.ts`

and the big bubble:

<!-- example-code: guide-first-page.ts -->

```ts
export const surface = defineSpawns({
  key: "surface",
  kinds: [
    {
      id: "big-bubble",
      wait: { minMs: 45_000, maxMs: 150_000, ramp: { power: 3, stepMs: 1000 } },
      lifeMs: 12_000,
      active: (s: Page) => has(s, "ladle"),
      outcomes: [
        { id: "splash", weight: 60 },
        { id: "rolling-boil", weight: 40, noRepeat: true },
      ],
    },
  ],
  onCatch: (d: Draft<Page>, outcome, now) => {
    if (outcome === "splash") {
      wallet.draft.credit(d, "bubbles", income(d).mul(60).max(25)); // a minute of everything, 25 at least
      return;
    }
    boosts.draft.start(d, outcome, now);
  },
});
```

`docs/examples/guide-first-page.ts`

`active` keeps big bubbles away until the ladle is bought; while it is false, nothing arrives, and the wait starts
over once it holds. `noRepeat` means two rolling boils never come back to back. `wallet.draft.credit(d, ...)` and
`boosts.draft.start(d, ...)` are draft helpers: you are already inside a recipe in `onCatch`, so you change the draft you
hold rather than calling a store action.

The rolling boil is paid where it applies: the kettles' `mult` (in the generators section) multiplies by three while
`buffActive(s.boosts, "rolling-boil", now)` holds. No step of your own is needed. A screen reads
`state.surface.kinds["big-bubble"].live` to draw the bubble, calls `store.getState().surface.catch("big-bubble")` on a
click, and shows `buffLeftMs(state.boosts, "rolling-boil", now)` as a countdown.

`mult` is read once a pass, at the pass's `now`, and the buffs feature ends a finished buff early in that same pass.
Over a live tick, a fraction of a second, that makes no difference you can see. Over a long absence it does: the
catch-up is one pass, so a rolling boil that ran out halfway through it pays nothing for the half it covered. If your
boost is big enough for that to matter, pay its extra in a `produce` step of your own with
`overlapMs(state.boosts, id, ctx.now - ctx.dtMs, ctx.now)`, which measures exactly the part of the pass the buff
covered, ended or not.

The rest is in [Spawns](../spawns.md) and [Buffs](../buffs.md).

## Putting the page together

The whole page is the one `defineGame` from the start of the chapter: chapter 4's four features, then the kitchen, the
foam, the kettles, the spoon, the boosts and the surface.

Count what you did not write: no price loop, no buy-max, no crit roll, no random timer, no offline payout, no
milestone check. Each of those is a kernel function a factory already calls. What is left is content (the numbers,
the names) and the few lines where your game's systems touch each other: the stir raising the foam, the ladle letting
bubbles rise, the rolling boil speeding the kettles.

Run the file to watch it work. `bun docs/examples/guide-first-page.ts` stirs thirty times, buys a burner, lets a
minute pass on a fake clock, buys a kettle and prints the rows a screen would draw. It begins:

<!-- example-output: guide-first-page.ts lines=1-4 -->

```
after 30 stirs: 42 bubbles, foam spilled 1 time
bought a burner: true
bought a kettle: true
bubbles: 52 foam: 0
```

The store in the script is seeded (`createIdleStore(game, { seed: "simmer", ... })`), so the crit rolls come out the
same on every run; with this seed none of the thirty stirs crits.

## Things that bite

- **The tree's own rules ignore `open`.** `kitchen.def.tree.check` and `kitchen.def.tree.affordable` will happily say
  yes to a node your `open` hides; they know only ranks and balances. Ask the feature (`kitchen.select.check`,
  `kitchen.select.affordable`, `kitchen.select.open`) on a screen.
- **A buff read in a callback counts at the end of the pass.** Fine over a tick; over a long absence a buff that ran
  out partway pays nothing for the part it covered. Use `overlapMs` in a step when that matters.
- **`buyCount` can return 0.** It means "you can afford none". `select.row` already takes care of it; if you call
  `buyCount` yourself, use `Math.max(1, ...)` for the label, or the row shows the price of nothing.
- **Feature order is behaviour.** Steps in the same phase run in the order the features are listed. A step that reads
  another feature's derived values in the same phase has to come after it (or be named first in `defineGame`'s
  `order`). Across phases the list order does not matter: the spoon reads `kettles.perSecond` at a press, long after
  `rates` set it.

## Next

[The first reset](07-the-first-reset.md): what happens to all of this when the player starts over for a bonus, and
which of these features should keep their state when they do.

## Reference

- Shelf: [Clicker](../clicker.md), [Generators](../generators.md), [Add a generator](../add-a-generator.md),
  [An upgrade tree](../upgrade-tree.md), [Spawns](../spawns.md), [Buffs](../buffs.md),
  [Time away](../time-away.md), [UI](../ui.md) (for `BuyAmount`) and [Gauges](../gauge.md).
- API: [`api/core/clicker.d.ts`](../../api/core/clicker.d.ts), [`api/core/gauge.d.ts`](../../api/core/gauge.d.ts),
  [`api/core/generators.d.ts`](../../api/core/generators.d.ts), [`api/core/cost.d.ts`](../../api/core/cost.d.ts),
  [`api/core/tree.d.ts`](../../api/core/tree.d.ts), [`api/core/graph/nodes.d.ts`](../../api/core/graph/nodes.d.ts),
  [`api/core/spawns.d.ts`](../../api/core/spawns.d.ts), [`api/core/buffs.d.ts`](../../api/core/buffs.d.ts),
  [`api/ui/tabs.d.ts`](../../api/ui/tabs.d.ts) (`BuyAmount`, `buyCount`).
- The whole example: [`docs/examples/guide-first-page.ts`](../examples/guide-first-page.ts), on Simmer's core in
  [`docs/examples/simmer/game-wallet.ts`](../examples/simmer/game-wallet.ts).
