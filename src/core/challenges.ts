import type { Draft } from "immer";
import {
  defineFeature,
  type Feature,
  type FeatureApi,
  type NeedsOf,
  type ReachOf,
  type ReachShape,
} from "./feature";

/**
 * Challenges: a run under a restriction, for a permanent reward. Entering one resets the run (the store's `resetRun`)
 * and switches on the challenge's named rule flags, which the game's own rules read (`trials.select.rule(state,
 * "noUpgrades")` in a buy, a rate). When the goal holds the challenge completes: it is counted, its best time kept,
 * the run reset again and the flags cleared. What the completions give is the game's own effects (`{ stat, add }` /
 * `{ stat, mul }`), which `select.contributions` hands to the `stats` feature. The feature never resets with the run:
 * it holds the record, and it survives the very reset it triggers.
 */

/** One challenge: when it opens, its goal, how often it can be completed, its reward and its rule flags. */
export interface ChallengeDef<G, E = never> {
  readonly id: string;
  /** Whether it can be entered. Default: always. */
  readonly unlocked?: (state: G) => boolean;
  /** Whether the run inside it has done what it asks. Read in the `settle` phase every pass while it is active. */
  readonly goal: (state: G) => boolean;
  /** How many times it can be completed (default 1). */
  readonly maxCompletions?: number;
  /** The permanent reward for `completions` so far: `{ stat, add }` / `{ stat, mul }` for the `stats` feature. */
  readonly effects?: (completions: number) => readonly E[];
  /** The restriction's named flags, which the game's rules check with `select.rule` while it is active. */
  readonly rules?: readonly string[];
}

/** The feature's saved state: the challenge under way and its flags, and the record. */
export interface ChallengesState {
  /** The challenge under way, or null. */
  active: string | null;
  /** The game time it was entered (0 when none is). */
  startedAt: number;
  /** The active challenge's rule flags; empty outside one. */
  rules: string[];
  /** Completions per challenge id. */
  completions: Record<string, number>;
  /** The fastest completion per challenge id, in game ms from entering. */
  bestMs: Record<string, number>;
}

/** Why a challenge cannot be entered. */
export type ChallengeFailure = "unknown" | "locked" | "maxed" | "busy";

/** The feature's actions. */
export interface ChallengeActions {
  /** Resets the run and enters the challenge. Returns why not, or null when it went in. */
  enter(id: string): ChallengeFailure | null;
  /** Leaves the challenge under way with no reward, resetting the run. False when none is active. */
  exit(): boolean;
}

/** Any game state holding the feature's slice under its key. */
export type ChallengesGame<K extends string, F extends keyof ChallengesState = keyof ChallengesState> = {
  readonly [P in K]: Pick<ChallengesState, F>;
};

/** The read-only questions over state, for recipes, steps, callbacks and screens. */
export interface ChallengeSelect<K extends string, G, E> {
  /** Why `id` cannot be entered now, or null when it can. */
  check(state: G, id: string): ChallengeFailure | null;
  /** Whether every completion of `id` is done. */
  maxed(state: ChallengesGame<K, "completions">, id: string): boolean;
  /** Whether `rule` is in force: true only while a challenge carrying it is active. */
  rule(state: ChallengesGame<K, "active" | "rules">, rule: string): boolean;
  /** Every completed challenge's reward, sourced `<key>:<id>`, as the `stats` feature's `contributions` take them. */
  contributions(state: ChallengesGame<K, "completions">): { source: string; effect: E }[];
}

/** The fixed configuration of a challenges feature. */
export interface ChallengeDefs<G, E> {
  readonly list: readonly ChallengeDef<G, E>[];
  /** One challenge of the list by id. */
  challenge(id: string): ChallengeDef<G, E> | undefined;
}

/** The helpers that take a draft first and change it. Challenges has none: its changes are its actions. */
export type ChallengeDraftHelpers = Record<never, never>;

/** The three namespaces of a challenges feature. */
export interface ChallengeHelpers<K extends string, G, E> {
  readonly select: ChallengeSelect<K, G, E>;
  readonly def: ChallengeDefs<G, E>;
  readonly draft: ChallengeDraftHelpers;
}

/** A `challenges` feature: the feature plus `select`, `def` and `draft`. */
export type ChallengesFeature<K extends string, G, E> = Feature<K, ChallengesState, ChallengeActions> &
  ChallengeHelpers<K, G, E>;

/**
 * Challenges as a feature. It saves `{ active, startedAt, rules, completions, bestMs }` under `key` (the contributions'
 * source prefix too) and never resets with the run. `enter(id)` resets the run inside its recipe and marks the
 * challenge active; the step `<key>.settle.goal` completes it when its goal holds: counted, the best time kept, the
 * run reset, the flags cleared, then `onComplete(draft, id, completions)`. `exit()` resets the run and pays nothing.
 * The callbacks read the game state: the feature's own slice and whatever `reach` names, so none needs an annotation.
 *
 * `select`: `check`, `maxed`, `rule` (is a rule flag in force: the restriction a buy or a rate checks),
 * `contributions`. `def`: `list`, `challenge(id)`. `draft`: empty.
 */
export function defineChallenges<
  const K extends string,
  E = never,
  const R extends ReachShape = readonly [],
  G extends object = Record<K, ChallengesState> & ReachOf<R>,
>(def: {
  readonly key: K;
  /** The features the callbacks read, as `feature`'s `reach`. */
  readonly reach?: R | (() => R);
  readonly list: readonly ChallengeDef<G, E>[];
  readonly onComplete?: (draft: Draft<G>, id: string, completions: number) => void;
  /** How deep entering, leaving and completing reset (default 1): challenges of a higher layer reset at its depth. */
  readonly depth?: number;
}): ChallengesFeature<K, G, E> & { readonly needs?: NeedsOf<R> } {
  const byId = new Map<string, ChallengeDef<G, E>>();
  for (const c of def.list) {
    if (byId.has(c.id)) throw new Error(`challenges "${def.key}": the challenge "${c.id}" appears twice`);
    byId.set(c.id, c);
  }

  type Own = Record<K, ChallengesState>;
  const own = (state: unknown): ChallengesState => (state as Own)[def.key];
  const maxOf = (c: ChallengeDef<G, E>): number => c.maxCompletions ?? 1;
  const maxed = (state: unknown, id: string): boolean => {
    const c = byId.get(id);
    return c !== undefined && (own(state).completions[id] ?? 0) >= maxOf(c);
  };
  const check = (state: G, id: string): ChallengeFailure | null => {
    const c = byId.get(id);
    if (!c) return "unknown";
    if (own(state).active !== null) return "busy";
    if (c.unlocked && !c.unlocked(state)) return "locked";
    return maxed(state, id) ? "maxed" : null;
  };
  /** Leaves whatever is active: the run reset at `now`, the flags cleared. */
  const leave = (
    reset: (draft: object, ctx: { now: number; depth?: number }) => void,
    draft: Draft<object>,
    now: number,
  ): void => {
    reset(draft, { now, depth: def.depth });
    const s = own(draft);
    s.active = null;
    s.startedAt = 0;
    s.rules = [];
  };

  const helpers: ChallengeHelpers<K, G, E> = {
    select: {
      check,
      maxed,
      rule: (state, rule) => {
        const s = own(state);
        return s.active !== null && s.rules.includes(rule);
      },
      contributions: (state) => {
        const out: { source: string; effect: E }[] = [];
        for (const c of def.list) {
          const n = own(state).completions[c.id] ?? 0;
          if (n <= 0 || !c.effects) continue;
          for (const effect of c.effects(n)) out.push({ source: `${def.key}:${c.id}`, effect });
        }
        return out;
      },
    },
    def: { list: def.list, challenge: (id) => byId.get(id) },
    draft: {},
  };

  const made = defineFeature<K, ChallengesState, ChallengeActions, ReachShape, Record<never, never>, Own>({
    reach: def.reach,
    key: def.key,
    initial: (): ChallengesState => ({ active: null, startedAt: 0, rules: [], completions: {}, bestMs: {} }),
    reset: "never",
    actions: (api: FeatureApi<Own>): ChallengeActions => {
      const any = api as unknown as FeatureApi<object>;
      const enter = (id: string): ChallengeFailure | null => {
        let failure: ChallengeFailure | null = "unknown";
        const now = api.now();
        api.set((d) => {
          failure = check(d as unknown as G, id);
          if (failure) return;
          any.resetRun(d, { now, depth: def.depth });
          const s = own(d);
          s.active = id;
          s.startedAt = now;
          s.rules = [...(byId.get(id)?.rules ?? [])];
        });
        return failure;
      };
      return {
        enter,
        exit: () => {
          let left = false;
          const now = api.now();
          api.set((d) => {
            if (own(d).active === null) return;
            leave((draft, c) => any.resetRun(draft as Draft<object>, c), d, now);
            left = true;
          });
          return left;
        },
      };
    },
    steps: {
      settle: {
        goal: (d: Draft<Own>, ctx) => {
          const s = own(d);
          const c = s.active === null ? undefined : byId.get(s.active);
          if (!c?.goal(d as unknown as G)) return;
          const n = (s.completions[c.id] ?? 0) + 1;
          s.completions[c.id] = n;
          const took = ctx.now - s.startedAt;
          const best = s.bestMs[c.id];
          if (best === undefined || took < best) s.bestMs[c.id] = took;
          leave(ctx.resetRun, d, ctx.now);
          def.onComplete?.(d as unknown as Draft<G>, c.id, n);
        },
      },
    },
  });
  return Object.assign(made, helpers) as ChallengesFeature<K, G, E> & { readonly needs?: NeedsOf<R> };
}
