/**
 * Samples on the main thread: 0.6 clips fetched and decoded once (a clip that fails stays out and is tried again on
 * the next load), a cue's zzfx voices rendered to one buffer, either turned into 16-bit PCM for the core, and the
 * core's sample ids.
 */
import type { Zzfx } from "./gate";
import type { ClipLayer } from "./types";
import { type Layer, mixLayers } from "./voice";

/** The loudest a scaled clip may peak. Output is `gain * volume`, so even 1.2 cannot clip at 0.35. */
const PEAK_CAP = 1.2;

/** zzfx's own default `randomness`: each play's pitch drawn within ± this ratio. */
const ZZFX_RANDOMNESS = 0.05;

/** A decoded clip with its loudest sample and its RMS, so a layer's `level` can be turned into a gain. */
export interface Decoded {
  buffer: AudioBuffer;
  peak: number;
  rms: number;
}

function measure(buffer: AudioBuffer): { peak: number; rms: number } {
  let peak = 0;
  let sum = 0;
  let count = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    for (const s of buffer.getChannelData(c)) {
      peak = Math.max(peak, Math.abs(s));
      sum += s * s;
      count += 1;
    }
  }
  return { peak, rms: count ? Math.sqrt(sum / count) : 0 };
}

/** A layer's gain before the master volume: its clip scaled to the layer's target RMS, held under `PEAK_CAP`. */
export function gainOf({ level }: ClipLayer, { peak, rms }: Decoded): number {
  if (peak === 0 || rms === 0) return 0;
  return Math.min(level / rms, PEAK_CAP / peak);
}

/** A layer's playback rate: its own when positive and finite (held to 1/16..16), else 1. */
export const rateOf = ({ playbackRate: r }: ClipLayer): number =>
  r !== undefined && Number.isFinite(r) && r > 0 ? Math.min(16, Math.max(1 / 16, r)) : 1;

/** Fetches and decodes one file through `context`. Rejects on a bad status or a file the browser cannot decode. */
export async function fetchDecoded(url: string, context: BaseAudioContext): Promise<Decoded> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const buffer = await context.decodeAudioData(await response.arrayBuffer());
  return { buffer, ...measure(buffer) };
}

/** The 0.6 clip registry: each clip fetched and decoded once, one request per clip at a time. */
export interface ClipCache<F extends string> {
  /** Decodes every clip not yet decoded; `onDecoded` hears each one that lands. A failure is tried again next time. */
  load(context: BaseAudioContext, onDecoded?: (file: F, clip: Decoded) => void): Promise<void>;
  get(file: F): Decoded | undefined;
}

export function createClipCache<F extends string>(urls: Readonly<Record<F, string>>): ClipCache<F> {
  const files = Object.keys(urls) as F[];
  const decoded = new Map<F, Decoded>();
  const inflight = new Map<F, Promise<void>>();
  return {
    load(context, onDecoded) {
      const jobs = files.map((file) => {
        if (decoded.has(file)) return Promise.resolve();
        let job = inflight.get(file);
        if (!job) {
          job = fetchDecoded(urls[file], context)
            .then((clip) => {
              decoded.set(file, clip);
              onDecoded?.(file, clip);
            })
            .catch(() => undefined)
            .finally(() => inflight.delete(file));
          inflight.set(file, job);
        }
        return job;
      });
      return Promise.all(jobs).then(() => undefined);
    },
    get: (file) => decoded.get(file),
  };
}

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
export function renderVoices(layers: readonly Layer[], { ZZFX }: Zzfx): Rendered {
  const steady = layers.map((layer) => ({ ...layer, voice: { ...layer.voice, randomness: 0 } }));
  return {
    samples: mixLayers(steady, (p) => ZZFX.buildSamples(...p), ZZFX.sampleRate),
    sampleRate: ZZFX.sampleRate,
    randomness: Math.max(0, ...layers.map(({ voice }) => Math.abs(voice.randomness ?? ZZFX_RANDOMNESS))),
  };
}

/** 16-bit interleaved PCM for the core, normalised to full scale: play it at `scale` to sound as the source did. */
export interface Pcm {
  pcm: Int16Array;
  channels: 1 | 2;
  frames: number;
  scale: number;
}

/** One or two channels of float samples as normalised 16-bit interleaved PCM (a third channel on is dropped). */
export function toPcm16(channels: readonly Float32Array[]): Pcm {
  const used = channels.slice(0, 2);
  const count = used.length === 2 ? 2 : 1;
  const frames = Math.min(...used.map((c) => c.length));
  let peak = 0;
  for (const data of used) for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(data[i] ?? 0));
  const scale = peak > 0 && Number.isFinite(peak) ? peak : 1;
  const pcm = new Int16Array(frames * count);
  const k = 32767 / scale;
  for (let c = 0; c < count; c++) {
    const data = used[c] ?? new Float32Array(0);
    for (let i = 0; i < frames; i++) pcm[i * count + c] = Math.round((data[i] ?? 0) * k);
  }
  return { pcm, channels: count, frames, scale };
}

/** Every channel of a decoded buffer. */
export const channelsOf = (buffer: AudioBuffer): Float32Array[] =>
  Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));

/**
 * The core's sample ids, 1 to `max - 1`. Fresh ids are handed out first; a freed id is reused only once they run
 * out, oldest freed first, so an id the core may still be releasing is not loaded over.
 */
export function createSampleIds(max: number) {
  let next = 1;
  const freed: number[] = [];
  return {
    /** A free id, or 0 when every id is taken. */
    take(): number {
      if (next < max) return next++;
      return freed.shift() ?? 0;
    },
    give(id: number): void {
      freed.push(id);
    },
  };
}
