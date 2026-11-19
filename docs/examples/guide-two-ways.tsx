/**
 * The smallest real game on the engine, and the page it ends with: what both ways in lead to. The game is the README's
 * smallest (`./readme-smallest.ts`), with its store and clock lines left out here: the page makes its own store and
 * starts its own clock, as a game's `main.tsx` does.
 *
 * A game that starts from an existing project adds this file and a page that draws it; one scaffolded from the
 * template holds the same shape among a lot more. Run it with `bun docs/examples/guide-two-ways.tsx`: it bakes on a
 * fake clock and prints the count.
 */
import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  D,
  defineFeature,
  defineGame,
  fmt,
  fmtRate,
  type GameStorage,
} from "watchpot/core";
import { createRuntimeHooks, mountGame, type StoreState, useGameClock } from "watchpot/react";

/** The bakery: loaves, and the ovens that bake them while the page is open. This is the whole game. */
export const bakery = defineFeature({
  key: "bakery",
  initial: () => ({ loaves: D(0), ovens: 1 }),
  derived: { perSecond: (s) => D(s.bakery.ovens) },
  actions: (api) => ({
    bake: () =>
      api.set((s) => {
        s.bakery.loaves = s.bakery.loaves.add(1);
      }),
    buyOven: () =>
      api.set((s) => {
        s.bakery.ovens += 1;
      }),
  }),
  steps: {
    produce: {
      ovens: {
        pass: "both",
        run: (s, ctx) => {
          s.bakery.loaves = s.bakery.loaves.add(s.bakery.perSecond.mul(ctx.dtMs / 1000));
        },
      },
    },
  },
});

/** The game: one feature, a name, and where it saves. */
export const game = defineGame({
  id: "bakery",
  save: { key: "bakery.save", version: 1 },
  features: [bakery],
});

/** The store, and the two hooks every part of the page reads it through. */
export function makeStore(options: { now?: () => number; storage?: GameStorage } = {}) {
  return createIdleStore(game, { now: Date.now, ...options });
}

type Store = ReturnType<typeof makeStore>;
type State = StoreState<Store>;

const { useGameStore, useGameState } = createRuntimeHooks<Store>();

/** The count: the one figure the page prints, worked out for a person. */
function Count() {
  const loaves = useGameState((s: State) => fmt(s.bakery.loaves).text);
  const rate = useGameState((s: State) => fmtRate(s.bakery.perSecond));
  return (
    <header>
      <h2>{loaves} loaves</h2>
      <p>{rate}</p>
    </header>
  );
}

/** The two buttons: one calls an action, the other buys an oven, which the step then bakes with. */
function Bake() {
  const store = useGameStore();
  const ovens = useGameState((s: State) => s.bakery.ovens);
  return (
    <div>
      <button type="button" onClick={() => store.getState().bakery.bake()}>
        Bake a loaf
      </button>
      <button type="button" onClick={() => store.getState().bakery.buyOven()}>
        Buy an oven, {ovens} lit
      </button>
    </div>
  );
}

/** The page: the clock started once for the whole page, then the count and the buttons. */
export function App() {
  useGameClock(useGameStore());
  return (
    <main>
      <Count />
      <Bake />
    </main>
  );
}

/** The last line of a `main.tsx`: the store, then the page drawn into `#root`. */
export function start() {
  const store = makeStore();
  mountGame(store, <App />);
  return store;
}

if (import.meta.main) {
  let t = Date.UTC(2026, 0, 1);
  const store = makeStore({ now: () => t, storage: createGameStorage(createMemoryBackend()) });
  store.getState().bakery.bake();
  store.getState().bakery.buyOven();
  for (let i = 0; i < 30; i++) {
    t += 1000;
    store.getState().tick(1000);
  }
  const s = store.getState();
  console.log("the count:", `${fmt(s.bakery.loaves).text} loaves`, fmtRate(s.bakery.perSecond));
  console.log("ovens:", s.bakery.ovens);
}
