// The guide, chapter 13: the dev panel on a `#dev` route, for a game scaffolded from the template (which does not
// mount the panel itself). Render <DevRoute /> anywhere inside the tree `mountGame` builds.
import { useEffect, useState } from "react";
import { DevPanel } from "watchpot/react";

/** The page's hash, kept current: the panel opens on `#dev` and closes when the hash goes. */
export function useRoute() {
  const [route, setRoute] = useState(() => location.hash);
  useEffect(() => {
    const on = () => setRoute(location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

/** The panel behind the route. `DevPanel` draws nothing in production; the inline check drops the route too. */
export function DevRoute() {
  const route = useRoute();
  return (
    <>
      {process.env.NODE_ENV !== "production" && route === "#dev" && (
        <DevPanel onClose={() => (location.hash = "")} />
      )}
    </>
  );
}
