// Generated test audio: sine tones as 16-bit WAV bytes. Nothing is downloaded or committed.

export type ToneOptions = {
  hz: number;
  seconds: number;
  /** Linear amplitude, 0..1. */
  amp?: number;
  /** Silence before the tone, seconds. */
  lead?: number;
  rate?: number;
};

/** A mono 16-bit WAV: `lead` seconds of silence, then a sine for `seconds`. */
export function toneWav({ hz, seconds, amp = 0.5, lead = 0, rate = 48000 }: ToneOptions): Uint8Array {
  const leadN = Math.round(lead * rate);
  const n = leadN + Math.round(seconds * rate);
  const out = new Uint8Array(44 + n * 2);
  const v = new DataView(out.buffer);
  const tag = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
  };
  tag(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  tag(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  tag(36, "data");
  v.setUint32(40, n * 2, true);
  for (let i = leadN; i < n; i++)
    v.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * hz * (i - leadN)) / rate) * amp * 32767), true);
  return out;
}
