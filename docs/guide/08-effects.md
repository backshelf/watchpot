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
{ stat: "heat", mul: 1.25 }
{ stat: "heat", add: 0.5 }
```

An effect with where it came from is a [contribution](../glossary.md#contribution):

```ts
{ source: "kitchen:copper", effect: { stat: "heat", mul: 1.25 } }
```

The source is a string. It is what the tooltip later turns back into a name the player reads.

The engine's systems already speak this language. An `upgradeTree` node carries `effects`, and the tree hands back one
contribution per rank held. A `buffs` entry may carry `effects`, and the feature hands back the running ones. An
`achievements` entry carries `effects` for while it is earned. So does anything you write yourself, because a
contribution is only an object.

## Four sources for one number

Here are Simmer's four, each declared where it lives. First the upgrade, a copper base for the stove:

<!-- example-code: guide-effects.ts -->

```ts
const COPPER: GraphNode<Effect<"heat">, "bubbles"> = {
  id: "copper",
  name: "Copper base",
  line: "Spreads the heat.",
  cost: [{ currency: "bubbles", amount: 100 }],
  costGrowth: 3,
  maxLevel: 5,
  requires: [],
  effects: [{ stat: "heat", mul: 1.25 }],
};
export const kitchen = upgradeTree({ key: "kitchen", nodes: [COPPER], wallet });
```

`docs/examples/guide-effects.ts`

The node's `effects` apply once per rank, so three ranks are three contributions of ×1.25. The tree's key, `kitchen`,
becomes the first half of the source: `kitchen:copper`.

The buff, a rolling boil:

<!-- example-code: guide-effects.ts -->

```ts
export const boosts = buffs<"boosts", Effect<"heat">>({
  key: "boosts",
  list: [
    { id: "rolling-boil", durationMs: 30_000, stack: "refresh", effects: () => [{ stat: "heat", mul: 3 }] },
  ],
});
```

`docs/examples/guide-effects.ts`

A [buff](../glossary.md#buff) runs from the [game time](../glossary.md#game-time) it started for `durationMs`. Its
`effects` is a function of its stacks and strength, because a stacking buff can be worth more the more it stacks. In
chapter 6 the rolling boil had no `effects` and was read by name where it applied; here it says what it does, so the
stats can count it with everything else. The second type argument, `Effect<"heat">`, says what kind of effect the list
holds (and that the only stat it may name is `heat`); the engine's types are generic over it so a game can bring its
own effect shape (more on that at the end).

The medal:

<!-- example-code: guide-effects.ts -->

```ts
export const medals = achievements<"medals", Simmer, Effect<"heat">>({
  key: "medals",
  columns: 5,
  list: [
    {
      id: "ten-burners",
      name: "Full stove",
      line: "Light ten burners.",
      effects: [{ stat: "heat", mul: 1.1 }],
      when: (s: Simmer) => s.stove.burners >= 10,
    },
  ],
});
```

`docs/examples/guide-effects.ts`

And the milestone, which no engine system makes for you here, so you write the contribution yourself:

<!-- example-code: guide-effects.ts -->

```ts
function milestones(s: Pick<Simmer, "stove">): Contribution<"heat">[] {
  const reached = Math.floor(s.stove.burners / 25);
  return reached > 0 ? [{ source: "milestone", effect: { stat: "heat", add: 0.5 * reached } }] : [];
}
```

`docs/examples/guide-effects.ts`

Notice what none of these mention: the stove's rate. The copper base does not know a stove exists. It says "heat,
times 1.25", and that is the whole of its job.

## The stats feature

The [stats feature](../glossary.md#stats-feature) is where the claims meet. `stats` declares each stat once, with its
base and caps, takes every contribution in one list, and serves each stat on the state as a Decimal: `s.stats.heat`.

<!-- example-code: guide-effects.ts -->

```ts
export const HEAT: StatCaps = { softcap: { start: 20, power: 0.5, label: "The pot spits over the rim" } };
```

`docs/examples/guide-effects.ts`

<!-- example-code: guide-effects.ts -->

```ts
export const heat = stats({
  key: "stats",
  vocab: WORDS,
  reach: () => SOURCES,
  stats: { heat: { base: 1, ...HEAT } },
  contributions: (s) => [
    ...kitchen.tree.contributions(s.kitchen.ranks),
    // The buffs' own step ends a buff whose time is up at the start of every pass, so each one listed is running.
    ...boosts.select.contributions(s, Number.NEGATIVE_INFINITY),
    ...medals.board.contributions(s.medals.earned),
    ...milestones(s),
  ],
  label: (source) => NAMES[source] ?? source,
});
```

`docs/examples/guide-effects.ts`

Line by line:

- `HEAT` holds the caps, a `StatCaps`. A [softcap](../glossary.md#softcap) slows a stat down past `start`: above it
  the value is `value^power × start^(1 - power)`, so with `power` 0.5 it grows like a square root. The `label` is the
  line a player reads while the softcap is biting. A `hardcap` would be a ceiling it never passes. Heat has no hardcap.
- `vocab: WORDS` is chapter 4's words, whose `stats: ["heat"]` names the one stat; `stats` must give every stat
  its `base`. There is no default base: 1 here, because heat multiplies.
- `reach: () => SOURCES` is the state the contributions read: chapter 4's features and the three above.
- `kitchen.tree.contributions(ranks)` is every rank held, sourced `kitchen:<node>`.
- `boosts.select.contributions(state, now)` is every buff running at `now`, sourced `boosts:<id>`. A stat reads the state and
  never the clock, and the buffs end themselves at the start of each pass, so every buff still listed counts.
- `medals.board.contributions(earned)` is every earned medal's effects, sourced `medals:<id>`.
- `label` turns a source id into the name a player reads (the table is in the tooltip section below).

Then the one order, the same everywhere in the engine:

```
(base + every add) × every mul, then the softcap, then the hardcap
```

With three copper ranks, the rolling boil, the medal and 25 burners, heat is (1 + 0.5) × 1.25³ × 3 × 1.1 = ×9.66,
under the softcap's start, so the softcap does nothing yet. The stat is never saved: it is worked out on load, and
again whenever a slice it read changes (a rank bought, a buff started), so whatever reads `s.stats.heat` reads it
current.

The order is the answer to the second problem from the if-chain. An add is always worth the same no matter which file
it came from, because every add lands before every multiplier.

## Reading the stat where it applies

The stove sets its rate in its own `rates.flame` step, and chapter 3's lid doubles it in `rates.trap`. Heat applies the
same way: a small feature multiplies the stove's rate by `s.stats.heat`, right after the lid.

<!-- example-code: guide-effects.ts -->

```ts
export const fire = feature({
  key: "fire",
  reach: [...SOURCES, heat],
  initial: () => ({}),
  steps: {
    rates: {
      stoke: {
        after: "lid.rates.trap",
        run: (s) => {
          s.stove.perSecond = s.stove.perSecond.mul(s.stats.heat);
        },
      },
    },
  },
});

export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  vocab: WORDS,
  features: [...SOURCES, heat, fire],
});
```

`docs/examples/guide-effects.ts`

You have seen every part of this in chapter 3; here is what each does for the stat.

- `reach: [...SOURCES, heat]` lets the fire read the stove and the stats, and the game lists the same features.
- `initial: () => ({})`: the fire saves nothing. Heat is worked out from things that are saved, so saving it too would
  only give a load something to disagree with.
- `steps: { rates: { stoke } }` multiplies the stove's rate every [pass](../glossary.md#pass), in the `rates`
  [phase](../glossary.md#phase), before anything is paid in `produce`, and `after` pins it behind the lid's step, so
  heat multiplies the doubled rate.
- The stats feature has no step and no place in the order: its values are derived, current wherever they are read.

The stove itself reads nothing new: its rate is set, doubled and multiplied by three steps that each know only their
own part. A factory with a callback reads it the same way: a `generators` list's `mult: (s) => s.stats.heat` applies
heat where the generators make their rate, with no step of your own.

## The tooltip

Now the third problem: telling the player why. `heat.select.explain(state, "heat")` returns a `StatBreakdown`: the
base, the summed adds, the product of the multipliers, the value before and after the caps, which cap is biting, and
`parts`, one row per source in the order they arrived, each with its `label`, its `op`, what it comes to (`value`) and
how many times over it counted (`times`).

<!-- example-code: guide-effects.ts -->

```ts
const NAMES: Record<string, string> = {
  "kitchen:copper": "Copper base",
  "boosts:rolling-boil": "Rolling boil",
  "medals:ten-burners": "Full stove",
  milestone: "Burner milestones",
};
```

`docs/examples/guide-effects.ts`

<!-- example-code: guide-effects.ts -->

```ts
export function whyHeat(s: StateOf<typeof game.features>): string[] {
  const b = heat.select.explain(s, "heat");
  const lines = b.parts.map((p) => `${p.op === "add" ? fmtPlus(p.value) : fmtTimes(p.value)}  ${p.label}`);
  lines.push(`= ${fmtTimes(b.value)}${b.softcapped ? `  (${b.softcapped})` : ""}`);
  return lines;
}
```

`docs/examples/guide-effects.ts`

Two things to see here.

- **Sources are ids, not names.** A contribution carries `kitchen:copper`, so the feature's `label` turns it into
  "Copper base" through a table. In a real game you would build that table from the content (every node's `name`,
  every buff's) rather than by hand.
- **One rank is one row.** Three copper ranks arrive as three contributions of the same effect, and the feature
  counts them as one row with `times: 3` whose value is 1.25³.

Run the file and the tooltip prints:

<!-- example-output: guide-effects.ts lines=3-7 -->

```
   ×1.95  Copper base
   ×3.00  Rolling boil
   ×1.10  Full stove
   +0.50  Burner milestones
   = ×9.66
```

On a page, these lines go inside the `Tooltip` from `watchpot/ui` over the stove's rate (chapter 10 builds the page).
The function itself is plain TypeScript, which is why it can live beside the game and be checked in a test.

## An effect that reads the state

An amount need not be a constant. "×1.25" is a number written in content, but "heat times the log of the bubbles
held" changes every tick, and "one stat feeds another" needs the first stat worked out before the second. An effect's
amount may be a function of the state: `{ stat: "heat", mul: (s) => s.wallet.bubbles.add(1).log10() }`, and in a
`stats` feature's own `sources` it may read another stat (`(q) => q.stats.luck.sqrt()`).

The feature is built on the [stat graph](../glossary.md#stat-graph) (`statIndex`, on the shelf as
[Stats](../stat-graph.md)), which a game can also use by hand, for a state that is never in the store. Each source is
indexed once, with a `label`, an `owner`, and when and how many times over it counts:

<!-- example-code: guide-effects.ts -->

```ts
const POT = statIndex<"heat", never, Cooking>({ base: () => 1, caps: { heat: HEAT } });
POT.add(
  { effects: [{ stat: "heat", mul: 1.25 }] },
  { label: "Copper base", owner: "kitchen", times: (s) => s.kitchen.ranks.copper ?? 0 },
);
POT.add(
  // Multiplied by the log of the bubbles held: it changes every tick, so no fixed number could carry it.
  { effects: [{ stat: "heat", mul: (s) => s.wallet.bubbles.add(1).log10() }] },
  { label: "A full pot", owner: "wallet", active: (s) => s.wallet.bubbles.gte(1000) },
);

/** Heat and its breakdown over one state, worked out on first read. */
export function potHeat(s: Cooking): { value: Decimal; lines: string[] } {
  const b = POT.over(s).explain("heat");
  return { value: b.value, lines: b.parts.map((p) => `${fmtTimes(p.value)}  ${p.label}`) };
}
```

`docs/examples/guide-effects.ts`

- **`times` counts a source over.** The copper base is one source counted once per rank: one row, ×1.25³.
- **Everything is a [Decimal](../glossary.md#decimal).** Idle games pass 1e308, and the graph does not care.
- **`POT.over(s)` makes a graph for one state.** It works each stat out the first time you read it and keeps it, so
  make a new graph whenever the state changes. The stats feature does that for you.

<!-- example-prints: guide-effects.ts | live heat ×11.71 [ "×1.95  Copper base", "×6.00  A full pot" ] -->

The script ends by asking the graph about the same pot holding a million bubbles, and prints
`live heat ×11.71 [ "×1.95  Copper base", "×6.00  A full pot" ]`.

Sources may also raise flags (a mechanic switched on while they count), and belong to a mute group (silenced, say,
during a challenge: their rows stay in the breakdown, marked, and stop counting). The reference page covers those.

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

Read it against what you just built and most of it is familiar. `apply` is one source's rows. `Part` is a
contribution. `onPart` is how its breakdown gets the same walk `select.explain` gives you. What differs is why it
exists (it was written before the engine's stats feature):

- **Multipliers are kept as log10.** Adding logs is multiplying, and a log never overflows, so a stat can pass 1e308 in
  a plain `number`. The engine reaches the same with Decimals.
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

### What the engine has now, and what it still lacks

The stats feature covers most of what that fold was written for: Decimals, flags, mute groups, stats reading stats,
`times` for a ranked source, and values kept on the state that every rule reads cheaply. What it lacks for this game is
an effect written in orders of magnitude, a `log` amount beside `add` and `mul`, so content can say "×1e500" without
writing a function (a string amount, `mul: "1e500"`, carries a constant).

For a new game, declare a `stats` feature. Fold your own only when you need what it has not, and keep the engine's
shape when you do: effects as data on the content, one fold, a fixed order, a breakdown from the same walk. If you are
going to copy a game, copy the shape, not the file.

## Things that bite

- **A new medal counts from the next pass's rate.** Medals are checked in the `settle` phase, after `rates` has
  multiplied the stove's rate and `produce` has paid. The example prints the rate before and after: 219 a second on the
  pass the medal is earned, 241 on the next. `s.stats.heat` itself moves at once, so a tooltip shows the new number
  one pass before the rate does.
- **Feature order is step order.** Within a phase, steps run in feature-list order unless a step says `after` or
  `before` (chapter 3). A step that multiplies a rate must run after the step that sets it. Nothing warns you when it
  does not; the rate is just wrong. A derived stat has no such order: it is current wherever it is read.
- **Generator milestones are not in the stats.** `generators({ list: [{ milestones }] })` multiplies inside the
  generator, so the breakdown never sees it. Simmer writes its milestone as a contribution for exactly that reason. If
  you use the built-in milestones, show them in the tooltip yourself (the list's `rules.boost(state, id)` gives their
  product).
- **Type the content's effects.** `Effect` alone takes any stat id, and the stats feature refuses contributions whose
  stat is a plain `string`; `Effect<"heat">` (or `Effect<StatOf<typeof WORDS>>`) makes `{ stat: "haet" }` a type error.
  An arrow returning effects may need its return type said (`(): Effect<"heat">[] => …`), or the literal widens.

## Next

[Chapter 9, Saving and time away](09-saving-and-time-away.md): what the save holds, what a load does with it, and how
the burners pay for the hours the tab was closed.

## Reference

- [Stats](../stat-graph.md), [Buffs](../buffs.md), [Upgrade tree](../upgrade-tree.md),
  [Achievements](../achievements.md) and [Generators](../generators.md) on the reference shelf.
- `api/core/stats.d.ts`: `stats`, `StatDef`, `StatSourceDef`, `Contribution`, `StatsSelect`, `StatsValues`,
  `RESERVED_STAT_IDS`.
- `api/core/graph/stats.d.ts`: `Effect`, `Amount`, `Softcap`, `StatCaps`, `statIndex`, `StatIndex`, `SourceMeta`,
  `StatGraph`, `StatPart`, `StatBreakdown`, `applySoftcap`.
- `api/core/tree.d.ts` (`Tree.contributions`, `rankContributions`), `api/core/buffs.d.ts` (`BuffsFeature.contributions`,
  `buffActive`), `api/core/achievements.d.ts` (`AchievementBoard.contributions`, `rowEffects`, `power`),
  `api/core/generators.d.ts` (`GeneratorsDef.mult`, `GeneratorRules.boost`).
- `api/core/fmt.d.ts`: `fmtTimes`, `fmtPlus`, `fmtRate`.
