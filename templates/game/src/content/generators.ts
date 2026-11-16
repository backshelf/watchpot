// @feature generators
// Written by /watchpot-init from .claude/specs/answers.json. It is the game's now: edit it freely.
import type { CostCurve } from "watchpot/core";

export interface GeneratorDef {
  id: string;
  name: string;
  line: string;
  /** The price of the next one, by how many are owned. */
  cost: CostCurve;
  /** What one makes a second, before the stats. */
  rate: number;
}

/** Each one owned raises the next one's price by this share. */
export const COST_GROWTH = 1.15;

/** Cheapest first. Each costs twelve times the last; one pays itself back in a minute, the next in two, and so on. */
export const GENERATORS: readonly GeneratorDef[] = [
  { id: "cushion-moss", name: "Cushion moss", line: "Grows where you breathe on it.", cost: { base: 10, growth: COST_GROWTH, round: "floor" }, rate: 0.167 },
  { id: "sheet-moss", name: "Sheet moss", line: "Carpets the gravel in a week.", cost: { base: 120, growth: COST_GROWTH, round: "floor" }, rate: 1 },
  { id: "maidenhair-fern", name: "Maidenhair fern", line: "Unfurls one fiddlehead at a time.", cost: { base: 1440, growth: COST_GROWTH, round: "floor" }, rate: 6 },
  { id: "pitcher-plant", name: "Pitcher plant", line: "Eats the gnats. Pays in spores.", cost: { base: 17280, growth: COST_GROWTH, round: "floor" }, rate: 36 },
  { id: "strangler-fig", name: "Strangler fig", line: "Patient. Very patient.", cost: { base: 207360, growth: COST_GROWTH, round: "floor" }, rate: 216 },
];
