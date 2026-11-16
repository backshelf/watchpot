// Written by /watchpot from .claude/specs/answers.json. It is the game's now: edit it freely.
import type { Effect, GraphNode } from "watchpot/core";
import { type Currency, MAIN } from "./words";

/** A node, placed on the tree's grid: `col` its tier (left to right), `row` its place in the tier. */
export interface UpgradeNode extends GraphNode<Effect, Currency> {
  col: number;
  row: number;
}

export const TREE_NAME = "Station modules";

/** Two to a tier; each node after the first tier needs the one before it in its row. */
export const NODES: readonly UpgradeNode[] = [
  {
    id: "mirror-array",
    name: "Mirror array",
    line: "Bends a little more sun our way.",
    cost: [{ currency: MAIN, amount: 100 }],
    costGrowth: 2.5,
    maxLevel: 10,
    requires: [],
    effects: [{ stat: "output", mult: 1.1 }],
    col: 0,
    row: 0,
  },
  {
    id: "drip-line",
    name: "Drip line",
    line: "Waters the rows while I sleep.",
    cost: [{ currency: MAIN, amount: 800 }],
    costGrowth: 2.5,
    maxLevel: 5,
    requires: [],
    effects: [{ stat: "offline", add: 0.05 }],
    col: 0,
    row: 1,
  },
  {
    id: "spectral-lamps",
    name: "Spectral lamps",
    line: "The light the leaves actually like.",
    cost: [{ currency: MAIN, amount: 6400 }],
    costGrowth: 3,
    maxLevel: 20,
    requires: ["mirror-array"],
    effects: [{ stat: "output", mult: 1.1 }],
    col: 1,
    row: 0,
  },
  {
    id: "seed-vault",
    name: "Seed vault",
    line: "Something to carry to the next orbit.",
    cost: [{ currency: MAIN, amount: 51200 }],
    costGrowth: 2.5,
    maxLevel: 8,
    requires: ["drip-line"],
    effects: [{ stat: "gain", mult: 1.15 }],
    col: 1,
    row: 1,
  },
  {
    id: "pollinator-drones",
    name: "Pollinator drones",
    line: "Three of them. They argue.",
    cost: [{ currency: MAIN, amount: 409600 }],
    costGrowth: 3,
    maxLevel: 20,
    requires: ["spectral-lamps"],
    effects: [{ stat: "output", mult: 1.1 }],
    col: 2,
    row: 0,
  },
  {
    id: "night-side-heater",
    name: "Night-side heater",
    line: "The dark half stays warm now.",
    cost: [{ currency: MAIN, amount: 3276800 }],
    costGrowth: 2.5,
    maxLevel: 5,
    requires: ["seed-vault"],
    effects: [{ stat: "offline", add: 0.05 }],
    col: 2,
    row: 1,
  },
];
