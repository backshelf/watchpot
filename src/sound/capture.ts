/**
 * Development only: records what the sound puts out for a few seconds and hands it back as a WAV, so a build
 * with nobody listening can measure a mix: peaks against the limiter's ceiling, clipping, loudness.
 *
 * The output node is tapped by a `ScriptProcessorNode` that copies every block it hears, untouched, and writes
 * silence onward (it must reach the destination to run, and nothing is heard twice). The WAV is exactly what left
 * the core, after the limiter, at the context's sample rate; samples are clamped to -1..1 only where they become
 * 16-bit.
 */

/** A WAV file of 16-bit PCM from channels of floats (-1..1, clipped), interleaved. Pure. */
export function encodeWav(channels: readonly Float32Array[], rate: number): Blob {
  const count = Math.max(1, channels.length);
  const frames = channels.reduce((n, c) => Math.max(n, c.length), 0);
  const data = frames * count * 2;
  const bytes = new ArrayBuffer(44 + data);
  const view = new DataView(bytes);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + data, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, count, true);
  view.setUint32(24, Math.round(rate), true);
  view.setUint32(28, Math.round(rate) * count * 2, true);
  view.setUint16(32, count * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, data, true);
  let at = 44;
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < count; c++) {
      const v = Math.max(-1, Math.min(1, channels[c]?.[f] ?? 0));
      view.setInt16(at, Math.round(v < 0 ? v * 0x8000 : v * 0x7fff), true);
      at += 2;
    }
  }
  return new Blob([bytes], { type: "audio/wav" });
}

/** A sound's two faces that capture reads. */
type Capturable = { context(): AudioContext | null; output(): AudioNode | null };

/** Seconds past the length asked for, on the context's clock, after which capture resolves with what it has. */
const GRACE = 2;

/**
 * Records `seconds` of a sound's output as a 16-bit stereo WAV. Rejects when the core is not running or the browser
 * has no `createScriptProcessor`; resolves with what was gathered if the context stops before the length is reached.
 */
export function capture(sound: Capturable, seconds: number): Promise<Blob> {
  const fail = (reason: string) => Promise.reject(new Error(`watchpot/sound: capture ${reason}`));
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production")
    return fail("is for development builds only");
  if (!(seconds > 0) || !Number.isFinite(seconds)) return fail("needs a length in seconds above 0");
  const context = sound.context();
  const output = sound.output();
  if (!context || !output || context.state !== "running")
    return fail("needs the core running (after unlock)");
  if (typeof context.createScriptProcessor !== "function")
    return fail("needs createScriptProcessor, which this browser lacks");

  return new Promise<Blob>((resolve) => {
    const rate = context.sampleRate;
    const want = Math.max(1, Math.round(seconds * rate));
    const left = new Float32Array(want);
    const right = new Float32Array(want);
    let got = 0;
    let done = false;
    const until = context.currentTime + seconds + GRACE;
    const node = context.createScriptProcessor(4096, 2, 2);

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(guard);
      node.onaudioprocess = null;
      output.disconnect(node);
      node.disconnect(context.destination);
      resolve(encodeWav([left.subarray(0, got), right.subarray(0, got)], rate));
    };

    node.onaudioprocess = (event) => {
      const input = event.inputBuffer;
      const l = input.getChannelData(0);
      const r = input.numberOfChannels > 1 ? input.getChannelData(1) : l;
      const take = Math.min(l.length, want - got);
      left.set(l.subarray(0, take), got);
      right.set(r.subarray(0, take), got);
      got += take;
      const out = event.outputBuffer;
      for (let c = 0; c < out.numberOfChannels; c++) out.getChannelData(c).fill(0);
      if (got >= want || context.state !== "running" || context.currentTime > until) finish();
    };
    // A context that delivers no blocks at all would never reach the check above. A timer is not a clock read.
    const guard = setTimeout(finish, (seconds + GRACE) * 1000);

    output.connect(node);
    node.connect(context.destination);
  });
}
