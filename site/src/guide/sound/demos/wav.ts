// The recordings these pages play, written in the browser as the files a pack holds: 16-bit PCM in a WAV container.
// A demo has no audio shipped with it, so it makes the samples it needs on a press and hands the engine a blob URL.
// Nothing here runs at module scope: a function that makes a file is called from the reader's press.

const RATE = 48_000;

/** One channel of samples as a WAV file's bytes, and a URL to hand a pack's manifest. */
export function wavUrl(samples: Float32Array, rate = RATE): string {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const ascii = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // linear PCM
  view.setUint16(22, 1, true); // one channel
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(44 + i * 2, Math.round(value * 32_767), true);
  }
  return URL.createObjectURL(new Blob([view], { type: "audio/wav" }));
}

const silence = (seconds: number) => new Float32Array(Math.round(seconds * RATE));
const fade = (at: number, seconds: number) => Math.min(1, Math.max(0, seconds === 0 ? 0 : at / seconds));

/** A shot: one tone plucked and left to die away, 0.4 s. */
export function shot(seconds = 0.4, hz = 330): Float32Array {
  const out = silence(seconds);
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const decay = Math.exp(-9 * t);
    const edge = fade(t, 0.002) * fade(seconds - t, 0.03);
    out[i] =
      edge * decay * (0.5 * Math.sin(2 * Math.PI * hz * t) + 0.15 * Math.sin(2 * Math.PI * hz * 2 * t));
  }
  return out;
}

/**
 * A loop of `seconds` that meets itself: every tone is a whole number of cycles long, so the last sample runs back
 * into the first with no click, and the core can loop it against the transport.
 */
export function pad(seconds: number): Float32Array {
  const out = silence(seconds);
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const swell = 0.75 + 0.25 * Math.sin(2 * Math.PI * (3 / seconds) * t);
    out[i] =
      swell *
      (0.16 * Math.sin(2 * Math.PI * 110 * t) +
        0.11 * Math.sin(2 * Math.PI * 165 * t) +
        0.08 * Math.sin(2 * Math.PI * 220 * t));
  }
  return out;
}

/** A bass part: one pluck on every beat, four to the bar, the same pitch throughout. */
export function bass(seconds: number, hz = 55): Float32Array {
  const out = silence(seconds);
  const beat = seconds / 4;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const into = (t % beat) / beat;
    const decay = Math.exp(-5 * into);
    out[i] = 0.32 * decay * Math.sin(2 * Math.PI * hz * t);
  }
  return out;
}

/** Drums: a noise hit and a low thump on every beat, nothing between them. */
export function drums(seconds: number): Float32Array {
  const out = silence(seconds);
  const beat = seconds / 4;
  let seed = 1;
  for (let i = 0; i < out.length; i++) {
    const t = i / RATE;
    const into = t % beat;
    if (into > 0.12) continue;
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    const noise = (seed / 2_147_483_648) * 2 - 1;
    const decay = Math.exp(-40 * into);
    out[i] = 0.22 * decay * noise + 0.2 * Math.exp(-18 * into) * Math.sin(2 * Math.PI * 70 * t);
  }
  return out;
}
