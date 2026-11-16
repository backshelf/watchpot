import { D, type EventBag, type EventRuntime, NO_BAG, nextInt, type RngState } from "watchpot/core";
import { NETS, SHOWER, SKY, SKY_CELLS, type SkyTokenId } from "../../../content/shower";

/**
 * The shower's rules, pure: what its tree does to the nets and the catch, and what a cast brings back. The board
 * (`board.ts`) and the events feature call these; the screen reads them to print the same numbers.
 */

/** The tree's effects in force on a runtime, folded: the catch's multiplier, the nets' speed and the extra held. */
export function showerMods(runtime: Pick<EventRuntime, "upgrades">) {
  let catchMult = 1;
  let regen = 1;
  let spare = 0;
  for (const node of SHOWER.upgrades) {
    const ranks = runtime.upgrades[node.id] ?? 0;
    for (const e of node.effects) {
      if (e.kind === "catch") catchMult *= e.mult ** ranks;
      else if (e.kind === "scope") regen *= e.mult ** ranks;
      else spare += e.add * ranks;
    }
  }
  return { catchMult, regen, spare };
}

/** The bag the engine's regen and caps read: the scope speeds the nets, a spare raises their cap. */
export function showerBag(runtime: Pick<EventRuntime, "upgrades">): EventBag {
  const m = showerMods(runtime);
  return {
    regenMult: (_e, currency) => (currency === NETS ? m.regen : 1),
    capAdd: (_e, currency) => D(currency === NETS ? m.spare : 0),
    stat: (_e, key, base = 0) => (key === "catch" ? base * m.catchMult : NO_BAG.stat(_e, key, base)),
  };
}

/** A sky: the cycle it belongs to, which wave it is, and per cell what the net brought back (null: still up). */
export interface Sky {
  cycle: number;
  wave: number;
  cells: (SkyTokenId | null)[];
}

export const freshSky = (cycle: number, wave = 1): Sky => ({
  cycle,
  wave,
  cells: Array.from({ length: SKY_CELLS }, () => null),
});

/** What is still up there: each token's count less those already caught. */
export function leftIn(sky: Sky): Record<SkyTokenId, number> {
  const left = Object.fromEntries(SKY.map((t) => [t.id, t.count])) as Record<SkyTokenId, number>;
  for (const c of sky.cells) if (c) left[c] -= 1;
  return left;
}

/** What one cast brought back. */
export interface Catch {
  cell: number;
  token: SkyTokenId;
  shards: number;
  seeds: number;
  /** The sky is empty now: the next wave is up. */
  cleared: boolean;
}

/**
 * A net cast at `cell`: one of the tokens still up, drawn evenly by count from `rng`, its shards times the catch
 * (rounded, a caught shard never rounds to none). Null for a cell already caught or outside the sky.
 */
export function castAt(sky: Sky, cell: number, rng: RngState, catchMult: number): Catch | null {
  if (cell < 0 || cell >= sky.cells.length || sky.cells[cell] !== null) return null;
  const left = leftIn(sky);
  const pool = SKY.flatMap((t) => Array.from({ length: Math.max(0, left[t.id]) }, () => t));
  const [i] = nextInt(rng, pool.length);
  const token = pool[i];
  if (!token) return null;
  const shards = token.shards > 0 ? Math.max(1, Math.round(token.shards * catchMult)) : 0;
  const cleared = sky.cells.filter((c) => c === null).length === 1;
  return { cell, token: token.id, shards, seeds: token.seeds ?? 0, cleared };
}
