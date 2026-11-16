# Stats

The engine's one stat system. A stat is a named number many things change (`heat`, `output`, `dig`); an effect is one
change to it, and a game declares its stats once, in a `stats` feature, and reads each one off the state as a
`Decimal`: `s.stats.output`.

Example: [`examples/stat-graph.ts`](examples/stat-graph.ts) (the feature), and
[`examples/loadouts.ts`](examples/loadouts.ts) (one graph by hand, to score a loadout that is only being weighed).

## Effects

One spelling everywhere, on a tree's nodes, a buff, an achievement, a card, a source of your own:

```ts
{ stat: "heat", add: 0.5 }                        // added to the base
{ stat: "heat", mul: 1.25 }                       // a multiplier
{ stat: "heat", mul: (q) => q.pot.bubbles.add(1).log10() } // an amount read off the state
{ stat: "heat", mul: 2, quiet: true }             // counts like any other; marked for a screen that hides small print
```

An amount is a `DecimalSource` (a number, a string such as `"1e400"`, a `Decimal`) or a function of the state that
returns one. The type is `Effect<S, Q>`: `S` the stat ids (`Effect<"heat">` makes a typo in content a type error),
`Q` the state an amount reads.

One order, everywhere: `(base + every add) x every mul`, then the softcap, then the hardcap, in Decimals. A
[softcap](glossary.md#softcap) past `start` makes the value `value^power x start^(1 - power)` (The Modding Tree's), and
its `label` is the line a player reads while it bites; a `hardcap` is a ceiling.

## The `stats` feature

```ts
export const numbers = stats({
  key: "stats",
  vocab: WORDS, // its stats, `vocab({ stats: ["output", "offline", "gain"] })`
  reach: () => [upgrades, collection, reach<{ prestige: { currency: Decimal } }>()],
  stats: {
    output: { base: 1 },
    offline: { base: 0.5, hardcap: 1 },
    gain: { base: 1, softcap: { start: 100, power: 0.5, label: "Diminishing returns" } },
  },
  flags: ["autoBuy"],
  sources: [
    {
      label: "Orbits",
      owner: "prestige",
      effects: [{ stat: "output", mul: (q) => 1 + 0.1 * q.prestige.currency.toNumber() }],
    },
  ],
  contributions: (s) => [
    ...rankContributions("upgrades", NODES, s.upgrades.ranks),
    ...ITEMS.flatMap((item) =>
      Array.from({ length: s.collection.owned[item.id] ?? 0 }, () => ({ source: `collection:${item.id}`, effect: item.effect })),
    ),
  ],
  label: (source) => NAMES.get(source) ?? source,
  muted: (s, group) => trials.select.rule(s, `mute:${group}`),
});
```

- **Every stat's base is declared, once.** There is no default: 1 for a multiplier, 0 for a sum, whatever the game
  means. `stats` must name every stat of `vocab({ stats })`, and a stat cannot be called `flags` or `feed`
  (`RESERVED_STAT_IDS`).
- **Each stat is a derived value** ([`FeatureDef.derived`](glossary.md#derived-value)): it is on the state under its id
  (`s.stats.output`), never saved, worked out on load and on reset, and again only when a slice it read may have
  changed. A step, an action and the page all read it like any field, current as of the start of that step or action.
  Nothing has to run before it, so it needs no place in the feature order.
- **`sources`** are declared once, with where they come from (`label`, `owner`), an optional mute `group`, when they
  count (`active(q)`), how many times over (`times(q)`), their `effects` and the `flags` they raise.
- **`contributions(state)`** hands over what the game's other features list for the state as it stands: the factories'
  `contributions` (a tree's ranks, an achievement wall, the running buffs, a loadout, levels, challenges), or any
  `{ source, effect }[]` the game writes. The same effect object given several times by one source (one per rank held)
  is one row of the breakdown, counted that many times. A row's `owner` is the source id's part before `:`, and `label`
  turns the id into the name a player reads.
- **An effect may read another stat** off the state (`q.stats.heat`); the engine orders the stats by who reads whom, and
  two that read each other throw at the store's creation, naming the loop.
- **`flags`** are served under `s.stats.flags`: true while any counting source raises it.
- **`muted(state, group)`** silences a group's effects (`true`, or the reason as a string). The rows stay in the
  breakdown, marked with the reason, and stop counting. A mute takes effects, never flags: a source a game means to
  switch off whole reads the mute in its own `active` as well.
- A stat reads its state, never the clock. A buff's `contributions(state, now)` wants a time: pass
  `Number.NEGATIVE_INFINITY`, since the buffs' own step ends every buff whose time is up at the start of each pass and
  every buff still listed is running.

### Reading the breakdown

`numbers.select.explain(state, "output")` is a `StatBreakdown`: the `base`, the summed `add`, the multiplier `mult`, the
`raw` value before the caps, the capped `value`, the softcap's label while it bites (`softcapped`), `hardcapped`, and
`parts`, one row per effect in the order the sources were added (declared `sources` first, then the contributions):

- `label`, `owner`, `op` (`"add"` or `"mul"`), `quiet`;
- `value`: what the row comes to, `times` included (an add `times` times its amount, a mul its amount to the power
  `times`);
- `times`: how many times over the source counts (ranks held, copies owned);
- `muted`: null, or the reason its group is muted (the row is listed with what it would have come to, and does not
  count).

`select.parts(state, id)` is the rows alone; `select.value` and `select.flag` read the served values. `def.index` is the
source index, for a tool that lists what feeds a stat.

## One graph by hand: `statIndex`

The feature is built on `statIndex`, which a game may use directly for a state that never lives in the store: scoring
a loadout the auto-fill is only weighing, or a tooltip over "what if".

```ts
const POT = statIndex<"simmer", never, null>({ base: () => 1, caps: { simmer: { hardcap: 100 } } });
POT.add({ effects: [{ stat: "simmer", add: 2 }] }, { label: "Spoon", owner: "kit", times: () => 3 });
const g = POT.over(null); // or over(q, { muted, extra })
g.stat("simmer"); // Decimal; g.explain, g.parts, g.flag as above
```

- `statIndex({ base, caps })` takes every stat's base as a function (no default) and caps per stat.
- `index.add(source, meta)` indexes a source's `effects` and `flags` under its meta (`label`, `owner`, `group`,
  `active`, `times`). A graph already made does not see a source added after it.
- `index.over(q, { muted, extra })` is a graph over one state. Each stat is worked out on first read and kept for the
  graph's life, so each amount function runs at most once per graph; make a new graph after the state changes.
  `extra(stat)` adds effects for this graph only, after the indexed ones (`{ effect, meta }[]`): what the feature's
  `contributions` become. A stat whose effect reads the same stat, directly or through a chain, throws
  `stat "<id>" depends on itself`.
- `applySoftcap(value, softcap)` is the softcap on its own.
