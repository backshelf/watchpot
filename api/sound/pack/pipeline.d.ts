import type { SampleEntry } from "../desk";
import { type Pcm } from "./ffmpeg";
import type { Kind, Sidecar } from "./source";
export type Targets = {
    shots?: number;
    loops?: number;
    irs?: number;
};
export type PipelineOptions = {
    /** The pack's tempo: a loop is stretched and cut to it. */
    tempo?: number;
    codec: "opus" | "flac";
    targets?: Targets;
};
/** A recording made into a sample: the pcm to encode, its entry, its file name in the pack and its log line. */
export type Prepared = {
    pcm: Pcm;
    entry: SampleEntry;
    fileName: string;
    codec: "opus" | "flac";
    kbps: number;
    line: string;
};
/** Decodes a recording, failing with a line a person can act on when ffmpeg cannot read it. */
export declare function decodeSource(file: string, where: string): Promise<Pcm>;
/** The sample name, its role, its sidecar (the edit with it) and the name used in messages. */
export type PipelineJob = {
    name: string;
    kind: Kind;
    sidecar: Sidecar;
    where: string;
};
/** Runs a decoded recording through the pipeline. Throws, naming `where`, on everything `buildPack` refuses. */
export declare function prepare(decoded: Pcm, job: PipelineJob, o: PipelineOptions): Promise<Prepared>;
