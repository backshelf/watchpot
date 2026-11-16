// @feature dimensions
// Written by /watchpot-init from .claude/specs/answers.json. It is the game's now: edit it freely.
import type { CostCurve, DimensionSet } from "watchpot/core";

export interface TierDef {
  id: string;
  name: string;
  line: string;
  /** Ten at one price, then the price steps (`every: 10`). */
  cost: CostCurve;
}

/** Every ten bought of a tier doubles it. */
export const SET: DimensionSet = { size: 10, mult: 2 };

/** Lowest first: the first makes the main currency, each other makes the tier below it. */
export const TIERS: readonly TierDef[] = [
  { id: "cushion-moss", name: "Cushion moss", line: "Grows where you breathe on it.", cost: { base: 10, growth: 1000, every: 10 } },
  { id: "sheet-moss", name: "Sheet moss", line: "Carpets the gravel in a week.", cost: { base: 100, growth: 10000, every: 10 } },
  { id: "maidenhair-fern", name: "Maidenhair fern", line: "Unfurls one fiddlehead at a time.", cost: { base: 10000, growth: 100000, every: 10 } },
  { id: "pitcher-plant", name: "Pitcher plant", line: "Eats the gnats. Pays in spores.", cost: { base: 1000000, growth: 1000000, every: 10 } },
  { id: "strangler-fig", name: "Strangler fig", line: "Patient. Very patient.", cost: { base: 1000000000, growth: 100000000, every: 10 } },
];
