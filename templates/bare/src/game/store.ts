import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  type IdleStoreOptions,
  localStorageBackend,
} from "watchpot/core";
import { game } from "./game";

export { flushSave, saveBlocked, saveStatus } from "watchpot/core";

/**
 * The game's store. The app builds one at the root (`main.tsx`), saved to localStorage; a test builds its own
 * (`watchpot/test` › `freshStore`). `now` is the one wall-clock read.
 */
export function createGameStore(options: Partial<IdleStoreOptions> = {}) {
  return createIdleStore(game, {
    storage: createGameStorage(localStorageBackend() ?? createMemoryBackend()),
    ...options,
    now: options.now ?? (() => Date.now()),
  });
}

export type GameStore = ReturnType<typeof createGameStore>;
