/** Props of `DevPanel`. */
export interface DevPanelProps {
    /** Closes the panel (the game drops its `#dev` route). Absent, no close button. */
    onClose?: () => void;
}
/**
 * The developer's panel, docked over the game in a development build: time warp, a jump to day N, the state of
 * each feature, and the save as text to read, check, edit and load. It reads the store in context and changes it
 * only through its actions and the clock's offset. The entry exports it through `gate.tsx`, which loads it only in a
 * development build.
 */
export declare function DevPanel({ onClose }: DevPanelProps): import("react").JSX.Element;
