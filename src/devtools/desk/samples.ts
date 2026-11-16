/**
 * What the desk's window does with recordings: runs one through the sample host and stages it beside a sample, adds
 * a take from a dropped file, commits what is staged when the mix is saved, and decodes audio for drawing. The host
 * processes and writes; the desk holds and plays; nothing here keeps state of its own.
 */
import type { Desk, MixFile, SampleEdit, SampleHost, SampleSource } from "../../sound/desk";
import type { PackSample, Take } from "../../sound/types";
import { sampleNameFrom } from "./model";

/** What a person has set for a sample's next run through the pipeline, not yet applied. */
export interface SampleDraft {
  edit: SampleEdit;
  /** A loop's tempo in its source, and its length in bars. */
  bpm?: number;
  bars?: number;
}

export interface SampleDeps {
  desk: Desk;
  host: SampleHost;
  /** Recordings dropped in this window and not yet saved, by sample key. */
  files: Map<string, File>;
}

const packOf = (key: string) => key.slice(0, key.indexOf("/"));
const nameOf = (key: string) => key.slice(key.indexOf("/") + 1);

/** An edit with nothing in it left out, so a sidecar says only what was changed. */
export function tidyEdit(edit: SampleEdit, seconds: number): SampleEdit {
  const out: SampleEdit = {};
  if (edit.start !== undefined && edit.start > 0) out.start = edit.start;
  if (edit.end !== undefined && edit.end < seconds) out.end = edit.end;
  if (edit.fadeIn) out.fadeIn = edit.fadeIn;
  if (edit.fadeOut) out.fadeOut = edit.fadeOut;
  if (edit.semitones) out.semitones = edit.semitones;
  if (edit.reverse) out.reverse = true;
  return out;
}

/** How far from a whole number of bars a length may be and still be read as that many, in bars. */
const WHOLE_BARS = 0.02;
/** The tempos a loop is taken to be in when its name says none. */
const TEMPO_MIN = 60;
const TEMPO_MAX = 180;

/**
 * A dropped loop's tempo and length, read from the file: the tempo its name gives (`pack_100_pad.wav`, `120bpm`),
 * checked against its length where that is known, else the tempo nearest the pack's at which its length is a power
 * of two of bars. A loop cut at another tempo than its pack's has to say so before the pipeline can stretch it, and
 * nobody has typed anything yet when a file is dropped. Empty where nothing can be read.
 */
export function guessLoop(
  fileName: string,
  seconds: number | undefined,
  packTempo: number | undefined,
): { bpm?: number; bars?: number } {
  const barsAt = (bpm: number) => (seconds === undefined ? undefined : (seconds * bpm) / 240);
  const whole = (bars: number | undefined) =>
    bars !== undefined && Math.round(bars) >= 1 && Math.abs(bars - Math.round(bars)) <= WHOLE_BARS;
  const named: number[] = [];
  const said: number[] = [];
  for (const token of fileName.replace(/\.[a-z0-9]+$/i, "").split(/[^a-z0-9.]+/i)) {
    const match = /^(?:bpm)?(\d{2,3}(?:\.\d+)?)(bpm)?$/i.exec(token);
    const bpm = match ? Number(match[1]) : Number.NaN;
    if (!(bpm >= 40 && bpm <= 240)) continue;
    if (match?.[2] || /^bpm/i.test(token)) said.push(bpm);
    else named.push(bpm);
  }
  // A number that says it is a tempo first, then one at which the file is whole bars, then the first number.
  const candidates = [...said, ...named];
  const bpm = said[0] ?? candidates.find((each) => whole(barsAt(each))) ?? candidates[0];
  if (bpm !== undefined) {
    const bars = barsAt(bpm);
    return whole(bars) ? { bpm, bars: Math.round(bars as number) } : { bpm };
  }
  if (seconds === undefined || !(seconds > 0)) return {};
  let best: { bpm: number; bars: number } | undefined;
  for (const bars of [1, 2, 4, 8, 16, 32, 64]) {
    const at = (bars * 240) / seconds;
    if (at < TEMPO_MIN || at > TEMPO_MAX) continue;
    const near = Math.abs(at - (packTempo ?? 120));
    if (!best || near < Math.abs(best.bpm - (packTempo ?? 120)))
      best = { bpm: Math.round(at * 100) / 100, bars };
  }
  return best ?? {};
}

/**
 * Runs a sample through the host and stages the result: with `file` (default: the one in hand, dropped here), else
 * with no file, which is the kept source again. It plays in the running game from then. Throws the host's own
 * failure.
 */
export async function restage(
  { desk, host, files }: SampleDeps,
  key: string,
  kind: PackSample["kind"],
  draft: SampleDraft = { edit: {} },
  source: SampleSource = {},
  file: File | undefined = files.get(key),
): Promise<void> {
  const result = await host.process({
    pack: packOf(key),
    sample: nameOf(key),
    kind,
    ...(file ? { file, fileName: file.name } : {}),
    ...(Object.keys(draft.edit).length ? { edit: draft.edit } : {}),
    ...(draft.bpm !== undefined ? { bpm: draft.bpm } : {}),
    ...(draft.bars !== undefined ? { bars: draft.bars } : {}),
    ...(source.root !== undefined ? { root: source.root } : {}),
    ...(source.loop !== undefined ? { loop: source.loop } : {}),
  });
  if (!(await desk.stage(key, result.audio, result.entry, result.token)))
    throw new Error("the processed recording could not be decoded, or the sound is not running");
}

/**
 * A recording dropped on a sample: it replaces what the sample plays, staged until Save, and is the file in hand
 * from then. `draft` is what is known of it before anyone has set anything (a loop's tempo and bars, read from the
 * file). A failure throws with the file in hand, and what plays, as they were.
 */
export async function replaceSample(
  deps: SampleDeps,
  key: string,
  kind: PackSample["kind"],
  file: File,
  draft: SampleDraft = { edit: {} },
): Promise<void> {
  await restage(deps, key, kind, draft, {}, file);
  deps.files.set(key, file);
}

/** A recording dropped on a cue as a new take: a new sample of the cue's pack, staged, then one more take. */
export async function addTake(deps: SampleDeps, cue: string, file: File): Promise<string> {
  const { desk } = deps;
  const takes = desk.takes(cue);
  if (!takes) throw new Error(`no cue named ${cue}`);
  const pack = takes.takes[0] ? packOf(takes.takes[0].sample) : desk.packs()[0]?.name;
  if (!pack) throw new Error("no pack has loaded to hold the new take");
  const taken = new Set(
    desk
      .samples()
      .filter((sample) => sample.pack === pack)
      .map((sample) => sample.name),
  );
  const key = `${pack}/${sampleNameFrom(file.name, taken)}`;
  await replaceSample(deps, key, "shot", file);
  desk.setTakes(cue, [...takes.takes, { sample: key }]);
  return key;
}

/** Takes one take off a cue; a sample that was only ever staged for it goes with it. */
export function removeTake(
  { desk, files }: Pick<SampleDeps, "desk" | "files">,
  cue: string,
  index: number,
): void {
  const takes = desk.takes(cue);
  const gone = takes?.takes[index];
  if (!takes || !gone || takes.takes.length < 2) return;
  const rest = takes.takes.filter((_, i) => i !== index);
  desk.setTakes(cue, rest);
  const fresh = desk.staged().find((each) => each.key === gone.sample)?.fresh;
  if (fresh && !rest.some((take) => take.sample === gone.sample)) {
    desk.unstage(gone.sample);
    files.delete(gone.sample);
  }
}

/** Drops a staged recording; a take whose sample existed only as that recording leaves its cue with it. */
export function discard({ desk, files }: Pick<SampleDeps, "desk" | "files">, key: string): void {
  const fresh = desk.staged().find((each) => each.key === key)?.fresh;
  if (fresh) {
    for (const sample of desk.samples())
      if (sample.key === key)
        for (const user of sample.users) {
          if (!user.startsWith("cue:")) continue;
          const cue = user.slice(4);
          const takes = desk.takes(cue);
          const rest = takes?.takes.filter((take) => take.sample !== key) ?? [];
          if (takes && rest.length !== takes.takes.length) desk.setTakes(cue, rest.length ? rest : undefined);
        }
  }
  desk.unstage(key);
  files.delete(key);
}

/** One take changed in place. */
export function setTake(desk: Desk, cue: string, index: number, patch: Partial<Take>): void {
  const takes = desk.takes(cue);
  if (!takes?.takes[index]) return;
  desk.setTakes(
    cue,
    takes.takes.map((take, i) => {
      if (i !== index) return take;
      const next: Take = { ...take, ...patch };
      if (next.level === 0) delete next.level;
      if (next.weight === 1) delete next.weight;
      return next;
    }),
  );
}

/**
 * Saves: what is staged is written into its packs through the host and becomes the samples, then the mix file is
 * handed to the game, then the desk is marked saved. A failure at either step throws with nothing marked saved; the
 * answer says whether something moved while the file was being written.
 */
export async function saveAll(
  desk: Desk,
  host: SampleHost | undefined,
  onSave: (file: MixFile) => void | Promise<void>,
  files: Map<string, File>,
): Promise<{ samples: number; moved: boolean }> {
  const staged = desk.staged();
  if (host && staged.length) {
    try {
      await host.commit(staged.map((each) => each.token));
    } catch (error) {
      throw new Error(`the samples were not written (${messageOf(error)})`);
    }
    desk.committed(staged.map((each) => each.key));
    for (const each of staged) files.delete(each.key);
  }
  const file = desk.file();
  const text = JSON.stringify(file);
  try {
    await onSave(file);
  } catch (error) {
    throw new Error(
      `${messageOf(error)}${host && staged.length ? " (the samples are written; the mix file is not)" : ""}`,
    );
  }
  const moved = JSON.stringify(desk.file()) !== text;
  if (!moved) desk.saved();
  return { samples: host ? staged.length : 0, moved };
}

export const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** A recording's shape for drawing: the lowest and highest sample in each of `buckets` slices, and its length. */
export interface Peaks {
  seconds: number;
  min: Float32Array;
  max: Float32Array;
}

/** Decodes audio in `win` (no sound device is opened) and folds it to peaks; null where the window cannot decode. */
export async function peaksOf(win: Window, audio: ArrayBuffer, buckets = 800): Promise<Peaks | null> {
  const Offline = (win as unknown as { OfflineAudioContext?: typeof OfflineAudioContext })
    .OfflineAudioContext;
  if (!Offline) return null;
  let buffer: AudioBuffer;
  try {
    buffer = await new Offline(1, 1, 44100).decodeAudioData(audio.slice(0));
  } catch {
    return null;
  }
  const n = Math.max(1, Math.min(buckets, buffer.length));
  const min = new Float32Array(n);
  const max = new Float32Array(n);
  const span = buffer.length / n;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let b = 0; b < n; b++) {
      let lo = min[b] ?? 0;
      let hi = max[b] ?? 0;
      const to = Math.min(data.length, Math.floor((b + 1) * span));
      for (let i = Math.floor(b * span); i < to; i++) {
        const v = data[i] ?? 0;
        if (v < lo) lo = v;
        else if (v > hi) hi = v;
      }
      min[b] = lo;
      max[b] = hi;
    }
  }
  return { seconds: buffer.duration, min, max };
}
