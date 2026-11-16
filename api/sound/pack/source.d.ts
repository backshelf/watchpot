import type { SampleEdit } from "../desk";
import type { PackSample } from "../types";
export type Kind = PackSample["kind"];
/** A file's `<file>.json` beside it. */
export type Sidecar = {
    /** A loop's tempo in its source. */
    bpm?: number;
    /** The key of the recording (kept for the log; the pack's `key` is the manifest's). */
    key?: string;
    /** The root, as Hz or a note name (`"A3"`): wins over detection. */
    root?: number | string;
    /** Where the recording came from. */
    source?: string;
    /** A loop's length in bars, when the length alone would not say. */
    bars?: number;
    /**
     * A shot the game plays round (a bed, a roll): its ends are left as they are, neither trimmed nor faded, so the
     * end meets the start.
     */
    loop?: boolean;
    /** What was changed of the recording before the pipeline (the mix desk writes it): crop, fades, pitch, reverse. */
    edit?: SampleEdit;
};
export declare const ROLES: readonly {
    dir: "shots" | "loops" | "irs";
    kind: Kind;
}[];
export declare const roleDir: (kind: Kind) => string;
export declare const AUDIO: ReadonlySet<string>;
/**
 * Whether a pack or sample name may become part of a path: letters, digits, `.`, `_` and `-`, not starting with a
 * dot (so never `.`, `..` or a hidden folder), at most 100 characters.
 */
export declare function isSafeName(name: unknown): name is string;
/** A recording found under a source folder: its path, its role and the sample name it gives. */
export type SourceFile = {
    file: string;
    kind: Kind;
    name: string;
    rel: string;
};
/** Every audio file under `source/{shots,loops,irs}`, sorted, named as `buildPack` names them. */
export declare function listSources(source: string): SourceFile[];
/** The sidecar beside `file` (`{}` when there is none). Throws, naming the file, when it is not JSON or its edit is bad. */
export declare function readSidecar(file: string): Promise<Sidecar>;
/** The text of a sidecar: the fields that are set, in a fixed order, two-space JSON. */
export declare function sidecarText(sidecar: Sidecar): string;
/**
 * Keeps a recording as the source of sample `name`: copied to `<source>/<role>/<name><ext>` with its sidecar beside
 * it (none when the sidecar says nothing). Every earlier source that gave the same name, in any role or subfolder, is
 * removed with its sidecar, so a later `buildPack` over the folder finds one file per sample. Answers the kept path.
 */
export declare function keepSource(o: {
    /** The pack's source folder (the one holding `shots/`, `loops/` and `irs/`). */
    source: string;
    name: string;
    kind: Kind;
    /** The recording to keep. */
    file: string;
    /** Its extension (`.wav`), when the file's own name does not end in it. */
    ext?: string;
    sidecar: Sidecar;
}): Promise<string>;
