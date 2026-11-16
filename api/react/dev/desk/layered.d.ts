/**
 * Controls over one key of the mix, aware of its layers: each shows the value the layer being edited would give,
 * wears the tone of the layer that says it, marks when that is not what is heard, writes into the layer being edited
 * and resets by taking that layer's write away. The same for a mixer's key and for a trim, a source's trim or send,
 * and a tunable.
 */
import { type ReactNode } from "react";
import type { DeskParam } from "../../../sound/desk";
import { type Wear } from "./controls";
import { type Resolved } from "./model";
import { type Scale } from "./scale";
export declare const LEVEL: Scale;
export declare const TRIM: Scale;
export declare const SEND: Scale;
export declare const dbText: (v: number) => string;
export declare const parseDb: (text: string) => number | null;
export declare const sendText: (v: number) => string;
export declare const parseSend: (text: string) => number | null;
/** A key as a control needs it: where it stands, how it is worn, and the writes. */
export interface Layered extends Resolved {
    wear: Wear;
    pip: "written" | "says" | "none";
    /** The layer being edited, by name. */
    editName: string;
    write: (value: number) => void;
    reset: () => void;
    /** A sentence for the hover and the info line: what it shows, who says it, what is heard. */
    info: (what: string, format: (v: number) => string, hint?: string) => string;
}
/** Reads one key for the layer being edited. `fallback` is its worth when nothing says it and the desk cannot tell. */
export declare function useKey(key: string, fallback: number): Layered;
/** The mark and reset beside a layered control. */
export declare function KeyPip({ k, label }: {
    k: Layered;
    label: string;
}): import("react").JSX.Element;
export interface ParamRowProps {
    /** The key it reads and writes. */
    k: string;
    /** What the row shows as its name. */
    name: ReactNode;
    /** What a screen reader calls the control, and the info line's subject. */
    label: string;
    scale: Scale;
    format: (v: number) => string;
    parse: (text: string) => number | null;
    fallback: number;
    /** A mark on the fader's throw (unity). */
    mark?: number;
    hint?: string;
    /** Lets the name wrap over lines instead of being cut. */
    wrap?: boolean;
}
/** One setting as a row: its name, a fader, its value to type or drag, and its layer mark. */
export declare function ParamRow({ k, name, label, scale, format, parse, fallback, mark, hint, wrap, }: ParamRowProps): import("react").JSX.Element;
/** A setting that is one of a few: a segmented row, or a list when there are many. */
export declare function ChoiceRow({ k, name, label, choices, fallback, }: {
    k: string;
    name: ReactNode;
    label: string;
    choices: readonly string[];
    fallback: number;
}): import("react").JSX.Element;
/** An effect's setting as its row: a choice, or a fader on the setting's own scale. */
export declare function FxParamRow({ k, param, label }: {
    k: string;
    param: DeskParam;
    label: string;
}): import("react").JSX.Element;
/**
 * A panel's rows, flowing into as many columns as its height asks for: it counts the rows that fit and the grid
 * makes a column for each that many. (A grid cannot be left to count them itself: asked how wide it is before it
 * knows how tall, it answers with one row and every setting in a column of its own.)
 */
export declare function Params({ children }: {
    children: ReactNode;
}): import("react").JSX.Element;
/** A setting's name as words: `lowFreq` is "low freq", `mid1Q` is "mid 1 q". */
export declare const paramName: (param: string) => string;
/** A send as a knob with its target and level beside it: a bus's (`send:`) or a source's own (`chsend:`). */
export declare function SendKnob({ k, to, label, fallback, }: {
    k: string;
    to: string;
    label: string;
    fallback?: number;
}): import("react").JSX.Element;
