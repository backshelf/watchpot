import type { DevPanelProps } from "./DevPanel";
/**
 * The developer's panel over the running game (`./DevPanel.tsx`): time warp, a jump to day N, each feature's state,
 * the save to read, check, edit and load. Draws nothing in a production build. A game mounts it behind its own
 * route, under the store's provider.
 */
export declare function DevPanel(props: DevPanelProps): import("react").JSX.Element | null;
export type { DevPanelProps };
