/**
 * What the desk's window reads from a `Desk` on each change, where a control's value comes from and where a write to
 * it lands, and the few writes that take more than one call (an exclusive solo). Pure functions of the desk: React
 * holds none of it.
 */
import type { Desk, DeskBus, DeskChannel, DeskPack, DeskSample, DeskStaged, DeskTunable, MixFile } from "../../../sound/desk";
export declare const MASTER = "master";
export declare const MIX = "mix";
export declare const busId: (bus: string) => string;
export declare const levelKey: (bus: string) => string;
export declare const sendKey: (bus: string, to: string) => string;
export declare const fxKey: (bus: string, id: string, param: string) => string;
export declare const trimKey: (bus: string) => string;
export declare const chKey: (channel: string) => string;
export declare const chSendKey: (channel: string, to: string) => string;
export declare const tuneKey: (id: string) => string;
export declare const sceneLayer: (name: string) => string;
export interface Snapshot {
    buses: readonly DeskBus[];
    channels: readonly DeskChannel[];
    tunables: readonly DeskTunable[];
    /** The layers in force, bottom first: `"mix"`, then the current scene, then each pushed over it. */
    stack: readonly string[];
    current: string | null;
    pushed: readonly string[];
    labels: Readonly<Record<string, string>>;
    /** Scenes that may be named: every one that has been in force (stored) and every one in force now. */
    seen: readonly string[];
    file: MixFile;
    dirty: boolean;
    solos: number;
    mutes: number;
    packs: readonly DeskPack[];
    samples: readonly DeskSample[];
    staged: readonly DeskStaged[];
    canUndo: boolean;
    canRedo: boolean;
    limits: {
        fx: number;
        buses: number;
    };
}
export declare function snapshot(desk: Desk, stored: readonly string[]): Snapshot;
/** The layers a person may edit and see named: the mix, then every scene that has been in force, in the order heard. */
export declare const editLayers: (snap: Snapshot) => string[];
/**
 * A layer's name as the desk shows it ("All scenes" for the mix, a scene's label), or null when it names a scene
 * that has not been in force in this browser: that one is never named.
 */
export declare function layerName(layer: string, snap: Pick<Snapshot, "seen" | "labels">): string | null;
export type Tone = "default" | "mix" | "scene" | "route";
/** The kind of layer an owner is, for colour. */
export declare const toneOf: (owner: string) => Tone;
/** Who says the value in force, in words. */
export declare function ownerName(owner: string, snap: Pick<Snapshot, "seen" | "labels">): string;
/** True when the layer holds a desk write for the key (the file has it): what a reset takes away. */
export declare const written: (file: MixFile, layer: string, key: string) => boolean;
/** One key as a control shows it while `edit` is the layer being edited. */
export interface Resolved {
    /** What the control shows: the edit layer's value, else what lies under it. */
    shown: number;
    /** The value in force: what is heard now. */
    live: number;
    /** The layer whose value is in force: `"mix"`, `"scene:<name>"`, `"route"` or `"default"`. */
    owner: string;
    /** The layer the value shown comes from: the edit layer, `"mix"` under a scene, or `"default"`. */
    from: string;
    /** The edit layer says a value (declared or written). */
    says: boolean;
    /** The edit layer holds a desk write: a reset takes it away. */
    written: boolean;
    /** What is shown is not what is heard: another layer lies over it, or the edit layer is not in force. */
    shadowed: boolean;
    /** A mod route drives it: nothing may move it by hand. */
    locked: boolean;
}
/**
 * Where a key stands for a person editing `edit`. `fallback` is what the key is worth when no layer says it and the
 * desk cannot say (an effect's own start, 0 for a level or a trim, a tunable as declared).
 */
export declare function resolve(desk: Desk, file: MixFile, key: string, edit: string, fallback: number): Resolved;
export interface Tracks {
    /** Buses nothing sends into, in summing order. */
    plain: readonly DeskBus[];
    /** Buses another bus or a source sends into, in summing order. */
    returns: readonly DeskBus[];
    master: DeskBus | undefined;
    /** Each bus's sends that something says: the knobs its strip shows. */
    sends: ReadonlyMap<string, readonly string[]>;
}
/** The tracks as columns: the buses in summing order, the returns to their right, the master last. */
export declare function tracksOf(desk: Desk, snap: Snapshot): Tracks;
/** A cue with its roles, or any other source alone. */
export interface SourceNode {
    channel: DeskChannel;
    /** A cue's roles when it has more than one: with one, the cue's row stands for it. */
    roles: readonly DeskChannel[];
}
/** The sources as a browser lists them: each parentless channel, a cue's roles gathered under it. */
export declare function sourcesOf(channels: readonly DeskChannel[]): SourceNode[];
/** A source's name as a row shows it: a role is named by the bus its plays ask for. */
export declare const sourceLabel: (c: DeskChannel) => string;
/** The cue's key of a cue channel or one of its roles. */
export declare const cueKeyOf: (c: DeskChannel) => string;
/**
 * Solo: alone by default (every other solo comes off), added to the others with `add` (Ctrl or Cmd held). Pressing
 * the only solo takes it off.
 */
export declare function pressSolo(desk: Desk, snap: Snapshot, id: string, add: boolean): void;
/**
 * The buses still heard while anything is soloed (null when nothing is): each soloed bus and the bus of each soloed
 * channel, every bus on their way to the master, and the returns their sends reach (the core keeps those open).
 * A strip outside it is drawn dimmed, as silenced.
 */
export declare function audibleBuses(desk: Desk, snap: Snapshot): ReadonlySet<string> | null;
/** A name a pack can hold for a new sample, made from a file's name: letters, digits, ".", "_", "-". */
export declare function sampleNameFrom(fileName: string, taken: ReadonlySet<string>): string;
