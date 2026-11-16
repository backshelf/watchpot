import { fmt, fmtCounted, fmtPlayed, fmtRate } from "watchpot/core";
import {
  type AwayReturn,
  createRuntimeHooks,
  mountGame,
  type StoreState,
  useAwayReport,
  useGameClock,
} from "watchpot/react";
import { burnerPrice, perSecond, store } from "./game";

/** The store hooks, typed for this game. Made once, used by every component. */
const { useGameStore, useGameState } = createRuntimeHooks<typeof store>();

type State = StoreState<typeof store>;

/** The pot: the count, the rate, and the button that taps it. */
function Pot() {
  const game = useGameStore();
  const bubbles = useGameState((s) => s.pot.bubbles);
  const burners = useGameState((s) => s.stove.burners);
  return (
    <section>
      <h1>{fmt(bubbles).text} bubbles</h1>
      <p>{fmtRate(perSecond(burners))}</p>
      <button type="button" onClick={() => game.getState().pot.tap()}>
        Tap the pot
      </button>
    </section>
  );
}

/** The stove: how many burners are lit, and the button that buys the next. */
function Stove() {
  const game = useGameStore();
  const burners = useGameState((s) => s.stove.burners);
  const price = burnerPrice(burners);
  const canAfford = useGameState((s) => s.pot.bubbles.gte(price));
  return (
    <section>
      <p>{fmtCounted(burners, ["burner", "burners"])} lit</p>
      <button type="button" disabled={!canAfford} onClick={() => game.getState().stove.buyBurner()}>
        Light a burner for {fmt(price).text} bubbles
      </button>
    </section>
  );
}

/** What the pot made while you were away, from the state before the catch-up and the state after. */
function summarize({ before, after, ms }: AwayReturn<State>) {
  return { made: after.pot.bubbles.sub(before.pot.bubbles), ms };
}

/** The welcome back, shown after an absence of 30 seconds or more until the player dismisses it. */
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
function App() {
  useGameClock(store);
  return (
    <main>
      <AwayNote />
      <Pot />
      <Stove />
    </main>
  );
}

mountGame(store, <App />);
