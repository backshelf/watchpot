# A save migration

When a saved shape changes, bump `save.version` and add a step keyed by the version it produces (`3` takes a save from
2 to 3). The game's steps see the whole save; a feature's `migrations` see only its own data.

Example: [`examples/migration.ts`](examples/migration.ts) (`bun docs/examples/migration.ts`).

- Steps run one version at a time; at each, the game's step then the features' in feature order. The result is
  written back at once at the current version.
- `defineGame` refuses a gap between the oldest step and `save.version`. `oldestReadable(game)` is the oldest save it
  reads. An older save no step reaches is copied to `<key>.kept` and a fresh profile starts; a newer one blocks writes.
- Pin every released shape: make a fixture with `fixtureSave(game, persona)` per version and commit it as
  `save-v<N>.json`; test with `freshStore(game, { save, catchUp: false })`.
- A saved key the build no longer knows is dropped; a feature's `merge(merged, fresh)` reconciles one level of it.
