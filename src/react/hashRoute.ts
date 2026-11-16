import { useSyncExternalStore } from "react";

const hash = () => (typeof location === "undefined" ? "" : location.hash.replace(/^#/, ""));

function onHashChange(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

/** Moves the page to `#route`; an empty route clears the hash. */
function goTo(route: string): void {
  location.hash = route;
}

/**
 * The page's hash route without its `#` ("" for none), following every change, and a way to move it: a page behind
 * a route of its own, the dev panel at `#dev` say, opens and closes with the address bar and the back button.
 * `const [route, go] = useHashRoute()`, then `route === "dev" && <DevPanel onClose={() => go("")} />`.
 */
export function useHashRoute(): [route: string, go: (route: string) => void] {
  return [useSyncExternalStore(onHashChange, hash, () => ""), goTo];
}
