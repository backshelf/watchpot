import { type Decimal, ZERO } from "watchpot/core";
import type { Stats } from "./stats";
// @if generators
import { MAIN } from "../content/words";
// @end
// @if dimensions
import type { DimensionsState } from "watchpot/core";
import { TIERS } from "../content/dimensions";
import { chain } from "./dimensions";
// @end

/** What the income is read from: the stats and the core's state. */
export interface IncomeSources {
  readonly stats: Stats;
  // @if generators
  readonly generators: { readonly perSecond: Readonly<Record<string, Decimal>> };
  // @end
  // @if dimensions
  readonly dimensions: DimensionsState;
  // @end
}

/** What the core makes of the main currency a second now, every stat applied. */
// @if !generators|dimensions
// biome-ignore lint/correctness/noUnusedFunctionParameters: no producers yet; the sources are what a core will read.
// @end
export function incomeOf(s: IncomeSources): Decimal {
  let total = ZERO;
  // @if generators
  total = total.add(s.generators.perSecond[MAIN] ?? ZERO);
  // @end
  // @if dimensions
  total = total.add(chain.select.perSecond(s, TIERS[0]?.id ?? ""));
  // @end
  return total;
}
