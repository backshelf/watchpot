import { type ReactNode } from "react";
/** Props of `Portal`: what to move and where. */
export interface PortalProps {
    children?: ReactNode;
    /** Where the children go; `document.body` by default. Pick an element inside the game's theme scope to keep its tokens. */
    container?: Element | null;
}
/** Renders its children into `container` (the body by default), outside the parent's overflow and stacking. */
export declare function Portal({ children, container }: PortalProps): import("react").ReactPortal | null;
/**
 * A named context whose hook throws a readable error outside its root: `Dialog.Title` without a `Dialog.Root` says
 * so, instead of failing on an undefined value.
 */
export declare function partContext<T>(root: string): readonly [import("react").Provider<T | null>, (part: string) => T];
