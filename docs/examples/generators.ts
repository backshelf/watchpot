import { currencies, type Decimal, defineGame, generators, HOUR_MS } from "watchpot/core";
import { TOY } from "./vocab";

const wallet = currencies({ key: "wallet", vocab: TOY, start: { gold: 10 } });
type State = { wallet: { gems: Decimal } };

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
  mult: (s: State) => s.wallet.gems.div(100).add(1), // the game's own multiplier (its stat bus)
  automated: (s, def) => def.id === "press" && s.wallet.gems.gte(1),
  away: () => ({ rate: 0.5, capMs: 8 * HOUR_MS }),
});

export const game = defineGame({
  id: "buildings",
  save: { key: "buildings.save", version: 1 },
  features: [wallet, buildings],
  vocab: TOY,
});
// store.getState().buildings.buy("stall", 10) · .buyMax("press") · .buyNext("stall") · .run("press")
// buildings.rules.perSecond(state).gold · buildings.rules.untilMilestone(state, "stall")
