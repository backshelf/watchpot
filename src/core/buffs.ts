import type { Draft } from "immer";
import {
  type Feature,
  type FeatureApi,
  feature,
  type NeedsOf,
  type ReachOf,
  type ReachShape,
  type ResetRule,
} from "./feature";

/**
 * Buffs: timed effects, such as a rush that multiplies income by seven for 77 seconds. A buff runs from the game time
 * it started until its `until`; what starting one again does is its stacking rule (`refresh` the clock, `extend` it by
 * the duration, `stack` up to a count on one shared clock, or `ignore`). A buff that runs out moves to `ended` with
 * its window, so the income step of the same pass can still ask how much of a stretch it covered (`overlapMs`): a
 * buff that ran out half way through an absence paid for half of it.
 *
 * `startBuff`, `endBuff`, `expireBuffs` and the readers (`buffActive`, `buffLeftMs`, `buffStacks`, `overlapMs`) are
 * the pure kernel over `{ active, ended }`; `defineBuffs({ key, list })` is a feature that owns it and expires on game
 * time, with the readers state-first under `select`, the list under `def` and `start` / `end` over a draft under
 * `draft`.
 */

/** What starting a buff that is already running does. */
export type BuffStack = "refresh" | "extend" | "stack" | "ignore";

/** One running buff: when it started, when it ends, its stacks and the strength it was started with. */
export interface ActiveBuff {
  since: number;
  until: number;
  stacks: number;
  /** The game's own number for this run of it (a multiplier rolled at the start). */
  strength?: number;
}

/** A buff's last run, kept after it ends: the window it covered. */
export interface EndedBuff {
  since: number;
  until: number;
}

/** The buffs' state: those running, and each one's last finished run. */
export interface BuffsState {
  active: Record<string, ActiveBuff>;
  ended: Record<string, EndedBuff>;
}

/** A buff's rules: its id, how long a start runs and its stacking rule. */
export interface BuffRule {
  readonly id: string;
  readonly durationMs: number;
  readonly stack: BuffStack;
  /** With `stack`: the most stacks (default 1). */
  readonly maxStacks?: number;
}

/**
 * A buff as the feature declares it: its rules and its effects at a count of stacks and a strength. Without `effects`
 * it is a timer: read with `select.active` and `select.leftMs`, and adding nothing to `select.contributions`.
 */
export interface BuffDef<E> extends BuffRule {
  readonly effects?: (stacks: number, strength: number | undefined) => readonly E[];
}

/** What one start may override: the duration, and the strength it runs at. */
export interface BuffStart {
  readonly durationMs?: number;
  readonly strength?: number;
}

/** The buff running at `now`, or undefined. */
function running(state: Pick<BuffsState, "active">, id: string, now: number): ActiveBuff | undefined {
  const b = state.active[id];
  return b && b.until > now ? b : undefined;
}

/** Whether the buff is running at `now`. */
export function buffActive(state: Pick<BuffsState, "active">, id: string, now: number): boolean {
  return running(state, id, now) !== undefined;
}

/** How long the buff has left at `now`; 0 when it is not running. */
export function buffLeftMs(state: Pick<BuffsState, "active">, id: string, now: number): number {
  const b = running(state, id, now);
  return b ? b.until - now : 0;
}

/** The buff's stacks at `now`; 0 when it is not running. */
export function buffStacks(state: Pick<BuffsState, "active">, id: string, now: number): number {
  return running(state, id, now)?.stacks ?? 0;
}

/**
 * How much of the stretch from `from` to `to` the buff covered, running or ended: its window `[since, until)`
 * against the stretch. A catch-up's income step pays the buffed rate for this much of the gap.
 */
export function overlapMs(state: BuffsState, id: string, from: number, to: number): number {
  const b = state.active[id] ?? state.ended[id];
  if (!b) return 0;
  return Math.max(0, Math.min(to, b.until) - Math.max(from, b.since));
}

/**
 * Starts a buff at `now` by its stacking rule. Not running: one stack for `durationMs`. Running: `refresh` restarts
 * the clock, `extend` adds the duration to it, `stack` adds a stack (up to `maxStacks`) and restarts the shared clock,
 * `ignore` leaves it be. A new `strength` replaces the old. Pure: returns a new state, or `state` itself when nothing
 * changed.
 */
export function startBuff(state: BuffsState, rule: BuffRule, now: number, start: BuffStart = {}): BuffsState {
  const ms = Math.max(0, start.durationMs ?? rule.durationMs);
  const was = running(state, rule.id, now);
  const strength = start.strength ?? was?.strength;
  const withStrength = (b: ActiveBuff): ActiveBuff => (strength === undefined ? b : { ...b, strength });
  let next: ActiveBuff;
  if (!was) next = withStrength({ since: now, until: now + ms, stacks: 1 });
  else if (rule.stack === "ignore") return state;
  else if (rule.stack === "extend") next = withStrength({ ...was, until: was.until + ms });
  else if (rule.stack === "stack")
    next = withStrength({
      ...was,
      until: now + ms,
      stacks: Math.min(Math.max(1, rule.maxStacks ?? 1), was.stacks + 1),
    });
  else next = withStrength({ ...was, until: now + ms });
  return { ...state, active: { ...state.active, [rule.id]: next } };
}

/** Ends a running buff at `now`: it moves to `ended`, cut short. Pure; `state` itself when it was not running. */
export function endBuff(state: BuffsState, id: string, now: number): BuffsState {
  const b = running(state, id, now);
  if (!b) return state;
  const { [id]: _gone, ...active } = state.active;
  return { active, ended: { ...state.ended, [id]: { since: b.since, until: now } } };
}

/** Moves every buff whose `until` is at or before `now` to `ended`. Pure: returns the state and the ids that ended. */
export function expireBuffs(state: BuffsState, now: number): { state: BuffsState; ended: string[] } {
  const done = Object.keys(state.active).filter((id) => (state.active[id]?.until ?? 0) <= now);
  if (done.length === 0) return { state, ended: [] };
  const active = { ...state.active };
  const ended = { ...state.ended };
  for (const id of done) {
    const b = active[id];
    if (b) ended[id] = { since: b.since, until: b.until };
    delete active[id];
  }
  return { state: { active, ended }, ended: done };
}

/** The buffs feature's actions. */
export interface BuffsActions {
  /** Starts a buff at game time now by its stacking rule. False for an unknown id, or one its rule ignored. */
  start(id: string, start?: BuffStart): boolean;
  /** Ends a running buff now. False when it was not running. */
  end(id: string): boolean;
}

/** Any state or draft holding the buffs' state under its key. */
export type BuffsHost<K extends string> = { readonly [P in K]: BuffsState };

/** The read-only questions over state, for steps and callbacks: the state-first twins of the pure `buffActive` and kin. */
export interface BuffsSelect<K extends string, E> {
  /** Whether the buff is running at `now`. */
  active(state: BuffsHost<K>, id: string, now?: number): boolean;
  /** How long the buff has left at `now`; 0 when it is not running. */
  leftMs(state: BuffsHost<K>, id: string, now?: number): number;
  /** The buff's stacks at `now`; 0 when it is not running. */
  stacks(state: BuffsHost<K>, id: string, now?: number): number;
  /** How much of the stretch from `from` to `to` the buff covered, running or ended (see `overlapMs`). */
  overlapMs(state: BuffsHost<K>, id: string, from: number, to: number): number;
  /**
   * Every buff running at `now` as its effects, sourced `<key>:<id>`. Without `now`, every buff still held: the
   * feature's own `sync` step ends each buff whose time is up at the start of a pass, so what is held is what is
   * running, to within a pass. That is the form a stats feature's `contributions` uses, since a derived value
   * reads no clock.
   */
  contributions(state: BuffsHost<K>, now?: number): { source: string; effect: E }[];
}

/** The fixed configuration of a buffs feature. */
export interface BuffsFixed<E> {
  /** The buffs the feature was given. */
  readonly list: readonly BuffDef<E>[];
}

/** The helpers that take a draft first and change it, named like the actions they mirror. */
export interface BuffsDraftHelpers<K extends string> {
  /** Starts a buff in a draft of the game's state at game time `now`. False for an unknown id or an ignored start. */
  start(draft: BuffsHost<K>, id: string, now: number, start?: BuffStart): boolean;
  /** Ends a running buff in a draft at game time `now`. False when it was not running. */
  end(draft: BuffsHost<K>, id: string, now: number): boolean;
}

/** A `buffs` feature: the feature plus `select`, `def` and `draft`. */
export type BuffsFeature<K extends string, E> = Feature<K, BuffsState, BuffsActions> & {
  readonly select: BuffsSelect<K, E>;
  readonly def: BuffsFixed<E>;
  readonly draft: BuffsDraftHelpers<K>;
};

/**
 * Timed effects as a feature. It saves `{ active, ended }` under `key`; its step `<key>.sync.expire`, early in every
 * pass, ends the buffs whose time is up on game time, so one runs out during an absence too, and the pass's income
 * step reads `select.overlapMs` for the part of the stretch it covered. `onEnd(draft, id, now)` runs in the pass that
 * ends one and sees the feature's own slice and what `reach` names. A run reset ends every buff unless `reset` says
 * otherwise.
 */
/**
 * The `now` a reader takes when it is given none: before every end, so every buff still held counts as running.
 * The feature's `sync` step ends each buff whose time is up at the start of a pass, so what is held is what is
 * running, to within a pass. It is what a derived value uses, since it reads no clock. (`leftMs` without a `now`
 * is then not a time: pass one to read it.)
 */
const HELD = Number.NEGATIVE_INFINITY;

export function defineBuffs<
  const K extends string,
  E,
  const R extends ReachShape = readonly [],
  G extends object = Record<K, BuffsState> & ReachOf<R>,
>(def: {
  readonly key: K;
  /** The features `onEnd` reads, as `feature`'s `reach`. */
  readonly reach?: R | (() => R);
  readonly list: readonly BuffDef<E>[];
  readonly onEnd?: (draft: Draft<G>, id: string, now: number) => void;
  readonly reset?: ResetRule<BuffsState>;
}): BuffsFeature<K, E> & { readonly needs?: NeedsOf<R> } {
  const byId = new Map<string, BuffDef<E>>();
  for (const b of def.list) {
    if (byId.has(b.id)) throw new Error(`buffs "${def.key}": the buff "${b.id}" appears twice`);
    byId.set(b.id, b);
  }
  type Own = Record<K, BuffsState>;
  const slice = (draft: unknown): BuffsState => (draft as Own)[def.key];
  const land = (draft: unknown, next: BuffsState): void => {
    const s = slice(draft);
    s.active = next.active;
    s.ended = next.ended;
  };

  const startIn = (draft: unknown, id: string, now: number, start?: BuffStart): boolean => {
    const rule = byId.get(id);
    if (!rule) return false;
    const before = slice(draft);
    const next = startBuff(before, rule, now, start);
    if (next !== before) land(draft, next);
    return next !== before;
  };
  const endIn = (draft: unknown, id: string, now: number): boolean => {
    const before = slice(draft);
    const next = endBuff(before, id, now);
    if (next !== before) land(draft, next);
    return next !== before;
  };

  const made = feature<K, BuffsState, BuffsActions, ReachShape, Record<never, never>, Own>({
    reach: def.reach,
    key: def.key,
    initial: (): BuffsState => ({ active: {}, ended: {} }),
    reset: def.reset ?? "run",
    actions: (api: FeatureApi<Own>): BuffsActions => ({
      start: (id, start) => {
        let changed = false;
        const now = api.now();
        api.set((d) => {
          changed = startIn(d, id, now, start);
        });
        return changed;
      },
      end: (id) => {
        let changed = false;
        const now = api.now();
        api.set((d) => {
          changed = endIn(d, id, now);
        });
        return changed;
      },
    }),
    steps: {
      sync: {
        expire: (d: Draft<Own>, ctx) => {
          const step = expireBuffs(slice(d), ctx.now);
          if (step.ended.length === 0) return;
          land(d, step.state);
          for (const id of step.ended) def.onEnd?.(d as unknown as Draft<G>, id, ctx.now);
        },
      },
    },
  });
  const select: BuffsSelect<K, E> = {
    active: (state, id, now = HELD) => buffActive(slice(state), id, now),
    leftMs: (state, id, now = HELD) => buffLeftMs(slice(state), id, now),
    stacks: (state, id, now = HELD) => buffStacks(slice(state), id, now),
    overlapMs: (state, id, from, to) => overlapMs(slice(state), id, from, to),
    contributions: (state, now = HELD) => {
      const s = slice(state);
      const out: { source: string; effect: E }[] = [];
      for (const b of def.list) {
        const on = running(s, b.id, now);
        if (on && b.effects)
          for (const effect of b.effects(on.stacks, on.strength))
            out.push({ source: `${def.key}:${b.id}`, effect });
      }
      return out;
    },
  };
  const helpers: Pick<BuffsFeature<K, E>, "select" | "def" | "draft"> = {
    select,
    def: { list: def.list },
    draft: { start: startIn, end: endIn },
  };
  return Object.assign(made, helpers) as BuffsFeature<K, E> & { readonly needs?: NeedsOf<R> };
}
