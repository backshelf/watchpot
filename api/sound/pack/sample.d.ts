import type { SampleEdit, SampleEntry } from "../desk";
import type { PackManifest } from "../types";
import { type FormatHook } from "./manifest";
import { type Targets } from "./pipeline";
import { type Kind, type Sidecar } from "./source";
export type ProcessSampleOptions = {
    /** The recording's path. */
    file: string;
    /** The sample's name in its pack. */
    name: string;
    kind: Kind;
    /** What was changed of the recording, applied before the pipeline's trim and loudness match. */
    edit?: SampleEdit;
    /** What a sidecar says: a loop's tempo in its source and its length in bars, the root, a shot played round, where it came from. */
    bpm?: number;
    bars?: number;
    root?: number | string;
    loop?: boolean;
    source?: string;
    /** The pack's tempo (a loop is stretched and cut to it); with none, a loop keeps its own `bpm`. */
    tempo?: number;
    /** Opus in Ogg (default) or FLAC. An IR is always FLAC. */
    codec?: "opus" | "flac";
    targets?: Targets;
};
/** A recording made into a sample, not yet in any pack. */
export type ProcessedSample = {
    /** The encoded file. */
    bytes: Uint8Array;
    /** Its name beside `pack.ts` (`<name>.opus`, `<name>.flac`). */
    fileName: string;
    entry: SampleEntry;
    /** The tempo a loop was cut to. */
    tempo?: number;
    /** `buildPack`'s log line for it. */
    line: string;
};
/**
 * One recording through exactly the per-file pipeline `buildPack` runs (with `edit` applied first), encoded to bytes.
 * Nothing in any pack changes. Throws a message naming the file on everything `buildPack` refuses.
 */
export declare function processSample(o: ProcessSampleOptions): Promise<ProcessedSample>;
/** One processed sample to write into a pack. */
export type SampleWrite = {
    name: string;
    bytes: Uint8Array;
    fileName: string;
    entry: SampleEntry;
};
export type CommitSamplesOptions = {
    /** The folder holding `<pack>/`. */
    out: string;
    pack: string;
    samples: readonly SampleWrite[];
    /** Written into the manifest (a retune); a pack with no `pack.ts` yet starts with them. */
    tempo?: number;
    key?: string;
    format?: FormatHook;
};
/**
 * Writes processed samples into a pack: each encoded file beside `pack.ts`, and `pack.ts` rewritten from the manifest
 * it holds (read back from the module itself, so no source folder is needed) with those entries added or replaced and
 * every other entry as it was. A replaced sample's old file goes when its name changed (a new codec). Answers the
 * manifest written.
 */
export declare function commitSamples(o: CommitSamplesOptions): Promise<PackManifest>;
/** `commitSamples` for one sample. */
export declare function commitSample(o: Omit<CommitSamplesOptions, "samples"> & {
    name: string;
    sample: Omit<SampleWrite, "name">;
}): Promise<PackManifest>;
/** Where a sample's recording is: its kept source, or the pack's own encoded file standing in for one. */
export type SampleOrigin = {
    file: string;
    /** Its audio extension (`.wav`). */
    ext: string;
    kind: Kind;
    /** The kept source's sidecar; for the pack's file, what its entry says (a loop's `bpm` is the pack's tempo). */
    sidecar: Sidecar;
    /** True for a kept source, false for the pack's file. */
    kept: boolean;
};
/**
 * The recording sample `name` of `pack` is made from: the source kept under `<source>/<pack>/` (with its sidecar)
 * when there is one, else the pack's encoded file in `<out>/<pack>/`. `null` when it has neither.
 */
export declare function findOrigin(o: {
    out: string;
    source?: string;
    pack: string;
    name: string;
}): Promise<SampleOrigin | null>;
/** A loop made again at a new tempo, with the recording it was made from. */
export type RetunedLoop = ProcessedSample & {
    name: string;
    origin: SampleOrigin;
};
export type RetunePackOptions = {
    out: string;
    /** The folder each pack's sources are kept under (`<source>/<pack>/`). */
    source?: string;
    pack: string;
    tempo: number;
    codec?: "opus" | "flac";
    targets?: Targets;
};
/** What `retunePack` runs for each loop of a pack, in name order: its recording and the options it is made with. */
export declare function planRetune(o: RetunePackOptions): Promise<{
    name: string;
    origin: SampleOrigin;
    options: ProcessSampleOptions;
}[]>;
/**
 * Every loop of a pack made again at `tempo`: each from its kept source and that sidecar's `bpm` when there is one,
 * else from the pack's own file at the manifest's tempo. Nothing is written: commit the loops with
 * `commitSamples({ ..., tempo, key })` and the manifest's tempo moves with them.
 */
export declare function retunePack(o: RetunePackOptions): Promise<RetunedLoop[]>;
/** The codec a pack's file was written in. */
export declare const codecOf: (fileName: string | undefined) => "opus" | "flac";
