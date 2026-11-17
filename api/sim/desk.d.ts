/**
 * The sim desk's contract: a game's `sim.desk.ts` default-exports `defineDesk({...})`, which says what to run, which
 * knobs the sim may turn, and where the run ends.
 */
import type { AnyVocab, Balances, CurrencyOf, Decimal, KnobSpecs, Knobs } from "../core";
import type { FitGate, FitOptions, FitRun } from "./fit";
import type { SimSnapshot } from "./snapshot";
import type { FitTable } from "./table";
/** What the desk reads off a run at a moment: every currency, and the price of what is next to buy. */
export interface DeskSample<C extends string> {
    currencies: Balances<C>;
    next?: Record<string, {
        currency: C;
        cost: Decimal;
    }>;
}
/** A run the desk plays: a `FitRun` with its table and gates, and a sample of the holdings. */
export interface DeskRun<C extends string, X = unknown> extends FitRun<X> {
    readonly table: FitTable;
    readonly gates: readonly FitGate[];
    /** The game is finished. */
    done?(): boolean;
    sample(): DeskSample<C>;
}
/** The fit settings a desk may set. */
export type DeskFit = Pick<FitOptions, "quality" | "stepMs" | "stepping" | "lookEvery" | "snapshotEveryMs">;
/** What a game gives `defineDesk`. */
export interface DeskDef<V extends AnyVocab, S extends KnobSpecs, X> {
    vocab: V;
    knobs: Knobs<S>;
    /** The currency progress is measured in. */
    currency: CurrencyOf<V>;
    /** `sourceKey` globs of the files whose change invalidates a cached run. */
    source: readonly string[];
    /** Hours of play a window covers. Default 2. */
    windowHours?: number;
    /** Where a run ends. */
    end: {
        hours: number;
    };
    /** Seeds per run: `tuning` while turning knobs (default 1), `full` for a report (default 8). */
    seeds?: {
        tuning?: number;
        full?: number;
    };
    fit?: DeskFit;
    /** A fresh run for `seed`, resumed from `from` when given. */
    run(options: {
        seed: number;
        from?: SimSnapshot<X>;
    }): DeskRun<CurrencyOf<V>, X>;
}
/** A desk with its defaults filled. */
export interface Desk<V extends AnyVocab, S extends KnobSpecs, X> extends DeskDef<V, S, X> {
    windowHours: number;
    seeds: {
        tuning: number;
        full: number;
    };
}
/** Checks and freezes a desk, filling `windowHours` (2) and `seeds` (1, 8). Does not call `run`. */
export declare function defineDesk<V extends AnyVocab, S extends KnobSpecs, X = unknown>(def: DeskDef<V, S, X>): Desk<V, S, X>;
