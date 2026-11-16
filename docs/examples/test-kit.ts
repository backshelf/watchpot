import { createElement } from "react";
import {
  costAt,
  createGameStorage,
  createIdleStore,
  defineGame,
  feature,
  fmt,
  HOUR_MS,
  type IdleStore,
  MINUTE_MS,
  ZERO,
} from "watchpot/core";
import { createRuntimeHooks } from "watchpot/hooks";
import {
  createAsyncMemoryBackend,
  type FixturePlay,
  fixtureSave,
  freshStore,
  renderWith,
  T0,
  testClock,
} from "watchpot/test";

// ---- the game under test: Simmer's pot and its burners

export const BURNER_COST = { base: 10, growth: 1.15 } as const;

export const pot = feature({
  key: "pot",
  initial: () => ({ bubbles: ZERO, burners: 0 }),
  actions: (api) => ({
    tap: () =>
      api.set((d) => {
        d.pot.bubbles = d.pot.bubbles.add(1);
      }),
    buyBurner: () =>
      api.set((d) => {
        const price = costAt(BURNER_COST, d.pot.burners);
        if (d.pot.bubbles.lt(price)) return false;
        d.pot.bubbles = d.pot.bubbles.sub(price);
        d.pot.burners += 1;
        return true;
      }),
  }),
  steps: {
    produce: {
      simmer: (d, ctx) => {
        d.pot.bubbles = d.pot.bubbles.add(((1 + d.pot.burners) * ctx.dtMs) / 1000);
      },
    },
  },
});

export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  features: [pot],
});

// ---- the kit

// The game's store and state types, read off a store the kit would make (the function is never called).
const storeOf = () => freshStore(game).store;
type Store = ReturnType<typeof storeOf>;
type State = Store extends IdleStore<infer S extends object> ? S : never;

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

/** A screen test (under `bun test`, with happy-dom registered): the component reads the store in context. */
const { useGameState } = createRuntimeHooks<Store>();
export function Burners() {
  const burners = useGameState((s) => s.pot.burners);
  return createElement("p", null, `${burners} burners`);
}
export const mountBurners = () => renderWith(freshStore(game).store, createElement(Burners));

if (import.meta.main) {
  console.log("a minute on the stove:", fmt(aMinuteOnTheStove()).text, "bubbles");

  const save = fixtureSave(game, TWENTY_TAPS_AND_A_BURNER);
  console.log("same play, same save:", save === fixtureSave(game, TWENTY_TAPS_AND_A_BURNER));
  const loaded = loadSave(save);
  console.log("the fixture loads:", loaded.burners, "burner,", fmt(loaded.bubbles).text, "bubbles");

  const clock = testClock(T0);
  clock.advance(HOUR_MS);
  console.log(
    "the test clock: an hour after T0",
    clock.now() - T0 === HOUR_MS,
    "| T0 is local noon:",
    new Date(T0).getHours(),
  );

  const { bubbles, rewritten } = await loadAsync(save);
  console.log("async load, then a tap:", fmt(bubbles).text, "bubbles | the save was rewritten:", rewritten);
}
