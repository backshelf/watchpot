/**
 * What the desk's window does with recordings: runs one through the sample host and stages it beside a sample, adds
 * a take from a dropped file, commits what is staged when the mix is saved, and decodes audio for drawing. The host
 * processes and writes; the desk holds and plays; nothing here keeps state of its own.
 */
import type { Desk, MixFile, SampleEdit, SampleHost, SampleSource } from "../../../sound/desk";
import type { PackSample, Take } from "../../../sound/types";
/** What a person has set for a sample's next run through the pipeline, not yet applied. */
export interface SampleDraft {
    edit: SampleEdit;
    /** A loop's tempo in its source, and its length in bars. */
    bpm?: number;
    bars?: number;
}
export interface SampleDeps {
    desk: Desk;
    host: SampleHost;
    /** Recordings dropped in this window and not yet saved, by sample key. */
    files: Map<string, File>;
}
/** An edit with nothing in it left out, so a sidecar says only what was changed. */
export declare function tidyEdit(edit: SampleEdit, seconds: number): SampleEdit;
/**
 * A dropped loop's tempo and length, read from the file: the tempo its name gives (`pack_100_pad.wav`, `120bpm`),
 * checked against its length where that is known, else the tempo nearest the pack's at which its length is a power
 * of two of bars. A loop cut at another tempo than its pack's has to say so before the pipeline can stretch it, and
 * nobody has typed anything yet when a file is dropped. Empty where nothing can be read.
 */
export declare function guessLoop(fileName: string, seconds: number | undefined, packTempo: number | undefined): {
    bpm?: number;
    bars?: number;
};
/**
 * Runs a sample through the host and stages the result: with `file` (default: the one in hand, dropped here), else
 * with no file, which is the kept source again. It plays in the running game from then. Throws the host's own
 * failure.
 */
export declare function restage({ desk, host, files }: SampleDeps, key: string, kind: PackSample["kind"], draft?: SampleDraft, source?: SampleSource, file?: File | undefined): Promise<void>;
/**
 * A recording dropped on a sample: it replaces what the sample plays, staged until Save, and is the file in hand
 * from then. `draft` is what is known of it before anyone has set anything (a loop's tempo and bars, read from the
 * file). A failure throws with the file in hand, and what plays, as they were.
 */
export declare function replaceSample(deps: SampleDeps, key: string, kind: PackSample["kind"], file: File, draft?: SampleDraft): Promise<void>;
/** A recording dropped on a cue as a new take: a new sample of the cue's pack, staged, then one more take. */
export declare function addTake(deps: SampleDeps, cue: string, file: File): Promise<string>;
/** Takes one take off a cue; a sample that was only ever staged for it goes with it. */
export declare function removeTake({ desk, files }: Pick<SampleDeps, "desk" | "files">, cue: string, index: number): void;
/** Drops a staged recording; a take whose sample existed only as that recording leaves its cue with it. */
export declare function discard({ desk, files }: Pick<SampleDeps, "desk" | "files">, key: string): void;
/** One take changed in place. */
export declare function setTake(desk: Desk, cue: string, index: number, patch: Partial<Take>): void;
/**
 * Saves: what is staged is written into its packs through the host and becomes the samples, then the mix file is
 * handed to the game, then the desk is marked saved. A failure at either step throws with nothing marked saved; the
 * answer says whether something moved while the file was being written.
 */
export declare function saveAll(desk: Desk, host: SampleHost | undefined, onSave: (file: MixFile) => void | Promise<void>, files: Map<string, File>): Promise<{
    samples: number;
    moved: boolean;
}>;
export declare const messageOf: (error: unknown) => string;
/** A recording's shape for drawing: the lowest and highest sample in each of `buckets` slices, and its length. */
export interface Peaks {
    seconds: number;
    min: Float32Array;
    max: Float32Array;
}
/** Decodes audio in `win` (no sound device is opened) and folds it to peaks; null where the window cannot decode. */
export declare function peaksOf(win: Window, audio: ArrayBuffer, buckets?: number): Promise<Peaks | null>;
