import { createGameStorage, createIdleStore, createMemoryBackend, DAY_MS } from "watchpot/core";
import { DevPanel, mountGame, warpClock } from "watchpot/react";
import { game } from "./add-a-generator";

/**
 * The store a dev session plays. Nothing here is dev-only: the panel changes it through its root actions and the
 * clock's offset, never the wall.
 */
export const store = createIdleStore(game, {
  storage: createGameStorage(createMemoryBackend()),
  now: () => Date.now(),
});

/** The route check is written inline so the bundler folds it: a production build carries no panel code at all. */
function App({ route, closeDev }: { route: string; closeDev: () => void }) {
  return <>{process.env.NODE_ENV !== "production" && route === "#dev" && <DevPanel onClose={closeDev} />}</>;
}

/** A browser entry: `mountGame(store, <App />)` renders into `#root` under the store's provider. */
export function main() {
  mountGame(store, <App route={location.hash} closeDev={() => (location.hash = "")} />);
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
