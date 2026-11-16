import {
  D,
  defineGame,
  deserialize,
  feature,
  type Migration,
  oldestReadable,
  savedRecord,
  saveSetAside,
  ZERO,
} from "watchpot/core";
import { fixtureSave, freshStore } from "watchpot/test";

/** Version 1: the layer is called `prestige` and the counter `owned`. */
const prestigeV1 = feature({ key: "prestige", initial: () => ({ runs: 0, shards: ZERO }), reset: "never" });
const generatorV1 = feature({ key: "generator", initial: () => ({ owned: 1 }) });
const v1 = defineGame({
  id: "mig",
  save: { key: "mig.save", version: 1 },
  features: [generatorV1, prestigeV1],
});

/** Version 2 (the game's step, it sees the whole save): the layer is renamed `ascension`. */
const renameLayer: Migration = (saved) => {
  const { prestige, ...rest } = savedRecord(saved);
  return { ...rest, ascension: prestige };
};
/**
 * Version 3 (the feature's step, it sees only its own data): `owned` is now `count`. `savedRecord` reads the saved
 * shape loosely, with no cast. The step is never called for a save with no `generator` slice: the merge gives that
 * slice its defaults, so the step need not build one from nothing.
 */
const countOwned: Migration = (saved) => {
  const { owned, ...rest } = savedRecord(saved);
  return { ...rest, count: owned ?? 1 };
};

const ascension = feature({ key: "ascension", initial: () => ({ runs: 0, shards: ZERO }), reset: "never" });
const generator = feature({ key: "generator", initial: () => ({ count: 1 }), migrations: { 3: countOwned } });

/** Steps are keyed by the version they PRODUCE. `defineGame` refuses a gap between the oldest step and `version`. */
export const v3 = defineGame({
  id: "mig",
  save: { key: "mig.save", version: 3, migrations: { 2: renameLayer } },
  features: [generator, ascension],
});

/** The old game's save, made by play: the same string every time, so it can be committed. */
export const SAVE_V1 = fixtureSave(v1, (store) => {
  store.setState((s) => {
    s.generator.owned = 5;
    s.prestige.runs = 2;
    s.prestige.shards = D(30);
  });
});

/** Once, when version 1 ships: write its save to the file you commit, `test/fixtures/save-v1.json`. */
export const writeFixture = (path: string) => Bun.write(path, SAVE_V1);

/**
 * Every later build: load the committed file. A test asserts that nothing was set aside and the figures came through.
 */
export function loadFixture(text: string) {
  const { store, backend } = freshStore(v3, { save: text, catchUp: false });
  return { store, backend, setAside: saveSetAside(store) };
}

if (import.meta.main) {
  console.log("oldest readable:", oldestReadable(v3));
  const { store, backend, setAside } = loadFixture(SAVE_V1);
  const s = store.getState();
  console.log(
    "set aside:",
    setAside,
    "count:",
    s.generator.count,
    "runs:",
    s.ascension.runs,
    "shards:",
    s.ascension.shards.toString(),
  );
  const written = deserialize(backend.getItem("mig.save") ?? "") as { version: number };
  console.log("written back at version", written.version); // the migrated save is saved at once
}
