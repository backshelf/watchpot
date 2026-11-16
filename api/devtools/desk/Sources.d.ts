/**
 * The sources: every channel that has sounded, under the bus it sounds on, with a filter. Each row has its light,
 * its name (pressed, it opens in the detail), where its audio goes, its trim, mute, solo and, for a cue, an
 * audition. A cue played on more than one bus opens into its roles: a write on the cue's row reaches every role, a
 * write on a role's row reaches that role alone.
 */
import { type RefObject } from "react";
import type { DeskChannel } from "../../sound/desk";
/** What a screen reader and the info line call a source: a role is "<cue> as <role>". */
export declare const sourceName: (c: DeskChannel) => string;
export declare function SourcesPane({ selected, folded, onFold, filterRef, audible, order, }: {
    selected: string | undefined;
    folded: ReadonlySet<string>;
    onFold: (key: string) => void;
    filterRef: RefObject<HTMLInputElement | null>;
    audible: ReadonlySet<string> | null;
    /** The buses in the order the tracks show them. */
    order: readonly string[];
}): import("react").JSX.Element;
