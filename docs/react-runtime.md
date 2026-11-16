# React runtime

`watchpot/react` binds a store to React. It does four jobs: it hands the store to the tree (`mountGame`), gives your
components typed reads of it (`createRuntimeHooks`), starts the things a page starts once (the clock, the motion and
colour scheme, the sound), and offers a handful of small hooks a game page keeps needing (a boot sequence, hotkeys, a
hash route, game-time countdowns). It draws nothing: the look is your game's.

The store is built once, outside React, in your composition root. React only reads it and calls its actions; the
clock, not React, moves time.

Example: [`examples/react-runtime.tsx`](examples/react-runtime.tsx). It typechecks with the rest of the docs; it is a
browser module, so it has no output to run in a terminal. Simmer's page, with a title screen before play:

```tsx
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
```

## Which import

- **`watchpot/react`**: everything on this page, plus `useGameRuntime`, `usePageRuntime` and `SheetOutlet`. It reaches no
  stylesheet.
- **`watchpot/devtools`**: the `DevPanel` (with its sound desk and sample host), for a development build. The one entry
  with a stylesheet.

## The store hooks

**`mountGame(store, <App />, rootId?)`** renders into `#root` (or `rootId`) under **`IdleStoreProvider`**, the one
context that holds the store. A test mounts under the same provider with `renderWith` from
[the test kit](test-kit.md).

**`createRuntimeHooks<typeof store>(options?)`**, called once in your game, returns three hooks typed over your store:

- **`useGameStore()`**: the store itself, for handlers. Read it inside the handler (`game.getState().pot.tap()`),
  not during render.
- **`useGameState(selector)`**: one reading, re-rendering when the selected value changes by identity
  (`Object.is`). The selector must answer the same state with the same value. Return a string, a number, a boolean or
  a stored object, and work figures out in the render.
- **`useGameView()`**: the whole state at a slow pace, for a screen that reads much of it: at once after the
  player's own input, a few times a second while the game runs by itself, never while the tab is hidden. Pass
  `createRuntimeHooks({ view: { idleMs, inputMs } })` to change the pace (defaults 200 and 500 ms).

**`useShallow(selector)`** wraps a selector that builds a new value each time (an object of two figures, a Decimal
from arithmetic): it hands back its last value while the new one is shallowly equal. A Decimal compares by its
fields, so `useShallow((s) => s.pot.bubbles.mul(2))` is steady too. It comes from `watchpot/react`; you need no import of zustand for it.

**`StoreState<typeof store>`** is your state's type, for a selector written outside a component. **`useIdleStore()`**
is the untyped store in context, what the engine's own hooks read; a game uses its typed hooks instead.

Which read to use: a figure that moves every tick (the balance) is a narrow `useGameState`; a whole screen is
`useGameView`; a decorative read-out that must not render on every tick is `useSampled` (below).

## The runtime

Something has to start the clock, once, and the page's settings have to reach `<html>`. That is the runtime, in two
halves you can call together or apart:

- **`useGameClock(store)`**: the clock. It starts `startGameClock` (live ticks, the catch-up after time away, a save
  when the tab hides) and the watch on other tabs, and returns `{ taken }`: true once another tab of the game took the
  save, after which this tab's clock has stopped and it writes nothing until a reload. It starts in a layout effect,
  so the first catch-up lands before any child's effect reads the store. A clock that gives up is thrown from the
  render, for your error boundary.
- **`usePageRuntime({ motion?, scheme?, sound? })`**: everything else, with no store. It writes `data-motion` on
  `<html>` (the resolved motion, `"reduced"` or `"full"`, the operating system answering for `"system"`) and the colour
  scheme, and with `sound: { engine, on }` unlocks the sound engine on the first gesture and mutes it while `on` is
  false. It returns `{ reduced }`. `motion` and `scheme` default to `"system"`.
- **`useGameRuntime(store, options?)`** is both at once, returning `{ reduced, taken }`. A page with no title screen
  calls this at the top of its app and is done.

A game with a title screen calls them apart, so the motion and scheme are right while the title is up but time does
not run until the player starts:

```tsx
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
```

Style the motion from the attribute alone: `:root[data-motion="reduced"] .pot { transition: none; }`. Because the
attribute already follows the operating system under `"system"`, a stylesheet needs no `prefers-reduced-motion`
query beside it, except as a fallback for the first paint before the hook runs or for a page on `useGameClock` alone,
which never writes the attribute.

## Game time on the page

The page never reads `Date.now()` for anything the game decides. Two hooks give it game time:

- **`useTickNow()`**: the clock's `lastSeen`, moving with the store's own ticks. Anything that animates with the
  game follows it; a test drives it with `store.tick`.
- **`useClockNow(intervalMs?, override?)`**: the store's `gameNow()` (the wall plus the clock's offset, what actions
  check), re-read every `intervalMs` on one timer shared by every reader of that store and interval, and at once when
  the offset moves. Countdowns read this:

```tsx
/** A countdown reads game time on a shared timer: `useClockNow`, never `Date.now()`. */
export function StirTimer() {
  const now = useClockNow(250);
  const stirredAt = useGameState((s) => s.pot.stirredAt);
  const left = Math.max(0, stirredAt + 10_000 - now);
  return left > 0 ? <p>Stirring: {Math.ceil(left / 1000)} s</p> : null;
}
```

`override` pins it (a test, a parent that already ticks). **`warpClock(store, ms, { catchUp? })`** moves game time
forward by growing the clock's offset, never the wall: the running clock catches up over the gap on its next step, as
on a return. The dev panel's warp buttons call it. **`clockLens(store)`** finds where the store keeps its clock
fields, for a game that saves them under its own names.

## Boot, keys and routes

- **`useBoot(machine)`** holds a boot sequence's phase as React state: `[phase, send]`. The machine is yours, a
  `BootMachine<P, E>` of `{ initial, next(phase, event) }` (the title card, an intro, a splash); the shell draws a
  screen per phase and sends what the player does. `initial` is read once, on mount. Define the machine at module
  level, as `BOOT` is in the example, so `send` stays the same function from render to render.
- **`useHotkeys(keys, { enabled? })`** binds one `keydown` listener on `window` while `enabled` (default true). Each
  key is looked up as `event.key.toLowerCase()`, so write keys in lower case: `" "` for the space bar, `"escape"`,
  `"arrowup"`. It ignores a key with ctrl, meta or alt held, and typing in an input, a textarea, a select or editable
  text. A held key repeats the call; `event.repeat` is yours to read. The table is read through a ref, so a new
  object every render costs nothing.
- **`useHashRoute()`** returns `[route, go]`: the hash without its `#` (`""` for none), following every change, and a
  way to move it. A page behind a route of its own, the dev panel at `#dev` say, then opens and closes with the
  address bar and the back button. Gate the panel with `process.env.NODE_ENV !== "production"` written inline, as
  above, so a production build drops its code ([Dev panel workflow](dev-panel-workflow.md)).

## The rest of the entry

Smaller hooks, each with its own reference:

- **Time away, told:** `watchAway`, `useAwayReport` and `awayGains` ([Time away](time-away.md)). `useAwayReport`
  hears the opening catch-up whether it sits in a child of the component that starts the clock or after it in the
  same component.
- **Sampled reads:** `useSampled`, `createSampler`, `SampleProvider`, `useSample` read the store on a timer for a
  decorative read-out, and `frameRate` counts frames.
- **News:** `useNews(log, onLine)` calls `onLine` for each line a journal gains.
- **Prefs:** `usePrefs` ([Prefs and the pace clock](prefs.md)).
- **Layout and tab:** `usePageLayout`, `PageLayoutProvider`, `usePageLayoutObserver`, `WIDE_AT`; `claimTabTitle`,
  `releaseTabTitle` and `useAwayTitle` for the browser tab's title.
- **Layers:** `useLayerSwap` switches a window's layers, committing the store's layer when the transition ends.
- **Sheets:** `SheetOutlet` and `SheetRegistry`, re-exported from `watchpot/ui` ([UI](ui.md)).

The README's React section lists each one's options.

## Things that bite

- **A selector that builds a new value loops.** `useGameState((s) => ({ a: s.a }))` or `(s) => s.gold.mul(2)`
  returns a new value every call, so React renders again until it throws. In development the first such selector is
  named in a console warning before that happens. Wrap it in `useShallow`, or select stored values and compute in the
  render.
- **`useGameView`'s pace is set once per store.** Every reader shares one paced view, made with the options of the
  first call; a later call with other options gets the first call's pace and a development warning. Set the pace once,
  in `createRuntimeHooks({ view })`.
- **No provider, no store.** Every hook here throws outside a provider, naming the hook that was called. Mount with
  `mountGame`, or wrap a test in `renderWith`.
- **Start the clock once.** Two components that each call `useGameRuntime` or `useGameClock` run two clocks over one
  store. Call it in the one component that owns play.
- **A countdown on `Date.now()` drifts from the game.** The dev panel's warp and a player's time away move game time,
  not the wall. Read `useClockNow` for anything an action will check.
- **Handlers read the store when they run.** Calling `useGameStore().getState()` during render and keeping the result
  gives a handler a stale state. Call `getState()` inside the handler.

## Where the guide teaches it

- [Chapter 2, Your first game](guide/02-your-first-game.md#step-3-the-clock): the clock hook on Simmer's first page.
- [Chapter 10, The page](guide/10-the-page.md): the three store hooks, the selector trap, the runtime hook and its two
  halves, and the two imports.
- API: [`api/react/index.d.ts`](../api/react/index.d.ts), [`api/hooks/index.d.ts`](../api/hooks/index.d.ts).
