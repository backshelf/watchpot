import { crossedMark, fmt, fmtCounted, fmtRate, watchChanges } from "watchpot/core";
import { createRuntimeHooks, DevPanel, mountGame, type StoreState, useGameRuntime } from "watchpot/react";
import { FloatingNumbers, Pressable, useFloatingNumbers } from "watchpot/ui";
import { useShallow } from "zustand/react/shallow";
import { burnerPrice, perSecond, store } from "./simmer/game";

// Simmer's page, grown from chapter 2's: the same game and store, read and drawn the way a bigger page is.

// The hooks: made once, typed over the game's store. Every screen reads through these three.
export const { useGameStore, useGameState, useGameView } = createRuntimeHooks<typeof store>();
type State = StoreState<typeof store>;

/** The balance: a narrow selector that returns a string, so it re-renders only when the text changes. */
export function Balance() {
  const text = useGameState((s) => fmt(s.pot.bubbles).text);
  return <h1>{text} bubbles</h1>;
}

/** Two figures in one read: `useShallow` keeps the object steady while neither figure has changed. */
export function Summary() {
  const { burners, rate } = useGameState(
    useShallow((s: State) => ({
      burners: s.stove.burners,
      rate: fmtRate(perSecond(s.stove.burners)),
    })),
  );
  return (
    <p>
      {fmtCounted(burners, ["burner", "burners"])} lit, {rate}
    </p>
  );
}

/** The pot's look. The engine draws nothing: this is all of it, keyed on the primitive's `data-*`. */
export const POT_CSS = `
.pot { position: relative; display: inline-grid; }
.pot-press {
  min-width: 160px; min-height: 160px; border-radius: 50%;
  border: 2px solid currentColor; background: transparent; font: inherit;
  cursor: pointer; touch-action: manipulation; user-select: none;
  transition: scale 120ms ease-out;
}
.pot-press[data-pressed] { scale: 0.95; }
.pot-press:focus-visible { outline: 3px solid currentColor; outline-offset: 4px; }
.pot-floats { position: absolute; inset: 0; pointer-events: none; }
.pot-floats > [data-float] {
  translate: -50% -50%; font-weight: 700;
  animation: pot-rise 800ms ease-out forwards;
}
@keyframes pot-rise { to { opacity: 0; transform: translateY(-40px); } }
:root[data-motion="reduced"] .pot-press { transition: none; }
:root[data-motion="reduced"] .pot-floats > [data-float] { animation-duration: 1ms; }
@media (prefers-reduced-motion: reduce) {
  .pot-press { transition: none; }
  .pot-floats > [data-float] { animation-duration: 1ms; }
}
`;

/** The pot: the engine's `Pressable` (one press per finger, key or click) wearing Simmer's own look. */
export function Pot() {
  const game = useGameStore();
  const floats = useFloatingNumbers({ max: 16 });
  return (
    <div className="pot">
      <Pressable
        className="pot-press"
        onPress={(press) => {
          game.getState().pot.tap();
          floats.spawn({ x: press.x, y: press.y, node: "+1" });
        }}
      >
        Tap the pot
      </Pressable>
      <FloatingNumbers floats={floats} className="pot-floats" />
    </div>
  );
}

/** The stove: the whole state at the paced rate, its figures worked out in render, one action on the button. */
export function Stove() {
  const game = useGameStore();
  const s = useGameView();
  const price = burnerPrice(s.stove.burners);
  const canAfford = s.pot.bubbles.gte(price);
  return (
    <section aria-labelledby="stove-title">
      <h2 id="stove-title">The stove</h2>
      <p>Each burner adds {fmtRate(1)}.</p>
      <button type="button" disabled={!canAfford} onClick={() => game.getState().stove.buyBurner()}>
        Light a burner for {fmt(price).text} bubbles
      </button>
    </section>
  );
}

/** What Simmer celebrates: the stove reaching a count of burners. */
export type SimmerEvent = { kind: "burners"; at: number };

/** One watch over the store, turning each change into Simmer's own events. Returns the stop. */
export function watchSimmer(on: (event: SimmerEvent) => void): () => void {
  const watch = watchChanges<State, SimmerEvent>(store, {
    rules: [
      (next, prev, emit) => {
        const at = crossedMark([1, 10, 25], prev.stove.burners, next.stove.burners);
        if (at !== undefined) emit({ kind: "burners", at });
      },
    ],
    on,
  });
  return () => watch.stop();
}

/** The page: the runtime once at the top, then the screens, then the dev panel behind its route. */
export function App({ route, closeDev }: { route: string; closeDev: () => void }) {
  const game = useGameStore();
  const { taken } = useGameRuntime(game, { motion: "system", scheme: "system" });
  return (
    <main>
      <style>{POT_CSS}</style>
      {taken && (
        <p role="alert">Simmer is open in another tab. Play there, or close it and reload this one.</p>
      )}
      <Balance />
      <Pot />
      <Summary />
      <Stove />
      {process.env.NODE_ENV !== "production" && route === "#dev" && <DevPanel onClose={closeDev} />}
    </main>
  );
}

/** The browser entry: the store goes into context, the page renders under it. */
export function main() {
  mountGame(store, <App route={location.hash} closeDev={() => (location.hash = "")} />);
}
