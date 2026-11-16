import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  defineGame,
  lifetimeMultiplier,
  powerGain,
  prestige,
} from "watchpot/core";
import { wallet } from "./add-a-currency";
import { generator } from "./add-a-generator";
import { TOY } from "./vocab";

/**
 * A layer above the run. `prestige` owns `runs`, the layer's currency and its lifetime total (never reset) and one
 * action that pays `gain` and resets the run. `gain` here is `floor(1 x (gold / 1000) ^ 0.5)`.
 */
export const ascension = prestige({
  key: "ascension",
  action: "ascend", // the reset action's name; default "reset"
  reach: [wallet],
  initial: () => ({ lastGain: "0" }), // the layer's own fields
  gain: (s) => powerGain(s.wallet.goldThisRun, { k: 1, exp: 0.5, per: 1000 }),
  afterReset: (s, { gain }) => {
    s.ascension.lastGain = gain.toString();
  },
});

export const game = defineGame({
  id: "prestige",
  save: { key: "prestige.save", version: 1 },
  features: [wallet, generator, ascension],
  vocab: TOY,
});

/** What the layer's currency is worth to the run: `1 + k x lifetime ^ exp`, exactly 1 with nothing earned. */
export const bonus = (shards: Parameters<typeof lifetimeMultiplier>[0]) =>
  lifetimeMultiplier(shards, { k: 0.1, exp: 1 });

if (import.meta.main) {
  const store = createIdleStore(game, {
    storage: createGameStorage(createMemoryBackend(), { debounceMs: 0 }),
    now: () => Date.UTC(2026, 0, 1),
  });
  store.getState().wallet.credit("gold", 40_000);
  console.log("ascend:", store.getState().ascension.ascend()); // true: the gain is above zero
  const a = store.getState().ascension;
  console.log(
    "runs:",
    a.runs,
    "gain:",
    a.lastGain,
    "gold after reset:",
    store.getState().wallet.gold.toString(),
  );
  console.log("bonus:", bonus(a.lifetime).toString());
}
