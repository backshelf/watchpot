# Add a generator

A generator is a feature whose steps make money: a derived rate in `rates`, income in `produce`, and a separate,
capped and discounted payout for time the tab was closed.

Example: [`examples/add-a-generator.ts`](examples/add-a-generator.ts) (`bun docs/examples/add-a-generator.ts`).

- A step is a function (both passes) or `{ pass: "tick" | "catchUp", run }`. In a catch-up `ctx.dtMs` is the gap since
  `lastSeen`; `offlineCredit(elapsed, rate, cap)` turns it into credited time (`creditedMs`). A gap of up to
  `awayAfterMs` (5 s by default, a quick tab switch) never reaches the catch-up: the clock pays it as live ticks.
- Buying is an action that debits inside one recipe, so a failed purchase changes nothing. `api.set` returns what the
  recipe returns, so `api.set((s) => …)` hands back `true` when the purchase went through.
- `moves(state)` lists what a player could do now. The store never calls it; the sim's
  [auto-player](persona.md) does.
- `reset` decides what a run reset does to the feature: `"run"` (default), `"never"`, `{ keep }` or a function.
