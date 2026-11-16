import { type Decimal, type DecimalSource } from "./decimal";
import { type Feature } from "./feature";
/**
 * Records: the statistics screen. Named running values, each folded by its kind (a `sum` adds, a `max` keeps the
 * highest, a `min` the lowest, a `last` the latest) and kept at the scopes it names: this run, and the profile's whole
 * life. A run reset pushes the ending run's values onto a short list of past runs, with the run's length in game time,
 * folds them into the best of every run, and starts the run scope over; the life scope never clears.
 */
/** How a record folds a new value in. */
export type RecordKind = "sum" | "max" | "min" | "last";
/** Where a record is kept: this run, or the whole life of the profile. */
export type RecordScope = "run" | "life";
/** One tracked record. */
export interface RecordTrack {
    readonly kind: RecordKind;
    readonly scope: readonly RecordScope[];
    /** Kept as a Decimal (an amount that can outgrow a double); a number otherwise. */
    readonly decimal?: boolean;
    /** Which way a run's value is better, for `best`. Default: lower for `min`, higher for the rest. */
    readonly best?: "high" | "low";
}
/** A record's value: a Decimal for a `decimal` track, else a number. */
export type TrackedValue<T extends RecordTrack> = T extends {
    readonly decimal: true;
} ? Decimal : number;
/** Any record's value. */
export type RecordValue = number | Decimal;
/** One finished run: when it ended, how long it lasted in game time, and its run-scope values. */
export interface RunSummary {
    endedAt: number;
    lengthMs: number;
    values: Record<string, RecordValue>;
}
/** The values at each scope: this run, the whole life, and the best of any finished run. */
export interface RecordScopes {
    run: Record<string, RecordValue>;
    life: Record<string, RecordValue>;
    /** The best run-scope value of any finished run. */
    best: Record<string, RecordValue>;
}
/** The records feature's saved state. A record absent from a scope has no value yet (a `max` never noted). */
export interface RecordsState {
    values: RecordScopes;
    /** Finished runs, oldest first, `keepRuns` at most. */
    runs: RunSummary[];
    /** Game time the current run started. */
    runStart: number;
    /** The shortest finished run, or null before the first. */
    bestRunMs: number | null;
}
type Name<T> = keyof T & string;
/** The records feature's actions. */
export interface RecordsActions<T extends Record<string, RecordTrack>> {
    /** Adds to a `sum` (on any other kind, the same as `note`). */
    add<N extends Name<T>>(name: N, n: DecimalSource): void;
    /** Folds a value in by the record's kind, at every scope it keeps. */
    note<N extends Name<T>>(name: N, value: DecimalSource): void;
    run<N extends Name<T>>(name: N): TrackedValue<T[N]> | undefined;
    life<N extends Name<T>>(name: N): TrackedValue<T[N]> | undefined;
    best<N extends Name<T>>(name: N): TrackedValue<T[N]> | undefined;
}
/** Any game state holding the feature's slice under its key. */
export type RecordsGame<K extends string> = {
    readonly [P in K]: RecordsState;
};
/** The read-only questions over state, for recipes, steps, callbacks and screens. */
export interface RecordsSelect<K extends string, T extends Record<string, RecordTrack>> {
    /** A record's value at a scope (`run`, `life` or the `best` of any finished run), or undefined before it has one. */
    value<N extends Name<T>>(state: RecordsGame<K>, scope: RecordScope | "best", name: N): TrackedValue<T[N]> | undefined;
}
/** The fixed configuration of a records feature. */
export interface RecordsDefs<T extends Record<string, RecordTrack>> {
    /** Each record's name and how it folds and where it is kept. */
    readonly track: T;
}
/** The helpers that take a draft first and change it, named like the actions they mirror. */
export interface RecordsDraftHelpers<T extends Record<string, RecordTrack>> {
    /** `add` inside a recipe or step. */
    add<N extends Name<T>>(draft: object, name: N, n: DecimalSource): void;
    /** `note` inside a recipe or step. */
    note<N extends Name<T>>(draft: object, name: N, value: DecimalSource): void;
}
/** The three namespaces of a records feature. */
export interface RecordsHelpers<K extends string, T extends Record<string, RecordTrack>> {
    readonly select: RecordsSelect<K, T>;
    readonly def: RecordsDefs<T>;
    readonly draft: RecordsDraftHelpers<T>;
}
/** A `records` feature: the feature plus `select`, `def` and `draft`. */
export type RecordsFeature<K extends string, T extends Record<string, RecordTrack>> = Feature<K, RecordsState, RecordsActions<T>> & RecordsHelpers<K, T>;
/**
 * Statistics as a feature. `track` maps each record's name to `{ kind, scope, decimal?, best? }`; it saves
 * `RecordsState` under `key`. The draft helpers `draft.add(draft, name, n)` and `draft.note(draft, name, value)` fold a
 * value in from a recipe or a step, the actions of the same names from outside; `select.value(state, scope, name)`
 * reads one and `def.track` holds the tracks. A run reset (the feature's own `reset`) pushes
 * the run scope onto `runs` (`keepRuns`, default 10) with the run's length, folds it into `best` and `bestRunMs`, and
 * clears it; the life scope stays. No steps: the game notes what it counts where it happens.
 */
export declare function defineRecords<const K extends string, const T extends Record<string, RecordTrack>>(def: {
    readonly key: K;
    readonly track: T;
    readonly keepRuns?: number;
}): RecordsFeature<K, T>;
export {};
