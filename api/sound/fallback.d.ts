/**
 * The 0.6 play path, kept whole: what runs where the core cannot start (no AudioWorklet, no WebAssembly, or a boot
 * that failed) and while it boots. A cue with every clip decoded plays its clips as buffer sources through one gain
 * each, straight to the destination; any other cue mixes its zzfx voices into one buffer (sample-accurate layering)
 * and plays that through zzfx.
 */
import type { Zzfx } from "./gate";
import { type Decoded } from "./samples";
import type { ClipLayer } from "./types";
import { type Layer } from "./voice";
/** A cue's clip layers, each with its decoded clip. */
export type ReadyClips = readonly {
    layer: ClipLayer;
    clip: Decoded;
}[];
/** Plays a cue the 0.6 way: its clips when `ready`, else its zzfx voices. */
export declare function playFallback({ ZZFX }: Zzfx, voices: readonly Layer[], ready: ReadyClips | null): void;
/** How long a cue's clips sound, at their rates and offsets. */
export declare const clipSeconds: (ready: ReadyClips) => number;
