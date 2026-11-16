import type { Desk, MixFile, SampleHost } from "../../sound/desk";
/**
 * A switch of the game's own in the desk's top bar: one of a few named states, set from the desk (which scene the
 * sound is in, say, so a mix can be worked on without playing to it). `options` and `value` are read on every draw.
 */
export interface DeskSwitch {
    id: string;
    label: string;
    options(): readonly {
        value: string;
        label: string;
    }[];
    value(): string;
    set(value: string): void;
}
/** What a game hands the mix desk's window. */
export interface SoundDeskOptions {
    /** The sound's desk (`sound.desk`). */
    desk: Desk;
    /**
     * Who processes a dropped recording and writes it into a pack (`fetchSampleHost(url)` over a dev server that
     * mounts `watchpot/sound/pack`'s `sampleHost`). Without one the desk shows samples and takes and replaces none.
     * Save commits what is staged through it before `onSave`.
     */
    samples?: SampleHost;
    /** The game's own switches, in the top bar. */
    switches?: readonly DeskSwitch[];
    /**
     * Saves the mix: called with `desk.file()` when the person presses Save. A game writes it where its own
     * `createSound({ mix })` reads it from (a route on its dev server that writes the file into the repository).
     * The desk calls `desk.saved()` once the promise resolves, and shows the failure when it rejects.
     */
    onSave: (file: MixFile) => void | Promise<void>;
    /** The window's title (default "Mix desk"). */
    title?: string;
    /**
     * A key under which the desk keeps, on this device, what is not the mix: which scenes have been heard (only those
     * are shown, so a game's later scenes are not named before they play), the window's size, how its panes are
     * sized, what is folded and what is selected.
     */
    storageKey?: string;
}
/**
 * Opens the mix desk in a window of its own (a development tool: a game calls it from a dev build only) and returns
 * a function that closes it. Called while it is open, it brings the window forward. Where a window cannot be opened
 * (a blocked popup), it returns a function that does nothing and warns once.
 */
export declare function openSoundDesk(options: SoundDeskOptions): () => void;
