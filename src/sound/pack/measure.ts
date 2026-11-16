import { ebur128, type Pcm } from "./ffmpeg";

export type Loudness = {
  /** Integrated loudness, LUFS. */
  lufs: number;
  /** True peak, dBFS. */
  peakDb: number;
};

/** EBU R128 gates in 400 ms blocks, so anything shorter is tiled up to this before it is measured. */
const MIN_SECONDS = 0.5;

/** Repeats a short sound end to end until it fills a block, so its loudness is its own and not diluted by silence. */
export function tiled(pcm: Pcm): Pcm {
  const len = pcm.channels[0]?.length ?? 0;
  const want = Math.ceil(MIN_SECONDS * pcm.rate);
  if (len === 0 || len >= want) return pcm;
  const copies = Math.ceil(want / len);
  return {
    rate: pcm.rate,
    channels: pcm.channels.map((ch) => {
      const out = new Float32Array(len * copies);
      for (let k = 0; k < copies; k++) out.set(ch, k * len);
      return out;
    }),
  };
}

/** Integrated loudness and true peak by ffmpeg's `ebur128`. */
export async function measure(pcm: Pcm): Promise<Loudness> {
  const { lufs, truePeakDb } = await ebur128(tiled(pcm));
  return { lufs, peakDb: truePeakDb };
}

/** dB to a linear ratio. */
export const fromDb = (db: number): number => 10 ** (db / 20);
export const toDb = (linear: number): number => 20 * Math.log10(linear);

/** The correlation of two channels (1 = the same signal). Silence counts as the same. */
export function correlation(l: Float32Array, r: Float32Array): number {
  let lr = 0;
  let ll = 0;
  let rr = 0;
  for (let i = 0; i < l.length; i++) {
    const a = l[i] as number;
    const b = r[i] as number;
    lr += a * b;
    ll += a * a;
    rr += b * b;
  }
  if (ll === 0 || rr === 0) return ll === rr ? 1 : 0;
  return lr / Math.sqrt(ll * rr);
}

/** Folds a stereo pair to mono when the channels correlate above `threshold` (default 0.98); otherwise returns it as is. */
export function foldMono(pcm: Pcm, threshold = 0.98): Pcm {
  const [l, r] = pcm.channels;
  if (!l || !r || correlation(l, r) <= threshold) return pcm;
  const m = new Float32Array(l.length);
  for (let i = 0; i < m.length; i++) m[i] = ((l[i] as number) + (r[i] as number)) / 2;
  return { rate: pcm.rate, channels: [m] };
}

/** Multiplies every sample by `gain` in place. */
export function applyGain(pcm: Pcm, gain: number): void {
  for (const ch of pcm.channels) for (let i = 0; i < ch.length; i++) ch[i] = (ch[i] as number) * gain;
}

/** The largest absolute sample over every channel. */
export function samplePeak(pcm: Pcm): number {
  let p = 0;
  for (const ch of pcm.channels)
    for (let i = 0; i < ch.length; i++) p = Math.max(p, Math.abs(ch[i] as number));
  return p;
}
