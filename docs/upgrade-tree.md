# An upgrade tree

Ranks bought one at a time over `GraphNode`s, each rank's effects handed to the stats feature (`defineStats`) as contributions.

Example: [`examples/upgrade-tree.ts`](examples/upgrade-tree.ts) (`bun docs/examples/upgrade-tree.ts`).

- `defineUpgradeTree({ key, nodes, wallet, reach?, open?, worth?, milestone?, reset? })` is the tree as a feature: it saves
  `{ ranks }` and buys with `buy(id)` through a currencies feature. A run reset clears the ranks unless `reset` says
  otherwise. Like every factory it returns the feature plus `select` (questions over state), `def` (what it was
  given) and `draft` (helpers for a recipe, named like the actions). `reach` names the features `open` and `worth`
  read, as on `feature`, so their state is typed with no annotation (the wallet is reached already).
- A buy returns a `BuyResult`: `{ ok: true, id, level }` or `{ ok: false, code }` with `code` one of `unknown`,
  `closed` (the tree's `open` refuses the node now), `maxed`, `requires`, `cannot-afford`.
- **What a screen offers.** `open(state, node)` holds a node back until the game says it is on offer. A screen should
  ask the feature's `select`, not the kernel: `mine.select.open(state, id)`, `mine.select.check(state, id)` (why
  `buy(id)` would refuse, `closed` first, or null) and `mine.select.affordable(state, id, limit?)` read that `open` the
  way the actions do, so the screen never offers a node that `buy` then refuses. The kernel, `mine.def.tree`, has its
  own `check` and `affordable` that know nothing of `open`. `select` also has `ranks(state)`, `rank(state, id)` and
  `contributions(state)`; `def` has `nodes`, `node(id)` and `tree`.
- **In a recipe.** `mine.draft.buy(draft, id)`, `mine.draft.buyMax(draft, id, limit?)` and `mine.draft.buyAll(draft,
  limit?)` do what the actions do inside a step or a game's own action, and respect `open`.
- **Buy max.** `buyMax(id, limit?)` buys as many ranks as the wallet covers, up to `limit` and the node's last rank,
  one debit per currency, and returns how many (0 when closed, maxed, short or a requirement is missing). It is the
  count buying one at a time would reach, worked out in one step: a node's price in a currency is one geometric line
  floored, which `maxAffordable` counts in closed form however large the numbers; several lines in one currency are
  walked, `WALK_LIMIT` ranks a call at most. Never loop `buy` to a balance. The kernel carries the same as
  `def.tree.affordable(id, ranks, balance, limit?)` (the count, for a "max (12)" label) and
  `def.tree.buyMax(ranks, id, purse, limit?)`.
- **Buy everything.** `buyAll(limit?)` buys one rank at a time, always the cheapest open one, until the wallet covers
  nothing more, and returns how many. Cheapest is by the first line of each rank's price, ties in node order, so it
  suits a tree priced in one currency. A free node with no last rank is skipped unless you give a `limit`. The
  kernel carries it as `def.tree.buyCheapest(ranks, purse, { open, limit })`.
- Read the effects through the stats feature (`defineStats`): `contributions: (s) => mine.select.contributions(s)`, then `speed.select.value(s, "toy.speed")`. Each rank is a `{ source, effect }` sourced `<key>:<node>`.
- To draw it, hand the nodes to `TreeGraph` (`watchpot/ui`), or to the template's `Tree` wrapper over it
  (`templates/game/src/ui/Tree.tsx`).
- For a tree you keep elsewhere in your state, use `tree({ id, nodes })` for the rules alone.

## Letting the auto-player buy from it

The tree declares auto-player moves of its own, so the sim's [auto-player](persona.md) buys from it with no wrapper:
one move per node whose next rank can be bought (open, not at its last rank, its requirements held), priced at the
first currency of that rank's price, with no `worth`. The auto-player works the worth out from its objective, the
number it is trying to grow (`autoPlayer(game, { objective })`): the objective after buying less the objective before.

A node that does not move the objective at once (an unlock, an offline cap) works out to nothing and is never bought.
For those, say a `worth(state, node)` in the tree's definition, in the same unit as the game's other moves in that
currency:

<!-- example-code: upgrade-tree.ts -->

```ts
/**
 * A tree as a feature: it saves `{ ranks }` and buys through the wallet. `open` holds the laser back until the
 * player has swept up some dust: a closed node refuses with `closed`, and the feature's own readers say so too.
 */
export const mine = defineUpgradeTree({
  key: "mine",
  nodes: NODES,
  wallet,
  open: (s, node) => node.id !== "laser" || s.wallet.goldEver.gte(100),
  // The sim's auto-player gets a move per buyable node for free. Say a worth only for a node that does not raise
  // its objective at once; the rest are worked out.
  worth: (_s, node) => (node.id === "laser" ? 3 : 1),
});
```

`treeMoves(key, nodes, worth?)` is the same list of moves for a feature you wrote yourself that keeps ranks as
`TreeState` and has the tree's `buy` action: `withMoves(feature, treeMoves("mine", NODES, (state, node) => 1))`.
