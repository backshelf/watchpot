/**
 * Samples on the main thread: 0.6 clips fetched and decoded once (a clip that fails stays out and is tried again on
 * the next load), a cue's zzfx voices rendered to one buffer, either turned into 16-bit PCM for the core, and the
 * core's sample ids.
 */
import type { Zzfx } from "./gate";
import type { ClipLayer } from "./types";
import { type Layer } from "./voice";
/** A decoded clip with its loudest sample and its RMS, so a layer's `level` can be turned into a gain. */
export interface Decoded {
    buffer: AudioBuffer;
    peak: number;
    rms: number;
}
/** A layer's gain before the master volume: its clip scaled to the layer's target RMS, held under `PEAK_CAP`. */
export declare function gainOf({ level }: ClipLayer, { peak, rms }: Decoded): number;
/** A layer's playback rate: its own when positive and finite (held to 1/16..16), else 1. */
export declare const rateOf: ({ playbackRate: r }: ClipLayer) => number;
/** Fetches and decodes one file through `context`. Rejects on a bad status or a file the browser cannot decode. */
export declare function fetchDecoded(url: string, context: BaseAudioContext): Promise<Decoded>;
/** The 0.6 clip registry: each clip fetched and decoded once, one request per clip at a time. */
export interface ClipCache<F extends string> {
    /** Decodes every clip not yet decoded; `onDecoded` hears each one that lands. A failure is tried again next time. */
    load(context: BaseAudioContext, onDecoded?: (file: F, clip: Decoded) => void): Promise<void>;
    get(file: F): Decoded | undefined;
}
export declare function createClipCache<F extends string>(urls: Readonly<Record<F, string>>): ClipCache<F>;
/** A cue's zzfx voices as the core plays them: one buffer, and how far each play's pitch may wander. */
export interface Rendered {
    samples: Float32Array;
    sampleRate: number;
    /** zzfx's `randomness` of the cue (its largest layer's): the core draws a rate within ± this per play. */
    randomness: number;
}
/**
 * Mixes a cue's zzfx layers into one buffer with `mixLayers`, rendered without zzfx's per-render pitch randomness
 * (the buffer is uploaded once, so each play draws its own rate instead).
 */
export declare function renderVoices(layers: readonly Layer[], { ZZFX }: Zzfx): Rendered;
/** 16-bit interleaved PCM for the core, normalised to full scale: play it at `scale` to sound as the source did. */
export interface Pcm {
    pcm: Int16Array;
    channels: 1 | 2;
    frames: number;
    scale: number;
}
/** One or two channels of float samples as normalised 16-bit interleaved PCM (a third channel on is dropped). */
export declare function toPcm16(channels: readonly Float32Array[]): Pcm;
/** Every channel of a decoded buffer. */
export declare const channelsOf: (buffer: AudioBuffer) => Float32Array[];
/**
 * The core's sample ids, 1 to `max - 1`. Fresh ids are handed out first; a freed id is reused only once they run
 * out, oldest freed first, so an id the core may still be releasing is not loaded over.
 */
export declare function createSampleIds(max: number): {
    /** A free id, or 0 when every id is taken. */
    take(): number;
    give(id: number): void;
};
