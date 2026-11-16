import type { Draft } from "immer";
import { type Feature, type NeedsOf, type ReachOf, type ReachShape, type ResetRule } from "./feature";
/**
 * Buffs: timed effects, such as a rush that multiplies income by seven for 77 seconds. A buff runs from the game time
 * it started until its `until`; what starting one again does is its stacking rule (`refresh` the clock, `extend` it by
 * the duration, `stack` up to a count on one shared clock, or `ignore`). A buff that runs out moves to `ended` with
 * its window, so the income step of the same pass can still ask how much of a stretch it covered (`overlapMs`): a
 * buff that ran out half way through an absence paid for half of it.
 *
 * `startBuff`, `endBuff`, `expireBuffs` and the readers (`buffActive`, `buffLeftMs`, `buffStacks`, `overlapMs`) are
 * the pure kernel over `{ active, ended }`; `buffs({ key, list })` is a feature that owns it and expires on game
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
/** Whether the buff is running at `now`. */
export declare function buffActive(state: Pick<BuffsState, "active">, id: string, now: number): boolean;
/** How long the buff has left at `now`; 0 when it is not running. */
export declare function buffLeftMs(state: Pick<BuffsState, "active">, id: string, now: number): number;
/** The buff's stacks at `now`; 0 when it is not running. */
export declare function buffStacks(state: Pick<BuffsState, "active">, id: string, now: number): number;
/**
 * How much of the stretch from `from` to `to` the buff covered, running or ended: its window `[since, until)`
 * against the stretch. A catch-up's income step pays the buffed rate for this much of the gap.
 */
export declare function overlapMs(state: BuffsState, id: string, from: number, to: number): number;
/**
 * Starts a buff at `now` by its stacking rule. Not running: one stack for `durationMs`. Running: `refresh` restarts
 * the clock, `extend` adds the duration to it, `stack` adds a stack (up to `maxStacks`) and restarts the shared clock,
 * `ignore` leaves it be. A new `strength` replaces the old. Pure: returns a new state, or `state` itself when nothing
 * changed.
 */
export declare function startBuff(state: BuffsState, rule: BuffRule, now: number, start?: BuffStart): BuffsState;
/** Ends a running buff at `now`: it moves to `ended`, cut short. Pure; `state` itself when it was not running. */
export declare function endBuff(state: BuffsState, id: string, now: number): BuffsState;
/** Moves every buff whose `until` is at or before `now` to `ended`. Pure: returns the state and the ids that ended. */
export declare function expireBuffs(state: BuffsState, now: number): {
    state: BuffsState;
    ended: string[];
};
/** The buffs feature's actions. */
export interface BuffsActions {
    /** Starts a buff at game time now by its stacking rule. False for an unknown id, or one its rule ignored. */
    start(id: string, start?: BuffStart): boolean;
    /** Ends a running buff now. False when it was not running. */
    end(id: string): boolean;
}
/** Any state or draft holding the buffs' state under its key. */
export type BuffsHost<K extends string> = {
    readonly [P in K]: BuffsState;
};
/** The read-only questions over state, for steps and callbacks: the state-first twins of the pure `buffActive` and kin. */
export interface BuffsSelect<K extends string, E> {
    /** Whether the buff is running at `now`. */
    active(state: BuffsHost<K>, id: string, now: number): boolean;
    /** How long the buff has left at `now`; 0 when it is not running. */
    leftMs(state: BuffsHost<K>, id: string, now: number): number;
    /** The buff's stacks at `now`; 0 when it is not running. */
    stacks(state: BuffsHost<K>, id: string, now: number): number;
    /** How much of the stretch from `from` to `to` the buff covered, running or ended (see `overlapMs`). */
    overlapMs(state: BuffsHost<K>, id: string, from: number, to: number): number;
    /** Every buff running at `now` as its effects, sourced `<key>:<id>`. */
    contributions(state: BuffsHost<K>, now: number): {
        source: string;
        effect: E;
    }[];
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
export declare function buffs<const K extends string, E, const R extends ReachShape = readonly [], G extends object = Record<K, BuffsState> & ReachOf<R>>(def: {
    readonly key: K;
    /** The features `onEnd` reads, as `feature`'s `reach`. */
    readonly reach?: R | (() => R);
    readonly list: readonly BuffDef<E>[];
    readonly onEnd?: (draft: Draft<G>, id: string, now: number) => void;
    readonly reset?: ResetRule<BuffsState>;
}): BuffsFeature<K, E> & {
    readonly needs?: NeedsOf<R>;
};
