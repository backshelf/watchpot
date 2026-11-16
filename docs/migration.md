# A save migration

When a saved shape changes, bump `save.version` and add a step keyed by the version it produces (`3` takes a save from
2 to 3). The game's steps see the whole save; a feature's `migrations` see only its own data.

Example: [`examples/migration.ts`](examples/migration.ts) (`bun docs/examples/migration.ts`).

- Steps run one version at a time; at each, the game's step then the features' in feature order. The result is
  written back at once at the current version.
- Read the saved shape with `savedRecord(saved)`: it gives the object as a loose record (an empty one for anything
  else), with its Decimals already revived, so a step needs no cast. A slice inside reads the same way,
  `savedRecord(old.wallet)`.
- A feature's step is not called when the save has no slice for that feature. The merge gives the slice its
  defaults, so a step only ever changes data that is there; it never has to build a slice from nothing.
- `defineGame` refuses a gap between the oldest step and `save.version`. `oldestReadable(game)` is the oldest save it
  reads. An older save no step reaches, or one whose step throws or returns something that is not a state, is copied
  to `<key>.kept` and a fresh profile starts; the console names the kept key, and `saveSetAside(store)` says why
  (`"old-version"` or `"migration-failed"`). A newer save blocks writes (`saveBlockedBy(store)` is `"newer"`).
- A saved key the build no longer knows is dropped; a feature's `merge(merged, fresh)` reconciles one level of it.

## Pinning a released shape

Every save a player holds must keep loading, so pin each version you ship with a committed file:

1. When a version ships, make its save by play with `fixtureSave(game, play)` (seeded, so the same play makes the
   same string) and write it to `test/fixtures/save-v<N>.json`. Commit the file and never regenerate it: it stands
   for a save already out in the world.
2. In a test, load the file into the current build with `freshStore(game, { save, catchUp: false })` and assert that
   `saveSetAside(store)` is null and the figures you care about came through.

```ts
/** Once, when version 1 ships: write its save to the file you commit, `test/fixtures/save-v1.json`. */
export const writeFixture = (path: string) => Bun.write(path, SAVE_V1);

/**
 * Every later build: load the committed file. A test asserts that nothing was set aside and the figures came through.
 */
export function loadFixture(text: string) {
  const { store, backend } = freshStore(v3, { save: text, catchUp: false });
  return { store, backend, setAside: saveSetAside(store) };
}
```

`catchUp: false` keeps the test clock from paying the time between the save and now, so the figures are the ones the
play left.
