import { readClock } from "../../core/clock-feature";
import { isDecimal } from "../../core/decimal";
import { storeMeta } from "../../core/persist";
import { decodeProfile, SaveError } from "../../core/save";
import { asPersisted } from "../../core/storage";
import { partializeState } from "../../core/store";
import { DAY_MS } from "../../core/time";
import { clockLens, warpClock } from "../clock";
import type { RuntimeStore } from "../store";

/**
 * The dev panel's reads and actions on a store, pure of React so a test drives them. Every one goes through the
 * store; the clock moves by `warpClock` (its offset), never by the wall. Not in the entry's barrel: only the panel
 * reaches them, so a production bundle, which never loads the panel, carries none of this.
 */

/** The profile's day: 1 on the day it was made, counted in whole days of game time since. */
export function profileDay(store: RuntimeStore): number {
  const { createdAt } = readClock(store.getState(), clockLens(store));
  if (!(createdAt > 0)) return 1;
  return Math.floor(Math.max(0, store.getState().gameNow() - createdAt) / DAY_MS) + 1;
}

/** Warps to the same time on the profile's day `day` and catches up over the days between. A past day is refused. */
export function jumpToDay(store: RuntimeStore, day: number): void {
  const days = Math.floor(day) - profileDay(store);
  if (days > 0) warpClock(store, days * DAY_MS, { catchUp: true });
}

/** The features' keys in the store's game, in order: what the inspector lists. */
export function featureKeys(store: RuntimeStore): readonly string[] {
  return storeMeta(store)?.game.features.map((f) => f.key) ?? [];
}

/** One feature's saved data as indented JSON, Decimals as strings: what the inspector shows. */
export function featureJson(store: RuntimeStore, key: string): string {
  const meta = storeMeta(store);
  const feature = meta?.game.features.find((f) => f.key === key);
  if (!feature) return "{}";
  const data = partializeState([feature], store.getState())[key] ?? {};
  return JSON.stringify(data, (_k, v: unknown) => (isDecimal(v) ? v.toString() : v), 2);
}

/** What a check of a save found: fine (at the version it would load as), or the codec's reason. */
export type SaveCheck = { ok: true; version: number } | { ok: false; reason: string };

/** Reads an export through the store's codec (and its migrations) without loading it. */
export function checkSave(store: RuntimeStore, json: string): SaveCheck {
  const game = storeMeta(store)?.game;
  if (!game) return { ok: false, reason: "this store has no game" };
  try {
    const env = decodeProfile(json, game.save.version, game);
    if (!asPersisted(env.state)) return { ok: false, reason: "bad-shape" };
    return { ok: true, version: env.version };
  } catch (error) {
    return { ok: false, reason: error instanceof SaveError ? error.code : String(error) };
  }
}
