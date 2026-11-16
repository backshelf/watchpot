import type { SampleEdit } from "../desk";
import { type Pcm } from "./ffmpeg";
/**
 * The edit as given, checked: every field a finite number of the right sign, `start` before `end`, the pitch within
 * two octaves. Throws a message naming the field. An edit with nothing in it is `undefined`.
 */
export declare function checkEdit(edit: unknown): SampleEdit | undefined;
/** Crop, reverse and fades: the parts of an edit that need no ffmpeg. A new pcm; the input is left as it is. */
export declare function shapeEdit(pcm: Pcm, edit: SampleEdit): Pcm;
/**
 * The whole edit: cropped to `start`..`end`, moved by `semitones` with its length kept (rubberband), reversed, then
 * faded in and out (the fades are at the ends of what plays, after the reverse). No edit returns the pcm as it is.
 */
export declare function applyEdit(pcm: Pcm, edit: SampleEdit | undefined): Promise<Pcm>;
