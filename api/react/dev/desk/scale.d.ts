/**
 * How a value sits on a fader's travel, how it moves by a nudge, and how it reads and parses as text. Faders work in
 * position (0 at the bottom or left, 1 at the top or right); the desk in values.
 */
import type { DeskParam } from "../../../sound/desk";
export type Nudge = "fine" | "normal" | "coarse";
export interface Scale {
    min: number;
    max: number;
    toPos(value: number): number;
    fromPos(pos: number): number;
    /** One step of the value up (`dir` 1) or down, clamped to the range. */
    nudge(value: number, dir: 1 | -1, size: Nudge): number;
}
export declare const decimalsOf: (step: number) => number;
/**
 * A fader law for dB: travel follows the fourth root of the gain, so the top of the throw (where a mix lives) gets
 * most of it, as a console's fader does. Unity sits about four fifths up on a -60..+6 throw.
 */
export declare function dbScale(min: number, max: number): Scale;
/** A send's gain, 0 (none) to `max`, on the same law as a level fader; it steps in dB. */
export declare function gainScale(max: number): Scale;
export declare function linScale(min: number, max: number, step?: number): Scale;
/**
 * Log travel for frequencies and times. A range that starts at 0 (a delay of 0 to 2 s) cannot be logarithmic, so it
 * gets a curve that is: three decades of fine travel above the floor, then log.
 */
export declare function logScale(min: number, max: number): Scale;
export declare function paramScale(p: DeskParam): Scale;
export declare const toDb: (gain: number) => number;
export declare const fromDb: (db: number) => number;
/** A dB figure with its sign, a true minus and one decimal: "−6.0", "+1.5", "0.0", "−∞". */
export declare function fmtDb(db: number): string;
/** A value in a param's unit, as a field shows it and `parseValue` reads it back. */
export declare function fmtValue(v: number, unit: string, step?: number): string;
/**
 * Reads what a person typed: a number with an optional suffix in the field's unit or a near one ("1.2k", "1.2 kHz",
 * "250ms", "-6", "−6 dB", "4:1", "-inf"). Null when it is not a number.
 */
export declare function parseValue(text: string, unit: string): number | null;
