import type { PackManifest } from "../types";
import { type Targets } from "./pipeline";
export type BuildPackOptions = {
    /** The folder holding `shots/`, `loops/` and `irs/`. */
    source: string;
    /** The folder to write `<name>/` into. */
    out: string;
    name: string;
    /** The tempo every loop is stretched and cut to. Defaults to the loops' own `bpm` when they all agree. */
    tempo?: number;
    key?: string;
    /** Opus in Ogg (default) or FLAC. An IR is always FLAC. */
    codec?: "opus" | "flac";
    /** Loudness targets in LUFS by role. Defaults: shots -18, loops -20, irs untouched. */
    targets?: Targets;
    /** Where the per-file lines go (default `console.log`). */
    log?: (line: string) => void;
};
/**
 * Builds a sound pack: every file under `source/{shots,loops,irs}` edited as its sidecar says, trimmed, matched in
 * loudness, rooted, cut to whole bars (loops), encoded, and written to `<out>/<name>/` with a `pack.ts` manifest.
 * Throws (one message listing every file at fault) when a file is silent, clips, has no tempo, or a loop is not within
 * 5 ms of whole bars. The pack is the folder: a sample with no source here is not in the pack it writes.
 */
export declare function buildPack(options: BuildPackOptions): Promise<PackManifest>;
