/**
 * The player's sound settings, kept per device: a volume for each bus a game shows, and the headphones mode. Stored
 * as one JSON value under the game's key; a value that will not parse, or storage that refuses, leaves the settings
 * for the session only.
 */
import type { Mixer, Space } from "./types";
/** A game's sound settings: read for a settings row, written from it. */
export interface SoundPrefs<B extends string> {
    /** The player's volume for a bus, 0..1 (1 when never set). */
    busVolume(name: B | "master"): number;
    setBusVolume(name: B | "master", volume: number): void;
    headphones(): boolean;
    setHeadphones(value: boolean): void;
}
/**
 * The settings stored under `key`, applied to `sound` now and on every change. `storage` is `localStorage` where
 * there is one; without it the settings last the session.
 */
export declare function soundPrefs<B extends string>(key: string, sound: {
    mixer: Mixer<B>;
    space: Space;
}, storage?: Pick<Storage, "getItem" | "setItem">): SoundPrefs<B>;
