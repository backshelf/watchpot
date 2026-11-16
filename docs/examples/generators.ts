import {
  type BuffsState,
  buffActive,
  createIdleStore,
  currencies,
  type Decimal,
  defineGame,
  generators,
  HOUR_MS,
} from "watchpot/core";
import { boosts } from "./buffs";
import { TOY } from "./vocab";

const wallet = currencies({ key: "wallet", vocab: TOY, start: { gold: 10 } });
type State = { wallet: { gems: Decimal }; boosts: BuffsState };

/** The rush buff (`buffs.ts`) multiplies every building by 7 while it runs. */
const rush = (s: State, now: number) => (buffActive(s.boosts, "rush", now) ? 7 : 1);

/** Three buildings: a steady earner, a timed cycle a manager automates, and one that makes gems. */
export const buildings = generators({
  key: "buildings",
  wallet,
  list: [
    {
      id: "stall",
      cost: { base: 10, growth: 1.15 },
      pays: "gold",
      makes: "gold",
      rate: 1, // per one owned, per second
      free: 1, // owned at the start of a run
      milestones: [{ at: 25, gives: { mult: 2 } }],
    },
    {
      id: "press",
      cost: { base: 100, growth: 1.2 },
      pays: "gold",
      makes: "gold",
      cycle: { ms: 6000, pays: 40 }, // 40 per one owned, each completed cycle
      milestones: [{ at: 25, gives: { speed: 2 } }], // halves the cycle
    },
    { id: "kiln", cost: { base: 5000, growth: 1.3 }, pays: "gold", makes: "gems", rate: 0.01 },
  ],
  global: [{ at: 10, gives: { mult: 3 } }], // once every building is at 10
  // The game's own multiplier. The last argument carries game time, so a buff can multiply right here.
  mult: (s: State, _def, { now }) => s.wallet.gems.div(100).add(1).mul(rush(s, now)),
  // The milestones count only once the player holds a gem: the game's rule, not the list's.
  milestones: (s) => s.wallet.gems.gte(1),
  automated: (s, def) => def.id === "press" && s.wallet.gems.gte(1),
  away: () => ({ rate: 0.5, capMs: 8 * HOUR_MS }),
});

export const game = defineGame({
  id: "buildings",
  save: { key: "buildings.save", version: 1 },
  features: [wallet, boosts, buildings],
  vocab: TOY,
});
// store.getState().buildings.buy("stall", 10) · .buyMax("press") · .buyNext("stall") · .run("press")
// buildings.rules.perSecond(state).gold · buildings.rules.untilMilestone(state, "stall")

if (import.meta.main) {
  const wall = Date.UTC(2026, 0, 1);
  const store = createIdleStore(game, { now: () => wall });
  store.getState().catchUp(wall);
  store.getState().wallet.credit("gold", 200);
  const s = store.getState();
  // One buy row per mode, for a screen: how many it buys, their price, and whether the player can.
  for (const mode of [1, 10, "max", "next"] as const) {
    const row = buildings.rules.row(s, "stall", mode);
    console.log(`stall ×${mode}:`, row.count, row.price.toFixed(0), row.canBuy);
  }
  console.log("away:", buildings.rules.away(s)); // what the catch-up credits of an absence
}
