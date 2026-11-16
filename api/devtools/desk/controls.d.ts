/**
 * The desk's controls: a fader and a knob that answer the pointer, the wheel, the keys and a fine mode; a value field
 * that is typed into, dragged and nudged; mute and solo as toggle buttons; a segmented switch of real radios; a picker
 * over a native select; the mark that says a layer wrote a value; a splitter. Every listener sits on the element
 * itself, so they work in whichever document the desk is drawn into.
 */
import { type MouseEvent, type ReactNode } from "react";
import type { Tone } from "./model";
import type { Scale } from "./scale";
/** What a hover and the info line say of an element: its `title`, and the same text for the desk's foot. */
export declare const tip: (text: string | undefined) => {
    title: string;
    "data-info": string;
} | {};
/** How a control wears its layer: who says the value in force, and whether what it shows is what is heard. */
export interface Wear {
    tone?: Tone;
    /** The edit layer says the value shown. */
    says?: boolean;
    /** What is shown is not what is heard. */
    shadowed?: boolean;
    /** The value heard, drawn as a mark when it is not the one shown, in the tone of the layer that says it. */
    ghost?: number;
    ghostTone?: Tone;
}
export interface FaderProps extends Wear {
    value: number;
    scale: Scale;
    onChange: (value: number) => void;
    /** What a screen reader calls it: "music level". */
    label: string;
    /** The value as words: "−6.0 dB". */
    valueText: string;
    orientation?: "vertical" | "horizontal";
    /** Double-click, Delete or Backspace: back to what lies under the layer being edited. */
    onReset?: () => void;
    readOnly?: boolean;
    /** A mark on the throw (unity on a dB fader). */
    mark?: number;
    /** What the hover and the info line say. */
    info?: string;
}
/**
 * A fader. A drag that starts anywhere on it moves the cap from where it stands: a press never makes it jump (a
 * level that leaps to where a pointer happened to land is heard). Shift drags at a tenth of the travel. The wheel moves it a step while it has the focus (shift: a fine step).
 * Arrows step (shift: coarse, Alt or Ctrl: fine), Page keys step coarse, Home and End go to the ends.
 */
export declare const Fader: import("react").MemoExoticComponent<({ value, scale, onChange, label, valueText, orientation, onReset, readOnly, mark, info, ...wear }: FaderProps) => import("react").JSX.Element>;
export interface KnobProps extends Wear {
    value: number;
    scale: Scale;
    onChange: (value: number) => void;
    label: string;
    valueText: string;
    onReset?: () => void;
    readOnly?: boolean;
    info?: string;
}
/** A knob: dragged up and down from where it stands (shift: fine), and otherwise a fader's keys and wheel. */
export declare const Knob: import("react").MemoExoticComponent<({ value, scale, onChange, label, valueText, onReset, readOnly, info, ...wear }: KnobProps) => import("react").JSX.Element>;
export interface ValueFieldProps extends Wear {
    value: number;
    format: (value: number) => string;
    parse: (text: string) => number | null;
    /** A value typed, dragged or nudged. */
    onCommit: (value: number) => void;
    label: string;
    /** With a scale the field is also dragged up and down and nudged by the arrows. */
    scale?: Scale;
    onReset?: () => void;
    readOnly?: boolean;
    /** Draws its place in the range under the figure: for a value with no fader beside it. */
    bar?: boolean;
    /** A drag is held under the hand and written once, when it ends (for a value each write of which is a step). */
    lazy?: boolean;
    info?: string;
}
/**
 * A value to type: shows the formatted value, takes a number in its unit on Enter or blur, Escape puts it back. With
 * a scale it is a control of its own: dragged up and down (shift: fine), nudged by the up and down arrows, reset by
 * a double click.
 */
export declare const ValueField: import("react").MemoExoticComponent<({ value, format, parse, onCommit, label, scale, onReset, readOnly, bar, lazy, info, ...wear }: ValueFieldProps) => import("react").JSX.Element>;
/** Mute or solo: a real toggle button, its state in `aria-pressed`. */
export declare function Toggle({ kind, on, label, onPress, title, }: {
    kind: "mute" | "solo";
    on: boolean;
    label: string;
    onPress: (e: MouseEvent<HTMLButtonElement>) => void;
    title?: string;
}): import("react").JSX.Element;
/** A choice of a few, as real radios drawn as one segmented strip. */
export declare function Segmented({ label, options, value, onChange, disabled, wear, }: {
    label: string;
    options: readonly {
        value: string;
        label: string;
        hint?: string;
    }[];
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    wear?: Wear;
}): import("react").JSX.Element;
export interface PickOption {
    value: string;
    label: string;
    disabled?: boolean;
}
/**
 * A choice from a list, over a native select (its list is the platform's own: it opens outside any scrolling pane
 * and answers the keyboard). `face` is what the closed control shows when that is not the chosen option's own label.
 */
export declare function Picker({ label, value, options, onChange, face, look, disabled, info, tone, }: {
    label: string;
    value: string;
    options: readonly PickOption[];
    onChange: (value: string) => void;
    face?: ReactNode;
    /** `field`: a boxed value; `quiet`: text until hovered; `button`: an action that opens a list. */
    look?: "field" | "quiet" | "button";
    disabled?: boolean;
    info?: string;
    tone?: Tone | "live";
}): import("react").JSX.Element;
/**
 * The mark beside a control that says the layer being edited wrote its value: pressed, it takes the write away. A
 * layer that says the value in code alone wears a ring that cannot be pressed; one that says nothing wears none.
 */
export declare function Pip({ state, label, onPress, info, }: {
    state: "written" | "says" | "none";
    label: string;
    onPress: () => void;
    info?: string;
}): import("react").JSX.Element;
/** A small square button holding an icon. */
export declare function IconButton({ label, onPress, children, disabled, pressed, tone, info, }: {
    label: string;
    onPress: (e: MouseEvent<HTMLButtonElement>) => void;
    children: ReactNode;
    disabled?: boolean;
    pressed?: boolean;
    tone?: "bad" | "on";
    info?: string;
}): import("react").JSX.Element;
/**
 * The bar between two panes: dragged, or moved by the arrows while it has the focus. `value` is the size in pixels of
 * the pane it sizes; `grow` says which way the pointer moves to make that pane larger.
 */
export declare function Splitter({ label, orientation, value, min, max, grow, onChange, }: {
    label: string;
    /** `horizontal`: a bar across, dragged up and down. */
    orientation: "horizontal" | "vertical";
    value: number;
    min: number;
    max: number;
    grow: 1 | -1;
    onChange: (value: number) => void;
}): import("react").JSX.Element;
export declare const Chevron: () => import("react").JSX.Element;
export declare const PlayIcon: () => import("react").JSX.Element;
export declare const UndoIcon: () => import("react").JSX.Element;
export declare const RedoIcon: () => import("react").JSX.Element;
export declare const CloseIcon: () => import("react").JSX.Element;
export declare const PlusIcon: () => import("react").JSX.Element;
export declare const PowerIcon: () => import("react").JSX.Element;
export declare const LeftIcon: () => import("react").JSX.Element;
export declare const RightIcon: () => import("react").JSX.Element;
export declare const OutIcon: () => import("react").JSX.Element;
export declare const Disclosure: ({ open }: {
    open: boolean;
}) => import("react").JSX.Element;
