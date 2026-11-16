import { D, type Decimal, type GraphNode, tree } from "watchpot/core";

/** The price table, by item id. A tuning script may rewrite it while the game runs. */
const PRICES = new Map<string, Decimal>([["lid", D(50)]]);

/** What an item costs when the table has no figure for it: out of reach, so nothing unpriced can be bought. */
const UNPRICED = D("1e999999");

/** A node whose price is read from the table each time the tree asks, through a getter. */
const node = (id: string, name: string): GraphNode<never, "gold"> => ({
  id,
  name,
  line: "",
  cost: [
    {
      currency: "gold",
      get amount() {
        return PRICES.get(id) ?? UNPRICED;
      },
    },
  ],
  costGrowth: 1.5,
  maxLevel: 5,
  requires: [],
  effects: [],
});

export const shelf = tree({ id: "shelf", nodes: [node("lid", "A lid"), node("ladle", "A ladle")] });

if (import.meta.main) {
  const lid = shelf.node("lid");
  const ladle = shelf.node("ladle");
  if (lid && ladle) {
    console.log("lid:", shelf.price(lid, 0)?.[0]?.amount.toString()); // 50
    PRICES.set("lid", D(80)); // re-priced mid-run
    PRICES.set("ladle", D(200)); // priced for the first time
    console.log("lid:", shelf.price(lid, 0)?.[0]?.amount.toString()); // 80
    console.log("ladle:", shelf.price(ladle, 0)?.[0]?.amount.toString()); // 200
  }
}
