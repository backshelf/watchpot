---
name: watchpot-features
description: >
  Add or change game logic in a watchpot idle game: a new feature with `defineFeature` (state, actions, tick steps,
  derived values, prestige reset, migrations), or a ready-made system from the engine (generators, upgrades,
  achievements, prestige layers, buffs and the rest). Use when the user asks for a new mechanic, currency, building,
  upgrade, unlock, reset layer or rule in a game built on watchpot, or when an action or a tick step misbehaves. Not
  for the page (React screens), the sound (watchpot-sound) or the save format (watchpot-save).
---

# watchpot-features

A watchpot game is a list of features passed to `defineGame`. Each feature owns one slice of the state and says how
it starts, what the player can do to it, what time does to it, and what a prestige reset does to it. The engine's
docs are in `node_modules/watchpot/docs/`; read the page for a system before writing one.

## First, look for a ready-made one

The engine ships most idle-game systems as `defineX` factories, each with a recipe page: currencies, generators,
dimensions, upgrades and trees, achievements, missions, challenges, levels and stages, prestige layers, buffs,
autobuyers, markets, crafting, allocation, gacha, spawns, records, streaks and more (`docs/README.md` lists them).
A factory brings its state, actions, steps, derived values and sim moves, typed. Hand-write a feature only for what
none of them covers, and then build it from the engine's helpers (`costAt`, `buyMax`, `D`, `offlineCredit`) rather
than from scratch.

## A feature, by hand

```ts
import { D, defineFeature, ZERO } from "watchpot/core";

export const pot = defineFeature({
  key: "pot",
  reach: [wallet], // the features this one reads or writes besides itself
  initial: () => ({ heat: 0, boiled: ZERO }),
  actions: (api) => ({
    stoke: () => api.set((s) => void (s.pot.heat = Math.min(1, s.pot.heat + 0.1))),
  }),
  steps: {
    produce: {
      boil: { pass: "tick", run: (s, ctx) => void (s.pot.boiled = s.pot.boiled.add(s.pot.heat * ctx.dtMs / 1000)) },
    },
  },
  reset: { keep: ["heat"] },
});
```

- **`key`** names the slice: the state is `s.pot`. It is also the save's key for it, so never rename one that has
  shipped without a migration (watchpot-save).
- **`reach`** lists every other feature this one touches. The types come from it: a feature that writes
  `s.wallet` without `wallet` in `reach` does not typecheck.
- **`actions`** change state only inside `api.set(recipe)`. The recipe edits a draft; the engine makes the next
  state from it. Never keep a reference to the draft after the recipe returns.
- **`steps`** are what time does, grouped by phase. The phases run in order every tick: `guard`, `sync`, `rates`,
  `produce`, `automate`, `settle`, `commit`, `after`. A step's `pass` is `"tick"` (live play, `ctx.dtMs` since the
  last tick) or `"catchUp"` (the gap since the player was last seen, once on load); a step with no `pass` runs in
  both. Put income in `produce`, things that buy on their own in `automate`, unlock checks in `settle`.
- **`derived`** values are computed from state and cached until what they read changes. Use them for anything shown
  on the page that is worked out (a rate, a price), not stored.
- **`reset`** is what a prestige reset does to the slice: `"run"` (back to `initial`), `{ keep: [...] }`, a function
  of the old and fresh slice, or `"never"`. A deeper reset layer uses `{ depth, rule }`.
- **`transient`** lists fields that are never saved (a UI flag, a timer that restarts).

Then add the feature to `defineGame({ features: [...] })`. A feature that is not listed is not in the game, and
the error says so.

## Rules that bite

- **Decimals.** Big numbers are `Decimal` (`D(10)`, `ZERO`). Compare with `.lt()`, `.gte()`, `.eq()`, never
  `<`, `>` or `===`, which compare objects and are silently wrong.
- **No wall clock.** Game logic never calls `Date.now()`: use `ctx.now` in a step or `api.now()` in an action. The
  sim and the offline catch-up both depend on it.
- **Pure steps.** A step reads the state and `ctx` and writes the draft. No timers, no fetches, no randomness
  except `ctx.rng`.
- **Shape changes are save changes.** Adding a field is safe (the loader fills it from `initial`). Renaming,
  removing or retyping a saved field needs a migration and a `save.version` bump: see watchpot-save.

## Checking it

`bun run verify` typechecks and lints. If the game has a pacing sim (`bun run sim -- --contract`), run it once
after changing numbers, and read `docs/sim.md` before teaching the auto-player a new move (`moves`).
