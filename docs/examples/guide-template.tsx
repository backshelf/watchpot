// The guide, chapter 13: the dev panel on a `#dev` route, for a game you wrote by hand (the template mounts its own).
// Render <DevRoute /> anywhere inside the tree `mountGame` builds.
import { DevPanel } from "watchpot/devtools";
import { useHashRoute } from "watchpot/react";

/** The panel behind the route. `DevPanel` draws nothing in production; the inline check drops the route too. */
export function DevRoute() {
  const [route, go] = useHashRoute();
  return (
    <>{process.env.NODE_ENV !== "production" && route === "dev" && <DevPanel onClose={() => go("")} />}</>
  );
}
