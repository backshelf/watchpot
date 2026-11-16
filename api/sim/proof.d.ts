/**
 * The fit's proof on several workers. The proof (`proveFit`) is stretches between snapshots, each standing alone, so
 * they can be replayed at once, one per worker. A worker is a separate copy of the game: it cannot be handed the
 * game's replay as a function, so the game names a module that exports one (`FitProofModule`), and each worker
 * imports it. The single-threaded `proveFit` is the default and gives the same lines; this is the caller's opt-in
 * when the proof is long.
 */
import type { FitProof, FitRun } from "./fit";
import { type SimSnapshot } from "./snapshot";
import type { FitTable, FitTableData } from "./table";
/**
 * What a proof module exports, under the name `proveFitParallel` is given (default `fitProof`): the live table the
 * game reads its prices from (the worker loads the finished one into it), and the replay `proveFit` would be given.
 */
export interface FitProofModule<X = unknown> {
    readonly table: FitTable;
    replay(from: SimSnapshot<X> | undefined): FitRun<X>;
}
/** Options for `proveFitParallel`. */
export interface ParallelProofOptions<X> {
    /** The proof module: an absolute path or a file URL (`new URL("./proof.ts", import.meta.url)`). */
    module: string | URL;
    /** The export holding the `FitProofModule`. Default `"fitProof"`. */
    exportName?: string;
    /** The finished table (`table.data()` after the fit). */
    table: FitTableData;
    /** The fit's snapshots (`result.snapshots`). */
    marks: readonly SimSnapshot<X>[];
    /** The snapshot the fit carried on from, if it did. */
    start?: SimSnapshot<X>;
    /** How many workers at once. Default 4; never more than there are stretches. */
    workers?: number;
}
/** What the main thread sends a worker: one stretch. */
export interface ProofJob {
    module: string;
    exportName: string;
    table: FitTableData;
    index: number;
    from: string | null;
    to: string;
}
/** What a worker sends back. */
export interface ProofAnswer {
    index: number;
    failed: string[];
    error?: string;
}
/**
 * `proveFit` on workers: each stretch is replayed in a worker of its own on the finished table, the later (slower)
 * stretches first. Resolves to the same `FitProof` the single-threaded proof gives, its lines in stretch order; a
 * stretch that throws is a failed line.
 */
export declare function proveFitParallel<X>(options: ParallelProofOptions<X>): Promise<FitProof>;
