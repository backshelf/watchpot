import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  D,
  defineGame,
  deserialize,
  feature,
  type Migration,
  oldestReadable,
  ZERO,
} from "watchpot/core";
import { fixtureSave, freshStore } from "watchpot/test";

type Saved = Record<string, unknown>;

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
  const { prestige, ...rest } = saved as Saved;
  return { ...rest, ascension: prestige };
};
/** Version 3 (the feature's step, it sees only its own data): `owned` is now `count`. */
const countOwned: Migration = (saved) => {
  const { owned, ...rest } = saved as Saved;
  return { ...rest, count: owned };
};

const ascension = feature({ key: "ascension", initial: () => ({ runs: 0, shards: ZERO }), reset: "never" });
const generator = feature({ key: "generator", initial: () => ({ count: 1 }), migrations: { 3: countOwned } });

/** Steps are keyed by the version they PRODUCE. `defineGame` refuses a gap between the oldest step and `version`. */
export const v3 = defineGame({
  id: "mig",
  save: { key: "mig.save", version: 3, migrations: { 2: renameLayer } },
  features: [generator, ascension],
});

/** Keep the old game's save as a permanent fixture (`test/fixtures/save-v1.json`); every later build must load it. */
export const SAVE_V1 = fixtureSave(v1, (store) => {
  store.setState((s) => {
    s.generator.owned = 5;
    s.prestige.runs = 2;
    s.prestige.shards = D(30);
  });
});

if (import.meta.main) {
  console.log("oldest readable:", oldestReadable(v3));
  const { store, backend } = freshStore(v3, { save: SAVE_V1, catchUp: false });
  const s = store.getState();
  console.log(
    "count:",
    s.generator.count,
    "runs:",
    s.ascension.runs,
    "shards:",
    s.ascension.shards.toString(),
  );
  const written = deserialize(backend.getItem("mig.save") ?? "") as { version: number };
  console.log("written back at version", written.version); // the migrated save is saved at once
  createIdleStore(v3, { storage: createGameStorage(createMemoryBackend()), now: () => 0 }); // a fresh profile also builds
}
