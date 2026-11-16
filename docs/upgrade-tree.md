# An upgrade tree

Ranks bought one at a time over `GraphNode`s, each rank's effects landing on the stat bus.

Example: [`examples/upgrade-tree.ts`](examples/upgrade-tree.ts).

- `upgradeTree({ key, nodes, wallet })` is the tree as a feature: it saves `{ ranks }`, buys with `buy(id)` through a
  currencies feature, and carries the rules as `.tree`. A run reset clears the ranks unless `reset` says otherwise.
- A buy returns a `BuyResult`: `{ ok: true, id, level }` or `{ ok: false, code }` with `code` one of `unknown`,
  `closed` (the tree's `open` refuses the node now), `maxed`, `requires`, `cannot-afford`.
- **Buy max.** `buyMax(id, limit?)` buys as many ranks as the wallet covers, up to `limit` and the node's last rank,
  one debit per currency, and returns how many (0 when closed, maxed, short or a requirement is missing). It is the
  count buying one at a time would reach, worked out in one step: a node's price in a currency is one geometric line
  floored, which `maxAffordable` counts in closed form however large the numbers; several lines in one currency are
  walked, `WALK_LIMIT` ranks a call at most. Never loop `buy` to a balance. The rules carry the same as
  `tree.affordable(id, ranks, balance, limit?)` (the count, for a "max (12)" label) and
  `tree.buyMax(ranks, id, purse, limit?)`.
- Read the effects with `statTotals(busOf(mine.tree.contributions(ranks)), "toy.speed")`, which gives `{ add, mult }`.
- To draw it, hand the nodes to `TreeGraph` (`watchpot/ui`), or to the template's `Tree` wrapper over it (`templates/game/src/ui/Tree.tsx`).
- For a tree you keep elsewhere in your state, use `tree({ id, nodes })` for the rules alone.
- **The auto-player** buys through `treeMoves(key, nodes, worth)`: one move per node whose next rank can be bought,
  priced as the tree prices it, worth what `worth(node, owned)` says. Hand it to `withMoves(tree, treeMoves(...))`.
