import type { SoundHost } from "../port";
import type { Music, MusicDef } from "../types";
/** The tension values where the roll's rate doubles. */
export declare const ROLL_DOUBLINGS: readonly [0.5, 0.75, 0.9];
/** Builds a score over a sound. Throws on a section naming a stem the definition does not list. */
export declare function createMusic<S extends string>(def: MusicDef<S, string>, host: SoundHost): Music<S>;
