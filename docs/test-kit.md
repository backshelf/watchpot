# The test kit

Most tests in a game are not about pacing. They check that a rule does what it says: a burner pays a bubble a second,
a reset keeps what it should, an old save still loads, a screen shows the right number. `watchpot/test` is the small
kit for those. It builds a store that is isolated (its own memory, no shared localStorage), already loaded (no
`await`), and on a clock the test moves by hand, so a test about an hour of play takes a millisecond and says the same
thing every time.

The pacing of a whole game is a different tool, the sim ([Plan and fit](plan-and-fit.md), [Pacing
contract](pacing-contract.md)).

Example: [`examples/test-kit.ts`](examples/test-kit.ts) (`bun docs/examples/test-kit.ts`). Simmer's pot and burners,
with the helpers a game's tests would keep:

```ts
/** A rule test: a fresh store, a minute of play, and what it made. */
export function aMinuteOnTheStove() {
  const { store, play } = freshStore(game, { seed: 1 });
  play(MINUTE_MS); // moves the clock a minute and ticks over it, at the new now
  return store.getState().pot.bubbles;
}

/** A fixture's author: plain calls on a store. The same play makes the same save every time. */
export const TWENTY_TAPS_AND_A_BURNER: FixturePlay<State> = (store, clock) => {
  for (let i = 0; i < 20; i++) store.getState().pot.tap();
  store.getState().pot.buyBurner();
  store.getState().tick(HOUR_MS, clock.advance(HOUR_MS));
};

/** Loads a save as a migration test does: no catch-up, so the test is about the save and not about time away. */
export function loadSave(text: string) {
  return freshStore(game, { save: text, catchUp: false }).store.getState().pot;
}
```

In a test file these read as one line each: `expect(aMinuteOnTheStove().toNumber()).toBe(60)`. Running the example
prints what they return:

```
a minute on the stove: 60 bubbles
same play, same save: true
the fixture loads: 1 burner, 7,210 bubbles
the test clock: an hour after T0 true | T0 is local noon: 12
async load, then a tap: 7,211 bubbles | the save was rewritten: true
```

## `freshStore`

**`freshStore(game, options?)`** builds a store over `game` and returns `{ store, backend, clock, play }`.

- **`store`**: an ordinary store, loaded, with every change written straight through to the backend (no write
  window to wait for).
- **`backend`**: where it saves, a memory backend by default (`dump()` shows everything in it). Pass it to a second
  `freshStore` to reload from it: that is a reload test.
- **`clock`**: the store's wall, a `testClock`. It does not move by itself.
- **`play(ms)`**: moves the clock forward `ms` and ticks the store over it, at the new now. One number, where the
  long form is `store.getState().tick(ms, clock.advance(ms))`.

Its options:

- **`at`**: where the clock starts, and the first catch-up's time. Default `T0`.
- **`now`**: a wall to follow instead of one frozen at `at` (`Date.now` under a pinned system time); the clock shifts
  it as you advance.
- **`backend`**: a backend to use instead of a fresh memory one. It must answer at once.
- **`save`**: a save to put under the key first, as a raw backend string or an export (what `exportProfile`,
  `fixtureSave` or a player's "copy save" gives).
- **`name`**: the save key. Default the game's.
- **`seed`**: seeds the profile's draws and every run reset's. Default entropy, so pass one for any test whose
  outcome depends on a draw (a crit, a spawn, a gacha pull).
- **`catchUp`**: whether to catch up at the clock's now once built, as a boot does. Default true.

## The clock

**`testClock(start)`** is a wall a test moves by hand: frozen at a number, or following a function (shifted by every
move). `now()` reads it, `set(at)` puts it at a time, `advance(ms)` moves it and returns the new `now()` (back, for a
negative `ms`).

**`T0`** is noon, local time, on a fixed day: the default start. Noon, so a rule about "today" (a daily streak, a
local-day reset) sees the middle of a day, and a test that adds a few hours does not cross midnight by accident.

## Saves made by play

**`fixtureSave(game, play, options?)`** builds a fresh store seeded `"fixture"`, runs your `play` on it, and returns
the export at the clock's now. The same play makes the same string every time. `play` is a **`FixturePlay<S>`**,
`(store, clock) => void`: plain calls on a store, which buy, tick and move the clock. It is a fixture's author, not the
sim's auto-player.

Keep one fixture per save version you have shipped, as a file in the repository, and never change it. Make it once
with `fixtureSave` on the old build, write the string to `test/fixtures/`, and test that every later build still
reads it with `freshStore(game, { save, catchUp: false })` (the example's `loadSave`). [Migration](migration.md) walks
through it. The string is the export envelope: a load reads it as it reads what the backend holds, but the two are
not the same text.

## The async path

**`createAsyncMemoryBackend(entries?)`** is a memory backend whose every call answers a turn later, like IndexedDB or
a native bridge. `peek(name)` reads the stored string at once, for an assertion, and `idle()` settles once every call
so far, and any write it led to, has answered. It is for testing the async load and write paths, and since
`freshStore` needs a backend that answers at once, build that store yourself:

```ts
/** The async load path: the store returns holding a new profile and loads after. */
export async function loadAsync(text: string) {
  const backend = createAsyncMemoryBackend({ [game.save.key]: text });
  const store = createIdleStore(game, {
    storage: createGameStorage(backend, { debounceMs: 0 }),
    now: () => T0,
  });
  await store.hydrated;
  store.getState().pot.tap();
  await backend.idle(); // every write it led to has answered
  return { bubbles: store.getState().pot.bubbles, rewritten: backend.peek(game.save.key) !== text };
}
```

## Screens

**`renderWith(store, ui)`** is Testing Library's `render` under the store's provider, kept across `rerender`: what a
screen test mounts with. It needs a DOM (happy-dom, registered in a `bunfig.toml` preload, as the game template does)
and `@testing-library/react`, an optional peer of `watchpot/test` that your game installs as a dev dependency.

```ts
/** A screen test (under `bun test`, with happy-dom registered): the component reads the store in context. */
const { useGameState } = createRuntimeHooks<Store>();
export function Burners() {
  const burners = useGameState((s) => s.pot.burners);
  return createElement("p", null, `${burners} burners`);
}
export const mountBurners = () => renderWith(freshStore(game).store, createElement(Burners));
```

Then find what it drew by its accessible name or text (`screen.getByText("0 burners")`). `bun test` runs on happy-dom:
there is no CSS and no layout, so assert what is there and what it is called, never where it sits.

## Things that bite

- **`play` and `tick` are one step.** `play(HOUR_MS)` ticks once over the hour, while the live clock slices time into
  steps of a second. A rule that reads its rate once per step (a gauge, anything that compounds) sees one coarse step.
  Loop over seconds when the test is about such a rule.
- **`tick` never reads the length from the clock.** `tick(dtMs, now)` takes the length of the tick from you; the
  second argument is optional and defaults to the store's clock. Move the clock first (`clock.advance`), or use
  `play`, which does both.
- **A memory save is not durable.** A `freshStore` writes every change to its backend, but `saveStatus(store)` reads
  `"unsaved"`, because a store over a memory backend reports itself non-durable. A test of the "saving" indicator
  builds its own store with `createGameStorage(backend, { durable: true })`.
- **Catching up on a fixture tests time away.** Without `catchUp: false`, loading a save stamped before the test
  clock's now catches up over the gap, and the test is about the absence instead of the save.
- **No seed, no repeat.** A store without `seed` draws from entropy; a test of anything random passes and fails by
  luck. `fixtureSave` seeds `"fixture"` for you; `freshStore` does not.
- **Hooks that touch effects deserve a `<StrictMode>` run.** React runs an extra cleanup after the first mount in
  development, and that is where a focus or subscription effect breaks. Render the test's tree inside `<StrictMode>`
  once.

## Where the guide teaches it

- [Chapter 12, Proving the pacing](guide/12-proving-the-pacing.md#the-test-kit): the test kit beside the sim, with
  Simmer's fixture and a save that must keep loading.
- [Chapter 13, From the template](guide/13-from-the-template.md): the template's first screen test, on `renderWith`.
- API: [`api/test/`](../api/test/).
