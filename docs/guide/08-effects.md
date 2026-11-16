# Effects

By the end of this chapter Simmer's stove will make bubbles at a rate that four separate things change: an upgrade,
a timed buff, a medal and a milestone. None of them will know about the others, and a tooltip will say where every
part of the rate comes from. You will also know why the real game built on this engine folds its numbers its own way,
and which of the two approaches to reach for in a game of your own.

Everything here is in one file you can run: `docs/examples/guide-effects.ts`. It starts from chapter 4's Simmer
(`docs/examples/simmer/game-wallet.ts`: the wallet, the pot, the stove and the lid), adds an `upgradeTree`, `buffs`
and `achievements` beside it (chapters 6 and 7), then adds the effects.

```sh
bun docs/examples/guide-effects.ts
```

## The if-chain every idle game grows

Start with the problem, because the engine's answer only makes sense once you have felt it.

Say Simmer's burner makes one bubble a second. Then you add an upgrade that makes it 25% faster. The obvious code
goes in the stove:

```ts
let rate = 1;
if (copperBought) rate *= 1.25;
```

A week later there is a buff, a rolling boil that triples the rate for thirty seconds. Then a medal for lighting ten
burners that adds 10%. Then a milestone at 25 burners. Each one is another line in the stove:

```ts
let rate = 1;
if (copperBought) rate *= 1.25 ** copperRanks;
if (rollingBoilRunning(now)) rate *= 3;
if (earned("ten-burners")) rate *= 1.1;
rate += 0.5 * Math.floor(burners / 25);
```

This works, and every idle game starts this way. It goes wrong in three places.

- **The stove knows everything.** To add a source you edit the thing it affects. A second stat (how long the buff
  lasts, say) grows its own chain, and the two drift apart.
- **Order is an accident.** The milestone above adds after the multipliers, so it is worth less than if it came first.
  Nobody chose that; it is just the line it landed on.
- **Nobody can ask why.** A player who wants to know where their rate comes from needs a second copy of the chain that
  writes sentences instead of numbers, and that copy will be wrong by next week.

The fix is to turn it around. Each source says what it does to a named number, as data. One function collects every
source's claims and folds them in a fixed order. The stove reads the result and nothing else.

## Stats and effects

A [stat](../glossary.md#stat) is a named number that many things can change: Simmer's is `heat`, the multiplier on what
the stove makes. An [effect](../glossary.md#effect) is one change to a stat: an amount to add, or a factor to multiply
by. In the engine an effect is a plain object, the `Effect` type from `watchpot/core`:

```ts
{ stat: "heat", mult: 1.25 }
{ stat: "heat", add: 0.5 }
```

An effect with where it came from is a [contribution](../glossary.md#contribution):

```ts
{ source: "kitchen:copper", effect: { stat: "heat", mult: 1.25 } }
```

The source is a string. It is what the tooltip later turns back into a name the player reads.

The engine's systems already speak this language. An `upgradeTree` node carries `effects`, and the tree hands back one
contribution per rank held. A `buffs` entry may carry `effects`, and the feature hands back the running ones. An
`achievements` entry carries `effects` for while it is earned. So does anything you write yourself, because a
contribution is only an object.

## Four sources for one number

Here are Simmer's four, each declared where it lives. First the upgrade, a copper base for the stove:

```ts
const COPPER: GraphNode<Effect, "bubbles"> = {
  id: "copper",
  name: "Copper base",
  line: "Spreads the heat.",
  cost: [{ currency: "bubbles", amount: 100 }],
  costGrowth: 3,
  maxLevel: 5,
  requires: [],
  effects: [{ stat: "heat", mult: 1.25 }],
};
export const kitchen = upgradeTree({ key: "kitchen", nodes: [COPPER], wallet });
```

`docs/examples/guide-effects.ts`

The node's `effects` apply once per rank, so three ranks are three contributions of ×1.25. The tree's key, `kitchen`,
becomes the first half of the source: `kitchen:copper`.

The buff, a rolling boil:

```ts
export const boosts = buffs<"boosts", Effect>({
  key: "boosts",
  list: [
    { id: "rolling-boil", durationMs: 30_000, stack: "refresh", effects: () => [{ stat: "heat", mult: 3 }] },
  ],
});
```

`docs/examples/guide-effects.ts`

A [buff](../glossary.md#buff) runs from the [game time](../glossary.md#game-time) it started for `durationMs`. Its
`effects` is a function of its stacks and strength, because a stacking buff can be worth more the more it stacks. In
chapter 6 the rolling boil had no `effects` and was read by name where it applied; here it says what it does, so the
bus can count it with everything else. The second type argument, `Effect`, says what kind of effect the list holds;
the engine's types are generic over it so a game can bring its own effect shape (more on that at the end).

The medal:

```ts
export const medals = achievements({
  key: "medals",
  columns: 5,
  list: [
    {
      id: "ten-burners",
      name: "Full stove",
      line: "Light ten burners.",
      effects: [{ stat: "heat", mult: 1.1 }],
      when: (s: Simmer) => s.stove.burners >= 10,
    },
  ],
});
```

`docs/examples/guide-effects.ts`

And the milestone, which no engine system makes for you here, so you write the contribution yourself:

```ts
function milestones(s: Pick<Simmer, "stove">): Contribution[] {
  const reached = Math.floor(s.stove.burners / 25);
  return reached > 0 ? [{ source: "milestone", effect: { stat: "heat", add: 0.5 * reached } }] : [];
}
```

`docs/examples/guide-effects.ts`

Notice what none of these mention: the stove's rate. The copper base does not know a stove exists. It says "heat,
times 1.25", and that is the whole of its job.

## The stat bus

The [stat bus](../glossary.md#stat-bus) is where the claims meet. `busOf` takes every contribution in one list and
sums them per stat: the adds into one total, the multipliers into one product. `statValue` then reads one stat off it.

```ts
export const HEAT: StatDef = { softcap: { start: 20, power: 0.5, label: "The pot spits over the rim" } };

export function busFor(s: Cooking, now: number): StatBus {
  return busOf([
    ...kitchen.tree.contributions(s.kitchen.ranks),
    ...boosts.contributions(s.boosts, now),
    ...medals.board.contributions(s.medals.earned),
    ...milestones(s),
  ]);
}
```

`docs/examples/guide-effects.ts`

Line by line:

- `HEAT` is the stat's definition, a `StatDef`. It holds the caps, and nothing else. A
  [softcap](../glossary.md#softcap) slows a stat down past `start`: above it the value is `value^power × start^(1 -
  power)`, so with `power` 0.5 it grows like a square root. The `label` is the line a player reads while the softcap is
  biting. A `hardcap` would be a ceiling it never passes. Heat has no hardcap.
- `Cooking` is the state the bus reads: chapter 4's features and the three above, worked out with `StateOf`.
- `kitchen.tree.contributions(ranks)` is every rank held, sourced `kitchen:<node>`.
- `boosts.contributions(state, now)` is every buff running at `now`, sourced `boosts:<id>`. It needs the time because
  a buff's running is a question about time.
- `medals.board.contributions(earned)` is every earned medal's effects, sourced `medals:<id>`.
- `busOf` folds the lot. It does not care who said what.

Then the one order, the same everywhere in the engine:

```
(base + every add) × every mult, then the softcap, then the hardcap
```

`statValue(bus, "heat", 1, HEAT)` reads heat with a base of 1. With three copper ranks, the rolling boil, the medal
and 25 burners, that is (1 + 0.5) × 1.25³ × 3 × 1.1 = ×9.66, under the softcap's start, so the softcap does nothing
yet.

The order is the answer to the second problem from the if-chain. An add is always worth the same no matter which file
it came from, because every add lands before every multiplier.

## Reading the stat where it applies

The stove sets its rate in its own `rates.flame` step, and chapter 3's lid doubles it in `rates.trap`. Heat applies the
same way: a small feature folds the bus at the pass's `now` and multiplies the stove's rate by the result, right after
the lid.

```ts
/** Heat as the stove reads it: the bus folded at `now`, with a base of 1 and the softcap. */
export const heatAt = (s: Cooking, now: number): number => statValue(busFor(s, now), "heat", 1, HEAT);

/** The fire: works heat out where it applies, and multiplies the stove's rate by it. It knows no copper, buff or medal. */
export const fire = feature({
  key: "fire",
  reach: SOURCES,
  initial: () => ({}),
  // A fresh state (a new store, a load, a reset) gets the stove's full rate before the first pass.
  derive: (s, ctx) => {
    s.stove.perSecond = s.stove.perSecond.mul(heatAt(s, ctx.now));
  },
  steps: {
    rates: {
      stoke: (s, ctx) => {
        s.stove.perSecond = s.stove.perSecond.mul(heatAt(s, ctx.now));
      },
    },
  },
});

export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  vocab: WORDS,
  features: [...SOURCES, fire],
  // The stove sets its rate, the lid doubles it, then the fire multiplies it by heat.
  order: { rates: [...SIMMER_RATES, "fire.rates.stoke"] },
});
```

`docs/examples/guide-effects.ts`

You have seen every part of this in chapter 3; here is what each does for the stat.

- `SOURCES` is chapter 4's features followed by the kitchen, the boosts and the medals. `reach: SOURCES` lets the fire
  read all of them, and the game spreads the same list, so the two never disagree.
- `initial: () => ({})`: the fire saves nothing. Heat is worked out from things that are saved, so saving it too would
  only give a load something to disagree with.
- `steps: { rates: { stoke } }` multiplies the stove's rate every [pass](../glossary.md#pass), in the `rates`
  [phase](../glossary.md#phase), before anything is paid in `produce`. The step has `ctx.now`, the pass's game time,
  which is what `boosts.contributions` needs to know whether the rolling boil is running.
- `derive` does the same whenever the state is made fresh: a new store, a load, an import, a reset. The stove and the
  lid have a `derive` of their own for the same reason, and the three run in list order.
- `order` pins the fire's step after the lid's, so heat multiplies the doubled rate.

The stove itself reads nothing new: its rate is set, doubled and multiplied by three steps that each know only their
own part.

A factory with a callback works the same way. A `generators` list's `mult(state, def, { now })` is handed game time
too, so `(s, def, { now }) => statValue(busFor(s, now), "heat", 1, HEAT)` reads the bus where the generators apply it,
with no step of your own.

Folding the bus where it applies is right while one or two rules read a stat. A game where many rules read many stats,
many times a pass, folds them once in its own `rates` step into fields marked `transient`, with the same function as
its `derive`, and every rule reads the fields. That is what VOID IF REMOVED does
([chapter 5, stop 3](05-a-real-game.md#3-the-stats-where-effects-become-numbers), and below).

## The tooltip

Now the third problem: telling the player why. `explainStat` takes the same bus and the same arguments as `statValue`
and returns a `StatBreakdown`: the base, the summed adds, the product of the multipliers, the value before and after the
caps, which cap is biting, and `sources`, every contribution to that stat in the order they were collected.

```ts
const NAMES: Record<string, string> = {
  "kitchen:copper": "Copper base",
  "boosts:rolling-boil": "Rolling boil",
  "medals:ten-burners": "Full stove",
  milestone: "Burner milestones",
};

export function whyHeat(s: Cooking, now: number): string[] {
  const b = explainStat(busFor(s, now), "heat", 1, HEAT);
  const bySource = new Map<string, { add: number; mult: number }>();
  for (const { source, effect } of b.sources) {
    const row = bySource.get(source) ?? { add: 0, mult: 1 };
    row.add += effect.add ?? 0;
    row.mult *= effect.mult ?? 1;
    bySource.set(source, row);
  }
  const lines = [...bySource].map(([source, row]) => {
    const amount = row.add !== 0 ? fmtPlus(row.add) : fmtTimes(row.mult);
    return `${amount}  ${NAMES[source] ?? source}`;
  });
  lines.push(`= ${fmtTimes(b.value)}${b.softcapped ? `  (${b.softcapped})` : ""}`);
  return lines;
}
```

`docs/examples/guide-effects.ts`

Two things here are work the engine leaves to you, and it is fair to say so.

- **Sources are ids, not names.** A contribution carries `kitchen:copper`, so the tooltip needs its own table to turn
  that into "Copper base". In a real game you would build that table from the content (every node's `name`, every
  buff's) rather than by hand.
- **One rank is one row.** Three copper ranks arrive as three contributions, so the tooltip groups them by source and
  multiplies them together before showing one line.

Run the file and the tooltip prints:

```
   ×1.95  Copper base
   ×3.00  Rolling boil
   ×1.10  Full stove
   +0.50  Burner milestones
   = ×9.66
```

On a page, these lines go inside the `Tooltip` from `watchpot/ui` over the stove's rate (chapter 10 builds the page).
The function itself is plain TypeScript, which is why it can live beside the game and be checked in a test.

## The live graph

The bus has one limit you will hit: an effect is a constant. "×1.25" is a number written in content. Some effects are
not like that. "Heat times the log of the bubbles held" changes every tick, and "one stat feeds another" needs the
first stat worked out before the second.

For those the engine has a second tool, the [live graph](../glossary.md#live-graph) (`liveIndex`, on the shelf as
[The stat graph](../stat-graph.md)). You index each source once, from content, with effects whose `value` is a function
of the state:

```ts
const LIVE = liveIndex<"heat", never, Cooking>({ caps: { heat: HEAT } });
LIVE.add(
  { effects: [{ stat: "heat", op: "mul", value: (s) => 1.25 ** (s.kitchen.ranks.copper ?? 0) }] },
  { label: "Copper base", owner: "kitchen", active: (s) => (s.kitchen.ranks.copper ?? 0) > 0 },
);
LIVE.add(
  // Multiplied by the log of the bubbles held: it changes every tick, so no fixed effect could carry it.
  { effects: [{ stat: "heat", op: "mul", value: (s) => s.wallet.bubbles.add(1).log10() }] },
  { label: "A full pot", owner: "wallet", active: (s) => s.wallet.bubbles.gte(1000) },
);

export function liveHeat(s: Cooking): { value: Decimal; lines: string[] } {
  const b = LIVE.over(s).explain("heat");
  return { value: b.value, lines: b.parts.map((p) => `${fmtTimes(p.value)}  ${p.label}`) };
}
```

`docs/examples/guide-effects.ts`

What is different from the bus:

- **Each effect's `value` reads the state.** The copper base computes its ranks' worth itself, so it is one effect,
  not one per rank.
- **Each source has a `label`, an `owner` and an `active` test.** The breakdown's `parts` carry the label, so the
  tooltip needs no names table.
- **Everything is a [Decimal](../glossary.md#decimal).** The bus works in `number`, which stops at about 1e308. Idle
  games pass that, and the live graph does not care.
- **`LIVE.over(s)` makes a graph for one state.** It works each stat out the first time you read it and keeps it, so
  make a new graph whenever the state changes.

The script ends by asking the live graph about the same pot holding a million bubbles, and prints
`live heat ×11.71 [ "×1.95  Copper base", "×6.00  A full pot" ]`.

The live graph also has flags (a source can switch a mechanic on while it is active), mute groups (silence a set of
sources, say during a challenge) and stats that read other stats. The reference page covers those.

Its caps take the same `StatDef`, and the order is the same: (base + adds) × mults, softcap, hardcap. Two things are
spelled differently, and both will catch you moving between them. The live graph's base defaults to 1 for every stat,
while `statValue`'s defaults to 0 (Simmer passes 1 to the bus by hand). And a live effect says `op: "mul"`, where a bus
effect has a `mult` field.

## The honest part: the real game folds its own

VOID IF REMOVED, the game built on this engine, uses neither the bus nor the live graph. It has its own fold, in its own
file, and every number in the game goes through it. Here is how it starts:

```ts
/**
 * The stat bus: every multiplier and addition in the game, from every page, folded into named stats. Multipliers
 * are summed in log10, so a stat may pass 1e308 and a breakdown by source is the same walk with `onPart` set.
 * Nothing else reads the content's effects. `stats.ts` runs it once a pass.
 */
// ...

/** One line of a breakdown: who raised which stat, by how much (a multiplier in log10, or an addition). */
export interface Part {
  source: string;
  stat: string;
  log?: number;
  add?: number;
}

// ...

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
  const power = 10 ** (log["misfeed.power"] ?? 0);
  if (buffActive(s.boosts, "hot-run", now)) mul("boosts:hot-run", "print", MISFEED.hotRun.mult * power);
  if (buffActive(s.boosts, "double-feed", now))
    mul("boosts:double-feed", "press", MISFEED.doubleFeed.mult * power);
  // ...
  return { log, add, flags };
}
```

VOID IF REMOVED, `src/game/bus.ts`

Read it against what you just built and most of it is familiar. `apply` is `busOf` for one source. `Part` is a
contribution. `onPart` is how its breakdown gets the same walk `explainStat` gives you. What differs is why it exists:

- **Multipliers are kept as log10.** Adding logs is multiplying, and a log never overflows, so a stat can pass 1e308 in
  a plain `number`. The engine's bus would overflow there.
- **An effect can be written in orders of magnitude** (`log`, beside `mul` and `add`), for a multiplier too large to
  write as a number at all.
- **`times` scales an effect by ranks held,** so ten ranks are one call, not ten contributions.
- **Items raise flags** as well as effects, and the fold can read a stat it has already folded (the buffs above are
  scaled by `misfeed.power`, folded earlier in the same walk).

The buffs are the clearest sign of the split. The game uses the engine's `buffs` for the timing and gives every buff
no effects at all (`effects: () => []`, quoted in
[chapter 6](06-the-first-page.md#surprises-and-timed-boosts-spawns-and-buffs); on the current engine a timer buff
leaves `effects` out). The fold then asks `buffActive(s.boosts, "hot-run", now)` by id, as you saw above. The buff is
a timer; the fold decides what it is worth.

The rest of the shape is the one [chapter 5](05-a-real-game.md#3-the-stats-where-effects-become-numbers) quoted: a
`stats` feature in `src/game/stats.ts` folds once a pass in `rates` into transient fields, with the same function as
its `derive`, and every rule reads a stat through four small readers in `src/game/reads.ts` (`logOf`, `mulOf`, `addOf`
and `has`). Simmer folds where its one stat applies; the game has dozens of rules reading dozens of stats, so it folds
once and lets them all read the result.

So the idea is the engine's: sources declare effects, one fold, a fixed order, a breakdown from the same walk. The
implementation is the game's.

### What the engine would need for the game to use it

The live graph already has most of it: Decimals, flags, mute groups, stats reading stats. What it lacks for this game:

- **A fold you can keep in the state.** The live graph is lazy and tied to one state object. The game wants plain
  records in the draft that every rule reads cheaply, many times a pass. That works with the live graph only by reading
  every stat off a fresh graph into the state each pass, which is the fold again.
- **Effects written in orders of magnitude,** a `log` op beside `add` and `mul`, so content can say "×1e500" without
  writing a function.
- **Effects scaled by ranks,** so a ranked item is one source with a count, as `times` does.

The bus, for its part, would need all of the above plus a number type that does not overflow.

### Which to reach for

For a new game:

- **Start with the bus** (`busOf`, `statValue`, `explainStat`) when every effect is a constant bought in ranks and no
  stat will pass about 1e300. Most small idle games are this. The systems hand you contributions for it already.
- **Use the live graph** (`liveIndex`) when an effect's value reads the state or another stat, when you need flags or
  mutes, or when numbers will outgrow `number`. It shares the bus's caps and order, and a game can use both.
- **Fold your own** only when you need what neither has, as above, and keep the engine's shape when you do: effects as
  data on the content, one fold, a `stats` feature with `derive`, readers. That is what VOID IF REMOVED did.

If you are going to copy a game, copy the shape, not the file.

## Things that bite

- **A new medal counts from the next pass.** Medals are checked in the `settle` phase, after `rates` has read the bus
  and `produce` has paid. The example prints the rate before and after: 219 a second on the pass the medal is earned,
  241 on the next. A tooltip that calls `explainStat` fresh shows the new number one pass early.
- **Feature order is step order.** Within a phase, steps run in feature-list order unless `defineGame({ order })` pins
  some first (chapter 3). A step that multiplies a rate must run after the step that sets it, and a fold kept in the
  state must run before anything that reads it. Nothing warns you when it does not; the rate is just wrong, or a pass
  behind.
- **Generator milestones are not on the bus.** `generators({ list: [{ milestones }] })` multiplies inside the generator,
  so `explainStat` never sees it. Simmer writes its milestone as a contribution for exactly that reason. If you use the
  built-in milestones, show them in the tooltip yourself (the list's `rules.boost(state, id)` gives their product).
- **A typo in a stat id is silent.** `Effect.stat` is a `string`, and the bus folds whatever it is given. `{ stat:
  "haet" }` makes a stat nobody reads. The ids in `vocab({ stats })` do not type it.
- **The bus overflows past 1e308.** It is `number` throughout. A stat that grows without bound wants the live graph.

## Next

[Chapter 9, Saving and time away](09-saving-and-time-away.md): what the save holds, what a load does with it, and how
the burners pay for the hours the tab was closed.

## Reference

- [The stat graph](../stat-graph.md) for the live graph and "The first pass after a load", [Buffs](../buffs.md),
  [Upgrade tree](../upgrade-tree.md), [Achievements](../achievements.md) and [Generators](../generators.md) on the
  reference shelf.
- `api/core/graph/stats.d.ts`: `busOf`, `statValue`, `statTotals`, `explainStat`, `applySoftcap`, `Effect`,
  `Contribution`, `StatBus`, `StatDef`, `Softcap`, `StatBreakdown`.
- `api/core/graph/live.d.ts`: `liveIndex`, `LiveIndex`, `LiveEffect`, `LiveMeta`, `StatGraph`, `StatPart`,
  `LiveBreakdown`, `softcapDecimal`.
- `api/core/tree.d.ts` (`Tree.contributions`, `rankContributions`), `api/core/buffs.d.ts` (`BuffsFeature.contributions`,
  `buffActive`), `api/core/achievements.d.ts` (`AchievementBoard.contributions`, `rowEffects`, `power`),
  `api/core/generators.d.ts` (`GeneratorsDef.mult`, `GeneratorRules.boost`).
- `api/core/fmt.d.ts`: `fmtTimes`, `fmtPlus`, `fmtRate`.
