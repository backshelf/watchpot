import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  defineGame,
  defineSettings,
  feature,
  fmt,
  localStorageBackend,
  ZERO,
} from "watchpot/core";
import { DevPanel } from "watchpot/devtools";
import {
  type BootMachine,
  createRuntimeHooks,
  mountGame,
  type PageRuntimeOptions,
  type StoreState,
  useBoot,
  useClockNow,
  useGameClock,
  useHashRoute,
  useHotkeys,
  usePageRuntime,
  useShallow,
} from "watchpot/react";

// ---- the game: Simmer's pot, a burner, and the player's settings

export const pot = feature({
  key: "pot",
  initial: () => ({ bubbles: ZERO, burners: 0, stirredAt: 0 }),
  actions: (api) => ({
    tap: () =>
      api.set((d) => {
        d.pot.bubbles = d.pot.bubbles.add(1);
      }),
    stir: () =>
      api.set((d) => {
        d.pot.stirredAt = api.now();
      }),
  }),
  steps: {
    produce: {
      simmer: {
        pass: "both",
        run: (d, ctx) => {
          d.pot.bubbles = d.pot.bubbles.add(((1 + d.pot.burners) * ctx.dtMs) / 1000);
        },
      },
    },
  },
});

/** The runtime options' own types, so the settings hand straight to `usePageRuntime`. */
type Look = Required<Pick<PageRuntimeOptions, "motion" | "scheme">>;

export const choices = defineSettings({
  key: "settings",
  initial: (): Look => ({ motion: "system", scheme: "system" }),
});

export const game = defineGame({
  id: "simmer-page",
  save: { key: "simmer-page.save", version: 1 },
  features: [choices, pot],
});

/** The one place the page reads the wall clock. */
export const store = createIdleStore(game, {
  storage: createGameStorage(localStorageBackend() ?? createMemoryBackend()),
  now: Date.now,
});

// ---- the store hooks: made once, typed over the game's store

export const { useGameStore, useGameState, useGameView } = createRuntimeHooks<typeof store>();
type State = StoreState<typeof store>;

/** One figure: a selector that returns a string, so it renders only when the text changes. */
export function Bubbles() {
  const text = useGameState((s) => fmt(s.pot.bubbles).text);
  return <h1>{text} bubbles</h1>;
}

/** Two figures in one object: `useShallow` hands back the last object while both figures are the same. */
export function Stove() {
  const { burners, rate } = useGameState(
    useShallow((s: State) => ({ burners: s.pot.burners, rate: 1 + s.pot.burners })),
  );
  return (
    <p>
      {burners} burners, {rate} a second
    </p>
  );
}

/** A countdown reads game time on a shared timer: `useClockNow`, never `Date.now()`. */
export function StirTimer() {
  const now = useClockNow(250);
  const stirredAt = useGameState((s) => s.pot.stirredAt);
  const left = Math.max(0, stirredAt + 10_000 - now);
  return left > 0 ? <p>Stirring: {Math.ceil(left / 1000)} s</p> : null;
}

/** A summary that reads much of the state: the whole state, paced, not a selector per figure. */
export function Ledger() {
  const s = useGameView();
  return (
    <dl>
      <dt>Bubbles</dt>
      <dd>{fmt(s.pot.bubbles).text}</dd>
      <dt>Burners</dt>
      <dd>{s.pot.burners}</dd>
    </dl>
  );
}

// ---- the shell: a title, then the game, the clock starting only once play does

type Phase = "title" | "playing";
/** The boot machine, at module level: `useBoot` reads `initial` once, and a steady `next` keeps `send` steady. */
const BOOT: BootMachine<Phase, "start" | "quit"> = {
  initial: "title",
  next: (phase, event) => (event === "start" ? "playing" : event === "quit" ? "title" : phase),
};

/** Always mounted: the motion, the scheme (on <html>) and the boot phase. No clock yet. */
export function App() {
  const motion = useGameState((s) => s.settings.motion);
  const scheme = useGameState((s) => s.settings.scheme);
  const { reduced } = usePageRuntime({ motion, scheme });
  const [phase, send] = useBoot(BOOT);
  const [route, go] = useHashRoute();
  return (
    <main data-still={reduced || undefined}>
      {phase === "title" ? (
        <button type="button" onClick={() => send("start")}>
          Put the pot on
        </button>
      ) : (
        <Play onQuit={() => send("quit")} />
      )}
      {process.env.NODE_ENV !== "production" && route === "dev" && <DevPanel onClose={() => go("")} />}
    </main>
  );
}

/** Mounted once play starts: the clock, the watch on other tabs, the keys. */
function Play({ onQuit }: { onQuit: () => void }) {
  const game = useGameStore();
  const { taken } = useGameClock(game);
  useHotkeys({ " ": () => game.getState().pot.tap(), s: () => game.getState().pot.stir(), escape: onQuit });
  if (taken)
    return <p role="alert">Simmer is open in another tab. Play there, or close it and reload this one.</p>;
  return (
    <>
      <Bubbles />
      <Stove />
      <StirTimer />
      <Ledger />
      <button type="button" onClick={() => game.getState().pot.tap()}>
        Tap the pot
      </button>
    </>
  );
}

/** The browser entry: `index.html` loads this module and calls `main()`. */
export function main() {
  mountGame(store, <App />);
}
