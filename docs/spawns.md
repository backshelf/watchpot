# Spawns

Random clickable arrivals (the usual random-arrival model): something appears after a random wait, lives a few
seconds, and pays one of a weighted table when caught; one left alone dies and is counted missed. The wait is at least
`minMs` and at most `maxMs`, and with a ramp the chance it comes rises steeply past the minimum, so most arrive late.
Every draw is on the kind's own saved stream, so a reload replays the same arrivals and outcomes. The stream starts
from the store's seed, the key and the kind alone, so a save from before the spawns existed, imported into a store with
the same seed, arrives as the run that carried on does.

```ts
import { MINUTE_MS, spawns } from "watchpot/core";

export const visitors = spawns({
  key: "visitors",
  kinds: [
    {
      id: "spark",
      wait: { minMs: 5 * MINUTE_MS, maxMs: 15 * MINUTE_MS, ramp: { power: 5, stepMs: 1000 / 30 } },
      lifeMs: 13_000,
      outcomes: [
        { id: "windfall", weight: 50 },
        { id: "rush", weight: 45 },
        { id: "gem", weight: 5, noRepeat: true, when: (s: State) => s.wallet.gold.gte(1e6) },
      ],
    },
  ],
  onCatch: (draft: State, outcome) => {
    if (outcome === "windfall") wallet.credit(draft, "gold", draft.mine.perSecond.mul(900));
  },
});
// s.visitors.kinds.spark.live → null or { id, bornAt, diesAt }; store.getState().visitors.catch("spark")
```

Example: [`examples/spawns.ts`](examples/spawns.ts).

- **The wait** (`SpawnWait` `{ minMs, maxMs, ramp? }`): uniform between the two without a ramp. With `ramp: { power,
  stepMs }`, past `minMs` every `stepMs` it arrives with chance `u^power`, `u = (t - minMs) / (maxMs - minMs)`, and at
  `maxMs` for sure. `drawSpawnWait(rng, wait)` samples that in one draw by inverse transform: with `e = -ln(r)`, `u =
  ((power + 1) × e × stepMs / (maxMs - minMs))^(1 / (power + 1))`, capped at 1. `wait` and `lifeMs` may be functions of
  the game state (upgrades that bring them sooner or keep them longer).
- **Outcomes** (`{ id, weight, when?, noRepeat? }`): `drawOutcome(rng, outcomes, state, last)` picks by weight among
  those whose `when(state)` holds and that are not a `noRepeat` repeat of the last catch; null when none is open (then
  a catch is refused, so a table should leave one open). `drawAt: "birth"` draws at arrival instead and shows it on
  `live.outcome`, for a look that tells the player what it is.
- **`advanceSpawn(state, now, timing)`** is the kernel, pure: the live one dies at `diesAt` (missed), the next arrives
  at `nextAt`, its wait counted from the moment the last died or was caught, as often as fit before `now`, leaving at
  most one live. It walks `SPAWN_WALK_LIMIT` (10,000) arrivals in one pass at most, then starts the wait over.
- **`spawns({ key, kinds, onCatch?, reset? })`** saves `{ kinds: { [id]: { nextAt, live, caught, missed, born, last,
  rng } } }`. Its step `<key>.sync.arrive` brings every kind up to the pass's end on game time; over a catch-up the
  arrivals in the gap are counted missed, never paid. A kind's `active(state)` false holds it (nothing arrives; the
  wait starts over once it holds). `catch(kind)` returns the outcome id or null and runs `onCatch(draft, outcome, now,
  kind)` in the same recipe. A run reset clears what is live and starts the waits over, and keeps the counts and
  streams, unless `reset` says otherwise.
- **Sim:** a free move per live arrival, worth the kind's `worth(state)` (default 1): the auto-player catches whatever
  is live at a look, so a look cadence under `lifeMs` misses none.
