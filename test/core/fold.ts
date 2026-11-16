import { type Effect, statIndex } from "watchpot/core";

/**
 * What a list of contributions comes to on one stat, folded by the stat graph: the summed adds and the multiplied
 * muls (each source's effects as rows over no state). For a test of a factory's `contributions` alone, without a
 * game around it.
 */
export function totals(
  contributions: readonly { readonly source: string; readonly effect: Effect }[],
  stat: string,
): { add: number; mult: number } {
  const index = statIndex<string, never, null>({ base: () => 0 });
  const b = index
    .over(null, {
      extra: (id) =>
        contributions
          .filter((c) => c.effect.stat === id)
          .map((c) => ({ effect: c.effect, meta: { label: c.source, owner: c.source } })),
    })
    .explain(stat);
  return { add: b.add.toNumber(), mult: b.mult.toNumber() };
}
