import { createIdleStore, DAY_MS } from "watchpot/core";
import { DevPanel } from "watchpot/devtools";
import { mountGame, useHashRoute, warpClock } from "watchpot/react";
import { game } from "./add-a-generator";

/**
 * The store a dev session plays. Nothing here is dev-only: the panel changes it through its root actions and the
 * clock's offset, never the wall.
 */
export const store = createIdleStore(game, { now: () => Date.now() });

/**
 * `#dev` opens the panel and its close clears the hash, so the address bar and the back button open and shut it.
 * `DevPanel` already draws nothing in a production build and leaves its code out of the bundle; the inline
 * `NODE_ENV` check also keeps a production page from reacting to `#dev` at all.
 */
function App() {
  const [route, go] = useHashRoute();
  return (
    <>{process.env.NODE_ENV !== "production" && route === "dev" && <DevPanel onClose={() => go("")} />}</>
  );
}

/** A browser entry: `mountGame(store, <App />)` renders into `#root` under the store's provider. */
export function main() {
  mountGame(store, <App />);
}

/**
 * The workflow, in code (the panel's buttons call the same things): warp a day forward, let the next step catch
 * up over the gap as a return would, and read what the offline cap paid.
 */
export function warpADay() {
  store.getState().catchUp(Date.now());
  const before = store.getState().wallet.gold;
  warpClock(store, DAY_MS, { catchUp: true });
  return store.getState().wallet.gold.sub(before);
}

if (import.meta.main) console.log("a day away paid:", warpADay().toFixed(0));
