/**
 * The mixer: a game's buses, their effects and sends, the player's volumes and the scenes, kept on the main thread
 * and sent to the core.
 *
 * Every number the mix can move is a target: a bus's level (dB), one of its sends (0..1), one setting of one of its
 * effects, or an effect's on/off. What a target is worth, highest first:
 *
 * 1. the mod matrix: while any route drives it, the routes' sum (`drive`);
 * 2. the scenes: the topmost pushed scene that names it, else the current scene (`scene(name)`);
 * 3. the mix: the bus's definition, moved by the handles (`bus(name).level`, `.send`, `.fx(slot).set`).
 *
 * A layer that stops saying (a route removed, a scene popped) uncovers the one under it. The player's volume
 * (`setBusVolume`) is apart from all three: it multiplies the bus's gain. The master's gain in the core, a fader after
 * the master's effects, is the sound's volume (`volume`, what `sound.setVolume` sets) times the master's level times
 * the player's master volume. An effect setting nothing below has a value for stays where it was.
 *
 * **The structure can change while it plays** (the mix desk's doing): a bus made or removed, a bus's output, an
 * effect added, removed, moved or re-keyed. An effect is named by its `id` on its bus, never by where it sits, so a
 * scene, a route and a saved key reach the same effect wherever it has been moved; the core's slot is its place in
 * the bus's chain now. A chain that changes is defined again in the core from the first slot that differs, with
 * every setting sent again (those effects start over: their tails are cut). A declared effect that was taken out
 * keeps its targets: what a scene or a route says of it is held and sent nowhere.
 *
 * Everything may be called before the core is up; it is remembered and sent from `boot()`. While the core is up,
 * writes are gathered and sent once in a microtask, each target only when its value changed.
 */
import type { GraphBus } from "./desk";
import type { CorePort } from "./port";
import type { BusDef, DefaultBus, FxDef, Mixer, ModTarget, Presence, SceneDef } from "./types";
/** The buses every sound has, in index order from 1 (0 is the master). */
export declare const DEFAULT_BUSES: readonly DefaultBus[];
export interface MixerOptions<B extends string> {
    buses?: Readonly<Partial<Record<B, BusDef<B>>>>;
    scenes?: Readonly<Record<string, SceneDef<B>>>;
    presence?: {
        mine?: Presence;
        other?: Presence;
    };
}
/** The mixer as `engine.ts` holds it. */
export interface MixerCore<B extends string> {
    /** What a game sees: `sound.mixer`. */
    api: Mixer<B>;
    /** A bus's index in the core: 0 for `"master"`, `sfx`'s for a name that is not a bus or for none. */
    index(name: string | undefined): number;
    /** Sends everything declared and set so far. Called each time the core comes up, before anything plays. */
    boot(): void;
    /** A sample became ready or was freed: a convolver waiting for its impulse response can load it. */
    samples(): void;
    /** What a play's hand adds: `mine` true, false, or not said. */
    presence(mine: boolean | undefined): Presence;
    /** A mod target's key, for `drive`. Throws on a bus, an effect or a setting that does not exist. */
    target(target: ModTarget<B>): string;
    /** The mod matrix's value for a target (`undefined`: no route drives it), reached over `slewMs`. */
    drive(key: string, value: number | undefined, slewMs: number): void;
    /** The sound's master volume (`sound.setVolume`, 0..1): lands at once, and is sent from `boot()` before then. */
    volume(value: number): void;
    /** What the mix desk reaches the mix through. */
    desk: MixerDesk;
}
/** One effect of a bus's chain, as the desk reads it. */
export interface ChainUnit {
    id: string;
    kind: FxDef["kind"];
    /** True for one the code declares. */
    declared: boolean;
    /** A compressor's key bus in force. */
    key?: string;
    /** A convolver's impulse response in force. */
    ir?: string;
}
/**
 * The mix desk's hold on the mixer. A desk write sits over what the code declared in the same layer (the mix, or one
 * scene) and is kept apart from it, so taking the write away uncovers the declared value. A bus's trim and its
 * listening gain (mute and solo) multiply its gain beside the player's volume, outside the mix, the scenes and the
 * routes. The structure is the desk's to change: each change answers false (or null) when it is refused.
 */
export interface MixerDesk {
    /** Every bus but the master, in index order (the order the core numbers them). */
    names(): readonly string[];
    /** A bus's index in the core (0: the master), or -1 for a name that is not a bus. */
    indexOf(name: string): number;
    /** True for the master and every bus. */
    isBus(name: string): boolean;
    /** True for a bus the desk made. */
    made(name: string): boolean;
    /** A bus's name as a play resolves it: a name that is not a bus is `sfx`, as `index` reads it. */
    resolve(name: string | undefined): string;
    /** The bus a bus sums into (`null` for the master). */
    outOf(name: string): string | null;
    /** The bus whose player volume a bus takes on top of its own, or null. */
    follows(name: string): string | null;
    /** Says which bus's player volume a bus takes too (`null`: none). Refused for itself or a name that is no bus. */
    follow(bus: string, of: string | null): boolean;
    /** The buses a bus sends to now: a send known to the mix at a level above 0 in force. */
    sendsOf(name: string): readonly string[];
    /** A bus's effects in the order they run. */
    chain(name: string): readonly ChainUnit[];
    /** A bus's declared effects that are out of its chain, in declared order. */
    dropped(name: string): readonly ChainUnit[];
    /** The scenes, which are in force (bottom first), and what each is called where its definition says. */
    scenes(): {
        names: readonly string[];
        current: string | null;
        pushed: readonly string[];
        labels: Readonly<Record<string, string>>;
    };
    /** A target key in its canonical form, made known to the mixer, or null when no such target exists. */
    key(key: string): string | null;
    /** A layer's value for a key: the desk's write over the declared one. `"live"` is the value in force. */
    get(layer: string, key: string): number | undefined;
    /** Which layer the value in force comes from: `"route"`, `"scene:<name>"`, `"mix"` or `"default"`. */
    owner(key: string): string;
    /** A desk write into `"mix"` or `"scene:<name>"` (`undefined` takes it away), heard over `slewMs`. False when refused. */
    write(layer: string, key: string, value: number | undefined, slewMs: number): boolean;
    /** Every target a layer says and what it says: the declared values under the desk's writes. */
    says(layer: string): ReadonlyMap<string, number>;
    /** A bus's trim in dB (0: none). */
    trim(bus: string, db: number, slewMs: number): void;
    /** A bus's listening gain: 0 while muted or soloed out, else 1. */
    listen(bus: string, gain: number, slewMs: number): void;
    /** Hears a scene set, pushed or popped, a route starting or ending on a target, and the structure changing. */
    onChange(fn: () => void): void;
    /** Makes a bus that sums into `out` (default the master). */
    addBus(name: string, out?: string): boolean;
    /** Removes a bus the desk made, once no bus sums, sends or listens to it. */
    removeBus(name: string): boolean;
    /** Points a bus's output at another bus or the master; refused where it would close a loop. */
    setOut(bus: string, out: string): boolean;
    /** Adds an effect at a place in a bus's chain (default: last); its id. */
    fxAdd(bus: string, kind: FxDef["kind"], at?: number): string | null;
    fxRemove(bus: string, id: string): boolean;
    /** Puts a declared effect that was taken out back in its chain, after its declared predecessor. */
    fxRestore(bus: string, id: string): boolean;
    fxMove(bus: string, id: string, to: number): boolean;
    /** A compressor's key bus (`null`: its own). */
    fxKey(bus: string, id: string, key: string | null): boolean;
    /** A convolver's impulse response, by sample key. */
    fxIr(bus: string, id: string, sample: string): boolean;
    /** The structure where it differs from the declared one, by bus. */
    graph(): Record<string, GraphBus>;
    /** Replaces the structure with the declared one under `graph`, defining again only the chains that differ. */
    loadGraph(graph: Readonly<Record<string, GraphBus>> | undefined): void;
    /** The most effects a bus holds, and the most buses beside the master. */
    limits(): {
        fx: number;
        buses: number;
    };
}
/** Each `FxDef` kind's effect in the core (exported for the desk's table and its test). */
export declare const KIND: {
    readonly filter: "svf";
    readonly eq: "eq";
    readonly compressor: "comp";
    readonly saturator: "sat";
    readonly delay: "delay";
    readonly tape: "tape";
    readonly crush: "crush";
    readonly reverb: "fdn";
    readonly convolver: "conv";
    readonly freeze: "freeze";
    readonly stereo: "stereo";
};
/** Builds the mixer. Throws on a bus graph with a cycle, a scene naming a bus that does not exist, or over 15 buses. */
export declare function createMixer<B extends string>(options: MixerOptions<B>, port: CorePort): MixerCore<B>;
