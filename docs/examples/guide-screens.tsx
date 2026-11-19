/**
 * Several pages in one game: a screen per page, a rail of tabs that opens them, and only the open screen drawn. The
 * chrome — the count and the rail — is drawn once, around whichever screen is open; a screen never draws either.
 *
 * The tins are a finished screen that is off the rail: one entry in `EXTRA` puts it there, which is all a fourth page
 * costs. Run it with `bun docs/examples/guide-screens.tsx`: it fills jars on a fake clock and prints each screen's
 * figures.
 */

import { useState } from "react";
import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  D,
  defineFeature,
  defineGame,
  fmt,
  fmtCounted,
  fmtRate,
  type GameStorage,
} from "watchpot/core";
import { createRuntimeHooks, mountGame, type StoreState, useGameClock } from "watchpot/react";
import { NavTabs } from "watchpot/ui";

/** The pantry: shelves fill jars on their own, a press fills one at once, and a tin is opened by hand. */
export const pantry = defineFeature({
  key: "pantry",
  initial: () => ({ jars: D(0), shelves: 1, tins: 0 }),
  derived: { perSecond: (s) => D(s.pantry.shelves) },
  actions: (api) => ({
    fill: () =>
      api.set((s) => {
        s.pantry.jars = s.pantry.jars.add(1);
      }),
    shelf: () =>
      api.set((s) => {
        s.pantry.shelves += 1;
      }),
    tin: () =>
      api.set((s) => {
        s.pantry.tins += 1;
      }),
  }),
  steps: {
    produce: {
      shelves: {
        pass: "both",
        run: (s, ctx) => {
          s.pantry.jars = s.pantry.jars.add(s.pantry.perSecond.mul(ctx.dtMs / 1000));
        },
      },
    },
  },
});

/** The game: one feature, and where it saves. */
export const game = defineGame({
  id: "pantry",
  save: { key: "pantry.save", version: 1 },
  features: [pantry],
});

/** The store, and the hooks every screen reads it through. */
export function makeStore(options: { now?: () => number; storage?: GameStorage } = {}) {
  return createIdleStore(game, { now: Date.now, ...options });
}

type Store = ReturnType<typeof makeStore>;
type State = StoreState<Store>;

const { useGameStore, useGameState } = createRuntimeHooks<Store>();

/** The shelf: the count, and one press that fills a jar. */
function Shelf() {
  const store = useGameStore();
  const jars = useGameState((s: State) => fmt(s.pantry.jars).text);
  return (
    <section aria-label="The shelf">
      <h2>{jars} jars</h2>
      <button type="button" onClick={() => store.getState().pantry.fill()}>
        Fill a jar
      </button>
    </section>
  );
}

/** The storeroom: the shelves, and the press that adds one. */
function Storeroom() {
  const store = useGameStore();
  const shelves = useGameState((s: State) => s.pantry.shelves);
  const rate = useGameState((s: State) => fmtRate(s.pantry.perSecond));
  return (
    <section aria-label="The storeroom">
      <p>
        {fmtCounted(shelves, ["shelf", "shelves"])}, filling {rate}.
      </p>
      <button type="button" onClick={() => store.getState().pantry.shelf()}>
        Put up a shelf
      </button>
    </section>
  );
}

/** The ledger: one screen reading the figures of the other two. */
function Ledger() {
  const jars = useGameState((s: State) => fmt(s.pantry.jars).text);
  const shelves = useGameState((s: State) => s.pantry.shelves);
  const tins = useGameState((s: State) => s.pantry.tins);
  return (
    <section aria-label="The ledger">
      <h2>The books</h2>
      <p>
        {jars} jars, {fmtCounted(shelves, ["shelf", "shelves"])}, {fmtCounted(tins, ["tin", "tins"])} opened.
      </p>
    </section>
  );
}

/** The tins: a screen of its own, finished and not on the rail. */
function Tins() {
  const store = useGameStore();
  const tins = useGameState((s: State) => s.pantry.tins);
  return (
    <section aria-label="The tins">
      <h2>{fmtCounted(tins, ["tin", "tins"])} opened</h2>
      <button type="button" onClick={() => store.getState().pantry.tin()}>
        Open a tin
      </button>
    </section>
  );
}

/** Every screen, by the name of its tab: the table the page reads the open one out of. */
const SCREENS = { shelf: Shelf, storeroom: Storeroom, ledger: Ledger, tins: Tins } as const;
type Tab = keyof typeof SCREENS;

/** The screens that are finished and not on the rail yet: one entry here puts one on it. */
const EXTRA: readonly { id: Tab; label: string }[] = [];

/** The rail, in the order a player meets it. */
const TABS: readonly { id: Tab; label: string }[] = [
  { id: "shelf", label: "The shelf" },
  { id: "storeroom", label: "The storeroom" },
  { id: "ledger", label: "The ledger" },
  ...EXTRA,
];

/** The page: the clock, the chrome both screens share, the open screen, the rail. */
export function App() {
  useGameClock(useGameStore());
  const jars = useGameState((s: State) => fmt(s.pantry.jars).text);
  const [tab, setTab] = useState<Tab>("shelf");
  // Only the open screen is drawn: closing a tab unmounts its screen and everything it held.
  const Screen = SCREENS[tab];
  return (
    <div>
      <header>
        <h2>The pantry</h2>
        <p>{jars} jars</p>
      </header>
      <Screen />
      <NavTabs.Root aria-label="The pantry's screens" current={tab} onSelect={(id) => setTab(id as Tab)}>
        {TABS.map((entry) => (
          <NavTabs.Item key={entry.id} value={entry.id}>
            {entry.label}
          </NavTabs.Item>
        ))}
      </NavTabs.Root>
    </div>
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
  store.getState().pantry.fill();
  store.getState().pantry.shelf();
  for (let i = 0; i < 30; i++) {
    t += 1000;
    store.getState().tick(1000);
  }
  const s = store.getState();
  console.log("the shelf:", `${fmt(s.pantry.jars).text} jars`);
  console.log(
    "the storeroom:",
    fmtCounted(s.pantry.shelves, ["shelf", "shelves"]),
    fmtRate(s.pantry.perSecond),
  );
  console.log("the rail:", TABS.map((entry) => entry.label).join(", "));
}
