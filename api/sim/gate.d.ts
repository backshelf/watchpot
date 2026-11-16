import { type Tally, type Verdict } from "./contract";
/**
 * The gate runner: checks over sim jobs, every job run once however many checks read it, all at once (a process
 * each with `spawnJob`, so the gate takes as long as its slowest run). A check fails the gate when a majority of its
 * runs miss it (`tally`); a check marked `todo` is printed but never fails.
 */
export interface GateCheck<J, Res> {
    id: string;
    jobs: readonly J[];
    /** The verdicts, one list per run to tally: a run per seed, or one for a comparison. */
    judge: (results: readonly Res[]) => Verdict[][];
}
/** One check's tallies over the seeded runs of a gate, and those that fail on a majority. */
export interface GateResult {
    id: string;
    tallies: Tally[];
    failing: Tally[];
}
/** How a gate runs its jobs: the `key` that names a job and the `run` that plays it. */
export interface GateRunner<J, Res> {
    /** A job's identity: two checks naming the same job share one run. */
    key(job: J): string;
    run(job: J): Promise<Res>;
}
/** Runs every job the checks name once, all at once, and tallies each check over the results. */
export declare function runGate<J, Res>(checks: readonly GateCheck<J, Res>[], { key, run }: GateRunner<J, Res>): Promise<GateResult[]>;
/** Runs a script in its own Bun process and parses what it prints as JSON; a non-zero exit throws with its stderr. */
export declare function spawnJob<Res>(script: string, args: readonly string[]): Promise<Res>;
/** Each check's count of checks held by a majority, then every check's runs, values and spread. */
export declare function formatGate(results: readonly GateResult[]): string;
