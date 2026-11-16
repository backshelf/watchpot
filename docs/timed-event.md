# A timed event with a board

An event is data (`EventDefinition`): a window, currencies that trickle back, trees, milestones, a shop and a pass.
The framework's functions are pure over that data; the game's events feature keeps the runtimes and calls them.

Example: [`examples/timed-event.ts`](examples/timed-event.ts).

- `resolveWindow(schedule, now, anchor)` over a fixed, repeating or rolling schedule; `freshRuntime(def, now)` starts a
  cycle; `regenEventCurrencies(def, runtime, now)` gives the trickle (whole periods, parked at the cap).
- `eventNodeRow(currency)` builds tree rows priced in one event currency. `dueMilestones`, `buyEventNode`,
  `buyEventShopItem` and the pass helpers return an `EventFailure` (`isEventFailure`) instead of throwing.
- A **board** is what one event keeps beyond its runtime (a dig's layer, a road's token). Make one `boardRegistry()`,
  have each event's folder `register(board)` as it loads, and read `registry.list(order)` and `composeBoards(...)` when
  the store is built, not while modules load, since boards and the store usually import each other.
- The board set types its recipes over the whole game state; the example casts the feature's `api` once.
