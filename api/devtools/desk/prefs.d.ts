/**
 * What the mix desk keeps on this device that is not the mix: the scenes that have been in force (only those are ever
 * named), the window's place and size, what is folded, what is selected and how the panes are sized. One JSON record
 * under the game's `storageKey`; every read and write survives a storage that throws (a private window, blocked
 * site data).
 */
export interface DeskPrefs {
    /** Scene names that have been in force, in the order first heard. */
    seen: string[];
    /** Fold keys of the groups that are closed. */
    folded: string[];
    /** The window's last place and size, in screen pixels. */
    geometry?: {
        x: number;
        y: number;
        w: number;
        h: number;
    };
    /** The track whose devices are shown. */
    selected?: string;
    /** The source whose samples are shown, by channel id. */
    source?: string;
    /** The detail's open tab. */
    tab?: string;
    /** The detail's height and the sources pane's width, in pixels. */
    detail?: number;
    sources?: number;
}
export declare const DEFAULT_STORAGE_KEY = "watchpot.soundDesk";
export declare function readPrefs(key: string): DeskPrefs;
/** Merges `patch` into the stored record (read again first, so the window and the opener never undo each other). */
export declare function writePrefs(key: string, patch: Partial<DeskPrefs>): void;
