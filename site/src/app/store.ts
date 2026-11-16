// The one store this page runs: the toy game on the engine's store, saved in this browser. `now` here is the only
// wall-clock read the game makes; the engine itself never reads one.
import { createGameStorage, createIdleStore, createMemoryBackend, localStorageBackend } from "watchpot/core";
import { createRuntimeHooks } from "watchpot/hooks";
import { toy } from "../game/toy";

export const store = createIdleStore(toy, {
  storage: createGameStorage(localStorageBackend() ?? createMemoryBackend()),
  now: () => Date.now(),
});

export type GameStore = typeof store;

export const { useGameStore, useGameState, useGameView } = createRuntimeHooks<GameStore>();
