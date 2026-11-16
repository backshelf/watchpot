# Effects

By the end of this chapter Simmer's stove will make bubbles at a rate that four separate things change: an upgrade,
a timed buff, a medal and a milestone. None of them will know about the others, and a tooltip will say where every
part of the rate comes from. You will also know why the real game built on this engine folds its numbers its own way,
and which of the two approaches to reach for in a game of your own.

Everything here is in one file you can run: `docs/examples/guide-effects.ts`. It starts from chapter 4's Simmer
(`docs/examples/simmer/game-wallet.ts`: the wallet, the pot, the stove, the lid and the stats), adds an upgrade tree,
a buff and a medal beside it (chapters 6 and 7), and a stats feature that counts them all. The stove does not change:
since chapter 3 its rate has been its flame times `s.stats.heat`.

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

The fix is to turn it around. Each source says what it does to a named number, as data. One place collects every
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

The engine's systems already speak this language. An upgrade tree's node carries `effects`, and the tree hands back
one contribution per rank held. A buff may carry `effects`, and the buffs feature hands back the running ones. An
achievement carries `effects` for while it is earned. So does anything you write yourself, because a
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
export const kitchen = defineUpgradeTree({ key: "kitchen", nodes: [COPPER], wallet });
```

`docs/examples/guide-effects.ts`

The node's `effects` apply once per rank, so three ranks are three contributions of ×1.25. The tree's key, `kitchen`,
becomes the first half of the source: `kitchen:copper`.

The buff, a rolling boil:

<!-- example-code: guide-effects.ts -->

```ts
export const boosts = defineBuffs<"boosts", Effect<"heat">>({
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
holds (and that the only stat it may name is `heat`). The type arguments are needed here because nothing else in the call says what the
effects are: the list is read before the arrow's return type is.

The medal:

<!-- example-code: guide-effects.ts -->

```ts
export const medals = defineAchievements({
  key: "medals",
  columns: 5,
  reach: () => [stove],
  list: [
    {
      id: "ten-burners",
      name: "Full stove",
      line: "Light ten burners.",
      effects: [{ stat: "heat", mul: 1.1 } satisfies Effect<"heat">],
      when: (s) => s.stove.burners >= 10,
    },
  ],
});
```

`docs/examples/guide-effects.ts`

And the milestone, which no engine system makes for you here, so you write the contribution yourself:

<!-- example-code: guide-effects.ts -->

```ts
function milestones(s: { stove: { burners: number } }): Contribution<"heat">[] {
  const reached = Math.floor(s.stove.burners / 25);
  return reached > 0 ? [{ source: "milestone", effect: { stat: "heat", add: 0.5 * reached } }] : [];
}
```

`docs/examples/guide-effects.ts`

Notice what none of these mention: the stove's rate. The copper base does not know a stove exists. It says "heat,
times 1.25", and that is the whole of its job.

## The stats feature

The [stats feature](../glossary.md#stats-feature) is where the claims meet. You have had one since chapter 3, with the
lid as its one source. `defineStats` declares each stat once, with its base and caps, takes declared `sources` and
every contribution in one list, and serves each stat on the state as a Decimal: `s.stats.heat`. This chapter's game
lists a bigger one in place of chapter 4's:

<!-- example-code: guide-effects.ts -->

```ts
export const HEAT: StatCaps = { softcap: { start: 20, power: 0.5, label: "The pot spits over the rim" } };
```

`docs/examples/guide-effects.ts`

<!-- example-code: guide-effects.ts -->

```ts
export const heat = defineStats({
  key: "stats",
  vocab: WORDS,
  reach: () => [lid, stove, kitchen, boosts, medals],
  stats: { heat: { base: 1, ...HEAT } },
  // Chapter 3's lid, declared here as a source...
  sources: [LID_HEAT],
  // ...and the four sources above, handed over as contributions.
  contributions: (s) => [
    ...kitchen.select.contributions(s),
    // Every buff still held: the buffs' own step ends the expired ones at the start of each pass.
    ...boosts.select.contributions(s),
    ...medals.select.contributions(s),
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
- `reach` is the state the sources read: the lid, the stove (for the milestone) and the three sources above.
- `sources: [LID_HEAT]` is chapter 3's lid, unchanged. A declared source says when it counts (`active`); a
  contribution comes ready-made from a feature that knows its own effects.
- `kitchen.select.contributions(state)` is every rank held, sourced `kitchen:<node>`.
- `boosts.select.contributions(state)` is every buff held, sourced `boosts:<id>`. A stat reads the state and never
  the clock, and the buffs end themselves at the start of each pass, so every buff still held counts.
- `medals.select.contributions(state)` is every earned medal's effects, sourced `medals:<id>`.
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

The stove is chapter 4's, imported as it is. Its rate has read heat since chapter 3:

<!-- example-code: simmer/game-wallet.ts -->

```ts
// The stats by their state type, so any game that lists a stats feature with a `heat` stat can hold this stove.
reach: () => [wallet, reach<{ stats: { heat: Decimal } }>()],
// ...
// The burners' flame, times heat: the one number every multiplier on the stove goes into.
perSecond: (s) => flameOf(s.stove.burners).mul(s.stats.heat),
```

`docs/examples/simmer/game-wallet.ts`

- The stove names the stats by their state type, not by value. That is what lets this chapter list its own stats
  feature in place of chapter 4's: any feature under the key `stats` with a `heat` stat will do. It is also needed
  here for a second reason: this stats feature reads the stove (the milestone counts burners), and two features that
  read each other cannot both name the other by value.
- Nothing orders the two. Heat is a derived value of the stats feature and the rate is a derived value of the stove;
  the engine works heat out first because the rate reads it, and both are current wherever they are read.

The game lists chapter 4's features, the three new sources and the bigger stats feature:

<!-- example-code: guide-effects.ts -->

```ts
export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  vocab: WORDS,
  features: [...SIMMER, kitchen, boosts, medals, heat],
});
```

`docs/examples/guide-effects.ts`

`SIMMER` is chapter 4's features without their stats. A factory with a callback reads a stat the same way the stove
does: a `defineGenerators` list's `mult: (s) => s.stats.heat` applies heat where the generators make their rate, with
the stats in its `reach`.
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

VOID IF REMOVED, the game built on this engine, does not use the stats feature: it was written on an older engine,
before the feature existed, and has its own fold, in its own file, which every number in the game goes through. Here
is how that game's code starts:

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

The buffs are the clearest sign of the split. The game uses the engine's buffs for the timing and gives every buff
no effects at all (`effects: () => []`, quoted in
[chapter 6](06-the-first-page.md#surprises-and-timed-boosts-spawns-and-buffs); on the current engine a timer buff
leaves `effects` out). The fold then asks `buffActive(s.boosts, "hot-run", now)` by id, as you saw above. The buff is
a timer; the fold decides what it is worth.

The rest of the shape is the one [chapter 5](05-a-real-game.md#3-the-stats-where-effects-become-numbers) quoted: a
`stats` feature in `src/game/stats.ts` folds once a pass in a `rates` step into fields it never saves, and every rule
reads a stat through four small readers in `src/game/reads.ts` (`logOf`, `mulOf`, `addOf` and `has`). The engine's
stats feature gives the same thing as derived values, with no step, and every rule reads `s.stats.<id>`.

So the idea is the engine's: sources declare effects, one fold, a fixed order, a breakdown from the same walk. The
implementation is the game's.

### What the engine has now, and what it still lacks

The stats feature covers most of what that fold was written for: Decimals, flags, mute groups, stats reading stats,
`times` for a ranked source, and values kept on the state that every rule reads cheaply. What it lacks for this game is
an effect written in orders of magnitude, a `log` amount beside `add` and `mul`, so content can say "×1e500" without
writing a function (a string amount, `mul: "1e500"`, carries a constant).

For a new game, declare a `defineStats` feature. Fold your own only when you need what it has not, and keep the engine's
shape when you do: effects as data on the content, one fold, a fixed order, a breakdown from the same walk. If you are
going to copy a game, copy the shape, not the file.

## Things that bite

- **A new medal pays from the next pass.** Medals are checked in the `settle` phase, after `produce` has paid. The
  pass that earns the medal paid at the old rate; the rate read after it already counts the medal. The example prints
  both: 219 a second before the medal, 241 once it is earned.
- **Two features that read each other need a type reach.** The stats read the stove, and the stove reads the stats.
  Name one side by value and the other by its state type (`reach<{ stats: { heat: Decimal } }>()`); naming both by
  value is a type error about a type referring to itself.
- **A stat cannot read the clock.** A buff counts while it is held, and the buffs end themselves at the start of each
  pass. A source whose worth changes with time inside one pass belongs in a step, not a stat.
- **Generator milestones are not in the stats.** `defineGenerators({ list: [{ milestones }] })` multiplies inside the
  generator, so the breakdown never sees it. Simmer writes its milestone as a contribution for exactly that reason. If
  you use the built-in milestones, show them in the tooltip yourself (`kettles.select.boost(state, id)` gives their
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
- `api/core/stats.d.ts`: `defineStats`, `StatDef`, `StatSourceDef`, `Contribution`, `foldContributions`,
  `StatsSelect`, `StatsValues`, `RESERVED_STAT_IDS`.
- `api/core/graph/stats.d.ts`: `Effect`, `Amount`, `Softcap`, `StatCaps`, `statIndex`, `StatIndex`, `SourceMeta`,
  `StatGraph`, `StatPart`, `StatBreakdown`, `applySoftcap`.
- `api/core/tree.d.ts` (`select.contributions`, `rankContributions`), `api/core/buffs.d.ts` (`select.contributions`,
  `buffActive`), `api/core/achievements.d.ts` (`select.contributions`, `rowEffects`, `power`),
  `api/core/generators.d.ts` (`GeneratorsDef.mult`, `select.boost`).
- `api/core/fmt.d.ts`: `fmtTimes`, `fmtPlus`, `fmtRate`.
