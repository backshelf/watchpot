/**
 * The desk's animation frame: meters, gain reduction, the master's loudness and the sources' lights, read from the
 * desk and written straight to the elements that registered, on the desk window's own `requestAnimationFrame`.
 * Nothing here touches React state, so 60 Hz of meters costs no render.
 */
import type { Desk } from "../../../sound/desk";
/** The meters' throw, which is the level fader's: a meter's 0 dB sits beside the fader's. */
export declare const METER_SCALE: import("./scale").Scale;
/** A reduction bar's whole length in dB, and how fast it lets go, dB per second. */
export declare const REDUCTION_DB = 20;
export interface MeterEls {
    bus: string;
    orient: "v" | "h";
    peak: HTMLElement;
    rms: HTMLElement;
    hold: HTMLElement;
    /** The highest peak since its reset, as a figure (red at 0 dB and over). */
    readout?: HTMLElement;
}
/** A bus's gain reduction, drawn as a bar that grows from its start, with an optional figure. */
export interface ReductionEls {
    bus: string;
    /** `"down"` grows from the top of a strip's meter; `"across"` from the left of a device's. */
    orient: "down" | "across";
    bar: HTMLElement;
    text?: HTMLElement;
}
export declare class DeskLoop {
    private readonly desk;
    readonly meters: Set<MeterEls>;
    readonly reductions: Set<ReductionEls>;
    readonly lights: Map<string, HTMLElement>;
    readonly lufs: Set<HTMLElement>;
    private readonly bus;
    private readonly light;
    private readonly written;
    private frame;
    private last;
    private textAt;
    private win;
    constructor(desk: Desk);
    /** Runs on `win`'s frames (the desk's own window: a hidden opener's frames would stall). */
    start(win: Window): void;
    stop(): void;
    /** Clears a bus's highest-peak figure (a click on it). */
    resetMax(bus: string): void;
    private set;
    private text;
    tick(t: number): void;
    private lightUp;
}
