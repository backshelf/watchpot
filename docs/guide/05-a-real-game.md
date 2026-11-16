# A real game, opened up

Simmer's rules fit in one file, which is right for learning and wrong for a game you mean to finish. This chapter opens a finished game built on watchpot, shows you how its files are laid out and why, and follows one thing on its first page from the line of data that describes it to the button that buys it. By the end you will be able to open any watchpot game and find where a thing lives.

## The game

The game is called VOID IF REMOVED. Its first screen says what it is about:

*VOID IF REMOVED, src/content/words.ts*

```ts
export const NAME = "VOID IF REMOVED";
/** The save key's and the game id's stem (a codename: the title stays out of the file tree). */
export const SLUG = "opus";
/** The build's revision, as the page prints it: `package.json`'s version (a test holds the two together). */
export const REVISION = "0.1.0";
export const PREMISE =
  "A thermal label printer in a warehouse back office has woken up. It calls itself TAG. You are the temp who presses FEED.";

/** The currency the stations make and the supplies cost. */
export const MAIN = "labels";
```

TAG talks to you the whole time, in short lowercase lines, fond of you and a little ominous. The first hour is the same loop as Simmer with more on top. You tap a pad marked FEED and each press prints labels. Labels buy stations (the game's generators), which print labels by themselves. Labels also buy supplies, small one-off upgrades. Stamps (the game's achievements) mark what you have done, and before long you can start the roll over for a new currency, cores, which is the game's first reset. Three pages are open by then: Feed, Stamps and Roll.

The game's repository is private, so this guide names its files rather than linking them. Every excerpt below is the game's code as it stands, trimmed with `// ...` where lines belong to parts of the game you have not met yet.

## Why a real game is split up

Simmer keeps its bubbles, its burner, its prices and its rules in one `game.ts`, with the page beside it in `main.tsx`. That works while there is one of each. VOID IF REMOVED has ten stations, dozens of supplies, a wall of stamps and a narrator with something to say on every page. If all of that sat beside the rules, you could not change a price without reading code, and you could not change a rule without scrolling past a thousand lines of words.

So a watchpot game splits along one question: is this a fact about the game's world, or is it how the world works?

| Folder | What lives there | Example in this game |
|---|---|---|
| `src/content/` | Data and words: names, lines, prices, rates, when things should arrive | `stations.ts`, `feed.ts`, `words.ts`, `stamps.ts` |
| `src/game/` | [Features](../glossary.md#feature): the rules, each built on an engine [factory](../glossary.md#factory) | `feed.ts` (the stations, the pad, the heat), `roll.ts`, `game.ts` |
| `src/app/` | The page's frame: boot, tabs, the counter, settings, sound wiring, the store hooks | `App.tsx`, `hooks.ts`, `screens.tsx` |
| `src/screens/` | One screen per page, reading state and calling actions | `Feed.tsx`, `Stamps.tsx`, `Roll.tsx` |
| `src/ui/` | The game's own components, styled, over the engine's [headless](../glossary.md#headless) ones | `Btn.tsx`, `Meter.tsx`, `Plate.tsx` |
| `src/shaders/` | GLSL, one file per surface | the backdrop, the FEED pad |
| `src/fx/` | Celebrations: what answers a buy, a stamp, a reset | `Cheers.tsx`, `Away.tsx` |
| `sim/` | The simulated player that proves the pacing | `play.ts`, `fit.ts` |
| `test/` | Tests for what can break in the rules | `shops.test.ts` |

The game's own working notes put the rule in one line: numbers and words live in `src/content/`, rules live in the feature in `src/game/`, and looks live in the screen, the component's CSS module or the theme. When you want to change something, that line tells you which folder to open.

The dependency arrows point one way. Content is plain data and knows nothing of features. Features import content and the engine. Screens import features (to call their rules) and content (for their words). Nothing in `src/game/` runs React code (one file borrows a type from `watchpot/react`, which disappears when the code is compiled), so the rules run the same in a test or the simulated player as on the page. The one wobble you will find is that a few content files hold small functions, such as the condition a page opens on, and those import a helper from `src/game/reads.ts`. A condition is half data and half rule, and this game chose to keep it next to the words.

The template that `/watchpot` scaffolds lays a new game out the same way (`src/content`, `src/game`, `src/app`, `src/screens`, `src/ui`, `src/shaders`, `sim`), so this map holds for any watchpot game. [Chapter 13](13-from-the-template.md) walks the template itself.

## One thing, end to end

The rest of this chapter follows one supply on the Feed page. It is called Darkness +1, and buying it multiplies everything the stations print by 1.25. To get from that sentence to a bigger number on screen, it passes through five places:

1. **Content** describes the stations and the supply.
2. **Features** turn that content into engine factories: the stations become a `generators` feature, the supplies an `upgradeTree`.
3. **The stats** fold every bought effect into named numbers, once a pass.
4. **The screen** reads the state, shows the rate and calls `buy`.
5. **`defineGame`** lists every feature, in the order their steps run.

### 1. Content: the stations and the supplies

Here is the start of the stations' data.

*VOID IF REMOVED, src/content/stations.ts*

```ts
import type { CostCurve } from "watchpot/core";

/** A station: something in the building that prints or sticks labels once TAG has it. */
export interface StationDef {
  id: string;
  name: string;
  line: string;
  cost: CostCurve;
  /** Labels one makes a second, before the stats. */
  rate: number;
}

const GROWTH = 1.15;
const st = (id: string, name: string, line: string, base: number, rate: number): StationDef => ({
  id,
  name,
  line,
  cost: { base, growth: GROWTH, round: "floor" },
  rate,
});

/** Cheapest first. Each costs about fourteen times the last and pays itself back a little slower. */
export const STATIONS: readonly StationDef[] = [
  st("spare-roll", "Spare roll", "more of me, on a spindle.", 10, 0.4),
  st("tape-gun", "Tape gun", "it has a trigger. i am not allowed one.", 250, 4),
  st("price-gun", "Price gun", "ka-chunk. nine cents. ka-chunk.", 9000, 60),
  // ...
];
```

Read it from the top:

- `StationDef` is the game's own shape for a station. Only `cost` comes from the engine: `CostCurve` is watchpot's price curve, a base price and a growth per one owned (the same curve your burner used in Simmer).
- `st` is a small helper so each station fits on one line. Every station grows its price by 1.15 per one owned and rounds down.
- `STATIONS` is the list. Each line is an id, a name, TAG's line about it, a base price and labels a second.

Nothing here says how a station pays, when it can be bought or what multiplies it. Those are rules, and they live in the feature.

The same file holds the milestones, the owned counts at which a station doubles, and the "full shift" counts at which every station on the floor triples:

*VOID IF REMOVED, src/content/stations.ts*

```ts
/** Owned counts at which a station doubles: close together early, then every hundred. */
export const MILESTONES: readonly number[] = [
  10,
  25,
  50,
  100,
  // ...
];
export const MILESTONE_MULT = 2;

/** Counts every station must reach for the whole floor to triple. */
export const FULL_SHIFTS: readonly number[] = [
  25, 50, // ...
];
export const FULL_SHIFT_MULT = 3;
```

The supplies are written in a shape of the game's own, a `Shop` of `Item`s, each with a list of effects. The shape is short:

*VOID IF REMOVED, src/content/model.ts*

```ts
/** One effect of one rank: a multiplier on a stat, or an amount added to its base. */
export interface Fx {
  stat: StatId;
  mul?: number;
  add?: number;
  /** A multiplier too large to write as a number, in orders of magnitude (`500` is ×1e500). */
  log?: number;
}
// ...
/** Shorthands for writing effects. */
export const print = (mul: number): Fx => ({ stat: "print", mul });
export const station = (n: number, mul: number): Fx => ({ stat: `station.${n}`, mul });
export const mul = (stat: StatId, m: number): Fx => ({ stat, mul: m });
// ...
/** An item: id, name, line, the hour, what it does, and anything else. */
export const item = (
  id: string,
  name: string,
  line: string,
  at: number,
  fx: readonly Fx[],
  more: Partial<Item> = {},
): Item => ({ id, name, line, at, fx, ...more });

/** Minutes as hours, for the first tier's plan. */
export const min = (m: number) => m / 60;
```

An `Fx` is an [effect](../glossary.md#effect): it names a [stat](../glossary.md#stat) (`print` is the multiplier on everything the stations make, `station.1` is the multiplier on the first station alone) and says what it does to it. Effects are data. They do nothing until some rule reads the stat they name, which is the third stop on this trip.

And here is the start of the supplies:

*VOID IF REMOVED, src/content/feed.ts*

```ts
/** The supplies: bought with labels, gone with the roll. In the order a roll reaches them. */
export const SUPPLIES: Shop = {
  id: "supplies",
  area: "feed",
  currency: "labels",
  depth: 1,
  items: [
    item("ribbon", "Fresh ribbon", "blacker blacks.", min(0.4), [mul("press", 2)]),
    item("tension", "Spindle tension", "tighter. no, tighter.", min(1), [station(1, 2)], { own: 1 }),
    item("thumb", "A stronger thumb", "yours. i am investing in you.", min(1.8), [mul("press", 2)]),
    item("tape-refill", "Tape refill", "the good tape. the loud tape.", min(2.5), [station(2, 2)], {
      own: 2,
    }),
    item("loose-labels", "Loose labels", "some get away. catch them.", min(3.2), [], { flags: ["misfeeds"] }),
    // ...
    item("darkness-1", "Darkness +1", "a setting. also a mood.", min(9.5), [print(1.25)]),
    // ...
  ],
};
```

Darkness +1 is the last line shown: id, name, line, `min(9.5)`, and one effect, print ×1.25.

Look closely at `min(9.5)`. It is not a price. It is the played hour this item should first be bought at, here nine and a half minutes in. The price is worked out by the game's pacing script, which plays the game and prices each item so that it lands at its planned time. [Chapter 12](12-proving-the-pacing.md) explains that process; for now, know that a supply's price is not in this file. `depth: 1` says which [reset](../glossary.md#depth) clears the shop: the first one, NEW ROLL, takes every supply back.

### 2. Features: the content on engine factories

A [feature](../glossary.md#feature) is a slice of state plus the rules that change it: its actions, and the steps it runs every pass of the clock. You met them in [chapter 3](03-the-mental-model.md). The engine ships factories that build common features from a description, and a real game builds almost every feature that way.

The stations are the engine's `generators`:

*VOID IF REMOVED, src/game/feed.ts*

```ts
/** A station as the engine's list holds it: the content, its number (from 1), and what it is bought with. */
type Station = GeneratorDef<Currency> & StationDef & { n: number; rate: number };

/**
 * The stations, on the engine's `generators`: each makes labels a second and doubles at its milestones; the floor
 * triples each time every station reaches a full shift. ...
 */
export const stations = generators({
  key: "stations",
  wallet,
  list: STATIONS.map(
    (st, i): Station => ({
      ...st,
      n: i + 1,
      pays: MAIN,
      makes: MAIN,
      milestones: MILESTONES.map((at) => ({ at, gives: { mult: MILESTONE_MULT } })),
    }),
  ),
  global: FULL_SHIFTS.map((at) => ({ at, gives: { mult: FULL_SHIFT_MULT } })),
  mult: (s: Reads, def: Station) =>
    // ...
    stationMult(s, def.n, s.stations.owned[def.id] ?? 0),
  // ...
  away: () => ({ rate: 0.5, capMs: 8 * HOUR_MS }),
});
```

Line by line:

- `key: "stations"` is where this feature's state lives in the store and in the save: `state.stations.owned`, and so on.
- `wallet` is the game's [currencies](../glossary.md#wallet) feature. The stations buy from it and pay into it.
- `Station` is the engine's generator shape joined with the game's own. `GeneratorDef` is either kind of generator, one that pays a steady rate or one that runs a timed cycle; on the current engine a list of rate generators like this one can say so directly with `RateGeneratorDef<Currency>`.
- `list` maps each content station into what the engine needs. `...st` carries the name, line, cost and rate along. `pays` and `makes` name the currency it is bought with and the one it makes, both labels here. `milestones` turns the content's list of counts into the engine's milestone shape: at each count, the output doubles. `n` is the game's own field, the station's number, which the stats use.
- `global` is the full shifts: milestones that apply to every station once the lowest owned count reaches them.
- `mult` is the hook this chapter is following. Every pass, the engine asks it for one station's multiplier from the rest of the game. The game answers with `stationMult`, which reads the stats (stop 3). The engine also hands `mult` a third argument, `{ now }`, the game time of the pass, for a multiplier that depends on time; this game does not need it, because its stats already account for time.
- `away` says what time away is worth: half the rate, for at most eight hours. [Chapter 9](09-saving-and-time-away.md) covers it.

The engine does everything else: the price of the next one from the cost curve, buying one or ten or as many as you can afford, the milestone and global multipliers, the labels a second, and paying them every tick. That is the point of the factory. The game wrote a description and one multiplier.

The lines cut from this excerpt belong to a part of the game you have not met yet.

The supplies go through a small helper of the game's own, because every shop in the game is written in the same `Shop` shape. The helper turns each content `Item` into the engine's tree node:

*VOID IF REMOVED, src/game/shops.ts*

```ts
/** An item as the tree prices it. */
export const nodeOf = (shop: Shop, it: Item): ShopNode => ({
  id: it.id,
  name: it.name,
  line: it.line,
  cost: [
    {
      currency: shop.currency,
      get amount() {
        return it.fixed ?? gate(itemGate(shop, it));
      },
    },
  ],
  costGrowth: it.growth ?? 1,
  maxLevel: it.max ?? 1,
  requires: it.needs ?? [],
  effects: it.fx,
  item: it,
});
```

and then hands the nodes to the engine's `upgradeTree`:

*VOID IF REMOVED, src/game/shops.ts*

```ts
export function shop<const K extends string>(key: K, def: Shop) {
  SHOP_LIST.push({ key, area: def.area });
  const nodes = def.items.map((it) => nodeOf(def, it));
  type MoveState = Reads & Record<K, TreeState & TreeActions<Currency>>;
  const tree = upgradeTree({
    key,
    nodes,
    wallet,
    reset: { depth: def.depth },
    open: (s: MoveState, node: ShopNode) => offered(s, node.item, s[key].ranks),
  });
  // ...
  return Object.assign(withMoves(tree, moves), { def, nodes });
}
```

So `supplies = shop("supplies", SUPPLIES)` is an `upgradeTree` feature saved under `supplies`, holding a rank per item, with a `buy(id)` action. `effects: it.fx` carries Darkness +1's `print(1.25)` onto the node. `reset: { depth: def.depth }` clears the ranks at the first reset. `open` keeps an item off the shelf until the game says it is on offer: here, until its tier has opened, the items it needs are held and the station it is for is owned. `withMoves` adds the moves the simulated player uses to shop, which [chapter 12](12-proving-the-pacing.md) returns to.

Two things in `nodeOf` deserve a note. The price is a getter, read each time the engine asks, so the pacing script can price an item while a run is under way. That works because the engine reads `amount` fresh every time it prices a rank, and its docs promise to keep doing so. And the two `?? 1` defaults work together: most supplies are bought once (`maxLevel: 1`), so a `costGrowth` of 1 never comes into play for them.

### 3. The stats: where effects become numbers

Buying Darkness +1 sets `state.supplies.ranks["darkness-1"]` to 1. Nothing else happens yet. Something has to walk every held item, collect its effects and turn them into the number `stationMult` reads. In a watchpot game that something is the [stat bus](../glossary.md#stat-bus): one place that folds every effect in the game into named stats, once a pass.

The stats are a feature with no actions, only a step:

*VOID IF REMOVED, src/game/stats.ts*

```ts
/**
 * The stats as every rule reads them, under `stats`: worked out once a pass in `rates` (after the heat has moved,
 * before the stations read it), never saved. Listed after the features it folds and before the ones that read it.
 *
 * A store that has just been built, loaded, imported or reset holds none, and the first pass's `sync` steps already
 * read them (a pool trims itself to what a flag allows), so the engine folds them there too (`derive`).
 */
export const stats = feature({
  key: "stats",
  initial: (): StatsState => ({ log: {}, add: {}, flags: {} }),
  transient: ["log", "add", "flags"],
  reset: "never",
  derive: (d: Folding, ctx) => {
    d.stats = fold(d, ctx.now);
  },
  steps: {
    rates: {
      fold: (d: Folding, ctx) => {
        d.stats = fold(d, ctx.now);
      },
    },
  },
});
```

- `feature({...})` is the engine's general factory, the one the others are built on.
- `transient` lists fields that are never saved. The stats can always be worked out again from what was bought, so saving them would only let a save go stale.
- `steps.rates.fold` runs in the `rates` [phase](../glossary.md#phase) of every pass and replaces `state.stats` with a fresh fold. `derive` runs the same fold right after a load or reset, before the first pass has had a chance to.

The fold itself, at its heart, is this:

*VOID IF REMOVED, src/game/bus.ts*

```ts
/** Folds every contribution at game time `now`. `onPart` hears each one, for a breakdown. */
export function fold(s: BusReads, now: number, onPart?: (part: Part) => void): StatsState {
  const log: Record<string, number> = {};
  const add: Record<string, number> = {};
  const flags: Record<string, boolean> = {};
  const mulLog = (source: string, stat: string, l: number) => {
    log[stat] = (log[stat] ?? 0) + l;
    onPart?.({ source, stat, log: l });
  };
  const mul = (source: string, stat: string, value: number) => mulLog(source, stat, Math.log10(value));
  const plus = (source: string, stat: string, value: number) => {
    add[stat] = (add[stat] ?? 0) + value;
    onPart?.({ source, stat, add: value });
  };
  const apply = (source: string, fx: readonly Fx[], times = 1) => {
    for (const f of fx) {
      if (f.mul !== undefined) mulLog(source, f.stat, Math.log10(f.mul) * times);
      if (f.log !== undefined) mulLog(source, f.stat, f.log * times);
      if (f.add !== undefined) plus(source, f.stat, f.add * times);
    }
  };
  // ...
```

Below this, the function walks each shop and calls `apply` on every held item's effects, with `times` set to the ranks held. Darkness +1 adds `log10(1.25)` to `log.print`. Multipliers are summed as logarithms, so a stat can grow past what a JavaScript number holds and the order effects are added in never matters. `onPart` lets a tooltip ask "where did this number come from" with the same walk.

Rules read the result through four small helpers:

*VOID IF REMOVED, src/game/reads.ts*

```ts
/** A stat's multiplier, in log10 (0 with nothing raising it). */
export const logOf = (s: WithStats, stat: StatId): number => s.stats.log[stat] ?? 0;
/** A stat's multiplier. */
export const mulOf = (s: WithStats, stat: StatId): Decimal => Decimal.pow10(logOf(s, stat));
/** What has been added to a stat's base. */
export const addOf = (s: WithStats, stat: StatId): number => s.stats.add[stat] ?? 0;
/** Whether anything held raises the flag. */
export const has = (s: WithStats, flag: Flag): boolean => s.stats.flags[flag] === true;
```

And now the trip closes. This is the multiplier the stations feature asked for:

*VOID IF REMOVED, src/game/feed.ts*

```ts
/** A station's multiplier from the stats (the milestones are the engine's own). */
function stationMult(s: Reads, n: number, owned: number): Decimal {
  let log = logOf(s, "print") + logOf(s, `station.${n}`);
  // ...
  return D(10).pow(log);
}
```

`print` (Darkness +1 lives here) plus this station's own `station.<n>`, turned back from a logarithm into a [Decimal](../glossary.md#decimal). The engine multiplies the station's base rate, its owned count and its milestones by it, and that is the labels a second you see.

**Where the game goes its own way.** The engine ships a stat bus of its own: `busOf` and `statValue` in `watchpot/core`, which the template's `src/game/bus.ts` uses, and a live stat graph, `liveIndex`, described in [the stat graph page](../stat-graph.md). VOID IF REMOVED uses neither. It folds its own, in log10, with its own breakdown type. The shape is the same in both (a `bus.ts` that knows every source, a `stats` feature that runs it in `rates`, rules that read the result), so what you learn here carries over, but the code is not the engine's. [Chapter 8](08-effects.md) teaches effects on the engine's own bus; read this one as a picture of the pattern, not a recipe to copy.

Notice also the type every callback above is annotated with, `Reads`. It is the whole game state as a rule sees it, and this game writes it out by hand in `src/game/reads.ts`. A feature cannot import the finished game's state type (`StateOf<typeof game.features>`) because the game imports the features, and the import would go in a circle. So when you add a feature to this game, you also add its slice to `Reads`.

### 4. The screen: reading state and calling an action

The screen for the stations is a React component in `src/screens/Feed.tsx`. Here it is with the layout trimmed out:

*VOID IF REMOVED, src/screens/Feed.tsx*

```tsx
/** The stations: what is on the floor, what each makes, and the next of each. */
function Stations() {
  const store = useGameStore();
  const st = useGameView();
  const [mode, setMode] = useState<BuyMode>(1);
  const balance = st.wallet[MAIN];
  const list = stations.rules.list;
  // ...
  return (
    <Plate
      // ...
      aside={
        <BuyAmount
          className={s.modes}
          aria-label={COPY.buy.amount}
          options={MODES}
          value={mode}
          onValueChange={setMode}
          // ...
        />
      }
    >
      <ul className={s.stations}>
        {shown.map((def) => {
          const owned = st.stations.owned[def.id] ?? 0;
          const open = stations.rules.open(st, def.id);
          const affordable = stations.rules.affordable(st, def.id);
          const until = stations.rules.untilMilestone(st, def.id) ?? 1;
          const count = Math.max(1, buyCount(mode, { affordable, untilNext: until }));
          const price: Decimal = stations.rules.price(st, def.id, count);
          const can = open && price.lte(balance);
          const rate = owned > 0 ? stations.rules.rate(st, def.id) : ZERO;
          // ...
                <p className={s.name}>{def.name}</p>
                <p className={s.line}>{owned > 0 ? `${num(rate, 1)}${COPY.counter.perSecond}` : def.line}</p>
          // ...
                <Btn
                  tone={can ? "signal" : "stock"}
                  disabled={!can}
                  className={s.buy}
                  figure={num(price)}
                  aria-label={`${def.name} ×${count}, ${num(price)}`}
                  onClick={() => store.getState().stations.buy(def.id, count)}
                >
                  ×{count}
                </Btn>
          // ...
```

Three kinds of thing meet here, and each comes from a different layer.

**State, from the store.** `useGameView()` returns the whole game state, redrawn promptly after the player's input and a few times a second otherwise. `useGameStore()` returns the store itself, for calling actions. Both come from `src/app/hooks.ts`, where the game makes them once with `createRuntimeHooks<GameStore>()` from `watchpot/react`. For a figure that must move every tick, a screen uses the third hook, `useGameState(selector)`, with a narrow selector instead.

**Rules, from the feature.** The screen never works out a price or a rate itself. It asks `stations.rules`: `open`, `affordable`, `untilMilestone`, `price`, `rate`. These are the same functions the engine uses inside the feature, so the number on the button is the number the purchase will charge. `rate` already includes `stationMult`, so Darkness +1 shows up here without the screen knowing it exists. (On the current engine, the five lines from `affordable` to `can` are one call, `stations.rules.row(st, def.id, mode)`, which returns the count, its price and whether it can be bought. [Chapter 6](06-the-first-page.md#the-generators-generators) uses it.)

**An action, through the store.** `store.getState().stations.buy(def.id, count)` is the feature's action. The screen reads the store at the moment of the click, not the `st` it rendered with, so the purchase always sees the current balance.

The components split along the layers too. `BuyAmount` and `buyCount` come from `watchpot/ui`: the buy-mode switch is a headless engine primitive that brings its keyboard behaviour and ARIA but no look, and `buyCount` turns "×1, ×10, next, max" into a count. `Plate`, `Btn` and `Meter` come from the game's own `src/ui/`, each a component with its own CSS module and no English inside it; every word reaches them from `src/content/copy.ts` as `COPY.*`. [Chapter 10](10-the-page.md) and [chapter 11](11-look-and-sound.md) take this apart properly.

One small inconsistency is visible in this excerpt. The callbacks you give `generators` take the station's definition (`mult: (s, def) => ...`), but the rules you call from a screen take its id (`stations.rules.price(st, def.id, count)`). You will keep both in mind until it becomes habit.

### 5. `defineGame`: the list, and its order

Every feature only exists for the game once `defineGame` lists it. Here is the game's definition, trimmed to the features this chapter touched and their neighbours:

*VOID IF REMOVED, src/game/game.ts*

```ts
/**
 * The game: its features in order. Each phase of a pass runs their steps in this order, so the heat moves, then the
 * stats are folded, then the stations read them. A change to a saved shape bumps `save.version` with a migration
 * step (`watchpot` README › Saves).
 */
// ...
export const game = defineGame({
  id: SLUG,
  save: {
    key: `${SLUG}.save`,
    version: 9,
    migrations: {
      // ...
    },
  },
  vocab: WORDS,
  features: [
    wallet,
    settings,
    guide,
    progress,
    supplies,
    spindle,
    // ...
    roll,
    // ...
    stamps,
    pages,
    boosts,
    misfeeds,
    heat,
    stats,
    stations,
    press,
    feed,
    // ...
  ],
});

export type GameState = StateOf<typeof game.features>;
```

- `id` and `save.key` name the game and where its save is kept. `version` and `migrations` let an old save load into a newer game; [chapter 9](09-saving-and-time-away.md) covers them.
- `vocab: WORDS` is the game's [vocabulary](../glossary.md#vocabulary), its list of currencies, from `src/content/words.ts`.
- `features` is every feature, and **the order is part of the rules**. A pass of the clock runs phase by phase (`guard`, `sync`, `rates`, `produce`, and so on), and inside each phase it runs the features' steps in this array's order. `heat` comes before `stats` so the fold sees this pass's heat; `stats` comes before `stations` so the stations read this pass's stats. Move `stats` below `stations` and every station would run one pass behind every purchase. (`defineGame` also takes an `order` option that pulls named steps to the front of a phase; this game leaves it out and lets the array decide.)
- `GameState` is the finished state type, worked out from the features. It is what screens see through the hooks.

From here, `src/game/store.ts` hands `game` to the engine's `createIdleStore` with a save backend, and `src/main.tsx` mounts the app over that store with `mountGame`. Those two files are short, and they do what the last lines of Simmer's `game.ts` and `main.tsx` do.

## Finding your way in any watchpot game

You have now been through every layer once. When you open a game you have not seen, these questions get you to the right file:

- **A word, a name, a line of flavour?** `src/content/`. In this game every word on the page comes from there, down to the button labels in `copy.ts`.
- **A number: a rate, a base price, a multiplier on an item?** `src/content/` too. If a price is missing from the content, look for a fitted table beside it (here `gates.ts` and `fit.ts`) and the sim that writes it.
- **A rule: how something pays, when it opens, what a button does?** `src/game/`. Search that folder for the engine factory you expect (`generators(`, `upgradeTree(`, `prestige(`, `achievements(`); the feature's `key` is the name its state has in the store.
- **Why a number is the size it is?** The stat bus: `src/game/bus.ts` and the `stats` feature, then whatever rule reads the stat.
- **What is on screen?** `src/app/screens.tsx` maps each page to its screen in `src/screens/`.
- **How it looks?** The component in `src/ui/` and its `.module.css`, then the theme tokens.
- **What runs before what?** The `features` array in `defineGame`.

## Things that bite

- **The order of `features` is the order steps run in.** Nothing warns you when a feature reads a slice that is updated later in the same pass; you get numbers one pass stale, which looks like lag or a flicker. When a rule reads another feature's result, check that feature sits above it.
- **An effect does nothing until something reads its stat.** Adding `mul("press", 2)` to an item is half the job if no rule calls `mulOf(s, "press")`. The type checker will not catch it, because the stat name is valid either way.
- **`at` on an item is an hour, not a price.** It is easy to read `min(9.5)` as "costs 9.5". In this game prices come from the fitted table; change `at` and the item moves in the plan, but not until the table is fitted again.
- **A selector that builds a new object re-renders forever.** `useGameState((g) => ({ ... }))` returns a fresh object every time, so React never sees it settle and stops with a "maximum update depth" error. In development the engine warns you first and names the fix. Select one value, wrap an object-building selector in `useShallow` (from `watchpot/react`), or use `useGameView()` for a screen that reads a lot.
- **Read the store at the click, not at the render.** An action handler calls `store.getState()` when it runs. The state you rendered with may be a few passes old by the time the player clicks.

## Next

[Chapter 6, the first page](06-the-first-page.md), takes the five systems that fill an opening page (a button that pays, a meter, the generators, a shop, things to catch) one at a time, on this game's Feed page and on Simmer.

## Reference

- [Generators](../generators.md) and [Add a generator](../add-a-generator.md): `generators`, its rules, milestones and away; `api/core/generators.d.ts`
- [Upgrade tree](../upgrade-tree.md): `upgradeTree`, nodes, ranks and `rankCost`; `api/core/tree.d.ts`, `api/core/graph/nodes.d.ts`
- [Stat graph](../stat-graph.md): the engine's own bus, `busOf`, `statValue`, `liveIndex`; `api/core/graph/stats.d.ts`, `api/core/graph/live.d.ts`
- [Start a game](../start-a-game.md): `defineGame`, the store and the save; `api/core/game.d.ts`, `api/core/store.d.ts`
- Features, phases and steps: `api/core/feature.d.ts`
- The store hooks, `createRuntimeHooks` and `mountGame`: `api/react/store.d.ts`
- [Headless UI](../ui.md): `BuyAmount`, `buyCount` and the rest of `watchpot/ui`; `api/ui/tabs.d.ts`
- [Glossary](../glossary.md)
