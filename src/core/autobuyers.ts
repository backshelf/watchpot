import type { Draft } from "immer";
import { type Feature, type FeatureApi, feature, type ResetRule, type StepContext } from "./feature";

/**
 * Autobuyers: automation as a system. Each autobuyer is something the game buys for the player on an interval once
 * it is unlocked and the player has it switched on: the next generator, the cheapest upgrade, a max-all. The game
 * writes the purchase (`run`, inside the tick's recipe); the feature owns the switches, the schedule and the count.
 *
 * `everyMs` is the pure schedule: firing is on game time from the last fire, not accumulated per tick, so an
 * interval of 2 s fires at 2, 4, 6 s whatever the tick length. `autobuyers({ key, list })` is the feature.
 */

/**
 * Whether an interval of `intervalMs` has passed since `lastAt` at `now`, and the new `lastAt` when it has (null when
 * it has not). Never fired (`lastAt` undefined) or an interval of 0 fires at once and lands on `now`; otherwise the
 * new `lastAt` keeps the phase, `lastAt + intervalMs × floor((now - lastAt) / intervalMs)`, so the schedule never
 * drifts with the tick, and a gap of many intervals fires once.
 */
export function everyMs(lastAt: number | undefined, intervalMs: number, now: number): number | null {
  if (lastAt === undefined || !(intervalMs > 0)) return now;
  const since = now - lastAt;
  if (since < intervalMs) return null;
  return lastAt + intervalMs * Math.floor(since / intervalMs);
}

/** One autobuyer: when it is unlocked, how often it fires, and the purchase it makes. */
export interface AutobuyerDef<G> {
  readonly id: string;
  /** Whether the player has it: read off the whole game state. */
  readonly unlocked: (state: G) => boolean;
  /** Its interval now, in game ms (0 fires every tick). */
  readonly intervalMs: (state: G) => number;
  /** Makes the purchase inside the tick's recipe and returns how many it bought. */
  readonly run: (draft: Draft<G>, ctx: StepContext) => number;
  /** Higher fires first in a tick (default 0; ties keep the list order). */
  readonly priority?: number;
}

/** The feature's saved state: the player's switches, the last fire and the count bought, per autobuyer id. */
export interface AutobuyersState {
  /** The player's switches; an autobuyer starts on. */
  on: Record<string, boolean>;
  /** The game time it last fired; absent until it first does. */
  lastAt: Record<string, number>;
  /** How many it has bought. */
  bought: Record<string, number>;
}

/** The feature's actions. */
export interface AutobuyerActions {
  /** Flips an autobuyer's switch, or sets it to `on`. Returns the switch after; false for an unknown id. */
  toggle(id: string, on?: boolean): boolean;
  /** Sets every switch. */
  setAll(on: boolean): void;
}

/** An autobuyer list's rules. */
export interface AutobuyerRules<G> {
  readonly list: readonly AutobuyerDef<G>[];
  autobuyer(id: string): AutobuyerDef<G> | undefined;
  /** Whether it is unlocked and switched on. */
  active(state: G, id: string): boolean;
  /** Ms until it next fires (0 when it is due), or null when it is not active. */
  nextInMs(state: G, id: string, now: number): number | null;
}

/** An `autobuyers` feature, carrying its rules as `.rules`. */
export type AutobuyersFeature<K extends string, G> = Feature<K, AutobuyersState, AutobuyerActions> & {
  readonly rules: AutobuyerRules<G>;
};

/**
 * Autobuyers as a feature. It saves `{ on, lastAt, bought }` under `key` and fires in one step, `<key>.automate.fire`:
 * every unlocked autobuyer that is switched on and due by `everyMs`, highest `priority` first. A catch-up fires each
 * at most once at its end: purchases during an absence are not simulated, only the first one back. A run reset
 * keeps the player's switches and clears the rest, unless `reset` says otherwise. The callbacks read the whole game
 * state, so annotate one of them with the game's state type.
 */
export function autobuyers<const K extends string, G extends object = object>(def: {
  readonly key: K;
  readonly list: readonly AutobuyerDef<G>[];
  readonly reset?: ResetRule<AutobuyersState>;
}): AutobuyersFeature<K, G> {
  const byId = new Map<string, AutobuyerDef<G>>();
  for (const a of def.list) {
    if (byId.has(a.id)) throw new Error(`autobuyers "${def.key}": the autobuyer "${a.id}" appears twice`);
    byId.set(a.id, a);
  }
  // Highest priority first; `sort` is stable, so ties keep the list order.
  const firing = [...def.list].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  type Own = Record<K, AutobuyersState>;
  const own = (state: unknown): AutobuyersState => (state as Own)[def.key];
  const active = (state: G, a: AutobuyerDef<G>): boolean =>
    (own(state).on[a.id] ?? true) && a.unlocked(state);

  const rules: AutobuyerRules<G> = {
    list: def.list,
    autobuyer: (id) => byId.get(id),
    active: (state, id) => {
      const a = byId.get(id);
      return a !== undefined && active(state, a);
    },
    nextInMs: (state, id, now) => {
      const a = byId.get(id);
      if (!a || !active(state, a)) return null;
      const last = own(state).lastAt[a.id];
      return last === undefined ? 0 : Math.max(0, last + a.intervalMs(state) - now);
    },
  };

  const made = feature<K, AutobuyersState, AutobuyerActions, readonly [], Own>({
    key: def.key,
    initial: (): AutobuyersState => ({
      on: Object.fromEntries(def.list.map((a) => [a.id, true])),
      lastAt: {},
      bought: Object.fromEntries(def.list.map((a) => [a.id, 0])),
    }),
    reset: def.reset ?? { keep: ["on"] },
    actions: (api: FeatureApi<Own>): AutobuyerActions => ({
      toggle: (id, on) => {
        let after = false;
        api.set((d) => {
          if (!byId.has(id)) return;
          const s = own(d);
          after = on ?? !(s.on[id] ?? true);
          s.on[id] = after;
        });
        return after;
      },
      setAll: (on) =>
        api.set((d) => {
          for (const a of def.list) own(d).on[a.id] = on;
        }),
    }),
    steps: {
      automate: {
        fire: (d: Draft<Own>, ctx) => {
          for (const a of firing) {
            const state = d as unknown as G;
            if (!active(state, a)) continue;
            const s = own(d);
            const next = everyMs(s.lastAt[a.id], a.intervalMs(state), ctx.now);
            if (next === null) continue;
            s.lastAt[a.id] = next;
            const n = a.run(d as unknown as Draft<G>, ctx);
            // Read the slice again: a `run` that resets the run may have put a new record in its place.
            const after = own(d);
            if (n > 0) after.bought[a.id] = (after.bought[a.id] ?? 0) + n;
          }
        },
      },
    },
  });
  return Object.assign(made, { rules });
}
