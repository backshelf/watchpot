import { type FormatHook } from "./manifest";
import type { Targets } from "./pipeline";
import { type ProcessedSample, type ProcessSampleOptions } from "./sample";
/** What the host knows of a pack it may write. */
export type SamplePackConfig = {
    /** The tempo and key a pack starts with while its manifest says none. */
    tempo?: number;
    key?: string;
    /** What the pack was built with (`buildPack`'s options): a sample made here matches its neighbours. */
    codec?: "opus" | "flac";
    targets?: Targets;
};
export type SampleHostOptions = {
    /** The folder holding each pack's `<pack>/pack.ts` (`buildPack`'s `out`). */
    out: string;
    /**
     * The folder each pack's sources are kept under (`<source>/<pack>/shots|loops|irs/`), made when missing. Staging
     * lives in `<source>/.staged/`.
     */
    source: string;
    /** The packs the desk may write, by name: any other is refused. */
    packs: Readonly<Record<string, SamplePackConfig>>;
    /** Runs over each `pack.ts` the host writes (a game that formats its generated files). */
    format?: FormatHook;
    /** Runs one recording through the pipeline (default `processSample`): a test stubs it. */
    process?: (o: ProcessSampleOptions) => Promise<ProcessedSample>;
};
export type SampleHandler = {
    /** Answers a request under the mount (`"/__samples/*": (req) => host.fetch(req)`). */
    fetch(req: Request): Promise<Response>;
};
/**
 * The mix desk's sample host over `watchpot/sound/pack`: `process`, `describe`, `commit` and `retune` as HTTP, for a
 * Bun dev server to mount. Nothing is written into a pack until `commit`; until then each processed sample waits in
 * `<source>/.staged/<token>/` (cleared after a day, when a host is made).
 */
export declare function sampleHost(options: SampleHostOptions): SampleHandler;
