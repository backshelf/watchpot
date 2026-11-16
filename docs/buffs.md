# Buffs

Timed effects: a rush that multiplies income by seven for 77 seconds (the usual timed-multiplier model). A buff runs from the
game time it started to its `until`; starting it again follows its stacking rule. Expiry runs early in every pass on
game time, so a buff runs out during an absence too, and the income step of that pass asks how much of the gap it
covered.

```ts
import { buffs, type Effect, feature, overlapMs } from "watchpot/core";

export const boosts = buffs<"boosts", Effect>({
  key: "boosts",
  list: [
    { id: "rush", durationMs: 77_000, stack: "refresh", effects: () => [{ stat: "speed", mult: 7 }] },
    { id: "focus", durationMs: 30_000, stack: "stack", maxStacks: 5, effects: (stacks) => [{ stat: "speed", add: stacks }] },
    { id: "cooldown", durationMs: 10_000, stack: "ignore" }, // a timer: no effects
  ],
});

export const mine = feature({
  key: "mine",
  reach: [boosts],
  initial: () => ({ gold: 0 }),
  steps: {
    produce: {
      income: (d, ctx) => {
        const rushed = overlapMs(d.boosts, "rush", ctx.now - ctx.dtMs, ctx.now); // ×7 for that part
        d.mine.gold += (ctx.dtMs + 6 * rushed) / 1000;
      },
    },
  },
});
// store.getState().boosts.start("rush"); busOf(boosts.contributions(s.boosts, now))
```

Example: [`examples/buffs.ts`](examples/buffs.ts).

- **The kernel** is pure over `BuffsState` = `{ active: { [id]: { since, until, stacks, strength? } }, ended: { [id]:
  { since, until } } }`: `startBuff(state, rule, now, { durationMs?, strength? })`, `endBuff(state, id, now)` and
  `expireBuffs(state, now)` → `{ state, ended }` (a buff whose `until` is at or before `now` moves to `ended`, which
  keeps each buff's last run). Each returns `state` itself when nothing changed.
- **Stacking rules** (`BuffRule` `{ id, durationMs, stack, maxStacks? }`), for a start while it runs: `refresh`
  restarts the clock, `extend` adds the duration to it, `stack` adds a stack up to `maxStacks` and restarts the one
  shared clock, `ignore` leaves it be. A buff not running starts at one stack whatever its rule. A new `strength`
  replaces the old.
- **Readers:** `buffActive`, `buffLeftMs`, `buffStacks` (each at `now`) and `overlapMs(state, id, from, to)`, the part
  of the stretch the buff's window (running or ended) covered.
- **`buffs({ key, list, onEnd?, reset? })`** saves `BuffsState`; `BuffDef<E>` adds an optional
  `effects(stacks, strength)` to the rule. Its step `<key>.sync.expire` runs before `rates` and `produce`;
  `onEnd(draft, id, now)` runs for each buff it ends. Actions `start(id, { durationMs?, strength? })` (false for an unknown id or an ignored start) and `end(id)`;
  on the feature itself, `start(draft, id, now, start?)` and `end(draft, id, now)` do the same inside a recipe (a
  spawn's `onCatch`, an event's handler).
  `.contributions(state, now)` gives every running buff's effects sourced `<key>:<id>`, for `busOf`. A run reset ends
  every buff unless `reset` says otherwise.

## A buff as a timer

`effects` is optional. A buff without it is a named clock and nothing more: it starts by its stacking rule, runs out
on game time (during an absence too), keeps the window it covered, and adds nothing to `contributions`. Read it with
`buffActive(state, id, now)` and `buffLeftMs(state, id, now)` and decide in your own code what it means: a cooldown on
a button, a "hot run" your own stat fold multiplies by, a window in which a spawn pays double. The `cooldown` above is
one. Reach for this when the strength depends on something `effects(stacks, strength)` cannot see, such as another
stat. [Showcase 3](showcases.md#3-a-buff-with-no-effect) shows a real game doing it.
