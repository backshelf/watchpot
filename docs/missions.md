## Missions

Timed tasks in slots: send something away, collect when it is back (an expedition, a delivery, a research job). A
mission's cost is taken at the start through the game's `pay` hook, and its reward is rolled at the start too, on the
feature's own saved rng, and stored with the entry: a reload cannot reroll it, and a screen can show it before it
lands. Missions run on game time, so they finish during an absence.

```ts
import {
  type Decimal,
  defineGame,
  HOUR_MS,
  MINUTE_MS,
  missions,
  pickWeighted,
  type RngState,
} from "watchpot/core";
import { wallet } from "./add-a-currency";
import { ODDS, type Rarity, TOY } from "./vocab";

type State = { wallet: { gold: Decimal; gems: Decimal } };
type Reward = { gems: number; rarity: Rarity };
const RARITIES: readonly Rarity[] = ["common", "rare", "epic"];

/** A rarity drawn from this start's stream: the reward is fixed at the start, so a reload cannot reroll it. */
const roll =
  (gems: number) =>
  (_s: State, rng: RngState): Reward => {
    const [i] = pickWeighted(
      rng,
      RARITIES.map((r) => ODDS[r]),
    );
    return { gems, rarity: RARITIES[i] ?? "common" };
  };

/** Two slots (three at 100 gems); a short trip, a long one that costs gold, and one that opens later. */
export const trips = missions({
  key: "trips",
  slots: (s: State) => (s.wallet.gems.gte(100) ? 3 : 2),
  list: [
    { id: "scout", durationMs: () => 5 * MINUTE_MS, reward: roll(1) },
    { id: "voyage", durationMs: () => 4 * HOUR_MS, cost: { gold: 500 }, reward: roll(25) },
    { id: "deep", durationMs: () => 12 * HOUR_MS, available: (s) => s.wallet.gems.gte(50), reward: roll(80) },
  ],
  pay: (d, m) => (m.cost ? wallet.debit(d, "gold", m.cost.gold) : true), // writes nothing when it refuses
  onClaim: (d, reward) => wallet.credit(d, "gems", reward.gems),
});

export const game = defineGame({
  id: "trips",
  save: { key: "trips.save", version: 1 },
  features: [wallet, trips],
  vocab: TOY,
});
// store.getState().trips.start("scout") → null, or "unknown" | "unavailable" | "no-slot" | "cannot-pay"
// store.getState().trips.claim(entry.id) · .cancel(entry.id) · missionLeftMs(entry, store.getState().gameNow())
```

- **`missions({ key, slots, list, pay?, onClaim?, reset? })`** saves `{ active, done, rng, serial }` under `key` and
  adds no step: an entry is back once game time passes its `endsAt`, tab open or not. `slots(state)` is read at each
  start, so a slot the game takes away never cancels what is under way. A prestige reset clears the entries unless
  `reset` says otherwise.
- **`MissionDef<G, R, X>`**: `id`, `durationMs(state)` (read at the start), `available?(state)`, `cost?: X` (the
  game's own shape, which `pay(draft, mission)` takes; `pay` is not called for a mission without one and must write
  nothing when it refuses) and `reward(state, rng) → R`. `rng` is a stream of its own for this start, hashed from
  the saved one, which then moves on: two starts never share draws, and a seeded store rolls the same. `R` is saved:
  plain data or Decimals.
- **Actions:** `start(missionId)` returns null or why not: `unknown`, `unavailable`, `no-slot`, `cannot-pay`.
  `claim(activeId)` only once the entry is back: it frees the slot, counts `done`, and runs `onClaim(draft, reward,
  mission)` in its recipe. `cancel(activeId)` frees the slot with no reward and no refund.
- **Reads:** `missionLeftMs(entry, now)` and `missionReady(entry, now)`; `.rules.slots`, `freeSlots` and
  `ready(state, now)`. Entry ids are `<mission>#<n>`.
- **Auto-player moves:** a free claim per entry (refused until it is back) and a free start per available mission
  while a slot is free.