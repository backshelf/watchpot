// The ffmpeg boundary: every spawn of the pack pipeline goes through here. Audio crosses it as raw 32-bit float PCM
// on pipes, so no temp file is written for decode, stretch or measure.

/** Every sample of a pack is decoded and encoded at this rate. */
export const RATE = 48000;

/** Planar float PCM: one array per channel (1 or 2), all the same length. */
export type Pcm = { channels: Float32Array[]; rate: number };

export class FfmpegError extends Error {}

let checked = false;

/** Fails with one clear line when `ffmpeg` is not on PATH. */
export function requireFfmpeg(): void {
  if (checked) return;
  if (!Bun.which("ffmpeg"))
    throw new FfmpegError(
      "watchpot/sound/pack needs ffmpeg on PATH (https://ffmpeg.org/download.html), and it was not found",
    );
  checked = true;
}

/** Whether ffmpeg is installed, for tests that skip without it. */
export function hasFfmpeg(): boolean {
  return Bun.which("ffmpeg") !== null;
}

async function run(args: string[], stdin?: Uint8Array): Promise<{ stdout: Uint8Array; stderr: string }> {
  requireFfmpeg();
  const proc = Bun.spawn(["ffmpeg", "-hide_banner", "-nostats", "-y", ...args], {
    stdin: stdin ?? "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0)
    throw new FfmpegError(
      `ffmpeg ${args.join(" ")} failed (exit ${code}): ${stderr.trim().split("\n").slice(-3).join(" | ")}`,
    );
  return { stdout: new Uint8Array(stdout), stderr };
}

export function interleave(pcm: Pcm): Uint8Array {
  const n = pcm.channels.length;
  const len = pcm.channels[0]?.length ?? 0;
  const out = new Float32Array(len * n);
  for (let c = 0; c < n; c++) {
    const ch = pcm.channels[c] as Float32Array;
    for (let i = 0; i < len; i++) out[i * n + c] = ch[i] as number;
  }
  return new Uint8Array(out.buffer);
}

export function deinterleave(bytes: Uint8Array, channels: number, rate = RATE): Pcm {
  const flat = new Float32Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength - (bytes.byteLength % 4)),
  );
  const len = Math.floor(flat.length / channels);
  const out = Array.from({ length: channels }, () => new Float32Array(len));
  for (let c = 0; c < channels; c++) {
    const ch = out[c] as Float32Array;
    for (let i = 0; i < len; i++) ch[i] = flat[i * channels + c] as number;
  }
  return { channels: out, rate };
}

const rawIn = (channels: number) => [
  "-f",
  "f32le",
  "-ar",
  String(RATE),
  "-ac",
  String(channels),
  "-i",
  "pipe:0",
];

/** Decodes any file ffmpeg reads to stereo float at `RATE` (a mono file arrives as two equal channels). */
export async function decode(file: string): Promise<Pcm> {
  const { stdout } = await run(["-i", file, "-vn", "-f", "f32le", "-ar", String(RATE), "-ac", "2", "pipe:1"]);
  return deinterleave(stdout, 2);
}

/** Silence fed in after the sound, so the stretcher has let all of it out before its input ends. */
const STRETCH_PAD_SECONDS = 1;

/**
 * Time-stretches by `ratio` (> 1 is faster and shorter) without moving the pitch, with rubberband. The result is
 * exactly the source's length over `ratio`: at some ratios rubberband ends tens of milliseconds early, dropping the
 * sound's tail, so the source is fed in with silence after it and the result cut to the length it should have.
 */
export function stretch(pcm: Pcm, ratio: number): Promise<Pcm> {
  return rubberband(pcm, ratio, 1);
}

/** Moves the pitch by `ratio` (2 is an octave up) and keeps the length, with rubberband. */
export function repitch(pcm: Pcm, ratio: number): Promise<Pcm> {
  return rubberband(pcm, 1, ratio);
}

async function rubberband(pcm: Pcm, ratio: number, pitch: number): Promise<Pcm> {
  const n = pcm.channels.length;
  const frames = (pcm.channels[0] as Float32Array).length;
  const want = Math.round(frames / ratio);
  const padded: Pcm = {
    rate: pcm.rate,
    channels: pcm.channels.map((ch) => {
      const out = new Float32Array(ch.length + Math.round(STRETCH_PAD_SECONDS * RATE));
      out.set(ch);
      return out;
    }),
  };
  const { stdout } = await run(
    [
      ...rawIn(n),
      "-af",
      `rubberband=tempo=${ratio}:pitch=${pitch}`,
      "-f",
      "f32le",
      "-ar",
      String(RATE),
      "-ac",
      String(n),
      "pipe:1",
    ],
    interleave(padded),
  );
  const out = deinterleave(stdout, n);
  return {
    rate: out.rate,
    channels: out.channels.map((ch) => {
      const cut = new Float32Array(want);
      cut.set(ch.subarray(0, Math.min(want, ch.length)));
      return cut;
    }),
  };
}

/** The raw ebur128 report for a pcm: integrated loudness (LUFS) and true peak (dBTP), either may be -Infinity. */
export async function ebur128(pcm: Pcm): Promise<{ lufs: number; truePeakDb: number }> {
  const { stderr } = await run(
    [...rawIn(pcm.channels.length), "-af", "ebur128=peak=true", "-f", "null", "-"],
    interleave(pcm),
  );
  const summary = stderr.slice(stderr.lastIndexOf("Summary:"));
  const num = (re: RegExp) => {
    const m = re.exec(summary)?.[1];
    if (m === undefined)
      throw new FfmpegError(
        `ffmpeg ebur128 printed no summary: ${stderr.trim().split("\n").slice(-4).join(" | ")}`,
      );
    return m === "-inf" ? -Infinity : Number(m);
  };
  return { lufs: num(/I:\s+(-?inf|-?[\d.]+) LUFS/), truePeakDb: num(/Peak:\s+(-?inf|-?[\d.]+) dBFS/) };
}

/** Encodes to `file`: Opus in Ogg (bitrate in kbit/s) or 24-bit FLAC. */
export async function encode(pcm: Pcm, file: string, codec: "opus" | "flac", kbps: number): Promise<void> {
  const codecArgs =
    codec === "opus"
      ? ["-c:a", "libopus", "-b:a", `${kbps}k`, "-application", "audio"]
      : ["-c:a", "flac", "-sample_fmt", "s32", "-bits_per_raw_sample", "24"];
  await run([...rawIn(pcm.channels.length), ...codecArgs, file], interleave(pcm));
}
