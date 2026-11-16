# Add a generator

A generator is a feature whose steps make money: a derived rate in `rates`, income in `produce`, and a separate,
capped and discounted payout for time the tab was closed.

Example: [`examples/add-a-generator.ts`](examples/add-a-generator.ts) (`bun docs/examples/add-a-generator.ts`).

- A step is a function (both passes) or `{ pass: "tick" | "catchUp", run }`. In a catch-up `ctx.dtMs` is the gap since
  `lastSeen`; `catchUp(elapsed, rate, cap)` turns it into credited time (`creditedMs`).
- Buying is an action that debits inside one recipe, so a failed purchase changes nothing. Return `true` when it went
  through.
- `moves(state)` lists what a player could do now. The store never calls it; the sim's auto-player does (see
  [persona](persona.md)).
- `reset` decides what a prestige run reset does to the feature: `"run"` (default), `"never"`, `{ keep }` or a function.
