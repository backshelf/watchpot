# Loadouts

A loadout is a few slots, the items a player holds, and what the slotted items do together. Each item fits the slots
of its `kind`, each slotted item gives its own effects, and a set gives more once enough slotted items carry its tag:
the equipment screen of a gear game, a team of three, the tools on a bench.

The effects are your game's own type. With the engine's `Effect`, the loadout's `contributions` go straight into a
`stats` feature's `contributions`, the same way a tree's do, so a slotted item is one more source on the number it
changes. A loadout that is only being weighed is scored on a graph of its own (`statIndex`), as below.

Example: [`examples/loadouts.ts`](examples/loadouts.ts) (`bun docs/examples/loadouts.ts`). Simmer's stove gets a kit
of utensils:

```ts
/** Simmer's stove kit: three slots, and the pans and spoons a player has found. */
export const UTENSILS: LoadoutItem<Effect<"simmer">>[] = [
  { id: "glass-lid", kind: "lid", tags: ["glass"], effects: [{ stat: "simmer", add: 1 }] },
  { id: "copper-lid", kind: "lid", tags: ["copper"], effects: [{ stat: "simmer", mul: 1.5 }] },
  { id: "wooden-spoon", kind: "spoon", effects: [{ stat: "simmer", add: 2 }] },
  { id: "copper-ladle", kind: "spoon", tags: ["copper"], effects: [{ stat: "simmer", add: 1 }] },
  { id: "copper-trivet", tags: ["copper"], effects: [] },
];

/** What the player holds: found utensils, by id. */
export const cupboard = feature({
  key: "cupboard",
  initial: () => ({ held: ["glass-lid", "copper-lid", "wooden-spoon", "copper-ladle", "copper-trivet"] }),
});

type Reads = { cupboard: { held: string[] } };

/** The kit: a lid slot, a spoon slot and a spare that takes anything. Three copper pieces make a set. */
export const kit = loadoutFeature({
  key: "kit",
  slots: [{ id: "lid", kind: "lid" }, { id: "spoon", kind: "spoon" }, { id: "spare" }],
  items: UTENSILS,
  sets: [
    {
      id: "copperware",
      tag: "copper",
      tiers: [
        { count: 2, effects: [{ stat: "simmer", mul: 1.2 }] },
        { count: 3, effects: [{ stat: "simmer", mul: 2 }] },
      ],
    },
  ],
  owns: (s: Reads, item) => s.cupboard.held.includes(item),
});

export const game = defineGame({
  id: "simmer-kit",
  save: { key: "simmer-kit.save", version: 1 },
  features: [cupboard, kit],
});

/** The pot's one stat on the engine's stat graph: a base of 1 bubble a second. */
const POT = statIndex<"simmer", never, null>({ base: () => 1 });

/**
 * Bubbles a second with `slotted` in the kit: its contributions handed to one graph. A loadout that is only being
 * weighed (the auto-fill below tries many) never lives in the state, so it is read off the graph, not a stats feature.
 */
export const simmerRate = (slotted: Slotted) =>
  POT.over(null, {
    extra: () =>
      kit.loadout
        .contributions(slotted)
        .map(({ source, effect }) => ({ effect, meta: { label: source, owner: "kit" } })),
  })
    .stat("simmer")
    .toNumber();
```

Running it equips by hand, then lets `fillLoadout` find the best kit for `simmerRate`:

```
a spoon in the lid slot: wrong-kind
the glass lid: null | the wooden spoon: null
by hand: {"lid":"glass-lid","spoon":"wooden-spoon","spare":null} → 4.0 a second
auto-filled: {"lid":"copper-lid","spoon":"wooden-spoon","spare":"copper-ladle"} → 7.2 a second
copperware: 2 pieces, tier 0 | next tier at 3
```

The auto-fill is worth a look: the best kit keeps the wooden spoon (+2) and puts the copper ladle in the spare slot,
taking the two-piece copper tier (×1.2) over the three-piece one (×2), which would have cost the spoon.

## Two layers

The loadout comes in two layers, so a game that already keeps its own slots record can use the rules alone:

- **`loadout({ id, slots, items, sets? })`** is the rules, pure, over a slots record the game keeps wherever it
  likes. `id` is the contributions' source prefix.
- **`loadoutFeature({ key, slots, items, sets?, owns, reset? })`** is a feature that owns the record: it saves
  `{ slotted }` under `key`, carries the rules as `.loadout`, and uses `key` as the source prefix.

## The definition

- **`slots`**: `{ id, kind? }[]`. A slot with a `kind` takes only items of that kind; one without takes anything.
- **`items`**: `{ id, kind?, tags?, effects? }[]`, a `LoadoutItem<E>`. `tags` are what sets count.
- **`sets`**: `{ id, tag, tiers }[]`, a `LoadoutSet<E>`. `tiers` are `{ count, effects }`, lowest count first. A set
  counts the slotted items carrying its `tag` and pays the **highest** tier reached, and only that one.
- **`owns(state, item)`** (the feature only): your rule for whether the player holds an item, read off the whole game
  state when they equip.
- **`reset`** (the feature only): a run reset **keeps** the slots unless you say otherwise.

A repeated slot, item or set id throws when the loadout is made.

## The actions

- **`equip(slot, item)`** puts an item the player holds in a slot. It returns null when it went in, or why not, a
  `LoadoutFailure`: `"unknown-slot"`, `"unknown-item"`, `"wrong-kind"` or `"not-owned"`. An item already in another
  slot moves; it never doubles.
- **`clear(slot)`** empties a slot. False for a slot the loadout lacks.

## The rules

On `kit.loadout` (or whatever `loadout()` returned):

- **`fits(slot, item)`**: whether the kinds match. **`check(slot, item, owns)`**: the failure `equip` would return,
  without changing anything, for greying out a choice.
- **`equip(slotted, slot, item, owns)`** and **`clear(slotted, slot)`**: the same as the actions, on a record you
  keep (they write into it; use them on a draft).
- **`equipped(slotted)`**: the slotted items, in slot order. An id the loadout no longer knows is skipped.
- **`standings(slotted)`**: each set's `{ set, count, tier, next }`. `tier` is the index of the tier reached, -1 for
  none; `next` is the count the next tier needs, null at the last. This is what a set's line on the screen prints
  ("2 of 3 copper").
- **`contributions(slotted)`**: every effect in play, each slotted item's (source `<id>:<item>`), then each reached
  set tier's (source `<id>:set:<set>`). Hand it to a `stats` feature's `contributions` (or a graph's `extra`); the
  sources are what a tooltip's breakdown names.
- **`item(id)`**, **`slots`**, **`items`**, **`sets`**: the definition, for drawing the screen.

## The auto-equip

**`fillLoadout(rules, { owns, score, slots?, start?, depth? })`** finds a good loadout for your `score(slotted)`
(higher is better, over a whole slots record). From `start` (default empty) it tries every exchange of up to `depth`
slots at once (default 3) for owned items not already slotted, takes the best one that raises the score, and repeats
until none does. A single exchange fills and upgrades; a pair or a triple finds a set that pays only once two or three
of it are in, which filling one slot at a time never reaches. `slots` limits it to the slots that are open.

It returns a slots record and changes nothing. To use it, equip it slot by slot, clearing the slots it left empty:

```ts
  const owns = (item: string) => s().cupboard.held.includes(item);
  const best = fillLoadout(kit.loadout, { owns, score: simmerRate });
  for (const [slot, item] of Object.entries(best)) {
    if (item) s().kit.equip(slot, item);
    else s().kit.clear(slot);
  }
```

Its cost is one `score` call per exchange it tries, which grows with the items owned to the power of `depth`. Tens of
items and a handful of slots take milliseconds: run it on a press ("Best kit") or when the player's items change,
never every tick.

## Sim and tuning

A loadout offers the auto-player no moves. If your pacing depends on the player equipping well, give the sim a move
that runs `fillLoadout` and equips the result, with `withMoves(kit, …)`.

When you tune sets, read `standings` and `contributions` side by side: a set tier is often worth more than the best
single item, and the auto-fill will trade a strong item for it (as above). If that trade feels wrong to play, the
set's tier is too generous.

## Things that bite

- **Type the item list.** Write `UTENSILS: LoadoutItem<Effect<"simmer">>[]` (or `loadoutFeature<…>` with its type
  arguments). Left to inference, TypeScript reads the effect type off the first item alone, `{ stat, add }`, and
  refuses the next item's `mul`.
- **Owning is checked when equipping, never after.** `owns` runs inside `equip`. An item the player loses later
  stays slotted and keeps paying. When your game takes an item away, clear the slot that holds it in the same recipe.
- **A set pays one tier.** The tiers are not added up: three copper pieces pay the ×2 tier and not ×1.2 as well.
  Write a higher tier's effects to include what the lower one gave.
- **A renamed item drops out quietly.** `equipped` and `contributions` skip an id the loadout no longer knows, so an
  old save with a renamed item loads with that slot paying nothing. Rename it in a migration.
- **A slot added later starts empty.** An old save's `slotted` lacks the new slot; reading it as empty is right, and
  the first `equip` writes it.
- **The actions throw inside a recipe.** To equip inside your own `api.set` (a reward that comes pre-equipped), call
  `kit.loadout.equip(d.kit.slotted, slot, item, owns)` on the draft.

## Where the guide teaches it

- [Chapter 8, Effects](guide/08-effects.md): the stats feature that `contributions` feeds, and the tooltip that reads
  its breakdown.
- API: [`api/core/loadout.d.ts`](../api/core/loadout.d.ts).
