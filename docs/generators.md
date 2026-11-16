# Generators

The building list every idle game has: buy N of a thing, each one makes a currency a second, and the price climbs on a
cost curve (`cost.ts`, so bulk buys are closed-form). A generator pays a steady `rate` per one owned, or runs a timed
`cycle` that pays `cycle.pays × owned` each time it completes: started by hand with `run(id)`, or restarting itself
once the game's `automated` says so. Milestones on the owned count multiply the output or speed the cycle.

```ts
import { type BuffsState, buffActive, currencies, type Decimal, defineGame, generators, HOUR_MS } from "watchpot/core";
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
// buildings.select.perSecond(state).gold · buildings.select.untilMilestone(state, "stall")
```

Example: [`examples/generators.ts`](examples/generators.ts) (`bun docs/examples/generators.ts` prints a buy row per
mode).

- **`generators({ key, wallet, list, mult?, global?, milestones?, open?, automated?, away?, reset? })`** saves
  `{ owned, progress, running }` under `key`; `perSecond` (per currency, Decimals) is transient, worked out in
  `<key>.rates.perSecond` so screens and later features read it. Production is `<key>.produce.make`: a live tick
  pays its `dtMs`, a catch-up pays what `offlineCredit` credits through `away(state) → { rate, capMs? }` (default:
  all of it). `free` ones are owned again after a run reset.
- **`GeneratorDef`**: `id`, `cost: CostCurve`, `pays` (bought with), `makes`, then `rate` (per one owned, per second)
  or `cycle: { ms, pays }`, plus `milestones?: Threshold<{ mult?, speed? }>[]` on the owned count and `free?`.
  `global` milestones apply to every generator once the lowest owned count across the list reaches them. `mult(state,
  def)` is the game's multiplier per generator; a `speed` multiplies a rate and divides a cycle.
  `milestones(state, def)` is the game's gate on them: while it is false, that generator's own milestones and the
  global ones give nothing.
- **Cycles.** `cyclesIn(progress, dtMs, cycleMs, once?)` is the kernel: `floor((progress + dt) / cycleMs)` completed
  and the rest carried, so one long step pays exactly what many short ones do, and a cycle shorter than the tick pays
  its average rate with the remainder carried. A hand cycle (not `automated`) completes once and stops until the next
  `run(id)`. An automated one runs without `run`. `perSecond` counts automated cycles at their average and hand
  cycles not at all.
- **Actions:** `buy(id, count = 1)` (all or nothing), `buyMax(id, limit?)` (returns how many), `buyNext(id)` (exactly
  what reaches the next milestone; false past the last), `run(id)`.
- **`draft`** helpers on the feature, named like the actions, for a recipe or a step (an autobuyer): `draft.buy(draft,
  id, count?)`, `draft.buyMax(draft, id, limit?)`, `draft.buyNext(draft, id)` (each returning how many it bought) and
  `draft.run(draft, id)`.
- **`select`** (questions over state): `price(state, id, count?)`, `affordable`, `owned`, `open`, `boost` (folded
  `{ mult, speed }`), `cycleMs`, `cyclePays`, `automated`, `rate(state, id)` (all owned, a second), `untilMilestone`
  (null past the last), `perSecond(state)` and `away(state)`, the absence rate the catch-up credits (the definition's
  `away`, or `{ rate: 1 }`). **`def`** holds the `list` and `generator(id)`.
- **`reach`** names the features the callbacks read, as on `feature`; their state is then typed with no annotation (the
  wallet is reached already): `reach: [boosts]`, then `mult: (s) => s.boosts…`.
- **A buy row** for a screen: `select.row(state, id, mode)` with `mode` a count, `"max"` or `"next"` (`watchpot/ui`'s
  `BuyMode`) gives `{ count, price, canBuy }`. `count` is at least 1, so the row always shows a price; `canBuy` is
  false when the generator is closed, the balance falls short, or `"next"` is past the last milestone.
- **Auto-player moves:** one purchase per open generator, valued at the income one more adds a second (a cycle by its
  average), and a free `run` per idle hand cycle.
- **Every callback gets the moment.** `mult`, `open`, `automated`, `milestones` and `away` are each handed a last
  argument `{ now }` in game time, so a buff can multiply or open where it applies (`buffActive(s.boosts, "rush",
  now)`, as above). Steps pass the pass's `now`; `select` and the draft helpers take an optional trailing `now`, which
  defaults to the state's `gameNow()`; a screen that reads a buff passes the `now` it renders at.
- **A save step** for the list (a renamed id, a field added): `withMigrations(generators({ … }), { 2: step })`.
