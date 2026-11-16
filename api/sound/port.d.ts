/**
 * What `engine.ts` hands the modules that speak to the core: one way to post records, the events coming back, and
 * the few facts they need. Everything a game does through a module before `unlock()` is remembered by the module and
 * sent once the core is up: a module built with the sound has a `boot()` the engine calls, and one built later (a
 * score, a sequence, a generator) asks `whenUp`.
 */
import type { DeskChannel, DeskLink } from "./desk";
import type { HarmonyCore } from "./music/harmony";
import type { TransportCore } from "./music/transport";
import type { SoundEvent } from "./protocol";
import type { Gen, GenDef, GenKind, Grid, PackManifest, Placement, PlayOptions, VoiceHandle } from "./types";
export interface CorePort {
    /** Posts command records. Dropped while the core is not up. */
    send(records: Uint8Array): void;
    /** True while the core is up. */
    up(): boolean;
    /** Runs `fn` now when the core is up, else once when it comes up. */
    whenUp(fn: () => void): void;
    /** Hears every event the core writes (`BEAT`, `STEP`, `METERS`, ...); the returned function stops it. */
    listen(fn: (event: SoundEvent) => void): () => void;
    /** Milliseconds as whole frames at the context's sample rate; 0 for none. */
    frames(ms: number | undefined): number;
    /** The context's sample rate (48,000 before there is a context). */
    rate(): number;
    /** Seconds on the context's clock (0 before there is one): the only clock the sound reads. */
    time(): number;
    /** The context's frame now: what a record's `atFrame` counts (0 before there is a context). */
    frame(): number;
    /** The id of a sample the core holds and has answered for, by its key (`"pack/sample"`), else 0. */
    sample(key: string): number;
}
/** A sample the core holds and has answered for. */
export interface HeldSample {
    id: number;
    /** Source frames, and source frames a second. */
    frames: number;
    rate: number;
    /** The gain that restores the recording's level from the normalised PCM the core holds. */
    scale: number;
}
/** What one play of a cue would start now, as a sequencer track needs it. */
export interface CueVoice {
    sample: number;
    gain: number;
    rate: number;
    bus: number;
    /** The bus's name, for the desk's strip. */
    busName?: string;
    /** The cue's first two sends, by bus index. */
    sends: readonly {
        bus: number;
        level: number;
    }[];
}
/** What the music, the sequences and the babble need from the sound that holds them. */
export interface SoundHost {
    port: CorePort;
    /** A bus's index in the core (0: the master; `sfx`'s for a name that is not a bus). */
    bus(name: string | undefined): number;
    /** A sample by key, once the core holds it and has answered; else null. */
    held(key: string): HeldSample | null;
    /**
     * A pack's manifest once `loadPack` has resolved it, else null: with, for a sample the mix desk has replaced, the
     * entry of the recording that plays.
     */
    manifest(pack: string): PackManifest | null;
    /** Hears a sample's recording change under its key (the desk staged one, or switched sides); none without a desk. */
    swapped?(fn: (key: string) => void): () => void;
    loadPack(name: string): Promise<void>;
    /** Plays a cue of the sound; `when` waits for a line of the transport's grid. */
    play(key: string, options?: PlayOptions & {
        when?: Grid;
    }): VoiceHandle | null;
    /** What one play of a cue would start now (its first voice), or null when nothing of it can sound yet. */
    voice(key: string): CueVoice | null;
    /** Where a point or an element is on the screen, read now (`sound.space.resolve`). */
    place(at: NonNullable<PlayOptions["at"]>): Placement;
    /** A modelled source, as `sound.gen`. */
    gen(kind: GenKind, def?: GenDef<string>): Gen;
    transport: TransportCore;
    harmony: HarmonyCore;
    /** The mix desk's strip a source sounds through (`cue:<key>`, `stem:<pack>/<stem>`, ...); none without a desk. */
    channel?(kind: DeskChannel["kind"], name: string): DeskLink;
}
