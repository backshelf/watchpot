# A live stat graph

Stats whose effects are functions of the state, worked out lazily in Decimals: "multiplied by the log of the gold
held", one stat feeding another, values far past `number`.

Example: [`examples/stat-graph.ts`](examples/stat-graph.ts).

- `liveIndex<Stat, Flag, Q, Group>({ base, caps })` is built once, from content. `base(stat)` defaults to 1; `caps`
  takes the bus's `StatDef` (a `Softcap` and a `hardcap`) per stat.
- `index.add(source, meta)` indexes a source's `effects` (`{ stat, op: "add" | "mul", value: (q) => DecimalSource }`)
  and its `flags` under `meta`: a `label` and `owner` for the breakdown, an optional mute `group`, and `active(q)`.
- `index.over(q, { muted })` is a `StatGraph` for one state. `stat(id)` is `(base + every add) x every mul`, then the
  softcap (`softcapDecimal`), then the hardcap, counting an effect while its source is active and its group is not
  muted. A mute silences effects, never flags: `flag(id)` is true while any source raising it is active.
- Everything is worked out on first read and kept for the graph's life, so each `value` runs at most once per graph.
  Make a new graph whenever the state changes; a source added later shows only in graphs made after it.
- To let an effect read another stat, hand `over` a reader that holds the graph and delegates `stat` to it, as the
  example's `Reader` does. A value that comes back to its own stat, directly or through a chain, throws
  `stat "<id>" depends on itself`.
- `parts(id)` lists the counting effects in the order their sources were added, each with its worked value; `quiet`
  ones are marked, for a screen to leave out. `explain(id)` adds the base, the summed adds, the multiplier, the raw and
  capped values, and which cap bit, as `explainStat` does for the bus.

Which to reach for: the stat bus (`busOf`, `statValue`) for constant effects bought in ranks, such as an upgrade tree's
nodes, where everything is a `number` and folds once. The live graph when an effect's value reads the state or another
stat, or when a stat outgrows `number`. They share the order and the cap types, and a game can use both.

## The first pass after a load

Stats a game folds into its state each pass (a `stats` feature whose values are `transient`, worked out in a `rates`
step) are empty in a store that has just been built, loaded or imported, and the first pass's `guard` and `sync` steps
run before `rates`: a step there that reads them sees nothing (a pool trims itself to an empty cap on every reload, a
gate reads as shut). The live graph above has no such gap, since it is worked out on read; derived state kept in the
draft does.

Declare the fold as the feature's `derive(draft, { now, reason })` as well as its `rates` step. The store runs every
`derive`, in feature order, wherever the transient state is made fresh (`reason`: `new`, `load`, `import`, `reset`
after `resetProfile`, `run` after a run reset), so the state any pass starts from holds it:

```ts
const stats = feature({
  key: "stats",
  initial: () => ({ values: {} as Record<string, number> }),
  transient: ["values"],
  reset: "never",
  derive: (d: Draft<Game>, ctx) => {
    d.stats.values = fold(d, ctx.now);
  },
  steps: {
    rates: {
      fold: (d: Draft<Game>, ctx) => {
        d.stats.values = fold(d, ctx.now);
      },
    },
  },
});
```

`derive` must be pure: no rng, no time passing, nothing saved changed, since a load runs it and a run that carried on
does not. Within a running store the values are as fresh as the last pass's `rates`, so a `guard` or `sync` step reads
what the previous pass folded; that is the same after a load as before it.
