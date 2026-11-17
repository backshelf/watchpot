/**
 * Knobs: numbers a game exposes as config for the sim to turn, such as a price growth or a delay. They are never store
 * state (so no `select`, no save): game code reads one with `knobs.get(key)` at the moment it needs it. One run binds
 * at a time: `bind` gives the reader (the sim's `tunables`) the values, `bind(null)` returns to the defaults.
 */
/** What a knob's number means, for display. */
export type KnobUnit = "ms" | "x" | "%";
/** One knob: its default `value`, how to show it, and the range the sim may move it in. */
export interface KnobSpec {
    readonly value: number;
    readonly label: string;
    readonly group: string;
    readonly min?: number;
    readonly max?: number;
    readonly step?: number;
    readonly unit?: KnobUnit;
}
/** Knob specs by key. */
export type KnobSpecs = Readonly<Record<string, KnobSpec>>;
/** The keys of a knob spec. */
export type KnobKey<S extends KnobSpecs> = Extract<keyof S, string>;
/** A number for every knob. */
export type KnobValues<S extends KnobSpecs> = {
    readonly [P in KnobKey<S>]: number;
};
/** The knobs of a game: read with `get`, bound to a run's values with `bind`. */
export interface Knobs<S extends KnobSpecs> {
    /** The bound reader's value, or the default when unbound. Throws on an unknown key. */
    get(key: KnobKey<S>): number;
    readonly spec: S;
    /** A copy: the spec values with `saved` laid over. */
    defaults(): KnobValues<S>;
    /** Reads from `reader.values` until the next `bind`; null unbinds. */
    bind(reader: {
        readonly values: Readonly<Record<string, number | string | boolean>>;
    } | null): void;
}
/** Defines a game's knobs. `saved` overrides spec values. Throws on a bad spec; it does not clamp. */
export declare function defineKnobs<const S extends KnobSpecs>(spec: S, saved?: Readonly<Record<string, number>>): Knobs<S>;
