# Sweeps

A timing bar: a cursor crossing a track, targets on the track, and a strike graded by how near the cursor is to a
target's centre. A scanner, a fishing line, a perfect-press meter. The cursor's place is a pure function of game
time, so a screen draws it from `now` with no state of its own.

Example: [`examples/sweep.ts`](examples/sweep.ts).

- **The kernel.** `sweepAt(now, { periodMs, wave? }, since?)` is the cursor's place, 0 to 1: a `triangle` (the
  default) goes there and back in a period, a `saw` goes across and starts again. `gradeStrike(pos, targets, grades)`
  takes the nearest target whose span holds the cursor, at the first grade (list the tightest first) it is `within`
  (a share of the target's half width); null is a miss. `drawTarget(rng, width, taken, kind?)` places one more target
  clear of the rest where there is room. `passesIn(dtMs, motion)` is how often the cursor passes a point, for paying
  an automatic striker by the stretch.
- **`sweep({ key, setup, grades, kind?, onStrike?, reset? })`** saves `{ targets, streak, best, strikes, misses, hits,
  since, rng }`. `setup(state)` gives `{ motion, count, width }`, read each pass, so an upgrade can speed the cursor or
  widen and add targets; the track is topped up in `<key>.sync.targets` and after every hit, on the feature's own saved
  stream. `strike()` grades the cursor at the game time of the call: a hit removes its target and extends the streak,
  a miss ends it, and `onStrike(draft, { hit, streak, pos }, now)` runs in the same recipe (what a hit pays is the
  game's). `.strike(draft, now)` is the same strike inside a recipe; `.cursor(state, now)` is where to draw the
  cursor. A prestige reset keeps the tallies and clears the streak and the track.
- **Played by a person.** A strike is a reflex, so the sim cannot play it: pay an automated or simulated striker from
  `passesIn` at a share landed, and keep the hand-played rate a few times better than that so playing it is worth it.
  Give the player a key for it (`useHotkeys`) and keep the period over a second: a faster cursor is a coin flip.
