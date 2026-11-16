import type { Desk, MixFile, SampleHost } from "../../sound/desk";
import type { DeskSwitch } from "../SoundDesk";
export interface SoundDeskViewProps {
    desk: Desk;
    onSave: (file: MixFile) => void | Promise<void>;
    /** Who processes and writes recordings; without one, samples and takes are shown and not changed. */
    samples?: SampleHost;
    /** The game's own switches, in the top bar. */
    switches?: readonly DeskSwitch[];
    title?: string;
    storageKey?: string;
    /** The window it runs in, when its document has none of its own (a test's fake window). */
    win?: Window;
    /** It owns its document: it keeps the document's title, marked while unsaved or soloed. */
    ownsDocument?: boolean;
}
export declare function SoundDeskView({ desk, onSave, samples: host, switches, title, storageKey, win: givenWin, ownsDocument, }: SoundDeskViewProps): import("react").JSX.Element;
