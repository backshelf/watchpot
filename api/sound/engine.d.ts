/**
 * `createSound`: a game's cue table played by key through the DSP core. `unlock()` loads zzfx (whose AudioContext
 * everything plays through), resumes the context and boots the core in its worklet. The core then holds every
 * sound as a sample: a cue's zzfx voices rendered to one buffer, its 0.6 clips once decoded, a pack's recordings
 * once loaded. `play` asks the governor whether the play sounds, picks its take and its variation, and turns into
 * `VOICE_START` records on the cue's bus, with its sends and, for a placed cue, its place.
 *
 * Where the core cannot start (no AudioWorklet, no WebAssembly, or a boot that failed) and while it boots, cues play
 * the 0.6 way (`fallback.ts`). The gate is the same on every path: nothing plays or queues while muted, before
 * `unlock()`, or while the context is not running.
 */
import { type CoreLink } from "./boot";
import { type Governor } from "./governor";
import type { Sound, SoundOptions } from "./types";
/** What `createSound` needs from outside: where the core can run and how it boots. Swapped in tests. */
export interface CoreBoot {
    supported(context: AudioContext): boolean;
    boot(context: AudioContext, options: {
        voices: number;
    }): Promise<CoreLink>;
}
/** A game's sound over its cue table, its 0.6 clips and its packs. Nothing loads or plays until `unlock()`. */
export declare function createSound<K extends string, F extends string = string, B extends string = never>(options: SoundOptions<K, F, B>): Sound<K, B>;
/** `createSound` with its core boot (and, for a test of the wiring, its governor) swapped: what the tests drive. */
export declare function createSoundWith<K extends string, F extends string = string, B extends string = never>({ cues, samples: urls, packs, volume, voices, buses, scenes, routes, presence, seed, mix, }: SoundOptions<K, F, B>, core: CoreBoot, parts?: {
    governor?: Governor;
}): Sound<K, B>;
