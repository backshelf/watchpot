// @feature tree
// Written by /watchpot from .claude/specs/answers.json. It is the game's now: edit it freely.
import type { Effect, GraphNode } from "watchpot/core";
import { type Currency, MAIN } from "./words";

/** A node, placed on the tree's grid: `col` its tier (left to right), `row` its place in the tier. */
export interface UpgradeNode extends GraphNode<Effect, Currency> {
  col: number;
  row: number;
}

export const TREE_NAME = "The trellis";

/** Two to a tier; each node after the first tier needs the one before it in its row. */
export const NODES: readonly UpgradeNode[] = [
  {
    id: "better-soil",
    name: "Better soil",
    line: "Peat, sand, a little charcoal.",
    cost: [{ currency: MAIN, amount: 100 }],
    costGrowth: 2.5,
    maxLevel: 10,
    requires: [],
    effects: [{ stat: "output", mult: 1.1 }],
    col: 0,
    row: 0,
  },
  {
    id: "glass-lid",
    name: "Glass lid",
    line: "Keeps the damp in while you sleep.",
    cost: [{ currency: MAIN, amount: 800 }],
    costGrowth: 2.5,
    maxLevel: 5,
    requires: [],
    effects: [{ stat: "offline", add: 0.05 }],
    col: 0,
    row: 1,
  },
  {
    id: "grow-lamp",
    name: "Grow lamp",
    line: "Noon, all day.",
    cost: [{ currency: MAIN, amount: 6400 }],
    costGrowth: 2.5,
    maxLevel: 10,
    requires: ["better-soil"],
    effects: [{ stat: "output", mult: 1.1 }],
    col: 1,
    row: 0,
  },
  {
    id: "cuttings",
    name: "Cuttings",
    line: "Every plant remembers the last garden.",
    cost: [{ currency: MAIN, amount: 51200 }],
    costGrowth: 2.5,
    maxLevel: 5,
    requires: ["glass-lid"],
    effects: [{ stat: "gain", mult: 1.15 }],
    col: 1,
    row: 1,
  },
  {
    id: "misting-bottle",
    name: "Misting bottle",
    line: "Pfft. Pfft.",
    cost: [{ currency: MAIN, amount: 409600 }],
    costGrowth: 2.5,
    maxLevel: 5,
    requires: ["grow-lamp"],
    effects: [{ stat: "offline", add: 0.05 }],
    col: 2,
    row: 0,
  },
  {
    id: "mycorrhiza",
    name: "Mycorrhiza",
    line: "The roots talk now.",
    cost: [{ currency: MAIN, amount: 3276800 }],
    costGrowth: 2.5,
    maxLevel: 10,
    requires: ["cuttings"],
    effects: [{ stat: "output", mult: 1.1 }],
    col: 2,
    row: 1,
  },
];
