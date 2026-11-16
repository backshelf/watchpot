import type { Draft } from "immer";
import {
  defineFeature,
  type Feature,
  type FeatureApi,
  type NeedsOf,
  type ReachOf,
  type ReachShape,
  type ResetRule,
} from "./feature";

/**
 * Loadouts: a few slots, the items a player holds, and what the items in the slots do together. An item fits a slot
 * of its `kind`; every slotted item gives its own effects, and a `LoadoutSet` gives more once enough slotted items
 * carry its tag. `loadout({ id, slots, items, sets })` is the rules over a slots record the game keeps wherever it
 * saves it; `defineLoadout({ key, …, owns })` is a feature that owns the record, with the rules under `def.loadout`.
 * The effects are the game's own type: with the stats feature's `{ stat, add }` / `{ stat, mul }` effects,
 * `contributions` feeds its `contributions` as a tree's do.
 */

/** One slot. With a `kind` it takes only items of that kind; without one it takes anything. */
export interface LoadoutSlot {
  readonly id: string;
  readonly kind?: string;
}

/** One item that can be slotted: its kind (which slots take it), its tags (which sets count it) and its effects. */
export interface LoadoutItem<E> {
  readonly id: string;
  readonly kind?: string;
  readonly tags?: readonly string[];
  readonly effects?: readonly E[];
}

/** A set: slotted items carrying `tag` are counted, and the highest tier whose `count` is reached gives its effects. */
export interface LoadoutSet<E> {
  readonly id: string;
  readonly tag: string;
  /** Lowest count first. */
  readonly tiers: readonly { readonly count: number; readonly effects: readonly E[] }[];
}

/** What sits in each slot: an item id, or null for an empty slot. A slot absent is empty. */
export type Slotted = Readonly<Record<string, string | null>>;

/** Why an item cannot go in a slot. */
export type LoadoutFailure = "unknown-slot" | "unknown-item" | "wrong-kind" | "not-owned";

/** A set as it stands: how many slotted items carry its tag, the tier reached (-1 for none) and the next count. */
export interface SetStanding<E> {
  readonly set: LoadoutSet<E>;
  readonly count: number;
  /** The index of the tier reached, or -1. */
  readonly tier: number;
  /** The count the next tier needs, or null at the last. */
  readonly next: number | null;
}

/** The definition `loadout` takes. */
export interface LoadoutDef<E> {
  /** The source prefix of its contributions: `<id>:<item>` for an item, `<id>:set:<set>` for a set. */
  readonly id: string;
  readonly slots: readonly LoadoutSlot[];
  readonly items: readonly LoadoutItem<E>[];
  readonly sets?: readonly LoadoutSet<E>[];
}

/** A loadout's rules. */
export interface Loadout<E> {
  readonly id: string;
  readonly slots: readonly LoadoutSlot[];
  readonly items: readonly LoadoutItem<E>[];
  readonly sets: readonly LoadoutSet<E>[];
  item(id: string): LoadoutItem<E> | undefined;
  /** Whether the item's kind suits the slot. */
  fits(slot: string, item: string): boolean;
  /** Why `item` cannot go in `slot`, or null when it can. `owns` is the game's answer to "does the player hold it". */
  check(slot: string, item: string, owns: (item: string) => boolean): LoadoutFailure | null;
  /** Puts `item` in `slot`; an item already in another slot moves. Returns the failure, or null when it went in. */
  equip(
    slotted: Record<string, string | null>,
    slot: string,
    item: string,
    owns: (item: string) => boolean,
  ): LoadoutFailure | null;
  /** Empties a slot. False for a slot the loadout lacks. */
  clear(slotted: Record<string, string | null>, slot: string): boolean;
  /** The slotted items, in slot order. An id the loadout no longer knows is skipped. */
  equipped(slotted: Slotted): LoadoutItem<E>[];
  /** Every set as it stands. */
  standings(slotted: Slotted): SetStanding<E>[];
  /** Every effect in play: each slotted item's, then each reached set tier's. */
  contributions(slotted: Slotted): { source: string; effect: E }[];
}

/** A loadout's rules over a slots record the game keeps. Throws on a repeated slot, item or set id. */
export function loadout<E>(def: LoadoutDef<E>): Loadout<E> {
  const unique = (what: string, ids: readonly string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) throw new Error(`loadout "${def.id}": the ${what} "${id}" appears twice`);
      seen.add(id);
    }
  };
  const sets = def.sets ?? [];
  unique(
    "slot",
    def.slots.map((s) => s.id),
  );
  unique(
    "item",
    def.items.map((i) => i.id),
  );
  unique(
    "set",
    sets.map((s) => s.id),
  );
  const slotById = new Map(def.slots.map((s) => [s.id, s]));
  const itemById = new Map(def.items.map((i) => [i.id, i]));

  const fits = (slot: string, item: string) => {
    const s = slotById.get(slot);
    const i = itemById.get(item);
    return s !== undefined && i !== undefined && (s.kind === undefined || s.kind === i.kind);
  };
  const check = (slot: string, item: string, owns: (item: string) => boolean): LoadoutFailure | null => {
    if (!slotById.has(slot)) return "unknown-slot";
    if (!itemById.has(item)) return "unknown-item";
    if (!fits(slot, item)) return "wrong-kind";
    return owns(item) ? null : "not-owned";
  };
  const equipped = (slotted: Slotted) =>
    def.slots.flatMap((s) => {
      const item = itemById.get(slotted[s.id] ?? "");
      return item ? [item] : [];
    });
  const standings = (slotted: Slotted): SetStanding<E>[] => {
    const held = equipped(slotted);
    return sets.map((set) => {
      const count = held.filter((i) => i.tags?.includes(set.tag)).length;
      let tier = -1;
      set.tiers.forEach((t, n) => {
        if (count >= t.count) tier = n;
      });
      return { set, count, tier, next: set.tiers[tier + 1]?.count ?? null };
    });
  };

  return {
    id: def.id,
    slots: def.slots,
    items: def.items,
    sets,
    item: (id) => itemById.get(id),
    fits,
    check,
    equip: (slotted, slot, item, owns) => {
      const failure = check(slot, item, owns);
      if (failure) return failure;
      for (const s of def.slots) if (slotted[s.id] === item) slotted[s.id] = null;
      slotted[slot] = item;
      return null;
    },
    clear: (slotted, slot) => {
      if (!slotById.has(slot)) return false;
      slotted[slot] = null;
      return true;
    },
    equipped,
    standings,
    contributions: (slotted) => {
      const out: { source: string; effect: E }[] = [];
      for (const item of equipped(slotted))
        for (const effect of item.effects ?? []) out.push({ source: `${def.id}:${item.id}`, effect });
      for (const { set, tier } of standings(slotted))
        for (const effect of set.tiers[tier]?.effects ?? [])
          out.push({ source: `${def.id}:set:${set.id}`, effect });
      return out;
    },
  };
}

/** A loadout search under way, run a slice at a time so a page can show it working. */
export interface LoadoutSearch {
  /** Runs up to `count` more scorings. True while the search is not done. */
  step(count: number): boolean;
  /** The best loadout found so far. */
  best(): Record<string, string | null>;
  /** What `score` gave the best loadout. */
  bestScore(): number;
}

/** What `fillLoadout` and `searchLoadout` take. */
export interface LoadoutSearchOptions {
  owns: (item: string) => boolean;
  score: (slotted: Slotted) => number;
  slots?: readonly string[];
  start?: Slotted;
  depth?: number;
}

/**
 * A good loadout for `score` (higher is better, read over a whole slots record), a slice at a time: from `start`
 * (default empty), any exchange of up to `depth` slots at once (default 3) for items the player owns and has not
 * slotted that scores higher is taken, smallest exchanges first, until none does. A single exchange fills and
 * upgrades; a pair or a triple finds a set that pays only once two or three of it are in. `slots` limits it to the
 * slots that are open (default all). The cost is a scoring per exchange tried: proving no triple pays costs
 * (slots choose 3) × (spare items choose 3) of them, so a handful of slots and tens of items is a few hundred
 * thousand. Run it over frames with `step`, keep `score` cheap (work out what each item is worth once), and never
 * call it every tick.
 */
export function searchLoadout<E>(rules: Loadout<E>, options: LoadoutSearchOptions): LoadoutSearch {
  const { owns, score, depth = 3 } = options;
  const open = options.slots ?? rules.slots.map((s) => s.id);
  const candidates = rules.items.filter((i) => owns(i.id)).map((i) => i.id);
  const slotted: Record<string, string | null> = {};
  for (const slot of open) {
    const id = options.start?.[slot] ?? null;
    slotted[slot] = id !== null && rules.check(slot, id, owns) === null ? id : null;
  }
  let best = score(slotted);
  let bestSlotted = { ...slotted };
  // With kinds, which slot takes which item matters: an exchange tries every order. Without, one order is enough.
  const kinds = rules.slots.some((s) => s.kind !== undefined);
  const PERMS: Record<number, number[][]> = {
    1: [[0]],
    2: [
      [0, 1],
      [1, 0],
    ],
    3: [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ],
  };
  const permsOf = (k: number): number[][] => {
    if (!kinds) return [Array.from({ length: k }, (_, i) => i)];
    if (PERMS[k]) return PERMS[k] as number[][];
    const all: number[][] = [];
    const walk = (rest: number[], at: number[]) => {
      if (rest.length === 0) all.push(at);
      for (const [i, r] of rest.entries()) walk([...rest.slice(0, i), ...rest.slice(i + 1)], [...at, r]);
    };
    walk(
      Array.from({ length: k }, (_, i) => i),
      [],
    );
    PERMS[k] = all;
    return all;
  };
  /** Steps a combination of `k` indices below `n` to the next, in place. False past the last. */
  const next = (ix: number[], n: number): boolean => {
    const k = ix.length;
    let i = k - 1;
    while (i >= 0 && (ix[i] as number) === n - k + i) i--;
    if (i < 0) return false;
    ix[i] = (ix[i] as number) + 1;
    for (let j = i + 1; j < k; j++) ix[j] = (ix[j - 1] as number) + 1;
    return true;
  };

  function* run(): Generator<undefined, void, undefined> {
    for (let guard = 0; guard < 10_000; guard++) {
      let improved = false;
      for (let k = 1; k <= Math.min(depth, open.length) && !improved; k++) {
        const used = new Set(Object.values(slotted));
        const spare: (string | null)[] = candidates.filter((id) => !used.has(id));
        for (let i = 0; i < k; i++) spare.push(null);
        if (spare.length < k) continue;
        const perms = permsOf(k);
        const was: (string | null)[] = Array(k).fill(null);
        const si = Array.from({ length: k }, (_, i) => i);
        do {
          for (let i = 0; i < k; i++) was[i] = slotted[open[si[i] as number] as string] ?? null;
          const ii = Array.from({ length: k }, (_, i) => i);
          do {
            for (const perm of perms) {
              // Every slot changes, and each takes what it fits.
              let ok = true;
              for (let i = 0; i < k && ok; i++) {
                const id = spare[ii[perm[i] as number] as number] ?? null;
                if (id === was[i] || (id !== null && !rules.fits(open[si[i] as number] as string, id)))
                  ok = false;
              }
              if (!ok) continue;
              for (let i = 0; i < k; i++)
                slotted[open[si[i] as number] as string] = spare[ii[perm[i] as number] as number] ?? null;
              const value = score(slotted);
              if (value > best + 1e-12) {
                best = value;
                bestSlotted = { ...slotted };
                improved = true;
                break;
              }
              for (let i = 0; i < k; i++) slotted[open[si[i] as number] as string] = was[i] ?? null;
              yield;
            }
          } while (!improved && next(ii, spare.length));
        } while (!improved && next(si, open.length));
      }
      if (!improved) return;
      yield;
    }
  }

  const it = run();
  let done = false;
  return {
    step(count) {
      for (let n = 0; n < count && !done; n++) done = it.next().done === true;
      return !done;
    },
    best: () => ({ ...bestSlotted }),
    bestScore: () => best,
  };
}

/**
 * `searchLoadout` run to the end at once: the loadout it settles on. For a sim's player or a test; a page runs
 * `searchLoadout` over frames instead, since proving a large loadout cannot be bettered takes a while.
 */
export function fillLoadout<E>(
  rules: Loadout<E>,
  options: LoadoutSearchOptions,
): Record<string, string | null> {
  const search = searchLoadout(rules, options);
  while (search.step(100_000)) {}
  return search.best();
}

/** A loadout feature's state: what sits in each slot. */
export interface LoadoutState {
  slotted: Record<string, string | null>;
}

/** The loadout feature's actions. */
export interface LoadoutActions {
  /** Puts an item the player holds in a slot. Returns the failure, or null when it went in. */
  equip(slot: string, item: string): LoadoutFailure | null;
  /** Empties a slot. */
  clear(slot: string): boolean;
}

/**
 * The read-only questions over state. A loadout feature has none of its own: what sits in the slots is
 * `state[key].slotted`, and `def.loadout` answers over it (`kit.def.loadout.contributions(s.kit.slotted)`).
 */
export type LoadoutSelect = Record<never, never>;

/** The fixed configuration of a loadout feature. */
export interface LoadoutFixed<E> {
  /** The loadout's rules: pure over a slots record (`def.loadout.equip(slotted, …)`). */
  readonly loadout: Loadout<E>;
}

/** A `loadoutFeature`: the feature plus `select`, `def` and `draft` (both empty but `def`: the actions are the changes). */
export type LoadoutFeature<K extends string, E> = Feature<K, LoadoutState, LoadoutActions> & {
  readonly select: LoadoutSelect;
  readonly def: LoadoutFixed<E>;
  readonly draft: Record<never, never>;
};

/**
 * A loadout as a feature: it saves `{ slotted }` under `key` (the stat source prefix too). `owns(state, item)` is
 * the game's rule for what the player holds, read off the whole game state (its own slice plus what `reach` names). A
 * prestige reset keeps the slots unless `reset` says otherwise.
 */
export function defineLoadout<
  const K extends string,
  E,
  const R extends ReachShape = readonly [],
  G extends object = Record<K, LoadoutState> & ReachOf<R>,
>(def: {
  readonly key: K;
  /** The features `owns` reads, as `feature`'s `reach`. */
  readonly reach?: R | (() => R);
  readonly slots: readonly LoadoutSlot[];
  readonly items: readonly LoadoutItem<E>[];
  readonly sets?: readonly LoadoutSet<E>[];
  readonly owns: (state: G, item: string) => boolean;
  readonly reset?: ResetRule<LoadoutState>;
}): LoadoutFeature<K, E> & { readonly needs?: NeedsOf<R> } {
  const rules = loadout<E>({ id: def.key, slots: def.slots, items: def.items, sets: def.sets });
  type Own = Record<K, LoadoutState>;
  const slice = (draft: Draft<Own>): LoadoutState => (draft as Own)[def.key];
  const made = defineFeature<K, LoadoutState, LoadoutActions, ReachShape, Record<never, never>, Own>({
    reach: def.reach,
    key: def.key,
    initial: (): LoadoutState => ({ slotted: Object.fromEntries(def.slots.map((s) => [s.id, null])) }),
    reset: def.reset ?? "never",
    actions: (api: FeatureApi<Own>): LoadoutActions => ({
      equip: (slot, item) => {
        let result: LoadoutFailure | null = "unknown-slot";
        const state = api.get() as unknown as G;
        api.set((d) => {
          result = rules.equip(slice(d).slotted, slot, item, (id) => def.owns(state, id));
        });
        return result;
      },
      clear: (slot) => {
        let cleared = false;
        api.set((d) => {
          cleared = rules.clear(slice(d).slotted, slot);
        });
        return cleared;
      },
    }),
  });
  const helpers: Pick<LoadoutFeature<K, E>, "select" | "def" | "draft"> = {
    select: {},
    def: { loadout: rules },
    draft: {},
  };
  return Object.assign(made, helpers) as LoadoutFeature<K, E> & { readonly needs?: NeedsOf<R> };
}
