# Roadmap

Directions parked for later. Each is planned properly when it is picked up, and an entry is removed once it ships.

## A fit that carries on, and a proof on several cores

Size: stub

`watchpot/sim` prices a game in one pass (`runFit`) and leaves the rest to the game: how long a fit takes, how a
later fit avoids replaying hours nothing touched, and how the replay that proves the table is run. One game built
all three for itself: snapshots every couple of played hours that hold the saved profile, the state a profile
leaves out, the pilot's memory and the fit's own memory, so a fit picked up from one is the fit that took it;
snapshots refused once a gate before them has moved or been priced otherwise; and a proof that replays each
stretch between two snapshots in its own process on the finished table and fails unless it arrives exactly where
the fit stood. Move the generic parts into the engine: a way for a feature to declare what it holds that is not
saved, a snapshot and resume in the sim world, the carry-on fit, the parallel proof, and the look kept at a
person's pace while the world ticks finer. The game's version lives in its `sim/` (`play.ts`, `fit.ts`,
`prove.ts`, `stretch.ts`).

Not before the player has played on numbers fitted this way: whether those play well decides whether this is
worth making generic.

Plan with `/vibeplan`.
