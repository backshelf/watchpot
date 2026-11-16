// What a person changed of a recording (`SampleEdit`), applied before the pipeline's own trim and loudness match.
import type { SampleEdit } from "../desk";
import { type Pcm, repitch } from "./ffmpeg";

/** The furthest an edit moves the pitch, semitones each way. */
const MAX_SEMITONES = 24;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * The edit as given, checked: every field a finite number of the right sign, `start` before `end`, the pitch within
 * two octaves. Throws a message naming the field. An edit with nothing in it is `undefined`.
 */
export function checkEdit(edit: unknown): SampleEdit | undefined {
  if (edit === undefined || edit === null) return undefined;
  if (typeof edit !== "object") throw new Error("the edit is not an object");
  const e = edit as Record<string, unknown>;
  const out: SampleEdit = {};
  for (const k of ["start", "end", "fadeIn", "fadeOut"] as const) {
    const v = e[k];
    if (v === undefined) continue;
    if (!isNum(v) || v < 0) throw new Error(`the edit's ${k} must be a number of seconds, 0 or more`);
    out[k] = v;
  }
  if (e.semitones !== undefined) {
    if (!isNum(e.semitones) || Math.abs(e.semitones) > MAX_SEMITONES)
      throw new Error(`the edit's semitones must be a number from -${MAX_SEMITONES} to ${MAX_SEMITONES}`);
    if (e.semitones !== 0) out.semitones = e.semitones;
  }
  if (e.reverse !== undefined) {
    if (typeof e.reverse !== "boolean") throw new Error("the edit's reverse must be true or false");
    if (e.reverse) out.reverse = true;
  }
  if (out.start !== undefined && out.end !== undefined && out.end <= out.start)
    throw new Error(`the edit ends (${out.end} s) at or before it starts (${out.start} s)`);
  return Object.keys(out).length === 0 ? undefined : out;
}

/** Crop, reverse and fades: the parts of an edit that need no ffmpeg. A new pcm; the input is left as it is. */
export function shapeEdit(pcm: Pcm, edit: SampleEdit): Pcm {
  const len = pcm.channels[0]?.length ?? 0;
  const at = (s: number | undefined, fallback: number) =>
    s === undefined ? fallback : Math.min(len, Math.max(0, Math.round(s * pcm.rate)));
  const from = at(edit.start, 0);
  const to = Math.max(from, at(edit.end, len));
  const fadeIn = Math.min(to - from, at(edit.fadeIn, 0));
  const fadeOut = Math.min(to - from, at(edit.fadeOut, 0));
  return {
    rate: pcm.rate,
    channels: pcm.channels.map((ch) => {
      const out = ch.slice(from, to);
      if (edit.reverse) out.reverse();
      const n = out.length;
      for (let i = 0; i < fadeIn; i++) out[i] = (out[i] as number) * (i / fadeIn);
      for (let i = 0; i < fadeOut; i++) out[n - 1 - i] = (out[n - 1 - i] as number) * (i / fadeOut);
      return out;
    }),
  };
}

/**
 * The whole edit: cropped to `start`..`end`, moved by `semitones` with its length kept (rubberband), reversed, then
 * faded in and out (the fades are at the ends of what plays, after the reverse). No edit returns the pcm as it is.
 */
export async function applyEdit(pcm: Pcm, edit: SampleEdit | undefined): Promise<Pcm> {
  if (!edit) return pcm;
  let out = shapeEdit(pcm, { start: edit.start, end: edit.end });
  if ((out.channels[0]?.length ?? 0) === 0) throw new Error("the edit leaves nothing of the recording");
  if (edit.semitones) out = await repitch(out, 2 ** (edit.semitones / 12));
  return shapeEdit(out, { reverse: edit.reverse, fadeIn: edit.fadeIn, fadeOut: edit.fadeOut });
}
