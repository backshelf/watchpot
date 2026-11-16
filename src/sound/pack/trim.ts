import type { Pcm } from "./ffmpeg";

/** Below this the tail is silence. */
const FLOOR = 10 ** (-60 / 20);
/** Leading silence kept before the first sound, seconds (the brief wants under 3 ms). */
const LEAD = 0.001;
const FADE = 0.002;
/** How far back from the last audible sample a zero crossing is looked for, seconds. */
const CROSS_WINDOW = 0.05;

export type Trimmed = { pcm: Pcm; leadMs: number; tailMs: number };

/** The first and last index where any channel is above the floor, or `null` for silence. */
export function audibleRange(pcm: Pcm): [number, number] | null {
  const len = pcm.channels[0]?.length ?? 0;
  let first = -1;
  let last = -1;
  for (const ch of pcm.channels) {
    for (let i = 0; i < len; i++) {
      if (Math.abs(ch[i] as number) > FLOOR) {
        if (first < 0 || i < first) first = i;
        break;
      }
    }
    for (let i = len - 1; i >= 0; i--) {
      if (Math.abs(ch[i] as number) > FLOOR) {
        if (i > last) last = i;
        break;
      }
    }
  }
  return first < 0 ? null : [first, last];
}

/**
 * Cuts a shot (or an IR): leading silence down to 1 ms before the first sound, the tail where it falls under -60 dBFS
 * at the last zero crossing before it, a 2 ms fade in and a 2 ms fade out. `null` when the file is all silence.
 */
export function trimShot(pcm: Pcm): Trimmed | null {
  const range = audibleRange(pcm);
  if (!range) return null;
  const rate = pcm.rate;
  const start = Math.max(0, range[0] - Math.round(LEAD * rate));
  let end = range[1] + 1; // exclusive
  // Back to the last zero crossing of the channel sum, within a short window.
  const sum = (i: number) => pcm.channels.reduce((s, ch) => s + (ch[i] as number), 0);
  const lowest = Math.max(start + 1, end - Math.round(CROSS_WINDOW * rate));
  for (let i = end - 1; i > lowest; i--) {
    if (Math.sign(sum(i)) !== Math.sign(sum(i - 1)) || sum(i) === 0) {
      end = i;
      break;
    }
  }
  const fade = Math.min(Math.round(FADE * rate), Math.floor((end - start) / 2));
  const channels = pcm.channels.map((ch) => {
    const out = ch.slice(start, end);
    for (let i = 0; i < fade; i++) {
      out[i] = (out[i] as number) * (i / fade);
      const j = out.length - 1 - i;
      out[j] = (out[j] as number) * (i / fade);
    }
    return out;
  });
  const total = pcm.channels[0]?.length ?? 0;
  return {
    pcm: { channels, rate },
    leadMs: ((range[0] - start) / rate) * 1000,
    tailMs: ((total - end) / rate) * 1000,
  };
}

/** Cuts or zero-pads every channel to exactly `samples` frames (a loop's whole bars). */
export function fitLength(pcm: Pcm, samples: number): Pcm {
  return {
    rate: pcm.rate,
    channels: pcm.channels.map((ch) => {
      const out = new Float32Array(samples);
      out.set(ch.subarray(0, Math.min(samples, ch.length)));
      return out;
    }),
  };
}
