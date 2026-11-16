import type { MixerDesk } from "./mixer";
import type { CorePort } from "./port";
import type { FxDef, PackSample, Take } from "./types";
/**
 * What a person saved from the desk. Every part is optional and holds only what was moved.
 *
 * `layers` holds every number, by layer (`"mix"`, or `"scene:<name>"`) and key:
 * - `level:<bus>` (dB), `send:<bus>><to>` (0 and up), `fx:<bus>:<id>:<param>` (the effect's own unit; a filter's
 *   mode 0..3, a switch 0 or 1) and `fx:<bus>:<id>:on` (0 or 1): the mixer's targets;
 * - `trim:<bus>` (dB on a bus's gain, beside the mix), `ch:<channel>` (a source's trim, dB),
 *   `chsend:<channel>><bus>` (a source's own send, 0 and up), `tune:<id>` (a game's tunable).
 *
 * A scene says only what it changes; what a number is worth is the topmost pushed scene that says it, else the
 * current scene, else `"mix"`, else what the code declares.
 */
export interface MixFile {
    version: 2;
    layers?: Record<string, Record<string, number>>;
    /** The structure, where it differs from the declared one: the same in every scene. */
    graph?: MixGraph;
    /** A cue's takes, replacing the ones its code declares. */
    cues?: Record<string, {
        takes: Take[];
    }>;
}
/** The structure a desk changed. */
export interface MixGraph {
    buses?: Record<string, GraphBus>;
    /** The bus a source plays on, by channel id (`cue:<key>`, `cue:<key>@<role>`, `stem:<pack>/<stem>`, ...). */
    routes?: Record<string, string>;
}
/** What a desk changed of one bus's structure. */
export interface GraphBus {
    /** True for a bus the desk made: the code declares none of that name. */
    made?: true;
    /** The bus it sums into, when not the declared one (`"master"` for the master). */
    out?: string;
    /** The bus whose player volume it takes too, when not the declared one (`null`: none). */
    volume?: string | null;
    /**
     * Its chain in order, by effect id. An entry with a `kind` is an effect the desk added; one without names a
     * declared effect. `key` overrides a compressor's key bus (`null`: none); `ir` is a convolver's response.
     */
    fx?: GraphFx[];
    /** Declared effects taken out, by id. */
    drop?: string[];
}
export interface GraphFx {
    id: string;
    kind?: FxDef["kind"];
    key?: string | null;
    ir?: string;
}
/** The first desk's file: still read. Its `trims`, `channels` and `tunables` are `trim:`, `ch:` and `tune:` of `"mix"`. */
export interface MixFileV1 {
    version: 1;
    trims?: Record<string, number>;
    layers?: Record<string, Record<string, number>>;
    channels?: Record<string, number>;
    tunables?: Record<string, number>;
}
/**
 * A source of sound the desk has a strip for. A cue played on more than one bus (a play names its `bus`) has a
 * child strip per bus asked for, its **role**: `cue:<key>@<role>`. What is written on the cue reaches every role;
 * what is written on a role reaches it alone.
 */
export interface DeskChannel {
    /** `cue:<key>`, `cue:<key>@<role>`, `stem:<pack>/<stem>`, `gen:<name>`, `grain:<name>` or `voice:<name>`. */
    id: string;
    kind: "cue" | "stem" | "gen" | "grain" | "voice";
    /** The part after the kind: the cue's key (with `@<role>` for a role), the stem's `pack/stem`, the given name. */
    name: string;
    /** A role's cue: the channel id it is a child of. */
    parent?: string;
    /** A role's name: the bus its plays asked for. */
    role?: string;
    /** The bus it last sounded on (after any route). */
    bus: string;
    /** The bus the desk routes it to, when it does (a role's own, not its cue's). */
    route?: string;
    /** The buses it sends into on its own, each with the level in force. */
    sends: readonly {
        to: string;
        level: number;
    }[];
    /** The samples it plays, by key (`"pack/sample"`): a cue's takes in force, a stem's loop. Empty for the rest. */
    samples: readonly string[];
    /** Its trim in dB in force (0 when nothing says one): a role's own, not its cue's. */
    trim: number;
    muted: boolean;
    soloed: boolean;
    /** True while something of it sounds (a loop, a generator); a one-shot counts for as long as it rings. */
    sounding: boolean;
    /** When it last started, in the sound's own seconds (`context.currentTime`); for a light. */
    lastAt: number;
}
/** One setting of an effect, with what a control needs to draw it. */
export interface DeskParam {
    /** The setting's name in `FxDef` (`cutoff`, `threshold`, ...). */
    param: string;
    min: number;
    max: number;
    /** What the effect starts at when the mix says nothing. */
    initial: number;
    unit: "Hz" | "s" | "dB" | "ratio" | "" | "bpm" | "beats" | "bits";
    /** `log` for frequencies and times; `choice` for a switch or a mode (then `choices` names each value from 0). */
    scale: "lin" | "log" | "choice";
    choices?: readonly string[];
}
export interface DeskFx {
    /** Its place in the chain now, from 0. */
    slot: number;
    /** Its name on its bus: what a key (`fx:<bus>:<id>:<param>`) and the graph call it. */
    id: string;
    /** The `FxDef` kind: `filter`, `compressor`, `reverb`, ... */
    kind: FxDef["kind"];
    /** True for an effect the code declares; false for one the desk added. */
    declared: boolean;
    /** For a compressor that listens to another bus. */
    key?: string;
    /** For a convolver: its impulse response's sample key. */
    ir?: string;
    /** Its settings but `on`, which every effect has (`fx:<bus>:<id>:on`, 1 unless a layer says 0). */
    params: readonly DeskParam[];
}
export interface DeskBus {
    /** `"master"` or a bus's name. */
    name: string;
    /** True for a bus the desk made. */
    made: boolean;
    /** The bus it sums into (`"master"` for one that sums straight into the master; `null` for the master). */
    out: string | null;
    /** The buses it can send to (every bus but itself and the master; a send into a loop is refused by the core). */
    sends: readonly string[];
    /** The bus whose player volume (`setBusVolume`) it takes on top of its own, or null. */
    volume: string | null;
    fx: readonly DeskFx[];
    /** Its declared effects that were taken out of the chain: `fxRestore` brings one back. */
    dropped: readonly {
        id: string;
        kind: FxDef["kind"];
    }[];
    trim: number;
    muted: boolean;
    soloed: boolean;
}
/** A bus's meter, linear: 1 is full scale. */
export interface DeskMeter {
    peak: number;
    rms: number;
    /** The most gain reduction of the bus's compressors now, in dB (0 or more). */
    reduction: number;
}
/** A game's own number on the desk. */
export interface TunableSpec {
    /** Where it sits on the desk: a group's name, shown as a heading. */
    group: string;
    label: string;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    /** A sentence saying what it does and when a move is heard, for its hover. */
    hint?: string;
    /**
     * Its place in a grid: the tunables of one group that have a cell are drawn as one table, rows by columns (a
     * score's sections by its stems).
     */
    cell?: {
        row: string;
        column: string;
    };
}
/** One sample of a loaded pack, as the desk shows it. */
export interface DeskSample {
    /** `"<pack>/<sample>"`. */
    key: string;
    pack: string;
    name: string;
    /** Its manifest entry (the staged one's while `side` is `"b"`). */
    entry: SampleEntry;
    /** The encoded file's URL, for drawing the one in the pack (none for a sample the pack does not have yet). */
    url?: string;
    /** The channels that play it: cues that take it, the stem that loops it. */
    users: readonly string[];
    /** True while a replacement is held beside it. */
    staged: boolean;
    /** Which one plays: the pack's (`"a"`) or the staged one (`"b"`). */
    side: "a" | "b";
}
/** A pack that has loaded. */
export interface DeskPack {
    name: string;
    tempo?: number;
    key?: string;
}
/** A sample's manifest entry without its URL: what the pack pipeline measured. */
export type SampleEntry = Omit<PackSample, "url">;
/** What a person changed of a recording before the pipeline's own trim and loudness match. Seconds. */
export interface SampleEdit {
    /** Where it starts and ends in the source (default: all of it). */
    start?: number;
    end?: number;
    fadeIn?: number;
    fadeOut?: number;
    /** Pitch in semitones; a loop keeps its length. */
    semitones?: number;
    reverse?: boolean;
}
/** One file through the pack pipeline. */
export interface SampleRequest {
    pack: string;
    sample: string;
    kind: PackSample["kind"];
    /** The recording. Left out: the sample's kept source, processed again (a new edit). */
    file?: Blob;
    /** The file's own name, for its extension and its `source`. */
    fileName?: string;
    edit?: SampleEdit;
    /** A loop's tempo in its source, and its length in bars. */
    bpm?: number;
    bars?: number;
    /** The root as Hz or a note name. */
    root?: string | number;
    /** A shot the game plays round: its ends are left as they are. */
    loop?: boolean;
}
/** What `SampleHost.process` resolves: the encoded audio, its manifest entry, and the name to commit it by. */
export interface SampleResult {
    token: string;
    audio: ArrayBuffer;
    entry: SampleEntry;
}
/** What a kept source says of itself (its sidecar). */
export interface SampleSource {
    edit?: SampleEdit;
    bpm?: number;
    bars?: number;
    root?: string | number;
    loop?: boolean;
    source?: string;
}
/**
 * Who runs the pack pipeline for the desk and writes into the packs: a game's dev server
 * (`watchpot/sound/pack`'s `sampleHost`, reached by `watchpot/react`'s `fetchSampleHost`).
 */
export interface SampleHost {
    /** Processes one file. Nothing in the pack changes. */
    process(request: SampleRequest): Promise<SampleResult>;
    /** What the kept source of a sample says, and the source itself for drawing (the pack's file when none is kept). */
    describe(pack: string, sample: string): Promise<SampleSource & {
        audio: ArrayBuffer;
    }>;
    /** Writes processed samples into their packs (files and manifests) and keeps each source with its sidecar. */
    commit(tokens: readonly string[]): Promise<void>;
    /** Rebuilds a pack's loops at a new tempo and records its key; resolves each loop as `process` would. */
    retune?(pack: string, to: {
        tempo?: number;
        key?: string;
    }): Promise<readonly (SampleResult & {
        sample: string;
    })[]>;
}
/** A replacement held beside a sample, not yet in its pack. */
export interface DeskStaged {
    key: string;
    token: string;
    entry: SampleEntry;
    /** True for a sample the pack does not have yet (a new take). */
    fresh: boolean;
}
export interface DeskTunable extends TunableSpec {
    id: string;
    /** What the code declares. */
    initial: number;
    value: number;
}
export interface Desk {
    /** Every bus, the master first, then in the order the mixer sums them. */
    buses(): readonly DeskBus[];
    /**
     * The scenes the mix declares, and which are in force: the current one and those pushed over it, bottom first.
     * `labels` holds what a scene is called where its definition says (`SceneDef.label`).
     */
    scenes(): {
        names: readonly string[];
        current: string | null;
        pushed: readonly string[];
        labels: Readonly<Record<string, string>>;
    };
    /**
     * Every channel that has sounded since the sound was made, or that the mix file names, in the order first heard;
     * a cue's roles follow it.
     */
    channels(): readonly DeskChannel[];
    tunables(): readonly DeskTunable[];
    /**
     * A key's value in a layer: `"mix"` or `"scene:<name>"`. `undefined` when that layer says nothing of it.
     * `"live"` reads what is in force now, and `owner` says which layer that came from (`"mix"`, `"scene:<name>"`, or
     * `"route"` when a mod route drives it; `"default"` when nothing says it: the effect's own start, a trim of 0,
     * the tunable as declared). Every key of a `MixFile`'s layers is read and written here.
     */
    get(layer: string, key: string): number | undefined;
    owner(key: string): string;
    /** Writes a key in a layer, heard at once; `undefined` takes the desk's write away (the declared value returns). */
    set(layer: string, key: string, value: number | undefined): void;
    /** Writes every value `from` says (declared or written) into `to`, as desk writes. */
    copyLayer(from: string, to: string): void;
    /** A bus's trim in dB in `"mix"`; 0 takes it away. */
    trim(bus: string, db: number): void;
    /** A channel's trim in dB in `"mix"`; 0 takes it away. */
    channelTrim(id: string, db: number): void;
    /** Makes a bus that sums into `out` (default the master). */
    addBus(name: string, options?: {
        out?: string;
    }): boolean;
    /** Removes a bus the desk made, once nothing is routed, sent or keyed to it. */
    removeBus(name: string): boolean;
    /** Points a bus's output at another bus (or `"master"`). */
    setOut(bus: string, out: string): boolean;
    /**
     * Says which bus's player volume a bus takes on top of its own (`null`: none): a bus the desk made, kept apart from
     * the music's, that the player's music volume should still turn down.
     */
    setVolume(bus: string, of: string | null): boolean;
    /** Adds an effect at a place in a bus's chain (default: last) and answers its id. */
    fxAdd(bus: string, kind: FxDef["kind"], at?: number): string | null;
    fxRemove(bus: string, id: string): boolean;
    /** Puts a declared effect that was taken out back in its chain, after its declared predecessor. */
    fxRestore(bus: string, id: string): boolean;
    /** Moves an effect to a place in its chain. */
    fxMove(bus: string, id: string, to: number): boolean;
    /** A compressor's key bus (`null`: its own bus). */
    fxKey(bus: string, id: string, key: string | null): boolean;
    /** A convolver's impulse response, by sample key. */
    fxIr(bus: string, id: string, sample: string): boolean;
    /** The most effects a bus holds, and the most buses beside the master. */
    limits(): {
        fx: number;
        buses: number;
    };
    /** Routes a source to a bus whatever its plays ask for; `undefined` takes the route away. */
    route(channel: string, bus: string | undefined): boolean;
    /** Every pack that has loaded. */
    packs(): readonly DeskPack[];
    /** Every sample of the loaded packs, and every staged one. */
    samples(): readonly DeskSample[];
    /**
     * Holds a processed recording beside the sample `key` (or as a new sample of its pack) and plays it in the
     * original's place: a cue from its next play, a stem from its next bar. Resolves false when it cannot be decoded
     * or the core is not up.
     */
    stage(key: string, audio: ArrayBuffer, entry: SampleEntry, token: string): Promise<boolean>;
    /** Which one plays: the pack's own (`"a"`) or the staged one (`"b"`). */
    ab(key: string, side: "a" | "b"): void;
    /** Drops a staged recording; the pack's own plays again. */
    unstage(key: string): void;
    staged(): readonly DeskStaged[];
    /** Says the staged recordings of `keys` are in their packs now: each becomes the sample. */
    committed(keys: readonly string[]): void;
    /** A cue's takes in force, the ones its code declares, and whether the desk replaced them; null for no such cue. */
    takes(cue: string): {
        takes: readonly Take[];
        declared: readonly Take[];
        replaced: boolean;
    } | null;
    /** Replaces a cue's takes (`undefined`: the declared ones again), from its next play. */
    setTakes(cue: string, takes: readonly Take[] | undefined): void;
    /** Takes the last change back (writes to one key within 600 ms are one change); staged recordings are not in it. */
    undo(): void;
    redo(): void;
    canUndo(): boolean;
    canRedo(): boolean;
    /** Mutes a bus (`bus:<name>`) or a channel (its id). */
    mute(id: string, on: boolean): void;
    /** Solos a bus (`bus:<name>`) or a channel: while any is soloed, only the soloed sound. */
    solo(id: string, on: boolean): void;
    /** Takes every mute and solo off. */
    clearListening(): void;
    /** Plays a cue channel once, as it would sound from the game with no place and no hand. Other kinds do nothing. */
    audition(id: string): void;
    /** Sets a tunable; `undefined` takes the desk's write away. */
    tune(id: string, value: number | undefined): void;
    /** The meters since the last call: every bus by name (`master` after the limiter), and the master's loudness. */
    meters(): {
        buses: Readonly<Record<string, DeskMeter>>;
        lufs: number;
    };
    /** What has been moved, as the file a game hands back to `createSound({ mix })`. */
    file(): MixFile;
    /** Replaces what has been moved with `file` (the declared mix where it says nothing), heard at once. */
    load(file: MixFile | MixFileV1): void;
    /** True when `file()` differs from the file the sound was made with or last `saved()`. */
    dirty(): boolean;
    /** Marks the current state as saved. */
    saved(): void;
    /** Called after anything the desk shows has changed (a write, a new channel, a scene). Not for the meters. */
    subscribe(fn: () => void): () => void;
}
/**
 * Declares a number of the game's that the desk can move: `const TICK_DB = tunable("stream.ticks", -28, {...})`,
 * read as `TICK_DB()` each time it is used. `onChange` is for a value that has to be pushed somewhere when it moves
 * (a running voice's gain); it is not called for the declared value.
 */
export declare function tunable(id: string, initial: number, spec: TunableSpec, onChange?: (value: number) => void): () => number;
/** Every tunable declared so far. */
export declare function tunables(): DeskTunable[];
/** Sets a tunable (`undefined`: back to what the code declares). An id nothing has declared yet is kept for when it is. */
export declare function tune(id: string, value: number | undefined): void;
/** Hears every change to the tunables (a new one, a value). */
export declare function watchTunables(fn: () => void): () => void;
/** A source's hold on its channel strip: what it multiplies into its gain, where it goes, and what it tells the desk. */
export interface DeskLink {
    readonly id: string;
    /** The strip's gain now, linear: its trim (and its cue's, for a role), times 0 while muted or soloed out. */
    gain(): number;
    /** The bus the desk routes it to, or undefined: it plays where it asks. */
    route(): string | undefined;
    /**
     * Its own sends in force, at most two: the declared ones at the desk's levels, then any the desk added. Told the
     * declared ones (a cue's `sends`), it remembers them for the desk to show.
     */
    sends(declared?: Readonly<Record<string, number>>): readonly {
        to: string;
        level: number;
    }[];
    /**
     * It started sounding, on `bus` (a bus's name as the code gave it; left out: where it last sounded), sending on its
     * own into `sends` (what a solo of it keeps audible).
     */
    started(bus?: string, sends?: readonly string[]): void;
    /** A one-shot voice of it, sounding until the core's `VOICE_ENDED`. */
    voice(id: number): void;
    /** A loop, a generator or a line is running (`true`) or has stopped (`false`). */
    hold(on: boolean): void;
    /** Hears the strip's gain change; the returned function stops it. */
    watch(fn: () => void): () => void;
    /** Hears the strip's route change; the returned function stops it. */
    rerouted(fn: () => void): () => void;
}
/** A link to nothing: what a module uses when its host has no desk. */
export declare const NO_LINK: DeskLink;
/** The sound's cues and samples as the desk needs them: its takes and what it stages. */
export interface DeskSource {
    /** Every cue's key. */
    cues(): readonly string[];
    /** A cue's declared takes; null for no such cue. */
    takes(key: string): readonly Take[] | null;
    /** A cue's takes changed on the desk: its next play picks among the new ones. */
    retake(key: string): void;
    /** Every pack that has loaded. */
    packs(): readonly DeskPack[];
    /** Every sample of the loaded packs. */
    samples(): readonly {
        key: string;
        entry: SampleEntry;
        url?: string;
    }[];
    /** Decodes a recording and holds it beside `key`, playing in its place. False when it cannot. */
    stage(key: string, audio: ArrayBuffer, entry: SampleEntry): Promise<boolean>;
    /** Which one plays: the pack's (`"a"`) or the staged one (`"b"`). */
    side(key: string, side: "a" | "b"): void;
    /** Drops the staged recording. */
    unstage(key: string): void;
    /** The staged recording is the sample now. */
    keep(key: string): void;
}
/** What `createDesk` needs from the sound. */
export interface DeskDeps {
    mixer: MixerDesk;
    port: CorePort;
    /** Plays a cue by key with no options, on the bus named when one is. */
    audition(key: string, bus?: string): void;
    /** The sound's cues and samples; a desk without them shows no takes and stages nothing. */
    source?: DeskSource;
}
/** The desk as `engine.ts` holds it: the game's face, and the strips its sources sound through. */
export interface DeskCore {
    desk: Desk;
    channel(kind: DeskChannel["kind"], name: string): DeskLink;
    /** A cue's strip for one bus its plays ask for (`cue:<key>@<asked>`). */
    role(key: string, asked: string): DeskLink;
    /** A cue's takes as the desk replaced them, or undefined: the declared ones. */
    takes(key: string): readonly Take[] | undefined;
}
/** How quickly a desk write, a trim, a mute or a solo is heard, in milliseconds. */
export declare const DESK_SLEW_MS = 30;
/** Builds the desk over a sound's mixer. */
export declare function createDesk({ mixer, port, audition, source }: DeskDeps): DeskCore;
/** A desk that holds what it is told and reaches no sound: what `sound.desk` is until the engine builds the real one. */
export declare function inertDesk(): Desk;
