# watchpot/react

The store hooks, the clocks, the runtime hook and the page layout. [react-runtime](react-runtime.md) has a worked example, and `api/react/` has every signature.

## React

`watchpot/react` binds a store to React. It reads `/core`, the kit's motion and scheme writers and `watchpot/ui`'s
sheet outlet; it draws no page of its own (the page is `watchpot/ui`'s `PageShell` under the game's own look). Its
tests are in `test/react/`.

Shelf page: [docs/react-runtime.md](docs/react-runtime.md).

- **The store.** One context, `IdleStoreContext`, holds the store the composition root built:
  `mountGame(store, <App />)` renders into `#root` under `IdleStoreProvider`. `createRuntimeHooks<GameStore>()`, once in the game, gives the
  typed `useGameStore()`, `useGameState(selector)` and `useGameView()` (the whole state at a slow pace, below); the
  engine's own hooks read it untyped (`useIdleStore`). Without a provider a hook that reads the store throws, naming the
  hook and pointing to `mountGame` or an `IdleStoreProvider`. `RuntimeStore` is the shape they need: `getState` (the
  root actions), `setState` (an immer recipe) and `subscribe`. A selector must hand back the same value for the same
  state: a new object, or Decimal arithmetic, renders without end. Wrap it in `useShallow` (re-exported here and from
  `watchpot/react`, so no game imports zustand; it compares a Decimal by its fields:
  `useGameState(useShallow((s) => ({ a: s.a })))`), or select stored values and compute in the render. In development such a selector gets one warning,
  with the fix, before React's own loop error.
- **The route.** `useHashRoute()` is `[route, go]`: the hash without its `#`, following every `hashchange`, so a
  `#dev` panel opens and closes with the address bar (`route === "dev" && <DevPanel onClose={() => go("")} />`).
- **The clocks.** `useTickNow()` follows the clock's `lastSeen` (a test drives it with `store.tick`); `useClockNow(ms,
  override)` reads `gameNow()` on one timer per store and interval, and at once when the clock's offset moves. Both
  find the clock's fields through the game's `ClockLens` (`clockLens(store)`), wherever the game saves them.
  `warpClock(store, ms, { catchUp })` moves game time forward by the offset, never the wall: the running clock catches
  up over the gap on its next step, as on a return.
- **The runtime.** `useGameRuntime(store, { motion, scheme, sound })` is everything a page starts once: the clock
  (`startGameClock`, in a layout effect so the first catch-up lands before any child reads the store), the watch on
  other tabs (`taken`), `setReducedMotion` and `data-motion` on `<html>`, `applyColorScheme`, and the sound engine's
  unlock and mute. `data-motion` is the resolved motion, `"reduced"` or `"full"` (the OS deciding while the setting is
  `"system"`), so a stylesheet reads that attribute alone and a player who chose `"full"` keeps it. `motion` and
  `scheme` default to `"system"`, and the options may be left out. It returns `{ reduced, taken }`; a clock that gives
  up is thrown from the render, for the game's error boundary. It is two hooks composed, for a shell that shows
  something before the game runs (a title, a splash): `usePageRuntime({ motion, scheme, sound })` is everything but the
  clock (it needs no store, and returns `{ reduced }`), and `useGameClock(store)` is the clock and the watch, mounted
  when the game starts. `useBoot({ initial, next })` is a boot sequence's phase as state, the machine the game's;
  `useLayerSwap({ layers, layer, setLayer, canSwap, cue })` is a switch between a window's layers that commits the
  store's layer only when the transition ends (`select`, `finish`, `swap`). `usePrefs` reads and writes a device
  preference (`prefs()` in `/core`).
- **The page.** `SheetOutlet` and `SheetRegistry` are re-exported from `watchpot/ui` (where `PageShell` lives, see
  UI). The template's `Shell` (`templates/game/src/ui/Shell.tsx`) is the copy-in page a game starts from.
- **The rest.** `usePageLayout`, `PageLayoutProvider` (a value above the page wins, which is how tests pin the width),
  `usePageLayoutObserver`, `WIDE_AT` (900px); `claimTabTitle` and `releaseTabTitle` (the browser tab's title, claimed
  by id, the latest shown); `useAwayTitle(titles, { everyMs? })` shows the game's own words in the tab, in turn, while
  it is hidden, and gives the page's title back on the return.
- **Time away, told.** `watchAway(store, onReturn, { minMs?, settlePasses?, lens? })` hears the catch-up that
  credited an absence and hands `{ before, after, ms }` (`ms` the whole jump in `lastSeen`; the offline cap may have
  credited less); `useAwayReport(summarize)` holds the game's own report of it until `dismiss()`, and hears the
  clock's opening catch-up in either hook order (a child of the component that starts the clock, or after
  `useGameClock`/`useGameRuntime` in the same one), once, StrictMode included; `awayGains(before, after, reads)`
  lists what went up (`docs/time-away.md`).
- **Sampled reads.** `useSampled(store, { sample, initial, everyMs?, fps?, same? })` reads the store every `everyMs`
  (250 by default) into `sample(state, { prev, fps })`'s snapshot and re-renders only when it changes (`sameShallow`:
  entries one level down, arrays entry by entry), for decorative read-outs that must not render on every tick.
  `prev` is the last snapshot, so a trail is carried through it. With `fps: true` a `requestAnimationFrame` loop
  counts frames and `fps` is the rate since the last read (`frameRate`). `createSampler(options)`, once at module
  level, is one shared sampler: `<SampleProvider sampler store?>` reads its `store` (or the store in context) and
  every `useSample(sampler)` under it gets the same snapshot (`initial` outside it).
- **The whole state, paced.** A screen that reads much of the state would render on every tick if it selected all
  of it. `usePacedState(store, { idleMs?, inputMs?, now? })` (`useGameView()` from `createRuntimeHooks`, which takes
  the same options as `{ view }`) is the whole state handed on at once for `inputMs` (500) after a press, a key or a
  click, so the player's own doing is never late; every `idleMs` (200) at most while the game runs by itself; and
  not at all while the tab is hidden (it catches up as it shows). Every reader of a store shares one view
  (`pacedView(store)`: one subscription, one timer, the options of the first call); `createPacedView(store,
  options)` makes one of its own, a `{ get, subscribe }` for `useSyncExternalStore`. A figure that must move every
  tick is read with a narrow `useGameState` selector, and a decorative one with `useSampled`.
- **News and keys.** `useNews(log, onLine)` calls `onLine` for each line a journal gains, in order: nothing is news on
  mount, and a log replaced whole (an import, a fresh profile) calls nothing. `useHotkeys(keys, { enabled })` binds
  one `keydown` listener on `window` and looks the handler up by `event.key.toLowerCase()`. It ignores ctrl, meta
  or alt, and typing in an input, a textarea, a select or content-editable text. A held key repeats the call;
  `event.repeat` is the handler's to read.
