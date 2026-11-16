# Achievements

A wall of things a player does once, laid in rows of a fixed width: each earned at most once and kept for good, a
global multiplier from the count earned and the rows completed (the usual achievement-wall model: ×1.03 each, ×1.25
a row), and effects for the game's stats while earned. Most are checked by the feature every pass; some must hold for
a while first, some are only true at a moment the game names, and the rest the game awards itself.

```ts
import { type Achievement, achievements, type Decimal, type Effect, stats } from "watchpot/core";

type State = { wallet: { gold: Decimal; gems: Decimal } };
type Fx = Effect<"toy.speed">;

const LIST: Achievement<State, Fx>[] = [
  { id: "ten", name: "Pocket money", line: "Hold 10 gold.", when: (s) => s.wallet.gold.gte(10) },
  { id: "hoard", name: "Hoarder", line: "Hold 5 gems for 30 seconds.", when: (s) => s.wallet.gems.gte(5),
    forMs: 30_000, effects: [{ stat: "toy.speed", add: 1 }] },
  { id: "clean", name: "Clean slate", line: "Reset holding no gems.", secret: true, on: ["reset"],
    when: (s) => s.wallet.gems.lte(0) },
  { id: "found", name: "Found it", line: "Open the hidden door." }, // award("found")
];

export const wall = achievements({
  key: "wall",
  columns: 4,
  list: LIST,
  rowEffects: (): Fx[] => [{ stat: "toy.speed", mul: 1.25 }],
});
// before the reset: store.getState().wall.notify("reset")

/** What the wall gives: the global multiplier as a source, the earned effects and full rows as contributions. */
export const bonuses = stats({
  key: "stats",
  vocab: TOY,
  reach: () => [wall],
  stats: { "toy.speed": { base: 1 } },
  sources: [
    {
      label: "The wall",
      owner: "wall",
      effects: [{ stat: "toy.speed", mul: (q) => wall.board.power(q.wall.earned, { each: 1.03, row: 1.25 }) }],
    },
  ],
  contributions: (s) => wall.board.contributions(s.wall.earned),
});
```

Example: [`examples/achievements.ts`](examples/achievements.ts).

- **`Achievement<G, E>`** is `{ id, name, line, reward?, effects?, secret?, when?, forMs?, on? }`: `line` says what earns
  it and `reward` what it gives, both in the game's words; `effects` are the game's effect type, active while earned;
  `secret` hides it until earned (the tile's `hidden`). `when(state, now)` reads the whole game state.
- **`achievementBoard({ id, list, columns, rowEffects? })`** is the rules over an earned record (`id → game time
  earned`): `rows(earned)` (tiles `{ achievement, earned, at, hidden }`, each row `complete` once all of it is earned,
  a short last row included), `count`, `rowsComplete`, `contributions(earned)` (sourced `<id>:<achievement>`, then
  `<id>:row:<index>` from 0 for each complete row's `rowEffects(row)`) and `power(earned, { each, row? })` =
  `each^count × row^rowsComplete` as a Decimal. A repeated id throws.
- **`achievements({ key, list, columns, rowEffects?, keepFresh?, onEarn?, reset? })`** saves `{ earned, fresh, holding
  }` and carries the rules as `.board`. Its step `<key>.settle.check` checks every unearned achievement with a `when`
  and no `on`, after the pass's production. With `forMs` the timer (`holding`) starts the first pass the condition
  holds and clears the first pass it is broken; over a catch-up the gap counts only if it holds at the end.
- **Actions:** `award(id)` (the game's own; false when unknown or already earned), `notify(event)` (checks only the
  achievements whose `on` names it, earning one with no `when` outright; returns the ids earned) and
  `acknowledge(ids?)` (clears `fresh`, the toast queue, capped at `keepFresh`, default 20). `.earn(draft, id, now)`
  does the same as `award` inside a recipe, and `onEarn(draft, achievement, now)` runs in the recipe that earns one.
- `reset` defaults to `"never"`: a run reset keeps the wall.
- **Type arguments** are rarely needed: annotate the state on one `when` (or type the list, as above) and inference
  does the rest. When you do write them, the order is key, state, effect, the same as `Achievement<G, E>`:
  `achievements<"wall", State, Effect>`, or `achievements<"wall", State>` for a wall with no effects.

## Latches: achievements as one-way unlocks

An achievement is earned once and never un-earned, and the wall's default `reset` is `"never"`. That makes it the
right tool for anything that must open once and stay open after a reset wipes what opened it: a tab, a door, a page,
a glossary term the player has now met. Give the wall `columns` and a list as usual, leave it off the screen, and have
the screens ask the earned record (`s.doors.earned[id] !== undefined`), never the condition, which may no longer hold.
The `fresh` queue doubles as the list of things to announce.
[Showcase 6](showcases.md#6-a-door-that-stays-open-and-a-glossary-that-knows-it) and
[`examples/showcase-latch.ts`](examples/showcase-latch.ts) build one.
