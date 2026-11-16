# An upgrade tree

Ranks bought one at a time over `GraphNode`s, each rank's effects handed to the game's `stats`.

Example: [`examples/upgrade-tree.ts`](examples/upgrade-tree.ts) (`bun docs/examples/upgrade-tree.ts`).

- `upgradeTree({ key, nodes, wallet, open? })` is the tree as a feature: it saves `{ ranks }`, buys with `buy(id)`
  through a currencies feature, and carries the rules as `.tree`. A run reset clears the ranks unless `reset` says
  otherwise.
- A buy returns a `BuyResult`: `{ ok: true, id, level }` or `{ ok: false, code }` with `code` one of `unknown`,
  `closed` (the tree's `open` refuses the node now), `maxed`, `requires`, `cannot-afford`.
- **What a screen offers.** `open(state, node)` holds a node back until the game says it is on offer. A screen should
  ask the feature, not `.tree`: `mine.open(state, id)`, `mine.check(state, id)` (why `buy(id)` would refuse, `closed`
  first, or null) and `mine.affordable(state, id, limit?)` read that `open` the way the actions do, so the screen never
  offers a node that `buy` then refuses. `.tree`'s own `check` and `affordable` know nothing of `open`.
- **Buy max.** `buyMax(id, limit?)` buys as many ranks as the wallet covers, up to `limit` and the node's last rank,
  one debit per currency, and returns how many (0 when closed, maxed, short or a requirement is missing). It is the
  count buying one at a time would reach, worked out in one step: a node's price in a currency is one geometric line
  floored, which `maxAffordable` counts in closed form however large the numbers; several lines in one currency are
  walked, `WALK_LIMIT` ranks a call at most. Never loop `buy` to a balance. The rules carry the same as
  `tree.affordable(id, ranks, balance, limit?)` (the count, for a "max (12)" label) and
  `tree.buyMax(ranks, id, purse, limit?)`.
- **Buy everything.** `buyAll(limit?)` buys one rank at a time, always the cheapest open one, until the wallet covers
  nothing more, and returns how many. Cheapest is by the first line of each rank's price, ties in node order, so it
  suits a tree priced in one currency. A free node with no last rank is skipped unless you give a `limit`. The rules
  carry it as `tree.buyCheapest(ranks, purse, { open, limit })`.
- Read the effects through a `stats` feature fed `contributions: (s) => mine.tree.contributions(s.mine.ranks)`:
  `s.stats["toy.speed"]` is the value, `speed.select.explain(state, "toy.speed")` the base, `add`, `mult` and one row
  per node, its ranks counted as `times`.
- To draw it, hand the nodes to `TreeGraph` (`watchpot/ui`), or to the template's `Tree` wrapper over it
  (`templates/game/src/ui/Tree.tsx`).
- For a tree you keep elsewhere in your state, use `tree({ id, nodes })` for the rules alone.

## Letting the auto-player buy from it

A tree has no auto-player moves of its own, so the sim's [auto-player](persona.md) never buys a rank until you give
it some, and it does not warn you. Three lines do it: build the tree, then wrap it.

```ts
export const mine = withMoves(
  tree,
  treeMoves("mine", NODES, (node) => (node.id === "laser" ? 3 : 1)),
);
```

`treeMoves(key, nodes, worth)` makes one move per node whose next rank can be bought, priced at the first currency of
that rank's price. `worth(node, owned)` is what the rank is worth to the sim, in the same unit as the game's other
moves in that currency. List the wrapped `mine` in `defineGame`, not the bare tree.
