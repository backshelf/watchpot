# Layers

`layers({ key, base, layers })` is a layer system in the style of The Prestige Tree: rows of layers stacked over a
base resource. A layer's amount is earned by resetting everything in the rows beneath it; it carries one-time
upgrades, levelled buyables, milestones that are never lost and challenges, and every one of those is a source of
effects on stats (through the [live stat graph](stat-graph.md)) and of flags the rules read. The layers beneath read
those stats, so content is data and the rules never name a layer. The rules are pure functions over a plain state
(`.model`), so a sim or a test drives them with no store; the feature saves that state under `key` and steps it.

Example: [`examples/layers.ts`](examples/layers.ts) (`bun docs/examples/layers.ts`).

```ts
import { addStat, damp, type LayerDef, layers, mulStat } from "watchpot/core";

type Id = "a" | "b" | "c";
type Stat = "speed" | "gain" | "cost" | "passive";
type Layer = LayerDef<Id, Stat, "points">;

/** Row 1: a normal layer. Resetting `points` pays `floor(sqrt(points / 10) × gain)` of `a`. */
const A: Layer = {
  id: "a",
  row: 1,
  kind: "normal",
  from: "points",
  requires: 10,
  gain: "gain",
  passive: "passive",
  holding: { effects: [mulStat("speed", (q) => damp(q.units("a")))] },
  upgrades: [
    { id: "a1", cost: 1, effects: [mulStat("speed", () => 2)] },
    { id: "a2", cost: 5, effects: [mulStat("gain", (q) => damp(q.base))] },
  ],
  buyables: [
    {
      id: "a.x",
      pay: "a",
      first: 10,
      growth: 2,
      curve: 1.2,
      effects: [mulStat("speed", (q) => 1.5 ** q.level("a", "a.x"))],
    },
  ],
  challenges: [
    {
      id: "a.trial",
      goal: 1000,
      penalties: [mulStat("speed", () => 0.1)],
      mutes: ["a.upgrades"],
      effects: [mulStat("gain", () => 2)],
    },
  ],
};

/** Row 2: a static layer. Its units cost `200 × 4 ^ held ÷ cost` points, one reset each. */
const B: Layer = {
  id: "b",
  row: 2,
  kind: "static",
  from: "points",
  requires: 200,
  scale: 4,
  cost: "cost",
  parents: ["a"],
  holding: { effects: [mulStat("speed", (q) => 2 ** q.units("b").toNumber())] },
  milestones: [
    { id: "b2", at: 2, flags: ["keep:a"] },
    { id: "b3", at: 3, effects: [addStat("passive", () => 0.1)] },
  ],
};

/** Row 3: a normal layer measured from b's units held. */
const C: Layer = {
  id: "c",
  row: 3,
  kind: "normal",
  from: "b",
  requires: 4,
  exponent: 1,
  parents: ["b"],
  holding: { effects: [mulStat("cost", (q) => damp(q.amount("c")))] },
  milestones: [{ id: "c1", at: 1, flags: ["auto:b", "quiet:b", "bulk:b"] }],
};

export const climb = layers({ key: "climb", base: { id: "points", rate: "speed" }, layers: [A, B, C] });
```

- **The base** rises at `stat(rate) ^ stat(exponent)` a second and is wiped by every reset. `baseTotal` never is.
- **Stats** start at 1 (a layer's `passive` stat at 0); `stats` sets other bases and `caps` softcaps and hardcaps.
  A stat is `(base + adds) × muls`, worked out once per query; one that reads itself throws.
- **Rows.** A reset into a layer wipes every row beneath its own and the base, and nothing at its row or above.
  List layers lowest row first.
- **Normal layers** pay `floor((from / requirement) ^ exponent × stat(gain))` (exponent 0.5 by default), nothing
  below the requirement. `q.next(id)` is what `from` must reach for one more. It is a closed form that floating
  point can leave a hair short; `exactNext: true` nudges it up to the first value that pays.
- **Static layers** buy the next unit at `requirement × scale ^ (held ^ curve) ÷ stat(cost)` (curve 1 by default),
  or the next entry of `prices` (past the list, nothing). `max` caps what one holds. A static layer needs a `scale`
  or `prices`.
- **The row's toll.** A layer not yet established has its requirement multiplied by `tolls[n - 1]` when `n` other
  layers of its row are established (the last entry past the end).
- **`from`** is the base resource, a layer's amount (`"a"`) or its power (`"a.power"`), never a higher row's.
- **Upgrades** are bought once in the layer's `shop` resource (its own amount by default), shown and opened by
  `shown` and `open`. **Buyables** cost `first × growth ^ (level ^ curve)` in `pay`; effects read
  `q.level(layer, id)`. `buyLevel(…, true)` buys every level the resource covers.
- **Milestones** are reached the first time a count (`on`: `total` since the last wipe, `best` ever or `resets`;
  `best` for a static layer and `total` for a normal one by default) reaches `at`, and never lost.
- **Challenges.** Entering wipes beneath the layer; the `penalties` count and the `mutes` silence a layer's
  upgrades, holding, power or buyables (effects only, never flags) until the base reaches `goal`. A completion
  wipes again and the challenge's own effects and flags hold from then on. Leaving pays nothing. Inside, no layer at
  the challenge's row or above can reset. Ids are unique across layers; `needs` units to enter, `limit` completions.
- **Holding** effects count while the layer has units or gathered any since the last wipe; **power** builds at
  `rate` a second up to `cap` and has its own effects; a layer's `bonus` stat adds to `q.units`.
- **Passive.** A normal layer's `passive` stat is the share of its raw gain credited each second, without a reset.
- **Flags** (from any source): `keep:<layer>` keeps its upgrades and buyables through a wipe, `bulk:<layer>` lets an
  established static layer take every unit it can afford in one reset, `auto:<layer>` resets a static layer on its
  own, `quiet:<layer>` makes its reset wipe nothing, `autobuy:<layer>` and `autolevel:<layer>` buy its upgrades and
  buyables, `free:<layer>` makes its buyables spend nothing. Any other string is the game's own to read with
  `q.flag`.
- **Status:** `hidden` until every parent is established, `shown` until its requirement is first met (sighted), then
  `open`, then `established`. The lowest row starts sighted.
- **`settle`** runs after every action and every step: sightings and milestones, `tags` whose `when` holds, a
  challenge completed, then automation from the highest row down, skipping a layer the player switched to
  `manual`. **`advance`** reads every rate before any income lands. Time away is `offlineSteps` over `away`
  (8 hours, 240 steps of at least a second by default); a growing economy comes in at or a little under what
  one-second steps would give, within 10% for a smooth toy.
- **The feature** saves `{ base, baseTotal, layers, challenge, tags, playedMs }` with `reset: "never"`, loads an
  older save through `fillDeep` (a layer added since starts fresh), and steps as `<key>.produce.advance` and
  `<key>.produce.away`. Its actions are `reset`, `buy`, `level`, `enter`, `leave`, `manual` and `tag`; `onEvent`
  hears what the rules did (sighted, established, reset, milestone, upgrade, entered, completed, left, tagged,
  away), for a log, a sound or a tag of the game's own. Read a finished state with `.model.query(state)` (cached per
  state object); a rule's draft gets `.model.read(state)`.
- **The breakdown** (`q.parts(stat)`, `q.explain(stat)`) labels a layer's source by its `name`, else its id, and a
  challenge's penalties as `inside <challenge>`. `label: (source) => string` on the model puts them in the game's
  words: `source` is `{ layer, kind, id, label }`, `kind` one of `holding`, `power`, `upgrade`, `buyable`,
  `milestone`, `challenge`, `penalty`, and `label` the default to fall back on.
- **A game with state of its own beside the layers** (a log, an ending, a report of the last absence) writes its own
  `feature` over `layerModel`: `initial` spreads `model.fresh()` under its own fields, its actions and steps call
  the model's rules on the slice, and `onEvent` receives that same slice, so it can write to them. `layers()` is the
  feature for a game that keeps nothing beside the engine's state.
- **The auto-player** reads its moves: every affordable upgrade and level is worth 1 (cheapest share of a balance
  first), a reset is a free move worth its row, taken for a static layer that is not automated and for a normal
  one not yet established or paying at least what it holds. It never enters a challenge. Pass
  `balance: feature.balance`.
- **The check.** `layerModel` throws on a repeated id, a reference to an unknown layer (a `from`, `shop`, `pay`,
  parent, flag or mute), a `.power` of a layer without one, a layer measured from a higher row, a static layer with
  neither a scale nor prices, or a milestone on an unknown count.

## Tuning notes

- Keep feedback loops damped. An effect that reads an unbounded resource (an amount, the base, a power) goes through
  `damp(x)`, `log10(x + 10)`: two layers that multiply each other's growth by what they hold run away within a row.
- Give `auto` and `quiet` together. An automatic reset that also wipes resets the rows beneath under the player's
  feet every time it fires.
- A toll makes the order a row is taken in a choice: the first layer of a row is cheap, the rest pay for coming
  second.
- A static layer's `bulk` matters once its price outgrows the player's patience; give it with or after `auto`.
