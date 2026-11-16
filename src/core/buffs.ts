import type { Draft } from "immer";
import { type Feature, type FeatureApi, feature, type ResetRule } from "./feature";

/**
 * Buffs: timed effects, such as a rush that multiplies income by seven for 77 seconds. A buff runs from the game time
 * it started until its `until`; what starting one again does is its stacking rule (`refresh` the clock, `extend` it by
 * the duration, `stack` up to a count on one shared clock, or `ignore`). A buff that runs out moves to `ended` with
 * its window, so the income step of the same pass can still ask how much of a stretch it covered (`overlapMs`): a
 * buff that ran out half way through an absence paid for half of it.
 *
 * `startBuff`, `endBuff` and `expireBuffs` are the pure kernel over `{ active, ended }`; `buffs({ key, list })` is a
 * feature that owns it and expires on game time.
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
 * it is a timer: read with `buffActive` and `buffLeftMs`, and adding nothing to `contributions`.
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

/**
 * A `buffs` feature, carrying its list as `.list`, the running effects as `.contributions`, and `start` / `end`
 * over a draft, for another feature's handler that is already inside a recipe.
 */
export type BuffsFeature<K extends string, E> = Feature<K, BuffsState, BuffsActions> & {
  readonly list: readonly BuffDef<E>[];
  /** Starts a buff in a draft of the game's state at game time `now`. False for an unknown id or an ignored start. */
  start(draft: object, id: string, now: number, start?: BuffStart): boolean;
  /** Ends a running buff in a draft at game time `now`. False when it was not running. */
  end(draft: object, id: string, now: number): boolean;
  /** Every buff running at `now` as its effects, sourced `<key>:<id>`. */
  contributions(state: BuffsState, now: number): { source: string; effect: E }[];
};

/**
 * Timed effects as a feature. It saves `{ active, ended }` under `key`; its step `<key>.sync.expire`, early in every
 * pass, ends the buffs whose time is up on game time, so one runs out during an absence too, and the pass's income
 * step reads `overlapMs` for the part of the stretch it covered. `onEnd(draft, id, now)` runs in the pass that ends
 * one. A run reset ends every buff unless `reset` says otherwise.
 */
export function buffs<const K extends string, E, G extends object = object>(def: {
  readonly key: K;
  readonly list: readonly BuffDef<E>[];
  readonly onEnd?: (draft: Draft<G>, id: string, now: number) => void;
  readonly reset?: ResetRule<BuffsState>;
}): BuffsFeature<K, E> {
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

  const startIn = (draft: object, id: string, now: number, start?: BuffStart): boolean => {
    const rule = byId.get(id);
    if (!rule) return false;
    const before = slice(draft);
    const next = startBuff(before, rule, now, start);
    if (next !== before) land(draft, next);
    return next !== before;
  };
  const endIn = (draft: object, id: string, now: number): boolean => {
    const before = slice(draft);
    const next = endBuff(before, id, now);
    if (next !== before) land(draft, next);
    return next !== before;
  };

  const made = feature({
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
  return Object.assign(made, {
    list: def.list,
    start: startIn,
    end: endIn,
    contributions: (state: BuffsState, now: number) => {
      const out: { source: string; effect: E }[] = [];
      for (const b of def.list) {
        const on = running(state, b.id, now);
        if (on && b.effects)
          for (const effect of b.effects(on.stacks, on.strength))
            out.push({ source: `${def.key}:${b.id}`, effect });
      }
      return out;
    },
  });
}
