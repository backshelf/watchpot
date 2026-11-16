import type { Effect } from "watchpot/core";
import { STAT, type StatId } from "../content/words";

/** What an effect does, in the stat's own name: "Yield ×1.10", "Night shift +5%". */
export const effectText = (e: Effect) => {
  const name = STAT[e.stat as StatId];
  return e.mult !== undefined ? `${name} ×${e.mult}` : `${name} +${Math.round((e.add ?? 0) * 100)}%`;
};
