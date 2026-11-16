import type { DeskTunable } from "../../sound/desk";
/** A tunable's scale, format and parse, from its range, step and unit. */
export declare function useTunable(t: Pick<DeskTunable, "min" | "max" | "step" | "unit">): {
    scale: import("./scale").Scale;
    format: (v: number) => string;
    parse: (text: string) => number | null;
};
/** What a tunable's hover says after its label: what it does, its range and its id. */
export declare const tunableHint: (t: DeskTunable, format: (v: number) => string) => string;
export declare function Tunables(): import("react").JSX.Element;
