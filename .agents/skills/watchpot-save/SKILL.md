---
name: watchpot-save
description: >
  Change what a watchpot idle game saves without losing players' progress: bump `save.version` and write a
  migration when a saved field is renamed, removed, retyped or moved, read a set-aside save, and choose a storage
  backend. Use when the user renames or restructures game state that has already shipped, asks why a save was reset
  or set aside, or wants saving to IndexedDB, a native bridge or another backend. Not for adding a brand-new field
  (that needs nothing) or for game logic (watchpot-features).
---

# watchpot-save

The store saves every feature's slice under the game's `save.key`, with `save.version` beside it. It saves on its
own (shortly after a change, and at once when the page is hidden), so a game never writes a save by hand. The full
rules are in `node_modules/watchpot/docs/core.md` under "Saves".

## Does this change need a migration?

- **Adding a field: no.** The loader fills a missing field from the feature's `initial`. A feature whose state nests
  more than one level deep fills deeper fields with `fillDeep` in its `merge`.
- **Renaming, removing, moving or retyping a saved field: yes.** Without a step, the old field is dropped and the
  new one starts fresh, so the player loses that progress.
- **Renaming a feature's `key`: yes,** at the game level (the slice lives under the key).
- **Fields in `transient`** are never saved; changing them needs nothing.

## Writing a migration

Bump `save.version` in `defineGame` and add a step keyed by the version it produces: step `3` takes a save at 2 to 3.

```ts
import { savedRecord } from "watchpot/core";

// In the feature: sees only its own slice, and its result becomes that slice.
migrations: {
  3: (saved) => {
    const old = savedRecord(saved);
    return { ...old, count: old.owned ?? 0 };
  },
},
```

- A feature's `migrations` see only that feature's slice. The game's `save.migrations` see the whole saved state:
  use those to move data between features or rename a feature's key.
- On load the store runs every step from the saved version up, one version at a time (at each version the game's
  step, then the features' in order), then writes the migrated save back at once.
- Steps never skip a version: `defineGame` refuses a gap between the oldest step and `save.version`.
- `savedRecord(saved)` reads an old shape loosely, without a cast. Decimals are already revived when a step runs.
- Keep old steps forever. A player can come back after many versions.

## When a save is set aside

The engine never throws a player's save away. A save that is too old for any step to reach, that a step throws on,
or that cannot be parsed is copied to `<key>.kept` and the game starts fresh. `saveSetAside(store)` says why
(`old-version`, `migration-failed` or `unreadable`), so the page can tell the player. A save from a newer build is
kept as it is, and the store writes nothing that session (`saveBlocked`).

To test a migration, export a save from the old build (the dev panel's save tab, `#dev`), load it in the new one,
and check the dev panel's state.

## Storage backends

`createGameStorage(localStorageBackend() ?? createMemoryBackend())` is the default in a new game. A backend that
answers asynchronously (IndexedDB, a native bridge) is an `AsyncStorageBackend`: the store starts on a new profile
and loads after, so `await store.hydrated` before letting the player act. Until then it writes nothing, so early
play can never overwrite the save.
