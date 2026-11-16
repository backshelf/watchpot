import { type ComponentType, lazy, Suspense } from "react";
import type { DevPanelProps } from "./DevPanel";

/**
 * The panel, loaded on first draw in a development build and absent from a production one. Bun replaces
 * `process.env.NODE_ENV` at build time (`--production` makes it "production"), so there this is a constant `null` and
 * the dynamic import, the only edge to the panel's module, is dead code the bundler never follows: the panel's
 * script, styles and helpers stay out of the bundle and its source map.
 */
const Panel: ComponentType<DevPanelProps> | null =
  process.env.NODE_ENV === "production"
    ? null
    : lazy(() => import("./DevPanel").then((m) => ({ default: m.DevPanel })));

/**
 * The developer's panel over the running game (`./DevPanel.tsx`): time warp, a jump to day N, each feature's state,
 * the save to read, check, edit and load. Draws nothing in a production build. A game mounts it behind its own
 * route, under the store's provider.
 */
export function DevPanel(props: DevPanelProps) {
  if (!Panel) return null;
  return (
    <Suspense fallback={null}>
      <Panel {...props} />
    </Suspense>
  );
}

export type { DevPanelProps };
