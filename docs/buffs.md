# Buffs

Timed effects: a rush that multiplies income by seven for 77 seconds (the usual timed-multiplier model). A buff runs from the
game time it started to its `until`; starting it again follows its stacking rule. Expiry runs early in every pass on
game time, so a buff runs out during an absence too, and the income step of that pass asks how much of the gap it
covered.

```ts
import { defineBuffs, type Effect, feature, defineStats } from "watchpot/core";

export const boosts = defineBuffs<"boosts", Effect<"speed">>({
  key: "boosts",
  list: [
    { id: "rush", durationMs: 77_000, stack: "refresh", effects: () => [{ stat: "speed", mul: 7 }] },
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
      income: {
        pass: "both",
        run: (d, ctx) => {
          const rushed = boosts.select.overlapMs(d, "rush", ctx.now - ctx.dtMs, ctx.now); // ×7 for that part
          d.mine.gold += (ctx.dtMs + 6 * rushed) / 1000;
        },
      },
    },
  },
});
// store.getState().boosts.start("rush"), and boosts.draft.start(d, "rush", now) inside a recipe

/** `s.stats.speed`: every buff still listed is running, since `sync.expire` ends the rest at the start of a pass. */
export const speed = defineStats({
  key: "stats",
  vocab: WORDS, // vocab({ currencies: ["gold"], stats: ["speed"] })
  reach: () => [boosts],
  stats: { speed: { base: 1 } },
  contributions: (s) => boosts.select.contributions(s, Number.NEGATIVE_INFINITY),
});
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
- **Readers** over a `BuffsState`: `buffActive`, `buffLeftMs`, `buffStacks` (each at `now`) and `overlapMs(state, id,
  from, to)`, the part of the stretch the buff's window (running or ended) covered. The feature has the same four
  state-first over the whole game, under `select`.
- **`defineBuffs({ key, list, onEnd?, reach?, reset? })`** saves `BuffsState`; `BuffDef<E>` adds an optional
  `effects(stacks, strength)` to the rule. Its step `<key>.sync.expire` runs before `rates` and `produce`;
  `onEnd(draft, id, now)` runs for each buff it ends, and sees the buffs' own slice and what `reach` names. Actions
  `start(id, { durationMs?, strength? })` (false for an unknown id or an ignored start) and `end(id)`. Beside them
  the feature carries three namespaces:
  - `boosts.select`: `active(s, id, now)`, `leftMs(s, id, now)`, `stacks(s, id, now)`, `overlapMs(s, id, from, to)`
    and `contributions(s, now)`, which gives every running buff's effects sourced `<key>:<id>`, for a `stats`
    feature's `contributions`. A stat reads no clock, so pass `Number.NEGATIVE_INFINITY` there: the expiry step has
    already ended every buff whose time is up. `s` is the game's state (or a draft of it), not the buffs' slice.
  - `boosts.def.list`: the buffs it was given.
  - `boosts.draft`: `start(d, id, now, start?)` and `end(d, id, now)`, the actions inside a recipe (a spawn's
    `onCatch`, an event's handler).

  A run reset ends every buff unless `reset` says otherwise.

## A buff as a timer

`effects` is optional. A buff without it is a named clock and nothing more: it starts by its stacking rule, runs out
on game time (during an absence too), keeps the window it covered, and adds nothing to `select.contributions`. Read it with
`boosts.select.active(state, id, now)` and `boosts.select.leftMs(state, id, now)` and decide in your own code what it means: a cooldown on
a button, a "hot run" a source of your stats reads in its `active`, a window in which a spawn pays double. The `cooldown` above is
one. Reach for this when the strength depends on something `effects(stacks, strength)` cannot see, such as another
stat. [Showcase 3](showcases.md#3-a-buff-with-no-effect) shows a real game doing it.
