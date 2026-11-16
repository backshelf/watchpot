import type { SoundHost } from "../port";
import type { Sequence, SequenceDef } from "../types";
/**
 * A pattern as velocities, at most 64: a string's `1` is a hit and `0` a rest (spaces and `|` are left out, to mark
 * beats and bars); an array's numbers are velocities, 0..1.
 */
export declare function parsePattern(pattern: string | readonly number[]): number[];
/** Builds a sequence over a sound. At most 16 run at once. */
export declare function createSequence(def: SequenceDef<string>, host: SoundHost): Sequence;
