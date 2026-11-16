# The first page

By the end of this chapter you will know the five systems that fill an idle game's opening page: a button that pays,
a meter that fills, a row of things that earn, a shop, and surprises that turn up to be caught. You will see each one
as a player meets it in VOID IF REMOVED, as the game's own code, and as a few lines of Simmer you can copy, so that the
page you build next is made of factory calls rather than hand-written loops.

## One pattern, five times

Every system in this chapter is built the same way, so it is worth seeing the shape once before the first one.

A system has three layers.

1. **A [kernel](../glossary.md#kernel).** Pure functions that do the arithmetic and touch nothing else: what the next
   ten burners cost, how far a meter moves in 250 milliseconds, when the next surprise arrives. You can call them from
   anywhere, including a test or a sim, because they take numbers and return numbers.
2. **A [feature](../glossary.md#feature) over the kernel.** A factory such as `generators({ ... })` returns a feature
   (chapter 3's unit of state plus behaviour) that saves the system's state under its `key`, gives the store its
   actions (`buy`, `click`, `catch`), and adds the [steps](../glossary.md#step) that move it on every tick and over a
   [catch-up](../glossary.md#catch-up). You list it in `defineGame` like any feature you wrote yourself.
3. **Something the screen reads.** The factory hangs its read-only questions on the feature it returns, so a screen
   can ask "what does the next one cost" without repeating the formula. On `generators` this object is called
   `.rules`.

The reason for the split is that the screen, the sim and the store all need the same answers. If the price formula
lived in a button's click handler, the sim would need its own copy, and the two would drift. With the split, the
feature's action and the screen's label both call the same kernel.

You will meet this shape five times below. Be warned that the third layer is the least regular: only `generators`
puts its questions about the state on `.rules`. The others carry what the screen needs under different names (the
gauge has a `.rules` too, but it holds only fixed bounds), or as free functions you import, and the chapter points out
each one as it comes.

One more word before the first system. Several factories take callbacks such as `power`, `mult` or `open` that read
"the whole game state". They are called with the store's state, typed as whatever you annotate the first parameter
with. Simmer annotates them with one hand-written type, so here it is:

```ts
/** The parts of the game the callbacks below read. Written by hand: the features read each other. */
export interface Simmer {
  wallet: { bubbles: Decimal };
  kitchen: TreeState;
  heat: GaugeState;
  burners: GeneratorsState;
  boosts: BuffsState;
}
```

`docs/examples/guide-first-page.ts`

The engine exports each factory's state type (`TreeState`, `GaugeState` and so on), so the hand-written part is only
the list of keys. VOID IF REMOVED does the same thing at a larger size with a type it calls `Reads`, and every excerpt
below annotates its callbacks with it.

## The tap: `clicker`

**What the player sees.** The first thing on VOID IF REMOVED's opening page is a pad marked FEED. Every press prints a
label, and the label counter goes up. Now and then a press comes out as a "clean print" and pays ten times as much.
Hammering the pad faster than a person could is quietly ignored.

**The factory.** `clicker({ key, wallet, currency, power, crit?, combo?, maxPerSecond?, onClick?, reset? })` makes a
feature with one action, `click()`. A click pays `power(state)` into the wallet, multiplied by the
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
export const press = clicker({
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

**Simmer's version.** You tap the pot, and it pays one bubble plus 2% of what the burners make a second, more on a hot
pot (the heat is the next section):

```ts
export const pot = clicker({
  key: "pot",
  wallet,
  currency: "bubbles",
  // The tap stat, plus 2% of what the burners make a second, up to twice that on a hot pot.
  power: (s: Simmer) => {
    const base = clickShare(statOf(s, "tap"), s.burners.perSecond.bubbles ?? ZERO, 0.02);
    return base.mul(1 + gaugeFill(s.heat, HEAT.max));
  },
  crit: () => ({ chance: 0.03, mult: 10 }),
  maxPerSecond: 20,
  // The press warms the pot. Written into the draft by hand: the gauge has no draft helper.
  onClick: (d: Draft<Simmer>) => {
    d.heat.level = Math.min(HEAT.max, d.heat.level + HEAT.perTap);
  },
});
```

`docs/examples/guide-first-page.ts`

Line by line:

- `key: "pot"` is where the clicker saves its counters (presses ever, crits ever, the best press). The action is then
  `store.getState().pot.click()`.
- `wallet` is chapter 4's currencies feature, and `currency` is which balance a press pays into.
- `power` is the kernel's `clickShare(base, perSecond, share)`, which is `base + perSecond × share`. `statOf(s, "tap")`
  is the tap's base after the kitchen's upgrades; you will see it in the shop section.
- `crit` returns `{ chance, mult }`. It is a function of the state so an upgrade can raise the chance later.
- `maxPerSecond` counts presses in one-second windows of [game time](../glossary.md#game-time) and drops the rest.
- `onClick` runs inside the same [draft](../glossary.md#draft) as the payment, so anything that should happen on a
  press (warming the pot here) lands in the same state change.

The clicker's screen-side pieces are the action's return value (to flash "crit!") and two free functions,
`comboAt` and `comboShown`, for a combo meter. There is no `.rules` object. The feature also carries `.press(draft,
now)`, the same press for use inside another recipe: a [draft helper](../glossary.md#draft-helper), like the
wallet's `credit` in chapter 4.

The rest of the clicker, including the combo and the reset rule, is on the shelf in [Clicker](../clicker.md).

## The heat: `gauge`

**What the player sees.** The FEED pad glows with the printhead's heat, which climbs as you press and sinks when you
stop. A hot head prints more: at full heat, up to twice as much.

**The factory.** `gauge({ key, max, rate, trip?, awayRate?, onTrip?, reset? })` is a bounded level, a [gauge](../glossary.md#gauge). Every tick its
step moves the level by `rate(state)` per second and clamps it between 0 and `max`. With a `trip`, reaching the top
locks the gauge for a while and drops the level, which is how you build a boiler that can blow. Without one, the level
just stays at `max`. Over a catch-up it uses `awayRate` instead, which by default drains the whole gauge in an hour, so
a player comes back to a cool meter. The kernel underneath is `stepGauge`, and the readers are free functions:
`gaugeFill(state, max)` (0 to 1), `gaugeLocked(state, now)` and `secondsToTrip(state, perSecond, max)`.

The game's heat never trips and survives the first reset:

```ts
export const heat = gauge({
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
second. A single tap warms it too, and that happens in the clicker's `onClick`, which writes `d.heat.level` directly,
capped at `HEAT.max`. Reading it is a single selector on the screen,
`useGameState((g) => g.heat.level)`, and the game turns the level into a print multiplier in its stat bus:

```ts
    const full = HEAT.full + (add["heat.max"] ?? 0);
    const heat = 1 + (full - 1) * (s.heat.level / HEAT.max);
    if (heat > 1) mul("heat", "print", heat);
```

VOID IF REMOVED, `src/game/bus.ts`

**Simmer's version.** The pot cools by six a second, and each tap warms it by four (that was the clicker's `onClick`
above). The clicker's `power` multiplies by `1 + gaugeFill(s.heat, HEAT.max)`, so a pot at full heat pays a tap twice.

```ts
export const HEAT = { max: 100, perTap: 4, cooling: 6 };

/** The pot's heat, 0 to 100. Taps warm it (see `pot` below); it cools on its own. A hot pot pays up to twice a tap. */
export const heat = gauge({
  key: "heat",
  max: HEAT.max,
  rate: () => -HEAT.cooling,
});
```

`docs/examples/guide-first-page.ts`

Here the pattern bends. A gauge's feature carries `.rules`, but on a gauge that is `{ max, trip }`, its fixed bounds,
not functions over the state as on `generators`. And a gauge's only action, `nudge(amount)`, works from outside a
recipe; there is no draft helper. That is why both the game and Simmer raise the level by assigning
`d.heat.level` inside the clicker's `onClick`, which also means a tap could never trip a gauge that had a `trip`.

The gauge has no page of its own on the shelf yet; its reference is the "Gauges" section of the
[README](../../README.md#gauges).

## The generators: `generators`

**What the player sees.** Below the pad is a list of stations, the things in the warehouse that print labels on their
own. Each row shows how many you own, what they make a second, a small meter towards the next count at which that
station doubles, and a buy button whose price climbs with every purchase. A switch at the top of the list picks how
many a press buys: one, ten, up to the next doubling, or as many as you can afford. Only the first station you do
not own yet is shown in full; the two after it are blacked out. When every station reaches a "full shift" count, the whole
floor's output triples. Close the game, and the stations keep working at half rate, for up to eight hours.

**The factory.** `generators({ key, wallet, list, global?, mult?, open?, automated?, away?, reset? })` is the building
list every idle game has. Each entry in `list` is a `GeneratorDef`: an `id`, a `cost` curve, the currency it `pays`
with and the one it `makes`, and either a `rate` (per one owned, per second) or a timed `cycle`. [`milestones`](../glossary.md#milestone) on the
owned count multiply that generator's output; `global` milestones apply to all of them once the lowest owned count
reaches them. `mult(state, def)` is your game's own multiplier, and `away(state)` says what share of an absence the
list is paid and for how long at most. Your own fields, such as a `name`, ride along on each entry.

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

This is the one factory that has a proper `.rules`, and the game's list reads it for every row:

```tsx
  const [mode, setMode] = useState<BuyMode>(1);
  const balance = st.wallet[MAIN];
  const list = stations.rules.list;
  // Everything owned, and the first one that is not: the floor grows a station at a time.
  const firstUnowned = list.findIndex((def) => (st.stations.owned[def.id] ?? 0) === 0);
  const shown = firstUnowned < 0 ? list : list.slice(0, firstUnowned + 1);
  // ...
        {shown.map((def) => {
          const owned = st.stations.owned[def.id] ?? 0;
          const open = stations.rules.open(st, def.id);
          const affordable = stations.rules.affordable(st, def.id);
          const until = stations.rules.untilMilestone(st, def.id) ?? 1;
          const count = Math.max(1, buyCount(mode, { affordable, untilNext: until }));
          const price: Decimal = stations.rules.price(st, def.id, count);
          const can = open && price.lte(balance);
          const rate = owned > 0 ? stations.rules.rate(st, def.id) : ZERO;
```

VOID IF REMOVED, `src/screens/Feed.tsx`

The buy modes come from `watchpot/ui`. `BuyMode` is `number | "max" | "next"`, the `BuyAmount` component is the
switch, and `buyCount(mode, { affordable, untilNext })` turns the chosen mode into a count. The count goes to
`rules.price` for the label and to `stations.buy(def.id, count)` on the click. The blacked-out rows are the game's
own idea: it slices the list after the first station you do not own.

**Simmer's version.** Two burners on the stove, both doubling at 10, 25, 50 and 100, and tripling together once both
reach 25:

```ts
const DOUBLINGS = [10, 25, 50, 100].map((at) => ({ at, gives: { mult: 2 } }));

export const burners = generators({
  key: "burners",
  wallet,
  list: [
    {
      id: "burner",
      name: "Burner",
      cost: { base: 10, growth: 1.15, round: "ceil" },
      pays: "bubbles",
      makes: "bubbles",
      rate: 0.5,
      milestones: DOUBLINGS,
    },
    {
      id: "kettle",
      name: "Kettle",
      cost: { base: 150, growth: 1.15, round: "ceil" },
      pays: "bubbles",
      makes: "bubbles",
      rate: 6,
      milestones: DOUBLINGS,
    },
  ],
  global: [{ at: 25, gives: { mult: 3 } }], // once every burner and kettle reaches 25
  mult: (s: Simmer) => statOf(s, "burner"),
  away: () => ({ rate: 0.5, capMs: 8 * HOUR_MS }), // half pay while you are gone, for up to 8 hours
});
```

`docs/examples/guide-first-page.ts`

And the row a screen would draw, as a plain function with no React in it, so you can see every question the row asks:

```ts
/** One burner row: what it shows and what its button would buy, for the chosen buy mode. */
export function burnerRow(s: Simmer, id: string, mode: BuyMode) {
  const affordable = burners.rules.affordable(s, id);
  const untilNext = burners.rules.untilMilestone(s, id);
  const count = Math.max(1, buyCount(mode, { affordable, untilNext: untilNext ?? 1 }));
  const price = burners.rules.price(s, id, count);
  return {
    owned: burners.rules.owned(s, id),
    perSecond: fmt(burners.rules.rate(s, id)).text,
    untilNext,
    count,
    price: fmt(price).text,
    canBuy: burners.rules.open(s, id) && price.lte(s.wallet.bubbles),
  };
}
```

`docs/examples/guide-first-page.ts`

`Math.max(1, ...)` is there because `buyCount` returns 0 when you can afford none, and a row still wants to show the
price of one. `untilMilestone` returns `null` past the last milestone, which is why the `?? 1`.

One inconsistency to know about: the callbacks you pass in (`mult`, `open`, `automated`) receive the generator's whole
definition, `(state, def)`, but the `.rules` functions you call take its id, `(state, id)`. Inside `mult` you write
`def.id`; on a screen you pass `def.id`.

How time away is reported to the player, and why the half rate matters, is chapter 9. The rest of the factory,
including cycles and managers, is in [Generators](../generators.md) and
[Add a generator](../add-a-generator.md).

## The shop: `upgradeTree`

**What the player sees.** Beside the stations is a shelf of supplies, things you buy once with labels: fresh ribbon
that doubles a press, spindle tension that doubles the first station, loose labels that let labels get loose (the
next section). Most items are there from the start; some wait until you own the station they improve, and some
until the run reaches a later stage.
Everything on it is gone again after the first reset.

**The factory.** An [upgrade tree](../glossary.md#upgrade-tree) is a set of nodes, each bought one rank at a time. `upgradeTree({ key, nodes, wallet,
open?, milestone?, reset? })` saves the ranks under `key`, and its actions are `buy(id)` and `buyMax(id, limit?)`.
Each node is a `GraphNode`: an `id`, `name` and `line`, a `cost` in one or more currencies, a `costGrowth` per rank,
a `maxLevel`, the node ids it `requires`, and its `effects`. A tree does not need to look like a tree. With
`maxLevel: 1` and no requirements, it is a shop.

Why use a tree for a shop rather than a list of booleans? Because the tree already does the parts you would otherwise
write: the price per rank, the "requires", the refusal with a reason when you cannot afford it, and the
[effects](../glossary.md#effect) folded into a [stat bus](../glossary.md#stat-bus) with `busOf`.

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

**Simmer's version.** Four things for the kitchen: salt doubles a tap, a wooden spoon adds a bubble a tap for five
ranks, a lid doubles the burners once you own one, and a ladle lets big bubbles rise. Two of them:

```ts
type Upgrade = GraphNode<Effect, "bubbles">;

const UPGRADES: readonly Upgrade[] = [
  {
    id: "salt",
    name: "A pinch of salt",
    line: "Taps bring up twice the bubbles.",
    cost: [{ currency: "bubbles", amount: 25 }],
    maxLevel: 1,
    requires: [],
    effects: [{ stat: "tap", mult: 2 }],
  },
  {
    id: "spoon",
    name: "A wooden spoon",
    line: "One more bubble a tap, each rank.",
    cost: [{ currency: "bubbles", amount: 100 }],
    costGrowth: 2,
    maxLevel: 5,
    requires: ["salt"],
    effects: [{ stat: "tap", add: 1 }],
  },
  // ...
];

/** Whether an upgrade is on the shelf: the lid waits until there is a burner to put it on. */
export const onOffer = (s: Simmer, node: Upgrade): boolean =>
  node.id !== "lid" || (s.burners.owned.burner ?? 0) > 0;

export const kitchen = upgradeTree({ key: "kitchen", nodes: UPGRADES, wallet, open: onOffer });

// ...

/** A stat's value from the kitchen's ranks: 1, plus its adds, times its mults. Chapter 8 does this properly. */
export const statOf = (s: Pick<Simmer, "kitchen">, stat: "tap" | "burner"): number =>
  statValue(busOf(kitchen.tree.contributions(s.kitchen.ranks)), stat, 1);
```

`docs/examples/guide-first-page.ts`

`Effect` is the engine's `{ stat, add?, mult? }`. `kitchen.tree.contributions(ranks)` lists every rank held as an
effect, `busOf` folds them into totals per stat, and `statValue(bus, "tap", 1)` gives `(1 + adds) × mults`. That is
where the clicker's `statOf(s, "tap")` and the burners' `mult` came from. Folding the bus on every call is fine for
four upgrades; chapter 8 shows how a bigger game folds it once a pass.

The screen side is `.tree`, not `.rules`: the tree's rules over a ranks record (`price`, `check`, `affordable`,
`contributions`). Note what it does not know. `.tree.check` and `.tree.affordable` know nothing about `open`, and the
feature does not hand your `open` back to you. So keep your own `open` function where the screen can import it, as
Simmer does with `onOffer` and the game does with `offered`:

```ts
/** The kitchen shelf: what is on offer, what the next rank costs, and whether it can be bought now. */
export function shelf(s: Simmer) {
  return kitchen.tree.nodes
    .filter((node) => onOffer(s, node))
    .map((node) => {
      const owned = s.kitchen.ranks[node.id] ?? 0;
      const next = kitchen.tree.price(node, owned)?.[0];
      return {
        id: node.id,
        name: node.name,
        line: node.line,
        owned,
        price: next ? fmt(next.amount).text : null, // null: bought out
        canBuy: kitchen.tree.check(node.id, s.kitchen.ranks, () => s.wallet.bubbles) === null,
      };
    });
}
```

`docs/examples/guide-first-page.ts`

The game also has a "stock up" button that buys everything on the shelf it can afford, cheapest first. The engine has
no such call across a tree (only `buyMax` on one node), so the game wrote that loop itself.

The rest is in [An upgrade tree](../upgrade-tree.md); the stat bus is [chapter 8](08-effects.md) and
[The stat graph](../stat-graph.md).

## Surprises and timed boosts: `spawns` and `buffs`

**What the player sees.** A few minutes in, once you have bought loose labels, a label occasionally drifts out of the
printer's slot. It stays for a few seconds. Click it in time and you get one of three things: a hot run, a whole box,
or a double feed. A box pays a lump of labels at once. The two runs are timed boosts: a chip under the pad shows the
run's name, its multiplier and the seconds left.

**The factories.** These are two systems that work as a pair.

`spawns({ key, kinds, onCatch?, reset? })` is random arrivals, each a [spawn](../glossary.md#spawn). Each kind has a `wait` between arrivals (`minMs`,
`maxMs`, and an optional `ramp` that makes late arrivals likelier), a `lifeMs` it stays catchable, an `outcomes` table
of weights, and an optional `active(state)` that holds it back. Its step brings every kind up to the current
[game time](../glossary.md#game-time), and its action `catch(kind)` draws an outcome and runs your `onCatch(draft,
outcome, now, kind)` in the same recipe. Every draw is on the kind's own saved random stream. The screen reads
`state.<key>.kinds[kind].live`, which is `null` or `{ id, bornAt, diesAt }`.

`buffs({ key, list, onEnd?, reset? })` is timed effects, each a [buff](../glossary.md#buff). Each entry has an `id`, a `durationMs`, a `stack` rule for
starting it while it runs (`"refresh"`, `"extend"`, `"stack"` or `"ignore"`) and its `effects`. The readers are free
functions: `buffActive(state, id, now)`, `buffLeftMs(state, id, now)` and `overlapMs(state, id, from, to)`, which says
how much of a stretch of time the buff covered.

The game calls its arrivals misfeeds:

```ts
export const misfeeds = spawns({
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
      wallet.credit(d, MAIN, shadowRate(d).mul(MISFEED.boxSeconds).mul(mulOf(d, "misfeed.power")));
      return;
    }
    // ...
  },
});
```

VOID IF REMOVED, `src/game/misfeeds.ts`

The trimmed `onCatch` line starts the buff named by the outcome with the buffs feature's draft helper,
`boosts.start(d, outcome, now, ...)`. Note that `wait` is a function of the state, so an upgrade can bring misfeeds
sooner. The buffs themselves:

```ts
export const boosts = buffs<"boosts", Fx>({
  key: "boosts",
  list: [
    { id: "hot-run", durationMs: MISFEED.hotRun.seconds * 1000, stack: "refresh", effects: () => [] },
    { id: "double-feed", durationMs: MISFEED.doubleFeed.seconds * 1000, stack: "refresh", effects: () => [] },
  ],
});
```

VOID IF REMOVED, `src/game/misfeeds.ts`

The `effects` are empty. The game asks whether a run is active while it folds its stat bus, and multiplies there:

```ts
  const power = 10 ** (log["misfeed.power"] ?? 0);
  if (buffActive(s.boosts, "hot-run", now)) mul("boosts:hot-run", "print", MISFEED.hotRun.mult * power);
  if (buffActive(s.boosts, "double-feed", now))
    mul("boosts:double-feed", "press", MISFEED.doubleFeed.mult * power);
```

VOID IF REMOVED, `src/game/bus.ts`

There is a reason for the empty list, and you will hit it too. A buff is about time: whether it is running depends on
`now`. But the callbacks the other factories take (the clicker's `power`, the generators' `mult`) are given only the
state, never `now`. So a buff's effects cannot be read from inside them. The game gets around it by folding its stats
in a step of its own, which does have `ctx.now`, and storing the result in state for the callbacks to read. Chapter 8
shows that step.

On the screen, catching is one call, and the chip under the pad uses `buffLeftMs`:

```tsx
      onClick={() => store.getState().misfeeds.catch(MISFEED_KIND)}
```

VOID IF REMOVED, `src/screens/Feed.tsx`

**Simmer's version.** Once you own the ladle, a big bubble rises now and then. Catch it for a splash (a minute of
burner output, at least 25 bubbles) or a rolling boil (thirty seconds of the burners paying seven times over).

```ts
export const surface = spawns({
  key: "surface",
  kinds: [
    {
      id: "big-bubble",
      wait: { minMs: 45_000, maxMs: 150_000, ramp: { power: 3, stepMs: 1000 } },
      lifeMs: 12_000,
      active: (s: Simmer) => has(s, "ladle"),
      outcomes: [
        { id: "splash", weight: 60 },
        { id: "rolling-boil", weight: 40, noRepeat: true },
      ],
    },
  ],
  onCatch: (d: Draft<Simmer>, outcome, now) => {
    if (outcome === "splash") {
      const minute = (d.burners.perSecond.bubbles ?? ZERO).mul(60);
      wallet.credit(d, "bubbles", minute.max(25));
      return;
    }
    boosts.start(d, outcome, now);
  },
});
```

`docs/examples/guide-first-page.ts`

`active` keeps big bubbles away until the ladle is bought; while it is false, nothing arrives, and the wait starts
over once it holds. `noRepeat` means two rolling boils never come back to back. `wallet.credit(d, ...)` and
`boosts.start(d, ...)` are draft helpers: you are already inside a recipe in `onCatch`, so you change the draft you
hold rather than calling a store action.

Simmer pays the rolling boil without the stat-bus step, using the one tool the buffs factory gives for exactly this,
`overlapMs`, inside a small feature of its own:

```ts
/** The rolling boil pays the burners' rate six more times over, for the part of each pass it covered. */
export const boil = feature({
  key: "boil",
  reach: [wallet, burners, boosts],
  initial: () => ({ paid: ZERO }),
  steps: {
    produce: {
      rolling: (d, ctx) => {
        const covered = overlapMs(d.boosts, "rolling-boil", ctx.now - ctx.dtMs, ctx.now);
        if (covered <= 0) return;
        const extra = (d.burners.perSecond.bubbles ?? ZERO).mul((ROLLING_BOIL.extra * covered) / 1000);
        wallet.credit(d, "bubbles", extra);
        d.boil.paid = d.boil.paid.add(extra);
      },
    },
  },
});
```

`docs/examples/guide-first-page.ts`

The step runs in `produce`, after the generators worked out `perSecond` in `rates` and after the buffs feature
expired anything finished in `sync`. A buff that ended halfway through a pass is kept in `ended` with its window, so
`overlapMs` still pays the half it covered. A screen reads `state.surface.kinds["big-bubble"].live` to draw the
bubble, calls `store.getState().surface.catch("big-bubble")` on a click, and shows
`buffLeftMs(state.boosts, "rolling-boil", now)` as a countdown.

The rest is in [Spawns](../spawns.md) and [Buffs](../buffs.md).

## Putting the page together

All of it goes in one `defineGame`:

```ts
export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  // Steps of one phase run in this order (chapter 3). `boil` reads `burners.perSecond` from the earlier `rates`.
  features: [wallet, kitchen, heat, burners, pot, boosts, surface, boil],
  vocab: SIMMER,
});
```

`docs/examples/guide-first-page.ts`

Count what you did not write: no price loop, no buy-max, no crit roll, no random timer, no offline payout, no
milestone check. Each of those is a kernel function a factory already calls. What is left is content (the numbers,
the names) and the few lines where your game's systems touch each other: the tap warming the pot, the ladle letting
bubbles rise, the rolling boil paying the burners.

Run the file to watch it work: `bun docs/examples/guide-first-page.ts` taps the pot, buys a burner, lets a minute
pass on a fake clock and prints the rows a screen would draw.

## Things that bite

- **A brief tab switch counts as time away.** When the tab is hidden and shown again, the clock sends the gap, however
  short, through a catch-up. With `away: () => ({ rate: 0.5, ... })` a two-second alt-tab is paid at half rate too.
  Spawns keep their own clock through the gap, so a big bubble whose life ran out while the tab was hidden is counted
  as missed, never paid.
- **Callbacks get the state, not the time.** `power`, `crit`, `mult`, `open`, `rate`, `wait` and `active` never see
  `now`. Anything time-based (a buff, a gauge's lock) has to reach them through state that a step wrote, or be paid in
  a step of its own, as the rolling boil is.
- **The tree's own checks ignore `open`.** `.tree.check` and `.tree.affordable` will happily say yes to a node your
  `open` hides. Filter by your own `open` function first, and keep that function exported for the screen.
- **`buyCount` can return 0.** It means "you can afford none". Use `Math.max(1, ...)` for the label, or the row shows
  the price of nothing.
- **Writing into another feature's slice skips its rules.** Setting `d.heat.level` from the clicker's `onClick` works
  because Simmer's gauge has no `trip`; with one, a tap that fills the gauge would not trip it. Clamp it yourself and
  keep tripping gauges to `rate` or the `nudge` action.
- **Feature order is behaviour.** Steps in the same phase run in the order the features are listed. A step that reads
  another feature's derived values in the same phase has to come after it (or be named first in `defineGame`'s
  `order`). Across phases the list order does not matter: `boil` reads `perSecond` in `produce`, after `rates` set it.

## Next

[The first reset](07-the-first-reset.md): what happens to all of this when the player starts over for a bonus, and
which of these features should keep their state when they do.

## Reference

- Shelf: [Clicker](../clicker.md), [Generators](../generators.md), [Add a generator](../add-a-generator.md),
  [An upgrade tree](../upgrade-tree.md), [Spawns](../spawns.md), [Buffs](../buffs.md),
  [Time away](../time-away.md), [UI](../ui.md) (for `BuyAmount`), and the README's
  [Gauges](../../README.md#gauges) section.
- API: [`api/core/clicker.d.ts`](../../api/core/clicker.d.ts), [`api/core/gauge.d.ts`](../../api/core/gauge.d.ts),
  [`api/core/generators.d.ts`](../../api/core/generators.d.ts), [`api/core/cost.d.ts`](../../api/core/cost.d.ts),
  [`api/core/tree.d.ts`](../../api/core/tree.d.ts), [`api/core/graph/nodes.d.ts`](../../api/core/graph/nodes.d.ts),
  [`api/core/spawns.d.ts`](../../api/core/spawns.d.ts), [`api/core/buffs.d.ts`](../../api/core/buffs.d.ts),
  [`api/ui/tabs.d.ts`](../../api/ui/tabs.d.ts) (`BuyAmount`, `buyCount`).
- The whole example: [`docs/examples/guide-first-page.ts`](../examples/guide-first-page.ts).
