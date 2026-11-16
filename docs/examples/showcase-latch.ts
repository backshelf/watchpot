import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  type Decimal,
  defineAchievements,
  defineGame,
  definePrestige,
  powerGain,
} from "watchpot/core";
import { wallet } from "./add-a-currency";
import { TOY } from "./vocab";

type State = { wallet: { gold: Decimal }; rebirth: { runs: number } };

/**
 * The doors of the game, as achievements nobody sees on a wall: each opens the first pass its condition holds and,
 * because an achievement is never un-earned, stays open after a reset wipes what opened it.
 */
export const doors = defineAchievements({
  key: "doors",
  columns: 2,
  list: [
    { id: "market", name: "The market", line: "Hold 100 gold.", when: (s: State) => s.wallet.gold.gte(100) },
    { id: "vault", name: "The vault", line: "Start over once.", when: (s: State) => s.rebirth.runs >= 1 },
  ],
});

/** Whether a door is open: the screens ask this, never the condition. */
export const isOpen = (s: { doors: { earned: Record<string, number> } }, id: string): boolean =>
  s.doors.earned[id] !== undefined;

/** A reset that pays for the gold held and takes it all back. */
export const rebirth = definePrestige({
  key: "rebirth",
  action: "rebirth",
  reach: [wallet],
  gain: (s) => powerGain(s.wallet.gold, { k: 1, exp: 0.5, per: 100 }),
});

export const game = defineGame({
  id: "doors",
  save: { key: "doors.save", version: 1 },
  features: [wallet, rebirth, doors],
  vocab: TOY,
});

if (import.meta.main) {
  let wall = Date.UTC(2026, 0, 1);
  const store = createIdleStore(game, {
    storage: createGameStorage(createMemoryBackend(), { debounceMs: 0 }),
    now: () => wall,
  });
  store.getState().wallet.credit("gold", 500);
  wall += 1000;
  store.getState().tick(1000, wall); // the pass that checks the doors
  console.log("market open:", isOpen(store.getState(), "market")); // true
  store.getState().rebirth.rebirth(); // gold back to its start
  wall += 1000;
  store.getState().tick(1000, wall);
  const s = store.getState();
  console.log("gold:", s.wallet.gold.toString(), "market still open:", isOpen(s, "market")); // 30, true
  console.log("announce:", s.doors.fresh); // the queue a screen shows as "a door opened"
}
