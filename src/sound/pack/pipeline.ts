// One recording through the pack pipeline: the edit, the stretch to the pack's tempo and the cut to whole bars (a
// loop), the trim (a shot or an IR), the fold to mono, the loudness match, the root. `buildPack` and `processSample`
// both run every file through here, so a sample made alone is the sample a full build makes.
import type { SampleEntry } from "../desk";
import { applyEdit } from "./edit";
import { decode, FfmpegError, type Pcm, RATE, stretch } from "./ffmpeg";
import { applyGain, foldMono, fromDb, measure, samplePeak, toDb } from "./measure";
import { detectRoot, noteName, rootToHz } from "./pitch";
import type { Kind, Sidecar } from "./source";
import { fitLength, trimShot } from "./trim";

export type Targets = { shots?: number; loops?: number; irs?: number };

export type PipelineOptions = {
  /** The pack's tempo: a loop is stretched and cut to it. */
  tempo?: number;
  codec: "opus" | "flac";
  targets?: Targets;
};

/** A recording made into a sample: the pcm to encode, its entry, its file name in the pack and its log line. */
export type Prepared = {
  pcm: Pcm;
  entry: SampleEntry;
  fileName: string;
  codec: "opus" | "flac";
  kbps: number;
  line: string;
};

const DEFAULT_TARGET: Record<Kind, number | undefined> = { shot: -18, loop: -20, ir: undefined };
/** The true peak every sample is held under after gain, dBFS. */
const CEILING_DB = -1;
/** A loop's length must land this close to whole bars before it is cut, seconds. */
const BAR_TOLERANCE = 0.005;

const fmt = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : String(v));

/** Decodes a recording, failing with a line a person can act on when ffmpeg cannot read it. */
export async function decodeSource(file: string, where: string): Promise<Pcm> {
  try {
    return await decode(file);
  } catch (e) {
    if (!(e instanceof FfmpegError) || /not found/.test(e.message)) throw e;
    const tail = e.message.split(" | ").pop()?.split(": ").pop()?.trim();
    throw new Error(`${where}: ffmpeg cannot read this file as audio (${tail})`);
  }
}

/** The sample name, its role, its sidecar (the edit with it) and the name used in messages. */
export type PipelineJob = { name: string; kind: Kind; sidecar: Sidecar; where: string };

/** Runs a decoded recording through the pipeline. Throws, naming `where`, on everything `buildPack` refuses. */
export async function prepare(decoded: Pcm, job: PipelineJob, o: PipelineOptions): Promise<Prepared> {
  const { where, sidecar } = job;
  const warnings: string[] = [];
  let pcm = await applyEdit(decoded, sidecar.edit);
  let bars: number | undefined;

  if (job.kind === "loop") {
    const tempo = o.tempo ?? sidecar.bpm;
    if (tempo === undefined)
      throw new Error(`${where}: a loop needs a tempo: give its bpm, or the pack a tempo`);
    const srcBpm = sidecar.bpm ?? tempo;
    if (Math.abs(srcBpm - tempo) > 0.01) {
      pcm = await stretch(pcm, tempo / srcBpm);
      warnings.push(`stretched ${fmt(srcBpm)} to ${fmt(tempo)} bpm`);
    }
    const barSeconds = (60 / tempo) * 4;
    const seconds = (pcm.channels[0] as Float32Array).length / RATE;
    bars = sidecar.bars ?? Math.max(1, Math.round(seconds / barSeconds));
    const off = Math.abs(seconds - bars * barSeconds);
    if (off > BAR_TOLERANCE)
      throw new Error(
        `${where}: a loop of ${seconds.toFixed(3)} s is ${(off * 1000).toFixed(0)} ms from ${bars} bars at ${tempo} bpm (limit ${BAR_TOLERANCE * 1000} ms)`,
      );
    pcm = fitLength(pcm, Math.round(bars * barSeconds * RATE));
  } else if (!(job.kind === "shot" && sidecar.loop)) {
    const trimmed = trimShot(pcm);
    if (!trimmed) throw new Error(`${where}: the file is silent`);
    pcm = trimmed.pcm;
  }

  pcm = foldMono(pcm);
  const before = await measure(pcm);
  if (!Number.isFinite(before.lufs)) throw new Error(`${where}: the file is too quiet to measure`);

  const target =
    o.targets?.[job.kind === "shot" ? "shots" : job.kind === "loop" ? "loops" : "irs"] ??
    DEFAULT_TARGET[job.kind];
  const hold = CEILING_DB - before.peakDb;
  let gainDb = target === undefined ? Math.min(0, hold) : target - before.lufs;
  if (gainDb > hold) {
    if (target !== undefined) warnings.push(`peak held: ${fmt(target - before.lufs - hold)} LU under target`);
    gainDb = hold;
  }
  applyGain(pcm, fromDb(gainDb));
  const peak = samplePeak(pcm);
  if (peak >= 1) throw new Error(`${where}: clips after gain (${fmt(toDb(peak))} dBFS)`);
  const after = { lufs: before.lufs + gainDb, peak: fromDb(before.peakDb + gainDb) };

  let rootHz: number | undefined;
  let rootLabel = "-";
  if (job.kind !== "ir") {
    const named = sidecar.root === undefined ? undefined : rootToHz(sidecar.root);
    // A named root is the recording's: an edit's pitch moves it with the sound.
    const given = named === undefined ? undefined : named * 2 ** ((sidecar.edit?.semitones ?? 0) / 12);
    const found = given === undefined ? detectRoot(pcm) : { hz: given };
    if (found) {
      rootHz = found.hz;
      rootLabel = `${noteName(found.hz)} ${found.hz.toFixed(1)} Hz${given === undefined ? "" : " (sidecar)"}`;
    }
  }

  const codec = job.kind === "ir" ? "flac" : o.codec;
  const fileName = `${job.name}.${codec === "flac" ? "flac" : "opus"}`;
  const channels = pcm.channels.length as 1 | 2;
  const entry: SampleEntry = {
    seconds: (pcm.channels[0] as Float32Array).length / RATE,
    channels,
    lufs: after.lufs,
    peak: after.peak,
    kind: job.kind,
    ...(rootHz === undefined ? {} : { rootHz }),
    ...(bars === undefined ? {} : { bars }),
    ...(sidecar.source === undefined ? {} : { source: sidecar.source }),
  };
  const line = `${job.name.padEnd(20)} ${job.kind.padEnd(4)} ${entry.seconds.toFixed(2).padStart(6)} s  ${fmt(before.lufs).padStart(6)} -> ${fmt(after.lufs).padStart(6)} LUFS  root ${rootLabel}${warnings.length ? `  warn: ${warnings.join("; ")}` : ""}`;
  return { pcm, entry, fileName, codec, kbps: channels === 1 ? 96 : 128, line };
}
