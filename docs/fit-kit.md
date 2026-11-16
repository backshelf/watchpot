# The fit kit

A fit of a small game is one run of a few seconds, and [plan and fit](plan-and-fit.md) is all it needs. A big game's
fit is a long run: hours of played time at a step a second, minutes of real time. The fit kit is what makes that
bearable, all in `watchpot/sim`:

- **The live table** (`fitTable`): the one place the game reads fitted prices from and the fit writes them to.
- **Snapshots**: the whole sim at a moment of play, as plain data, every so often while it runs.
- **Resuming**: a fit (or any sim) carried on from a snapshot instead of from nothing, playing on exactly as the run
  that took it would have.
- **The proof**: the finished table replayed between the snapshots, which must arrive at each exactly. A draft skips
  it; it can run on Bun workers.
- **The profiler**: where a step's time goes, the pilot's look against the game's step and the game's steps by id.

Example: [`examples/fit-kit.ts`](examples/fit-kit.ts) (`bun docs/examples/fit-kit.ts`, add `--workers=2` for the proof
on workers): a toy pottery fitted with snapshots, a second fit carried on from one, the proof, a profile from a
snapshot and the table module. It runs in well under a second.

## The run

Everything here plays one thing: the game's **run**, a `FitRun`. It is what the fit plays, what the proof replays and
what the profiler times, so all three play the same steps:

```ts
interface FitRun<X> {
  step(dtMs: number): void; // the world plays dtMs
  look(): void; // the pilot's look
  playedMs(): number; // ms of play so far
  afterStep?(): void; // sample the holdings here
  capture?(): SnapshotParts<X>; // { world, player, extra }: the run now
}
```

Write one function that builds the run, fresh or from a snapshot, and use it everywhere:

```ts
function gameRun(from?: SimSnapshot<Extra>) {
  const store = (now: () => number) => simStore(game, now, "sim");
  const world = from ? resumeSimWorld(store, from.world) : createSimWorld(store, START);
  const player = autoPlayer(game, { objective, memory: from?.player });
  const have = holdings(["gold"], readGold, { from: from?.extra?.have });
  let played = from?.atMs ?? 0;
  const run: FitRun<Extra> = {
    step: (dt) => { world.play(dt); played += dt; },
    look: () => { player.look(world.store); },
    playedMs: () => played,
    afterStep: () => have.sample(),
    capture: () => ({ world: world.snapshot(), player: player.remember(), extra: { have: have.remember() } }),
  };
  return { run, gates: gatesOver(have), done: () => finished(world) };
}
```

Anything the run keeps that changes what it does next goes in the snapshot: the world (the store's data and the
clock), the auto-player's memory, and in `extra` whatever the game's run keeps besides (its holdings, its own pilot's
memory, the records it prints). Leave something out and a resumed run parts from the one that never stopped.

## The live table

`fitTable(FIT)` is a table of fitted prices that stays live. The game keeps one, a module-level constant, and reads
every gate's price through it: `prices.get(key)` is a Decimal, `BLOCKED` for a gate it does not hold, so nothing
unfitted is payable (`isBlocked(price)` tells a screen to leave the gate off the shelf). `figure(key)` is the price as
written, `has(key)` whether there is one, and `version()` counts every change, so a value worked out from the table
(a cached shelf) knows when to work it out again.

`runFit({ table })` shuts every gate in it before the run and writes each price in as it sets it, so the pilot can pay
a gate the moment it is priced. `data()` is the table as plain data, `load(data)` replaces it; `fitTableSource(table,
{ header, planImport, keyType, order?, draft? })` is the text of the module the fit script writes and the game
commits (`order` is the plan's; `draft` puts a first line saying the table was not proved).

A derived value is worked out again only when a slice of the state it read was written. One that reads the table
(a price a gate shows) does not know the fit changed it: read the table where it is needed, or make it part of a
value that the next step refreshes.

## Snapshots

A `SimSnapshot` is plain data: `{ format, atMs, world, player?, fit?, extra? }`.

- `world` is `world.snapshot()`: the sim clock and the plain store's data (every feature's slice, copied, with no
  actions and no derived values). The rng's place is in the data, since every draw is seeded from the state.
- `player` is the auto-player's `remember()`: the worths it has worked out and keeps, for how many looks yet, which
  moves it has found worth something. A fresh auto-player would work its worths out afresh, a look early, and buy
  something else.
- `fit` is the fit's own progress, when a fit took it: the steps played (the look cadence counts them), its step and
  look cadence, its plan, its gates and the table as it stood.
- `extra` is the game's.

`takeSnapshot({ atMs, world, player, extra })` takes one outside a fit; `snapshotCadence(everyMs, fromMs)` says when
one is due (`due(playedMs)`). A fit given `capture` and `snapshotEveryMs` takes its own, before the look of the step
that passes each mark, and one where it ends; they are `result.snapshots`.

The engine never picks a file. `encodeSnapshot(s)` is the text, `decodeSnapshot(text)` reads it back, and the script
writes it where it likes (a `sim/out/snap-<minutes>.json` beside the game's sim, say). The text is exact: a Decimal is
written as its parts, not the save's string, which loses the last digit of about one large Decimal in a thousand; a
number JSON cannot hold is written as its name. `snapshotDiff(a, b)` names where two values part, the proof's report.

`world.snapshot()` needs the plain store (`simStore`); `realSimStore` cannot be snapshotted.

## Resuming

`resumeSimWorld(build, snapshot.world)` builds a fresh store over a clock set to the snapshot's time and puts the
snapshot's data into it, with no opening catch-up: the run carries on as if it had never stopped. Pass the player's
memory to `autoPlayer({ memory })` and the game's `extra` to whatever keeps it (`holdings({ from })`).

`runFit({ from })` carries a fit on: build the run from the snapshot first, then call `runFit` with it. The fit takes
its table, its gates and its step count from the snapshot, asks only the gates still unpriced there, and plays on. A
change that acts from minute `m` then costs only the minutes after it, and prices what a fit from nothing would.

A snapshot is good while nothing before it changed:

- **The plan.** `fitHolds(snapshot, gates)` lists the gates planned before the snapshot that moved, were added or went
  since; `runFit` throws on any. Moving a gate after the snapshot is fine.
- **The rules.** A change to a rate, a price or the pilot that could act before the snapshot makes it another run's.
  The kit cannot see that: drop the snapshots after the earliest moment a change can act, and fit from there (or from
  nothing, for a change that acts everywhere).
- **The step.** A fit carries on only at the step and look cadence it was taken at, and throws otherwise.

`latestSnapshot(snapshots, atMs, holds?)` picks the latest at or before a moment that `holds` accepts: how a script's
`--from=<minute>` chooses, with `holds` reading `fitHolds`.

## The proof

`proveFit({ marks: result.snapshots, start?, replay })` replays the finished table from where the fit started
(`start`, the snapshot it carried on from, or nothing) to its first snapshot, then from each snapshot to the next,
each stretch built by `replay(from)` (your run builder) and played on the fit's own steps and looks. Each stretch must
arrive exactly where the fit's run stood: the world, the player, and `extra` when the replay captures one. It returns
`{ stretches, failed }`, a line per stretch that parted, naming the first few places.

Why it proves anything: during the fit every gate was shut until its price was set, and the replay plays with every
price set from the start. The two runs are the same only if no gate could be paid before the fit priced it, so the
table plays as planned. That holds when each price is above anything held before it was set: price with
`priceAbove` over the peak (or over the most held since the gate could first be reached), not `nicePrice` over
what is held.

The proof replays at the fit's own quality, since it is the fit's run again. A quick fit can be proved at quick, which
proves its table at quick; it says nothing about the same table at exact. Fit `exact` and prove it before a
checkpoint.

**A draft** is a fit that skips the proof (and is usually `quick`): fit, write the table with `draft: true`, play the
game. Prove before anything is built on the numbers.

**On workers.** The stretches stand alone, so they can be replayed at once. `proveFitParallel({ module, table, marks,
start?, workers? })` starts Bun workers (4 by default), each importing `module` and replaying its share, the later
stretches first; it resolves to the same `{ stretches, failed }`. A worker is a separate copy of the game and cannot be
handed a function, so the game names a module that exports its proof:

```ts
// sim/proof.ts
export const fitProof: FitProofModule<Extra> = { table: PRICES, replay: (from) => gameRun(from).run };
```

```ts
await proveFitParallel({ module: new URL("./proof.ts", import.meta.url), table: PRICES.data(), marks });
```

Each worker loads the finished table into the module's `table` before it replays. The single-threaded `proveFit` is
the default and the tested path; reach for workers when the proof is long, and remember every worker is a whole
game's worth of memory.

## The profiler

`profileSim({ steps, timer, look, step, timed?, playedMs? })` plays `steps` steps, a look before each, and times the
look and the step apart. The engine reads no clock: pass `timer: () => performance.now()`. `timeSteps(game, timer)`
is the same game with each feature step wrapped in the timer: build the sim's store over `timed.game` and pass
`timed`, and the profile lists the game's steps by id (`<feature>.<phase>.<name>`), the slowest first, with their
calls. A derived value's time lands in the step that first reads it. `formatProfile(profile, top?)` prints it.

Profile from a snapshot to see a late stretch without playing to it:

```ts
const timed = timeSteps(game, () => performance.now());
const late = gameRun(decodeSnapshot(await Bun.file("sim/out/snap-240.json").text()), timed.game);
console.log(formatProfile(profileSim({
  steps: 3000, timer: () => performance.now(), look: late.run.look, step: () => late.run.step(1000),
  playedMs: late.run.playedMs, timed,
})));
```

One run for a ballpark: a profile of a few thousand steps from two or three snapshots says where the time goes.

## Moving a game's own sim tooling onto the kit

A game that wrote its own versions of these keeps its plan, its gates' pricing and its reports, and swaps the
machinery:

1. Its gate module (a map of prices, a setter, a version counter, a reader that returns the blocked price) becomes
   `export const PRICES = fitTable<GateKey>(FIT)`. Readers call `PRICES.get(key)`; the fit's own setter calls go.
2. Its gates lose `block()`, and `price()` returns the figure instead of writing it. `runFit` takes `table: PRICES`.
3. Its run builder takes a `SimSnapshot` and returns a `FitRun` with `capture`. Whatever it kept outside the store
   to make a resumed run match (values a saved profile leaves out, the pilot's memory) is in the world snapshot
   already, since that is the store's whole data, or goes in `extra`. An export and import of the profile is no
   longer needed, nor is patching the store after an import.
4. Its snapshot files are written with `encodeSnapshot` and read with `decodeSnapshot`; its "does this snapshot still
   hold" check becomes `fitHolds` (plus whatever the game stamped about its rules); `--from` uses `latestSnapshot`.
5. Its proof's process-per-stretch script and its file hand-off become `proveFitParallel` with a proof module, or
   `proveFit` on one thread.
6. Its profiler script becomes `profileSim`, with `timeSteps` for the per-step table.

A snapshot taken by the game's old tooling is not a `SimSnapshot`: fit once from nothing after the move.
