/**
 * The tracks: one column per bus in summing order, the returns to their right, the master pinned last. Each column
 * is a strip: its name, where its audio goes, its sends as knobs, its fader beside its meter and gain reduction, its
 * trim, mute and solo. A "+" makes a bus.
 */
import { type RefObject } from "react";
import { type Tracks as TrackList } from "./model";
export declare function Meter({ bus, orient, readout, }: {
    bus: string;
    orient: "v" | "h";
    readout?: RefObject<HTMLElement | null>;
}): import("react").JSX.Element;
/** A bus's gain reduction: a bar that grows from its start, with its figure when there is room for one. */
export declare function Reduction({ bus, orient, figure, }: {
    bus: string;
    orient: "down" | "across";
    figure?: boolean;
}): import("react").JSX.Element;
export declare function TracksPane({ tracks, selected, audible, }: {
    tracks: TrackList;
    selected: string | undefined;
    audible: ReadonlySet<string> | null;
}): import("react").JSX.Element;
