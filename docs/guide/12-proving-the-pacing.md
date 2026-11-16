# Proving the pacing

By the end of this chapter Simmer will be played by a machine instead of by you: a day of play in a fraction of a
second, a list of what happened and when, and a pacing contract that says whether the first hour holds up. You will
also have the test kit's three tools for everything else (a fresh store, a save made by play, and a test that an old
save still loads), and you will know what a large game adds on top and when you can skip it.

## Why you cannot just play it

An idle game is a game about waiting, so its worst bugs are waits. A price one step too steep does not crash
anything. It turns minute twenty into a quarter of an hour of staring at a number, and you only find out by sitting
through it. Then you change the price, and to know whether that helped you would have to sit through it again.

You can play the first ten minutes yourself as often as you like. You cannot play the first ten hours after every
change, and you cannot play them the way a newcomer does, without knowing what is coming. So watchpot ships a
[sim lab](../glossary.md#sim-lab): `watchpot/sim`, a part of the engine that plays your game headless, on a clock it
owns, as fast as the machine allows. No browser, no wall clock, no waiting.

The sim lab does not tell you whether the game is fun. It tells you how long each wait is, what got bought when, and
whether that matches what you meant. Deciding what you meant is still your job.

It has three layers, and this chapter takes them in order:

1. **A world.** A store over a clock the sim moves, and the two ways time passes for a player: the tab open, or the
   tab closed and a catch-up on return.
2. **A player and a schedule.** An [auto-player](../glossary.md#auto-player) that buys what your features offer, and
   a [schedule](../glossary.md#schedule) that says when it is at the game.
3. **A judge.** A timeline of rows taken as the run goes, and a [pacing contract](../glossary.md#pacing-contract) the
   rows are checked against.

## Teaching Simmer to be played

The auto-player knows nothing about your game. It asks each feature what a player could do right now, and a
feature answers through an optional `moves` function. The store never calls it; only the sim does.

Simmer's features were written without moves, so the example imports them from
[`simmer/game-wallet.ts`](../examples/simmer/game-wallet.ts) and adds one with `withMoves(feature, moves)`, which
hands back the same feature with the moves attached:

<!-- example-code: guide-pacing.ts -->

```ts
/**
 * Simmer's pot, carrying what a player could do now, for the sim's auto-player: light a burner. The store never reads
 * this. Moves read the whole state, so any feature can carry them. The stove would be the natural home, but the lid
 * reaches the stove itself, and a stove with moves is a new object, so the lid would have to be rebuilt too. Nothing
 * reaches the pot.
 */
export const playablePot = withMoves(pot, (s: Simmer) => [
  {
    id: "buy-burner",
    cost: { currency: "bubbles", amount: burnerPrice(s.stove.burners) },
    value: () => BURNER_PER_SECOND, // bubbles a second: the only thing a burner does
    apply: (store) => store.getState().stove.buyBurner(),
  },
]);

/** Simmer with the playable pot in the pot's place: the same key, the same save. */
export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  vocab: WORDS,
  features: [wallet, playablePot, stove, lid],
  order: { rates: [...SIMMER_RATES] },
});
```

`docs/examples/guide-pacing.ts`

A [move](../glossary.md#move) has four parts:

- `id` names it. If its `apply` refuses, the auto-player does not try that id again in the same look.
- `cost` says what it costs and in which currency. A move with no cost is a free move: a claim, an open, a toggle.
  `burnerPrice` is the core's own price (`costAt`, rounded up), so the sim pays exactly what the page charges.
- `value` says what it is worth, in any unit you like, as long as every move in that currency uses the same one. A
  burner makes a bubble a second, so its worth is `BURNER_PER_SECOND`, 1.
- `apply` plays it through the store's own actions and says whether it went through. `buyBurner` already returns
  that, so the move hands it straight back.

The comment explains why the moves ride on the pot. `defineGame` checks each feature's `reach` against the list by
identity: the lid reaches the very `stove` object chapter 3 made, so a game that lists a changed copy of the stove
in its place fails with "feature "lid" reaches "stove", which the game does not list". A feature nothing reaches
can be swapped freely, and the pot is one.

At each look the auto-player buys the purchase with the best worth for the share of its balance it spends, again and
again while one is affordable, then takes every free move worth anything, and goes round once more if either did
something. It never saves up for something better. It is a greedy, tireless player, which is a fair stand-in for
the first hours of a person who is paying attention.

Several of the engine's ready-made systems carry their moves already: a `generators` list offers one purchase per
generator, valued at the income it adds, an `upgradeTree` offers one purchase per node whose next rank can be bought,
and a `clicker` offers one press per look. A move with no `worth` is worth what buying it adds to the auto-player's
`objective`; a node that moves no number the sim can see at once (an unlock, an offline cap) needs you to say what it
is worth, because only your game knows: the tree takes a `worth(state, node)` for that. Moves for a feature you wrote
yourself, or for one a factory made without any (`prestige`, say), are attached with `withMoves(feature, moves)`. The
second example file adds a kitchen to the playable Simmer: an `upgradeTree` with one upgrade, a copper base that
doubles the stove (a small `copper` feature reads its rank in a `rates` step after the lid's). Here is the tree with
its worth stated:

<!-- example-code: guide-pacing-tree.ts -->

```ts
// The tree declares the moves the sim buys from. `worth` is in the unit the burners' moves use, bubbles a second; the
// copper base changes no number the sim can see until the `copper` feature below reads it, so it is a fair guess:
// about five burners.
const kitchen = upgradeTree({ key: "kitchen", nodes: [COPPER], wallet, worth: () => 5 });
```

`docs/examples/guide-pacing-tree.ts`

`worth` gets the state and the node, so a game that can work the number out says so there. You put the tree in the
game's feature list as it is, and since nothing wraps it, there is no identity to keep.

Notice that tapping the pot is not a move. That is deliberate, and the reason is the first thing that bites in
[Things that bite](#things-that-bite).

## A run

Now the run itself. This plays one day of Simmer, around the clock:

<!-- example-code: guide-pacing.ts -->

```ts
export function playSimmer(seed = "simmer"): Run {
  const start = Date.UTC(2026, 0, 1);
  const world = createSimWorld((now) => simStore(game, now, seed), start);
  const player = autoPlayer(game);

  const hoursIn = () => (world.now() - start) / HOUR_MS;
  const read = (): Row => {
    const s = world.store.getState();
    return { hours: hoursIn(), bubbles: s.wallet.bubbles.toNumber(), burners: s.stove.burners };
  };
  const timeline = sampler({
    marks: [5, 15, 30, 60, 120, 240].map((min) => min * MINUTE_MS),
    start,
    take: read,
    at: (r) => r.hours,
  });
  // ...
  playDays({
    world,
    schedule: activeSchedule(10, 3),
    days: 1,
    start,
    rng: rngFor(seed, "auto"),
    look: (at) => {
      for (let i = 0; i < at.presses; i++) world.store.getState().pot.tap();
      const before = world.store.getState().stove.burners;
      if (player.look(world.store).bought === 0) return;
      // ...
    },
    afterLook: () => timeline.look(world.now()),
    dayEnd: () => timeline.close(read()),
  });
  // ...
}
```

`docs/examples/guide-pacing.ts`

Line by line:

- `start` is the moment the run begins, in epoch milliseconds. Any fixed date will do; it only has to be the same
  every run.
- `createSimWorld(build, start)` makes the world. You give it a function that builds a store over the clock it hands
  you, and it opens that store at `start` with one catch-up, as a first page load would. `simStore(game, now, seed)` is
  the store to build: your game, on storage that never writes (saving after every change is the slowest thing a sim
  could do), with its random draws seeded so one seed is always one run.
- `autoPlayer(game)` makes the player. It has to know how much of each currency the state holds, so it only reaches
  for what it can pay. A game with one `currencies` feature, as Simmer has, needs to say nothing: the player reads
  that wallet. A game with two wallets, or none, passes `balance(state, currency)` to say where to look.
- `read` takes one row: the hours since the start, the bubbles and the burners. A row holds whatever you want the
  contract to look at later.
- `sampler` keeps the timeline. It takes a row each time the run passes one of the `marks` (five minutes, a quarter
  hour, and so on), and `at` tells it when a row was taken.
- `playDays` is the loop. Each look it calls your `look` with where it is (`at.presses` among it), plays the time to
  the next look, then calls `afterLook`. At the end of each day it calls `dayEnd`. It plays whole `days` unless you
  stop it sooner (below).
- `activeSchedule(10, 3)` is the schedule: at the game around the clock, a look every ten seconds, three keypresses
  at each look. Why this schedule and not a more lifelike one is the next section but one.
- `rngFor(seed, "auto")` is the seeded stream a schedule draws its days from. This schedule draws nothing, but
  `playDays` always takes one.
- The `look` spends the schedule's presses on taps, then lets the auto-player buy. The lines cut from the excerpt
  write down every purchase: the time since the last one, and the first time the burner count reached 1, 10, 25, 50
  and 75.

`look` is yours. The auto-player is one call inside it, and anything a person does that is not a purchase (tapping,
holding something down, choosing when to reset) goes around it.

## Reading what happened

Run the file:

```sh
bun docs/examples/guide-pacing.ts
```

It plays a whole day in well under half a second and prints this:

<!-- example-output: guide-pacing.ts -->

```text
0:00  burner 1
0:00  burner 10
0:02  burner 25
0:29  burner 50
9:47  burner 75
| hours | bubbles | burners |
| --- | --- | --- |
| 0.08 | 912 | 32 |
| 0.25 | 3775 | 43 |
| 0.50 | 2087 | 50 |
| 1.00 | 5052 | 56 |
| 2.00 | 2542 | 62 |
| 4.00 | 87147 | 67 |
| 24.00 | 142440 | 82 |
pass Burners, hour 0.25 43.0 35–50
pass Burners, hour 1 56.0 50–70
FAIL Longest wait in hour 1 (min) 6.5 at most 5
fixture: 1 burner, 7210 bubbles
a minute on one burner: 120 bubbles
```

The first five lines are the firsts, in hours and minutes (`fmtClock`). The table is the timeline, printed with
`markdownTable`. Both printers come from `watchpot/sim`. Read them together and Simmer's story is plain: twenty-five
burners in two minutes, then fifty by half an hour, then seventy-five takes more than nine hours after that. Each
burner costs 15% more than the last, and nothing else in the game grows, so the waits stretch until the player is
watching a pot that never gets anywhere. (The bubbles column rises and falls because it is the balance: the player
spends it the moment a burner is affordable.)

The sim never puts the lid on, either. The lid has no moves, so to the auto-player it does not exist; a real Simmer
sim would give it a free move that puts it on and refuses once it is on.

That is what a sim is for. You did not have to sit through hour two to learn that hour two is empty.

The firsts are worth keeping in any sim you write. A timeline at fixed marks tells you how far the run got; a list
of firsts tells you where the gaps are. A long stretch with no new first is a stretch with nothing to look forward to.

## Stopping at a moment

The question you will ask most often is "when does the player first get X?". `playStraight` answers it. It plays one
unbroken sitting with a look at a fixed cadence, and its `until` is checked before each look, so the sitting ends the
moment the answer is yes:

<!-- example-code: guide-pacing-tree.ts -->

```ts
playStraight({
  world,
  ms: 2 * HOUR_MS, // the longest it may take
  lookEveryMs: 10_000, // a look every ten seconds
  look: () => player.look(world.store),
  until: has, // checked before each look: the sitting ends the moment it holds
});

return has() ? world.now() - start : null;
```

`docs/examples/guide-pacing-tree.ts`

<!-- example-prints: guide-pacing-tree.ts | copper base at 0:01 -->

`has` reads the tree's ranks from `world.store`. When `until` never holds, the sitting runs the full `ms`, which is
why the function says `null` rather than a time. Run the file and it prints `copper base at 0:01`: one minute in.

`playStraight` takes a look cadence, not a schedule, so it plays a player who never leaves. That is the right player
for "how soon can this happen", and the wrong one for "how does a week feel", which is `playDays`'s job.

`playDays` can stop early too. It takes the same `until`, and `hours`, a limit on the time played since `start`.
Both are checked after each look and the play that follows it, so the run ends after the look that crossed the line,
and a day cut short gets no `dayEnd`. `hours: 4` on Simmer's run would stop at the four-hour row.

## Played hours

Why a look every ten seconds, around the clock? Because pacing is measured in
[played hours](../glossary.md#played-hours): time a person spends at the game, paying attention.

Nobody starts an idle game and walks away. The first three or four hours are played straight, whatever kind of
session the game is built for, unless being left alone is the game's whole idea. "The first reset comes in half an
hour" means half an hour of playing, not half an hour of a tab sitting in the background overnight.
`activeSchedule(lookEverySec, presses)` is that player: at the game every hour of the day, looking every few seconds.
Every hour of its run is a played hour, so the hours in your timeline are the hours in your plan.

The other schedules answer other questions. `fixedSchedule(wakeHour, sleepHour, everyMin, presses)` is a day with
the tab open from a waking hour to a sleeping hour, and a `SessionSchedule` draws a lifelike week: a handful of
sessions a day, of varying length, with the tab closed between them and the odd day skipped. Use those to ask how a
casual checker's week goes, once the played hours are right. Their hours include the night, so never read played
pacing off them.

## A pacing contract

Reading a table is fine once. After every change you want a yes or a no, so you write down what you meant as data
and let the sim check it. That is a pacing contract: [bands](../glossary.md#band), each a floor and a ceiling for one
number at one point in the run.

<!-- example-code: guide-pacing.ts -->

```ts
/** Burners owned at a quarter hour and at one hour of play, each a band from a floor to a ceiling. */
export const CONTRACT = table(
  byHour((r: Row) => r.hours),
  { burners: { name: "Burners", read: (r: Row) => r.burners } },
  grid(
    [0.25, 1],
    [
      [
        "burners",
        [
          [35, 50],
          [50, 70],
        ],
      ],
    ],
  ),
);

/** The run judged: the bands, plus one rule of its own about the longest wait. */
export function judgeSimmer(run: Run): Verdict[] {
  return [...judge(run.rows, CONTRACT), atMost("Longest wait in hour 1 (min)", run.longestWaitMin, 5)];
}
```

`docs/examples/guide-pacing.ts`

- `table(axis, metrics, bands)` builds the contract. The axis says where on the run a band sits: `byHour` reads the
  hours off a row, so a band "at 0.25" is read on the last row taken by a quarter hour. (`byDay` is the same in
  calendar days.)
- The metrics name what a band can be about. Here there is one, the burners, read off a row.
- `grid(columns, rows)` writes the bands as a grid: one row per metric, one `[floor, ceiling]` per column. Simmer's
  says between 35 and 50 burners at a quarter hour, and between 50 and 70 at an hour.
- `judge(rows, table)` reads every band the run reached and returns a `Verdict` for each: a name, the value, the
  target in words and `ok`.
- `atMost(name, value, max)` (and its sibling `atLeast`) makes a verdict for a rule the table cannot express. The
  longest wait is the rule that matters most in an idle game, so it gets one of its own.

Why ranges and not exact numbers? A band says what you meant, with room for the run to move a little when you change
something unrelated. If it is too tight, every harmless change fails it. When your game draws at random (a crit, a
drop), the run changes with the seed too, and the bands are written as the 10th to 90th percentile over a few seeds
(`p10p90` computes that). Simmer draws nothing at random, so every seed plays the same run.

And Simmer fails its own contract: the longest wait in the first hour is six and a half minutes. That is the right
answer. The fix is not a cheaper burner. A cheaper burner would hide the problem for another ten minutes and leave
hour two just as empty. The fix is content: something else to buy, something that grows the burners' output, a
reset that starts the pot again stronger. That is what chapters [5](05-a-real-game.md) to
[7](07-the-first-reset.md) added. A contract tells you where the game runs thin; filling it is design.

## The contract as a test

A contract is most useful when it runs on its own. Put it in a test. Say your game keeps the run and the contract in
`sim/pacing.ts`:

```ts
import { expect, test } from "bun:test";
import { judgeSimmer, playSimmer } from "../sim/pacing";

test("Simmer keeps its pacing", () => {
  expect(judgeSimmer(playSimmer()).filter((v) => !v.ok)).toEqual([]);
});
```

Keep a test like this fast. Simmer's day takes a fraction of a second, so it can sit with the ordinary tests. A larger
game's run takes longer, and anything over a second belongs in a slow tier (in watchpot's own repository, a file
named `*.slow.test.ts`) that runs at a checkpoint rather than on every commit. Never make the whole plan of a big game
a test: a gate that takes minutes stops being run.

Over several seeds, `tally` gathers each check's verdicts and `failing` keeps the ones a majority of runs missed, so
one unlucky draw does not fail the build. `runGate` runs every seed's job at once (each in its own process when the
job's `run` is `spawnJob`) and tallies the results for you. Simmer has no use for them;
a game with real randomness does.

## The test kit

Most tests in a game are not about pacing. They check that a rule does what it says: a burner pays a bubble a second,
a reset keeps what it should, an old save still loads. For those, `watchpot/test` has a small kit.

**A fresh store.** `freshStore(game, options?)` builds an isolated store on a memory backend that writes every
change straight through, already loaded, with no `await`. It returns `{ store, backend, clock, play }`: the store,
what it saved to, a test clock (a `testClock`), and `play(ms)`, which moves the clock `ms` forward and ticks the store
over that time in one call. Unless you pass `at`, the clock starts frozen at `T0`, local noon on a fixed day, so a
rule about "today" sees the middle of a day. Here is the burner rule checked that way:

<!-- example-code: guide-pacing.ts -->

```ts
/** A rule checked the short way: one burner and a minute of play, in one call. */
export function aMinuteOnOneBurner(): number {
  const { store, play } = freshStore(game);
  store.setState((s) => {
    s.stove.burners = 1;
  });
  play(MINUTE_MS);
  return store.getState().wallet.bubbles.toNumber(); // the pot's 60 and the burner's 60
}
```

`docs/examples/guide-pacing.ts`

It returns 120, the last line of the output above. In a test you would write `expect(aMinuteOnOneBurner()).toBe(120)`,
or better, assert that a burner adds sixty a minute, so the test survives a change to the pot.

**A save made by play.** `fixtureSave(game, play)` runs a fresh store through a function you write, then exports
the save. It is seeded, so the same function makes the same save every time:

<!-- example-code: guide-pacing.ts -->

```ts
/** A save made by play: twenty taps, a burner, then an hour on the stove. The same save every time it is made. */
export const simmerFixture = (): string =>
  fixtureSave(game, (store, clock) => {
    for (let i = 0; i < 20; i++) store.getState().pot.tap();
    store.getState().stove.buyBurner();
    store.getState().tick(HOUR_MS, clock.advance(HOUR_MS));
  });

/** Loads a save into a fresh store, as a test does, without the catch-up a boot would make. */
export function loadSave(text: string) {
  return freshStore(game, { save: text, catchUp: false }).store.getState();
}
```

`docs/examples/guide-pacing.ts`

The function `fixtureSave` takes is typed `FixturePlay` in `watchpot/test`: `(store, clock) => void`, plain calls on
a store. It is a different thing from the sim's auto-player, which buys by itself; the reference shelf's
[persona](../persona.md) page calls both of them players.

The run prints `fixture: 1 burner, 7210 bubbles`: twenty from the taps, ten spent on the burner, and an hour of the
pot's simmer and the burner's flame, 3,600 each.

`tick(HOUR_MS, clock.advance(HOUR_MS))` passes the hour twice: once as the time to play, once as the moment it ends.
The test clock does not move by itself, so you move it first. The second argument is optional (it defaults to the
store's own clock, which is the one you just moved), but `tick` never works the first one out from the clock: the
length of the tick is always yours to say. Outside `fixtureSave`, `freshStore`'s `play(ms)` does both in one.

**An old save still loads.** When you change what a save holds (chapter [9](09-saving-and-time-away.md) covers the
migration), keep a save from every version you have shipped as a file in the repository, and test that this build
still reads it. Make the file once with `fixtureSave` on the old game, write the string to `test/fixtures/`, and never
change it again:

```ts
const SAVE_V1 = await Bun.file(new URL("./fixtures/save-v1.txt", import.meta.url)).text();

test("a version 1 save still loads", () => {
  expect(loadSave(SAVE_V1).stove.burners).toBe(1);
});
```

`catchUp: false` matters here: without it the fresh store would catch up from the save's time to the test clock's,
and for a save stamped before `T0` (a real player's, say) the test would be about time away instead of about the
save. A save `fixtureSave` made is stamped after `T0`, so its gap is negative and the catch-up does nothing, but
turning it off keeps the test honest whatever the file holds.

The string `fixtureSave` returns is the same export a player copies out of the game, so a fixture can also be a real
player's save, or one the sim made at some hour. VOID IF REMOVED keeps a real save from a past version, made by its
own sim, and its migration test loads it with `freshStore(game)` followed by `importProfile(text)` rather than the `save`
option. Both work. The reference shelf's migration page names the file `.json`, the game uses `.txt`, and the
contents are the same either way.

**A page.** `renderWith(store, ui)` mounts a React tree under the store's provider for a screen test, on happy-dom.
The game template's first test uses it; [chapter 13](13-from-the-template.md) walks through that file.

## What a large game does: plan and fit

Everything so far judges a game after the fact: set prices by hand, run, read, adjust. That works while a game has a
handful of prices. VOID IF REMOVED has far too many to tune by hand, and each one sits in a chain: what you can afford at one point depends
on everything you bought before it. Moving one price by hand shifts every wait after it.

So the game turns the question round. Instead of setting prices and measuring the waits, it writes down the waits
and lets the sim set the prices. This is [plan and fit](../glossary.md#plan-and-fit), and the engine supplies the
machinery (`runFit`, `FitGate`, `holdings`, `nicePrice`, `fitTableSource`, `fitReader`). Its shape:

- **The plan** (`sim/plan.ts` in the game) lists every [gate](../glossary.md#gate) (anything with a price) and the
  played hour it should open, gathered from the content. For example, it puts the first reset's page at half an hour
  of play.
- **The pilot** (`sim/pilot.ts`) is the player: the engine's `autoPlayer`, wrapped in the calls a person makes that are
  not purchases, such as holding the FEED pad down. It never reads a price it cannot pay, so a fit and its replay
  play the same.
- **The fit** (`bun sim/fit.ts`) plays once with every gate shut. As each gate's planned hour comes, it prices the
  gate at what the pilot holds then, rounded to a figure a player can read, and plays on with that price fixed. One
  pass in time order prices the whole game. It writes the prices to `src/content/fit.ts`, a table the game reads its
  prices from and nobody edits by hand: to move a price, move its hour in the plan and fit again. (The game drives
  `runFit` with its own `FitGate`s but reads that table through a reader of its own, not `fitReader`, because a fit
  has to change prices while it runs.)
- **The proof** replays the fitted game and checks it arrives exactly where the fit's own run stood. The game cuts
  the replay at snapshots and plays each stretch in its own process, so the proof runs in parallel. `--draft` skips
  it and marks the table as a draft.
- **Snapshots.** A full fit takes long enough to tie the machine up, so it leaves a snapshot every few played hours,
  and `bun sim/fit.ts --from=<h>` carries on from the latest one at or before that hour. You name the earliest hour
  your change can act at, and pay only for the hours after it.
- **The replay** (`bun run sim -- --contract`) plays on the fitted table and fails when a stretch has a wait over the
  game's limit or something planned is never bought. `--firsts` prints every first with its hour, which is how the
  first reset's page can be seen opening at the half hour the plan gave it.

Notice what is missing: the game uses no `table`, `judge`, `sampler` or `playDays`. Its pacing contract is the fit's
own report (the longest wait in each stretch, anything never bought, and the proof), not a table of bands. Those are
two roads to the same place, and a game takes one of them. The engine's [plan and fit page](../plan-and-fit.md)
explains the method in full, with a small bakery as the example.

## When you need none of that

Most games do not. If your game has a few dozen prices, set them by hand, write a sim like Simmer's on
`activeSchedule`, judge it against a contract with a longest-wait rule, and change content when it fails. That is an
afternoon's work and it covers you.

Reach for plan and fit when hand-tuning stops converging: when there are so many gates in a chain that moving one
breaks three others, and you find yourself refitting by hand after every content change. That is the problem it
solves, and it costs a plan file, a pilot, a fit script and minutes per fit to solve it.

## Things that bite

- **A free move that always goes through.** The auto-player takes free moves until none goes through, up to a
  thousand per look. A `tap` move whose `apply` always returns `true` gets taken a thousand times every look, and
  your sim reports a pot that fills by itself. The engine's `clicker` avoids this by refusing a second press at the
  same moment. For a hand-written tap, spend the presses in your `look` yourself, as Simmer does.
- **A feature with no moves is invisible to the sim.** A `generators` list and a `clicker` carry their moves; an
  `upgradeTree`, a `prestige` and every feature you write by hand do not. The auto-player never buys from them, and
  nothing warns you at run time, so a sim can quietly under-play your game, as it leaves Simmer's lid off. Attach
  moves with `withMoves` (see [Teaching Simmer to be played](#teaching-simmer-to-be-played)).
- **A feature with moves is a new object.** `withMoves` returns a copy, and `reach` is checked by identity, so a
  game cannot list the copy of a feature another feature reaches. Put the moves on a feature nothing reaches, or build
  the reaching feature over the copy.
- **The world's tick is a minute.** `createSimWorld` plays time in ticks of at most `SIM_TICK_MS`, which is 60,000 ms,
  while `playStraight` and `runFit` default to one second. With a look every ten seconds you never notice. Call
  `world.play(HOUR_MS)` yourself and every tick is a minute long, which matters for anything that happens inside a
  tick (a timer, a gauge). Pass `{ tickMs }` to `createSimWorld` when it does.
- **`world.now()` and `world.gameNow()` differ.** The first is the sim's wall clock, the second the store's game
  time (the wall plus any offset the profile carries). Measure the run with `now()`, as the examples do.
- **Two wallets need a `balance` reader.** With one `currencies` feature the auto-player reads it by itself; with
  two, or none, `autoPlayer` throws until you pass `balance`, and the reader usually needs a cast
  (`s.wallet[currency as "gold" | "gems"]`). A balance that reads the wrong number makes a player that buys nothing,
  or everything.
- **The sim's player never gets bored.** It buys the instant it can, never misses a look and never wonders what a
  button does. A contract that passes proves the waits, not the fun. Play your own first hour too.
- **Game numbers get huge, and loops do not.** A pacing script that loops once per unit held, or builds an array or a
  log line per unit, will try to count to 1e300 and take the machine down with it. VOID IF REMOVED once froze a whole
  PC this way. Count to a fixed list of marks, or use a closed form, and put a time limit on any new script that plays
  a game (`timeout 120 bun ...`) until it has finished once.

## Next

[Chapter 13, From the template](13-from-the-template.md): start a game from the template, which ships a sim, a
contract and its first tests already wired.

## Reference

- [The auto-player and fixture plays](../persona.md): the auto-player, moves and fixture saves.
- [A pacing contract](../pacing-contract.md): tables, bands, `judge`, and several seeds.
- [Plan and fit](../plan-and-fit.md): the plan, the fit, holdings, nice prices and the replay.
- [A save migration](../migration.md): versions, steps and pinning old saves.
- [Time away](../time-away.md): the catch-up that `world.away` exercises.
- `api/sim/world.d.ts`, `api/sim/auto.d.ts`, `api/sim/schedule.d.ts`, `api/sim/timeline.d.ts`,
  `api/sim/contract.d.ts`, `api/sim/gate.d.ts`, `api/sim/bare.d.ts`, `api/sim/fit.d.ts`, `api/sim/print.d.ts`
- `api/test/store.d.ts`, `api/test/clock.d.ts`, `api/test/render.d.ts`
- `api/core/tree.d.ts` (`upgradeTree`, `treeMoves`) and `api/core/feature.d.ts` (`withMoves`)
