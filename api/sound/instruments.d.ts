import type { SoundHost } from "./port";
import type { Gen, GenDef, GenKind, Grain, GrainDef } from "./types";
/** The instruments as `engine.ts` holds them. */
export interface Instruments {
    grain(sample: string, def?: GrainDef<string>): Grain;
    gen(kind: GenKind, def?: GenDef<string>): Gen;
    /** A sample became ready or was freed: a cloud waiting for its sample can start. */
    samples(): void;
}
export declare function createInstruments(host: SoundHost, seed: () => number): Instruments;
