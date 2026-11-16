# Showcases

By the end of this page you will have seen nine engine systems doing jobs their names do not suggest: an autobuyer that
buys nothing, a price nobody wrote down, a buff with no effect, and six more. Each comes with the reason it works and
code that runs. The page closes with the questions that help you find uses like these in your own game.

Every showcase rests on the same three facts about watchpot, so they are worth saying once up front.

- **A factory is a shape, not a purpose.** `buffs` is "a named clock that starts, runs out on game time, and remembers
  when". It is called `buffs` because that is its most common job. Nothing in it insists the clock changes a stat.
- **Callbacks read the whole state.** Almost every factory takes functions like `when`, `rate`, `unlocked` or `run`,
  and they are handed the whole game state (or a [draft](glossary.md#draft) of it). So any system can listen to any
  other, with no event wiring between them.
- **State is plain data on [game time](glossary.md#game-time).** A record of ids and numbers is easy to read from
  anywhere, and anything that runs on game time keeps running through a [catch-up](glossary.md#catch-up).

The showcases come from three places: VOID IF REMOVED, the game built on the engine (only from the pages a player meets
in the first hour), the reference game in `examples/orbital-orchard`, and small examples written for this page under
`docs/examples/showcase-*.ts`.

## 1. An autobuyer that presses the reset

**The use:** an [autobuyer](glossary.md#autobuyer) that never buys anything; it takes the
[prestige](glossary.md#prestige) for the player once the run has passed its best.

**Why it works.** The `autobuyers` factory owns three things: the player's on/off switches, the schedule, and a count.
It does not know what "buying" is. Each autobuyer's `run` is any change to the draft that returns a number, and the
feature only adds that number to its count. Separately, every `prestige` carries the reset as a draft helper, under the
action's name (`rebirth.draft.rebirth`), which runs the same reset as the button from inside a recipe, and keeps the
run's best reset pace, serving `pastPeak` on its slice. Put the two together and the "purchase" is the reset.

```ts
/** The layer keeps this run's best reset pace itself, and says when the run is past it (`pastPeak`). */
export const rebirth = prestige({
  key: "rebirth",
  action: "rebirth",
  reach: [wallet],
  gain: (s) => gainOf(s.wallet.gold),
  pace: { past: 0.8 },
});

type State = { rebirth: { currency: Decimal; pastPeak: boolean } };

export const auto = autobuyers({
  key: "auto",
  list: [
    { id: "stall", unlocked: () => true, intervalMs: () => 1000, run: (d) => stalls.draft.buy(d, "stall") },
    {
      // An autobuyer that buys nothing: it presses the reset for the player once the run is past its best.
      id: "rebirth",
      unlocked: (s: State) => s.rebirth.currency.gte(10),
      intervalMs: () => 1000,
      priority: -1, // after every buy in the same tick, so the reset sees what they bought
      run: (d: State, ctx) => (d.rebirth.pastPeak && rebirth.draft.rebirth(d, ctx) ? 1 : 0),
    },
  ],
});
```

`docs/examples/showcase-autoreset.ts`

Line by line:

- `pace: { past: 0.8 }` tunes the layer's reset pace, the "is it worth pressing?" figure from
  [chapter 7](guide/07-the-first-reset.md#is-it-worth-pressing): how fast a reset would grow what it pays into, in
  orders of magnitude a second. It rises while the run is young, peaks, then falls. The layer keeps the run's best
  (`peak`, back to zero on every reset, with `runStart`), and `pastPeak` turns true once the pace drops below 80% of
  it. Nothing else in the game tracks it.
- `priority: -1` matters. Autobuyers fire highest priority first, and the default is 0, so the stall buyer goes first
  and the reset sees the stall it just bought.
- `rebirth.draft.rebirth(d, ctx)` takes the step's context as it is. The helper needs the game time and the store's
  run reset, and the context an autobuyer's `run` is handed already carries both (`now` and `resetRun`).

The same trick turns an autobuyer into anything that should happen "every so often, if the player has it switched on":
catching whatever a [spawn](glossary.md#spawn) left on screen (`spawns.draft.catch(draft, kind, now)` is the draft helper for
that), or moving a slider.

## 2. A price that is asked for every time

**The use:** an upgrade's price that is not written in the content at all; the tree looks it up from a table each time
it needs it, so a tuning script can change it while the game runs.

**Why it works.** An upgrade node's cost is a list of `{ currency, amount }`. The engine reads `amount` at the moment it
prices a rank, never once at startup, so a JavaScript getter in that slot is called afresh on every read. The tree's
source says so in a comment ("a price line may be a getter"), but no reference page mentions it yet.

VOID IF REMOVED prices every shop this way. Its content files list items with names, lines and effects, and no prices,
and its `nodeOf` (quoted in [chapter 5](guide/05-a-real-game.md#2-features-the-content-on-engine-factories)) writes
each node's cost as `get amount() { return it.fixed ?? gate(itemGate(shop, it)); }`. And `gate` is the table:

```ts
const BLOCKED = D("1e999999999");
// ...
/** A gate's figure: what it costs, or the bar it sits at. */
export const gate = (id: string): Decimal => live.get(id) ?? BLOCKED;
```

VOID IF REMOVED, `src/content/gates.ts`

Two ideas ride on this. The first is that the price table is filled by a fitting script (the game's `bun sim/fit.ts`)
that plays the game and picks each price so the item arrives when the plan says it should. While it fits, it changes the
table, and the very next price read sees the new figure. The second is the fallback: an item the table has no figure for
costs `1e999999999`, so nothing unpriced can ever be bought by accident. Missing data fails closed.

Here is the same idea with nothing else around it, as proof that the engine reads lazily:

```ts
/** The price table, by item id. A tuning script may rewrite it while the game runs. */
const PRICES = new Map<string, Decimal>([["lid", D(50)]]);

/** What an item costs when the table has no figure for it: out of reach, so nothing unpriced can be bought. */
const UNPRICED = D("1e999999");

/** A node whose price is read from the table each time the tree asks, through a getter. */
const node = (id: string, name: string): GraphNode<never, "gold"> => ({
  id,
  name,
  line: "",
  cost: [
    {
      currency: "gold",
      get amount() {
        return PRICES.get(id) ?? UNPRICED;
      },
    },
  ],
  costGrowth: 1.5,
  maxLevel: 5,
  requires: [],
  effects: [],
});

export const shelf = tree({ id: "shelf", nodes: [node("lid", "A lid"), node("ladle", "A ladle")] });
```

`docs/examples/showcase-reprice.ts`

The end of that file prices the lid at 50, rewrites the table, and prices it again at 80, with no rebuild of the tree.

## 3. A buff with no effect

**The use:** a [buff](glossary.md#buff) used as a bare named timer; the game asks "is it running?" by id and decides for
itself what that means.

**Why it works.** A buff's `effects` are one way to read it: hand `.contributions(state, now)` to the game's
[stats feature](glossary.md#stats-feature) and the running buffs' effects arrive there. But the feature does its real work
without them. It starts a buff by its stacking rule, ends it on game time (during an absence too), and keeps the window
it covered. `buffActive(state, id, now)` and `buffLeftMs(state, id, now)` read that clock directly.

On VOID IF REMOVED's opening page, catching a misfeed (a label that gets loose and drifts by for a few seconds) can start
a hot run or a double feed. Both are buffs that declare no effect, and the game's own stat fold in `bus.ts` asks
`buffActive(s.boosts, "hot-run", now)` and applies the multiplier itself.
[Chapter 6](guide/06-the-first-page.md#surprises-and-timed-boosts-spawns-and-buffs) quotes both halves, and
[chapter 8](guide/08-effects.md#the-honest-part-the-real-game-folds-its-own) the fold around them.

Why bother? Because the strength depends on another stat (`misfeed.power`, raised by supplies). A buff's `effects` is a
function of its stack count and strength only, so it cannot read another stat. The game's fold can, so the fold does the
work and the buff only keeps time. On the engine's `stats` the same split is a source whose `active` asks the buff and
whose amount reads the other stat: `{ active: (q) => buffActive(q.boosts, "hot-run", Number.NEGATIVE_INFINITY), effects:
[{ stat: "print", mul: (q) => HOT_RUN * q.stats["misfeed.power"] }] }`.

The chain into the buff is one string long. The misfeed is a `spawns` kind whose outcomes are `"hot-run"`, `"box"` and
`"double-feed"`. Its `onCatch` credits a box of labels for `"box"`, and for the other two calls
`boosts.draft.start(d, outcome, now, { durationMs })`: the spawn's outcome id is the buff's id, so it passes straight through.
The FEED pad reads `buffLeftMs(g.boosts, "hot-run", g.gameNow()) > 0` to light up while a hot run is going.

The game is still on engine 0.17 and writes `effects: () => []` on both. On the current engine leave `effects` out: a
buff without it is a timer, and it adds nothing to `contributions`.

## 4. A gauge that never trips

**The use:** a [gauge](glossary.md#gauge), the engine's push-your-luck meter, with the push-your-luck taken out: a level
that rises and falls and never locks.

**Why it works.** A gauge is two ideas in one factory: a level that a rate moves every second, and a trip that locks it
at the top. The trip is optional. Leave it out and the level holds at `max`. And `rate(state, { now })` is read off the
whole state and the game time every [tick](glossary.md#tick), so the level can follow anything, a running buff included.

VOID IF REMOVED's printhead heat is one ([chapter 6](guide/06-the-first-page.md#the-meter-gauge) quotes it). Holding
FEED warms it, every second cools it, and the stat fold reads the level as a multiplier on print, up to double at full
heat. Single taps warm it too: the tap is a `clicker`, and its `onClick` adds a little heat to the level in the same
recipe as the tap. To do that in your own game, call the gauge feature's draft helper, `heat.draft.nudge(draft, amount,
now)`, from the recipe: it clamps and trips exactly as the `nudge` action does. `reset: "never"` keeps the heat
through the first reset, so a player who starts a new roll keeps their momentum.

Because `rate` can read anything, a gauge also makes a thermostat. This one eases toward a dial the player sets:

```ts
/** The state the gauge reads: its own level and a dial the player turns, 0 to 100. */
type Stove = { warmth: GaugeState; dial: { setting: number } };

/**
 * A gauge with no trip, used as a thermostat: each second it closes half the gap to the dial's setting, so it eases
 * up or down to wherever the player set it and holds there.
 */
export const warmth = gauge({
  key: "warmth",
  max: 100,
  rate: (s: Stove) => (s.dial.setting - s.warmth.level) * 0.5,
});
```

`docs/examples/showcase-glow.tsx`

## 5. A shader that reads the state

**The use:** a shader whose inputs are worked out from the game state alone, so a meter or a timed arrival shows up as
light on the page instead of a popup.

**Why it works.** `ShaderCanvas` takes `uniforms` as a plain object and sets every one on each frame it draws, with
no React render of its own. A uniform is a plain value: a number, a boolean, a colour string or a short array of
numbers. So the bridge from the game to the picture is a pure function from state to numbers, and you can test it like
any other function.

```ts
/** The shader's inputs, worked out from the game state alone: no event, no animation of the page's own. */
export const glowUniforms = (s: { warmth: GaugeState; drips: SpawnsState }) => ({
  u_heat: gaugeFill(s.warmth, warmth.def.max), // 0 to 1
  u_wobble: s.drips.kinds.drip?.live ? 1 : 0, // 1 while there is something to catch
});
```

`docs/examples/showcase-glow.tsx`

`gaugeFill` turns the gauge's level into a share from 0 to 1. A spawn kind's `live` is `null` until something arrives,
so `u_wobble` is 1 exactly while there is something to catch. The component passes those numbers through:

```tsx
/** The pot's light. The parent selects `glowUniforms(state)` from the store and passes it down. */
export function PotGlow({ heat, wobble }: { heat: number; wobble: number }) {
  return (
    <ShaderCanvas
      fragment={POT}
      uniforms={{ u_glow: "#ff8a3d", u_heat: heat, u_wobble: wobble }}
      paused={heat < 0.01 && wobble === 0}
      still={<div />}
    />
  );
}
```

`docs/examples/showcase-glow.tsx`

`paused` stops drawing while there is nothing to show, which keeps an idle tab cheap. VOID IF REMOVED's FEED pad works
this way: the pad is a shader that glows with the heat gauge's level, light rather than a colour swap.

## 6. A door that stays open, and a glossary that knows it

**The use:** [achievements](glossary.md#achievement) as one-way latches that open parts of the game, and the same record
used to keep a glossary from naming anything the player has not met.

**Why it works.** An achievement is earned once and never un-earned; its default reset rule is `"never"`. That is the
exact behaviour of a page tab that, once open, must stay open after a reset wipes whatever opened it. [Chapter
7](guide/07-the-first-reset.md#the-same-factory-opens-pages) shows VOID IF REMOVED doing this for its pages. Here is the
idea on its own:

```ts
export const doors = achievements({
  key: "doors",
  columns: 2,
  list: [
    { id: "market", name: "The market", line: "Hold 100 gold.", when: (s: State) => s.wallet.gold.gte(100) },
    { id: "vault", name: "The vault", line: "Start over once.", when: (s: State) => s.rebirth.runs >= 1 },
  ],
});

/** Whether a door is open: the screens ask this, never the condition. */
export const isOpen = (s: { doors: { earned: Record<string, number> } }, id: string): boolean =>
  s.doors.earned[id] !== undefined;
```

`docs/examples/showcase-latch.ts`

The script at the end of that file credits 500 gold, ticks once (the pass that checks the doors), resets, and shows
the market still open with the gold back at its start. The feature's `fresh` queue, meant for "achievement earned"
toasts, does a second job as the list of doors to announce.

Now the glossary. The engine's `lexicon` and `annotate` cut a line of text into plain runs and marked terms, so a page
can draw each term as a tooltip. `annotate` takes an optional `allow(id)` filter, meant for leaving out terms the player
has not met. Point that filter at the doors and the glossary can never spoil anything:

```ts
/** The doors' earned record, as `showcase-latch.ts` keeps it. */
type Doors = { earned: Record<string, number> };

/** Whether the player has met a term: its door is open, or it has none. */
const met = (doors: Doors, id: string): boolean => {
  const door = TERMS.find((t) => t.id === id)?.door;
  return door == null || doors.earned[door] !== undefined;
};

/**
 * A line of text cut into plain runs and marked terms. A term behind a closed door is left as plain text, so a tip
 * that mentions the vault reads the same as any other word until the vault is open. The scope is the set of open
 * doors, which is all `met` depends on, so each text is worked out once per set.
 */
export function marked(text: string, doors: Doors): Segment[] {
  const scope = Object.keys(doors.earned).sort().join(",");
  return mark(text, scope, (id) => met(doors, id));
}
```

`docs/examples/showcase-glossary.ts`

`mark` is `annotator(LEX)`: `annotate` with a memory, keyed by a scope string. The scope has to change whenever the
answer of `allow` could change, which is why it is built from the open doors. VOID IF REMOVED's tips work the same way:
a term from a page the player has not opened stays plain text.

## 7. A challenge rule that switches off a group

**The use:** [challenges](glossary.md#challenge) whose rule flags name a group of stat sources, so a restriction like
"no tools this run" is one line of content and no rule code at all.

**Why it works.** A challenge's `rules` are plain strings, and `trials.select.rule(state, rule)` is true only while a
challenge carrying that string is active. Separately, the engine's [stat graph](glossary.md#stat-graph) (`statIndex`,
and the `stats` feature built on it) puts each source in an optional `group`, and `muted` silences the effects of any
group it names: the rows stay in the breakdown, marked with the reason, and stop counting. Name the rule after the
group and the two systems join with no code in between. (A `stats` feature takes the same function as its own
``muted: (s, group) => trials.select.rule(s, `mute:${group}`)``.)

```ts
export const trials = challenges({
  key: "trials",
  list: [
    { id: "bare-hands", goal: (s: Kitchen) => s.gold.gte(1e6), rules: ["mute:tools"] },
    { id: "alone", goal: (s) => s.gold.gte(1e6), rules: ["mute:helpers"] },
    { id: "nothing", goal: (s) => s.gold.gte(1e4), rules: ["mute:tools", "mute:helpers"] },
  ],
});

// ...

/** The graph over one state, with the active challenge's mute flags read as the graph's mutes. */
class Reader {
  readonly graph: StatGraph<Stat, never>;
  constructor(readonly s: Kitchen) {
    this.graph = INDEX.over(this, { muted: (group) => trials.select.rule(s, `mute:${group}`) });
  }
}
```

`docs/examples/showcase-mute.ts`

A new restriction is one more list entry. The knives still exist inside "bare-hands", and the player still owns them;
they count for nothing until the challenge ends, because a mute silences effects and keeps everything else.

## 8. Levels that count time on display

**The use:** [levels](glossary.md#levels) whose experience is seconds: each dish gains a level for the time it spends
in the shop window.

**Why it works.** The `levels` factory does not care where experience comes from. `gain(draft, track, amount)` takes any
amount, and the curves read both ways (level from XP and XP from level). A [step](glossary.md#step) is handed `dtMs`,
the length of the pass, so "seconds on display" is one loop.

```ts
/** One track per dish. Its XP is seconds: how long the dish has sat in the window. */
export const fame = levels({
  key: "fame",
  tracks: DISHES.map((id) => ({ id, curve: SLOW })),
  maxLevel: 10,
  effects: (_track, level): Effect[] => [{ stat: "price", mul: 1 + 0.1 * level }],
});

/** The window: two dishes on show at a time, picked by the player. */
export const shopWindow = feature({
  key: "window",
  reach: [fame],
  initial: () => ({ shown: ["soup"] as string[] }),
  actions: (api) => ({
    show: (ids: readonly string[]) =>
      api.set((s) => {
        s.window.shown = ids.slice(0, 2);
      }),
  }),
  steps: {
    produce: {
      // Every pass, the tab open or a catch-up after an absence: each dish on show gains its seconds.
      age: (d, ctx) => {
        for (const id of d.window.shown) fame.gain(d, id, ctx.dtMs / 1000);
      },
    },
  },
});
```

`docs/examples/showcase-on-display.ts`

The player's choice (which two dishes to show) becomes a slow, visible investment, and `fame.select.progress` gives the
bar under each dish for free. The step has no `pass`, so it runs in the catch-up too and a dish keeps learning while the
tab is closed. If time away should not count, write the step as `{ pass: "tick", run }`.

## 9. The prestige currency as one more source

**The use:** the prestige currency's bonus, the gacha's duplicate copies and the upgrade ranks all fed to the stats
the same way, so one breakdown explains every multiplier.

**Why it works.** The [stats feature](glossary.md#stats-feature) takes declared sources and a flat list of
contributions, each a `source` string and an `effect`. It does not care which system made one. The reference game
declares its whole set of stats in one place:

```ts
export const stats = defineStats({
  key: "stats",
  vocab: WORDS,
  reach: () => [upgrades, collection, reach<{ prestige: { currency: Decimal } }>()],
  stats: {
    output: { base: 1 },
    offline: { base: OFFLINE_BASE, hardcap: 1 },
    gain: { base: 1 },
  },
  sources: [
    {
      label: "Orbits",
      owner: "prestige",
      effects: [{ stat: "output", mul: (q) => 1 + BONUS_PER_UNIT * q.prestige.currency.toNumber() }],
    },
  ],
  contributions: (s) => [
    ...rankContributions("upgrades", NODES, s.upgrades.ranks),
    ...ITEMS.flatMap((item) =>
      Array.from({ length: s.collection.owned[item.id] ?? 0 }, () => ({
        source: `collection:${item.id}`,
        effect: item.effect,
      })),
    ),
  ],
  label: (source) => NAMES.get(source) ?? source,
});
```

orbital-orchard, `examples/orbital-orchard/src/game/stats.ts`

Two small decisions are worth seeing. Each owned copy of a collection item hands over the same effect again, and the
feature counts the copies as one row with `times`, so a duplicate needs no "stack count" logic of its own. And the
prestige currency, which many games apply as a separate multiplier off to the side (the engine's `lifetimeMultiplier`
exists for that), is one more source, "Orbits". `stats.select.explain(state, "output")` lists it beside the upgrades,
so a breakdown screen can show exactly what the prestige currency in hand is worth.

## How to find your own

Every showcase above came from asking a factory the same few questions. Ask them of any system in the
[reference shelf](README.md).

- **What does it own that I would otherwise write?** Strip the name away. `buffs` owns a clock that survives time away.
  `achievements` owns a record that is never undone. `autobuyers` owns a schedule with an on/off switch. `spawns` owns a
  seeded random arrival. If you need that thing, the factory is yours, whatever it is called.
- **What does it refuse to know?** The autobuyer does not know what buying is. The buff does not need to know what it
  does. A challenge does not know what its rules mean. Each gap is a place your own meaning fits.
- **Which callbacks read the whole state?** `when`, `rate`, `unlocked`, `run`, `active`, `wait`. Each is a door through
  which one system can listen to another.
- **Is it ever undone, and by what?** Something that never resets is a latch. Something that resets with the run is a
  scratchpad you never have to clear.
- **Can one string join two systems?** A spawn outcome named like a buff, a challenge rule named like a stat group. When
  two systems both identify things by id, matching the ids is often all the wiring you need.
- **Does it run during a catch-up?** Anything on game time keeps working while the tab is closed, for free. Decide
  whether you want that, and say so with `pass`.

## Things that bite

- **The pace resetter fires at most once over an absence.** A catch-up fires each autobuyer once, at its end, so a player
  who was away for a day comes back to one reset, not dozens. That is usually what you want, but it means the
  autobuyer cannot stand in for a simulation of time away.
- **A getter price runs on every read, and reads are frequent.** Screens and the sim's auto-player ask for prices
  constantly. Keep the getter to a map lookup. VOID IF REMOVED goes further and caches each shelf's prices, keyed on a
  version counter that its table bumps on every change.
- **A run reset ends every buff**, timers included, unless the `buffs` feature's own `reset` says otherwise.
- **A gauge's rate holds still for a whole step.** The rate is read once per step and applied across all of it. A live
  tick is at most a second long (`MAX_STEP_MS`), so the thermostat above, which closes half the gap a second, at worst
  closes half of it in one step. A steeper rate that depends on the level itself (more than the whole gap a second)
  would overshoot and be saved only by the clamp to 0 and `max`. Over an absence the gauge does not use `rate` at all
  but `awayRate`, which by default drains at `max` an hour, so give a thermostat an `awayRate` that suits it.
- **An annotator's scope must cover everything `allow` reads.** The memory hands back the same segments for the same
  text and scope. If `allow` depends on something the scope string leaves out, the marks go stale.
- **A mute silences effects, never flags.** A muted source in the stat graph still raises its flags. If a
  restriction should also take away what a source unlocks, the source's `active` has to read the mute too.

## Next

That is the end of the guide. The [glossary](glossary.md) defines every term it used, and
[the reference shelf](README.md#the-reference-shelf) holds a page per system.

## Reference

- Autobuyers and resets: [autobuyers.md](autobuyers.md), [prestige-layer.md](prestige-layer.md),
  `api/core/autobuyers.d.ts`, `api/core/prestige/prestige.d.ts` (`PrestigeDraftHelpers`, `PrestigePaceDef`, `resetPace`)
- Upgrade trees and prices: [upgrade-tree.md](upgrade-tree.md), `api/core/tree.d.ts`, `api/core/graph/nodes.d.ts`
  (`NodeCost`, `rankCost`)
- Buffs and spawns: [buffs.md](buffs.md), [spawns.md](spawns.md), `api/core/buffs.d.ts`, `api/core/spawns.d.ts`
- Gauges: [gauge.md](gauge.md), `api/core/gauge.d.ts`
- Shaders: [shader.md](shader.md), `api/shader/canvas.d.ts`
- Achievements and marked text: [achievements.md](achievements.md), `api/core/achievements.d.ts`,
  `api/core/annotate.d.ts`
- Challenges and the stat graph: [challenges.md](challenges.md), [stat-graph.md](stat-graph.md),
  `api/core/challenges.d.ts`, `api/core/graph/stats.d.ts`
- Levels: [levels.md](levels.md), `api/core/levels.d.ts`
- The stats feature: [stat-graph.md](stat-graph.md), `api/core/stats.d.ts`
- The examples on this page: `docs/examples/showcase-autoreset.ts`, `showcase-reprice.ts`, `showcase-glow.tsx`,
  `showcase-latch.ts`, `showcase-glossary.ts`, `showcase-mute.ts`, `showcase-on-display.ts`
