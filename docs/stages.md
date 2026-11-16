# Stages

A track of walls, each with more resistance than the last, worn down by a force: the stage in front takes `force` a
second, falls when it has taken its resistance, and the next one stands. Zones, floors, waves, a front line on a map.
A stretch of any length is exact, so a long absence clears what the same time in ticks would.

Example: [`examples/stages.ts`](examples/stages.ts).

- **`StageTrack`** is `{ id, resistance, boss?, limitMs?, length? }`: `resistance` is `{ base, growth }` (stage `n`
  resists `base × growth ^ n`) or the game's own function of the stage; `boss: { every, mult }` multiplies every
  `every`th stage; `length` ends the track.
- **A time limit makes a wall.** With `limitMs`, a stage the force cannot fell inside the limit takes nothing: the
  track stops dead until the force grows, instead of waiting it out. Without one any force gets there eventually,
  which suits an idle track and makes a poor gate.
- **The kernel.** `advanceTrack(state, force, dtMs, track)` returns `{ state, cleared }` (at most `STAGE_WALK_LIMIT`
  stages a step); `TrackState` is `{ stage, worn, best }`. Readers: `resistanceAt`, `passable`, `trackFill` (0 to 1),
  `secondsToClear` (null at a wall) and `trackEnded`.
- **`stages({ key, reach?, tracks, force, open?, onClear?, away?, reset? })`** saves a `TrackState` per track and wears every
  open track in `<key>.produce.advance`. `force(state, track)` is the wear a second, read off the whole game state (a
  stat, a share of a pool); `open(state, track)` holds a track still until it is unlocked; `onClear(draft, track,
  from, to, now)` runs in the recipe of a step that cleared stages `from` up to (not including) `to`. Over an absence
  it wears for what `away(state)` credits (default: all of it). One action, `enter(track, stage)`, stands in front of
  an earlier stage again (never past `best`). A run reset starts every track over and keeps `best`.
- **Tuning.** A growth near 1.5 with a force that climbs in steps gives a rush of stages after every upgrade and then
  a wall; that rhythm is the mechanic. Pay per stage on a curve that grows slower than the resistance, or the track
  feeds its own force.
