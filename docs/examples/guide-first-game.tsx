/**
 * The last step of getting started, "Your first page": Simmer's first page whole, in one file. The game is chapter
 * 6's (`./guide-first-page`, on Simmer's core in `./simmer/game-wallet`); this file is what a player sees of it: a
 * count that prints itself, a button, a burner and its lid, a shelf of kettles and a shop.
 *
 * In a game of your own this is `main.tsx`, and its last line calls `start()`. Run it with
 * `bun docs/examples/guide-first-game.tsx`: with no page to draw, it plays a minute on a fake clock and prints what
 * the page would show.
 */
import { useState } from "react";
import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  fmt,
  fmtCounted,
  fmtPlayed,
  fmtRate,
  type GameStorage,
  ZERO,
} from "watchpot/core";
import {
  type AwayReturn,
  createRuntimeHooks,
  mountGame,
  type StoreState,
  useAwayReport,
  useGameClock,
} from "watchpot/react";
import { BuyAmount, type BuyMode } from "watchpot/ui";
import { game, kettleRow, kettles, shelf, statOf } from "./guide-first-page";
import { SIMMER_PER_SECOND } from "./simmer/game-wallet";

/** The store: the game running. It saves in the browser unless told where; `now` is where it reads the time. */
export function makeStore(options: { now?: () => number; storage?: GameStorage } = {}) {
  return createIdleStore(game, { now: Date.now, ...options });
}

type Store = ReturnType<typeof makeStore>;
type State = StoreState<Store>;

/** The store hooks, typed for this game. Made once, used by every component below. */
const { useGameStore, useGameState } = createRuntimeHooks<Store>();

/** Everything the pot makes a second on its own: its simmer, the stove (lid and all) and the kettles. */
const income = (s: State) =>
  s.stove.perSecond.add(s.kettles.perSecond.bubbles ?? ZERO).add(SIMMER_PER_SECOND);

/** The count, printed for a person, and what it grows by. */
function Count() {
  const bubbles = useGameState((s) => s.wallet.bubbles);
  const rate = useGameState((s) => fmtRate(income(s)));
  return (
    <header>
      <h2>{fmt(bubbles).text} bubbles</h2>
      <p>{rate}</p>
    </header>
  );
}

/** The button: a stir pays the stir stat, which the shop raises. */
function Stir() {
  const store = useGameStore();
  const stir = useGameState((s) => statOf(s, "stir"));
  return (
    <button type="button" onClick={() => store.getState().spoon.click()}>
      Stir the pot (stir {fmt(stir).text})
    </button>
  );
}

/** The stove: its burners, the next one's price and the lid. Every number here is a derived value or a stat. */
function Stove() {
  const store = useGameStore();
  const burners = useGameState((s) => s.stove.burners);
  const price = useGameState((s) => s.stove.nextPrice);
  const canBuy = useGameState((s) => s.stove.canBuy);
  const lid = useGameState((s) => s.lid.on);
  const heat = useGameState((s) => s.stats.heat);
  return (
    <section aria-label="The stove">
      <p>
        {fmtCounted(burners, ["burner", "burners"])} lit, at heat {fmt(heat).text}
      </p>
      <button type="button" disabled={!canBuy} onClick={() => store.getState().stove.buyBurner()}>
        Light a burner: {fmt(price).text}
      </button>
      <button type="button" aria-pressed={lid} onClick={() => store.getState().lid.toggle()}>
        {lid ? "Take the lid off" : "Put the lid on"}
      </button>
    </section>
  );
}

const MODES = [
  { value: 1, label: "×1" },
  { value: 10, label: "×10" },
  { value: "next", label: "Next" },
  { value: "max", label: "Max" },
] as const satisfies readonly { value: BuyMode; label: string }[];

/** The kettles: one row a generator, each buying as many as the chosen mode says. */
function Kettles() {
  const store = useGameStore();
  const [mode, setMode] = useState<BuyMode>(1);
  const s = useGameState((g) => g);
  return (
    <section aria-label="The kettles">
      <BuyAmount aria-label="How many to buy" options={MODES} value={mode} onValueChange={setMode} />
      <ul>
        {kettles.def.list.map((def) => {
          const row = kettleRow(s, def.id, mode, s.clock.lastSeen);
          return (
            <li key={def.id}>
              <span>
                {def.name}: {row.owned} owned, {row.perSecond}/s
              </span>
              <button
                type="button"
                disabled={!row.canBuy}
                onClick={() => store.getState().kettles.buy(def.id, row.count)}
              >
                Buy {Math.max(1, row.count)}: {row.price}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The kitchen: things bought once that change a number. The ladle's big bubbles are chapter 6's, not this page's. */
function Shop() {
  const store = useGameStore();
  const s = useGameState((g) => g);
  return (
    <section aria-label="The kitchen">
      <ul>
        {shelf(s)
          .filter((item) => item.id !== "ladle")
          .map((item) => (
            <li key={item.id}>
              <span>{item.name}</span>
              <button
                type="button"
                disabled={!item.canBuy}
                onClick={() => store.getState().kitchen.buy(item.id)}
              >
                {item.price === null ? "Bought" : `Buy: ${item.price}`}
              </button>
            </li>
          ))}
      </ul>
    </section>
  );
}

/** What the pot made while you were away, from the state before the catch-up and the state after. */
function summarize({ before, after, ms }: AwayReturn<State>) {
  return { made: after.wallet.bubbles.sub(before.wallet.bubbles), ms };
}

/** The welcome back, after an absence of 30 seconds or more, until the player dismisses it. */
function AwayNote() {
  const { report, dismiss } = useAwayReport(summarize);
  if (!report) return null;
  return (
    <aside>
      <p>
        While you were away ({fmtPlayed(report.ms)}), the pot made {fmt(report.made).text} bubbles.
      </p>
      <button type="button" onClick={dismiss}>
        Nice
      </button>
    </aside>
  );
}

/** The page. It starts the clock once, for the whole game. */
export function App() {
  useGameClock(useGameStore());
  return (
    <main>
      <AwayNote />
      <Count />
      <Stir />
      <Stove />
      <Kettles />
      <Shop />
    </main>
  );
}

/** Makes the store and draws the page into `#root`: the last line of your `main.tsx`. */
export function start() {
  const store = makeStore();
  mountGame(store, <App />);
  return store;
}

if (import.meta.main) {
  let t = Date.UTC(2026, 0, 1);
  const store = makeStore({ now: () => t, storage: createGameStorage(createMemoryBackend()) });
  const play = store.getState;
  play().catchUp();
  for (let i = 0; i < 20; i++) {
    t += 100;
    play().spoon.click();
  }
  console.log("lit a burner:", play().stove.buyBurner());
  for (let i = 0; i < 60; i++) {
    t += 1000;
    play().tick(1000);
  }
  console.log("bought a pinch of salt:", play().kitchen.buy("salt").ok);
  for (let i = 0; i < 60; i++) {
    t += 1000;
    play().tick(1000);
  }
  console.log("bought a kettle:", play().kettles.buy("kettle"));
  t += 1000;
  play().tick(1000);
  const s = play();
  console.log("the count:", `${fmt(s.wallet.bubbles).text} bubbles`, fmtRate(income(s)));
  console.log("the stir:", fmt(statOf(s, "stir")).text);
  console.log("the kettle row:", kettleRow(s, "kettle", 1, t));
}
