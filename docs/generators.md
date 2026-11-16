## Generators

The building list every idle game has: buy N of a thing, each one makes a currency a second, and the price climbs on a
cost curve (`cost.ts`, so bulk buys are closed-form). A generator pays a steady `rate` per one owned, or runs a timed
`cycle` that pays `cycle.pays × owned` each time it completes: started by hand with `run(id)`, or restarting itself
once the game's `automated` says so. Milestones on the owned count multiply the output or speed the cycle.

```ts
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
```

- **`generators({ key, wallet, list, mult?, global?, open?, automated?, away?, reset? })`** saves `{ owned, progress,
  running }` under `key`; `perSecond` (per currency, Decimals) is transient, worked out in `<key>.rates.perSecond` so
  screens and later features read it. Production is `<key>.produce.make`: a live tick pays its `dtMs`, a catch-up pays
  what `catchUp` credits through `away(state) → { rate, capMs? }` (default: all of it). `free` ones are owned again
  after a run reset.
- **`GeneratorDef`**: `id`, `cost: CostCurve`, `pays` (bought with), `makes`, then `rate` (per one owned, per second)
  or `cycle: { ms, pays }`, plus `milestones?: Threshold<{ mult?, speed? }>[]` on the owned count and `free?`.
  `global` milestones apply to every generator once the lowest owned count across the list reaches them. `mult(state,
  def)` is the game's multiplier per generator; a `speed` multiplies a rate and divides a cycle.
- **Cycles.** `cyclesIn(progress, dtMs, cycleMs, once?)` is the kernel: `floor((progress + dt) / cycleMs)` completed
  and the rest carried, so one long step pays exactly what many short ones do, and a cycle shorter than the tick pays
  its average rate with the remainder carried. A hand cycle (not `automated`) completes once and stops until the next
  `run(id)`. An automated one runs without `run`. `perSecond` counts automated cycles at their average and hand
  cycles not at all.
- **Actions:** `buy(id, count = 1)` (all or nothing), `buyMax(id, limit?)` (returns how many), `buyNext(id)` (exactly
  what reaches the next milestone; false past the last), `run(id)`.
- **Draft helpers** on the feature, for a recipe or a step (an autobuyer): `buy(draft, id, count?)` and
  `buyMax(draft, id, limit?)`, each returning how many it bought.
- **Rules (`.rules`):** `price(state, id, count?)`, `affordable`, `owned`, `open`, `boost` (folded `{ mult, speed }`),
  `cycleMs`, `cyclePays`, `automated`, `rate(state, id)` (all owned, a second), `untilMilestone` (null past the last)
  and `perSecond(state)`.
- **Auto-player moves:** one purchase per open generator, valued at the income one more adds a second (a cycle by its
  average), and a free `run` per idle hand cycle.
- **A multiplier that depends on the moment** (live play only, a timed lock, a boost that reads the clock): `mult`
  reads state alone, on a tick, over an absence and on a screen. Work the value out in a step of another feature
  earlier in the same phase, keep it as a transient field, and have `mult` read that; list that feature before the
  generators.
- **A save step** for the list (a renamed id, a field added): `withMigrations(generators({ … }), { 2: step })`.
