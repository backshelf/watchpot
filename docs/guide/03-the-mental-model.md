# The mental model

In chapter 2 you built Simmer and watched the pot fill. This chapter names every part of what you built, so the rest
of the guide can use those names without stopping to explain them. By the end you will know what a feature is, how
the store is made from features, what happens in one tick and in what order, how the engine tells time, and where a
reset and a save fit in. Along the way you will add a lid to Simmer that reaches into the stove.

Everything here is in one file you can run: `docs/examples/guide-mental-model.ts`. It rebuilds Simmer's pot and
stove so it stands on its own, then adds the lid. Two things differ from chapter 2's
[`game.ts`](../examples/simmer/game.ts): the pot makes nothing by itself, so every bubble after your taps comes from
a burner, and the pot can be lifted off the stove, which a later section needs.

So this chapter is something to read and run, not a change to type into your chapter 2 files. Keep your `game.ts` as
it is; the ideas here carry over to it unchanged, and chapter 4 picks Simmer up again. If you do want the lid in your
own game, the stove has to change shape first: its rate becomes a [transient](../glossary.md#transient) number worked
out in a `rates` step, and two steps in `produce` pay it out, one for play and one for time away. The sections below
build exactly that, one piece at a time.

The example declares four small helpers at the top, and the snippets below use them:

```ts
/** The price of the next burner, as chapter 2 set it: 10 bubbles, 15% more each, rounded up. */
const burnerPrice = (owned: number): Decimal => costAt({ base: 10, growth: 1.15, round: "ceil" }, owned);
const heatOf = (owned: number): Decimal => D(owned);

/** How much of an absence the stove pays for, and for how long at most. */
const OFFLINE_RATE = 0.5;
const AWAY_CAP_MS = 2 * 60 * 60 * 1000;
```

<sub>`docs/examples/guide-mental-model.ts`</sub>

`burnerPrice` is chapter 2's `burnerPrice`. `heatOf` is the stove's rate for a number of burners, one bubble a
second each. If you fold the lid into your own game, add chapter 2's simmer of one a second inside `heatOf`, so the
rate includes it. `OFFLINE_RATE` and `AWAY_CAP_MS` say how time away is paid:
half the live rate, for two hours at most.

```sh
bun docs/examples/guide-mental-model.ts
```

## Features and slices

A game in watchpot is a list of [features](../glossary.md#feature). A feature is one part of the game, declared in one
place: the state it saves, the things a player can do to it, and what it does as time passes. Simmer's pot is a
feature. So is its stove.

Here is the pot:

```ts
const pot = feature({
  key: "pot",
  initial: () => ({ bubbles: ZERO, lifted: false }),
  actions: (api) => ({
    tap: () =>
      api.set((s) => {
        s.pot.bubbles = s.pot.bubbles.add(1);
      }),
    lift: () =>
      api.set((s) => {
        s.pot.lifted = !s.pot.lifted;
      }),
  }),
  steps: {
    // A pot off the stove does not boil: stop the pass before any work phase runs.
    guard: { lifted: (s) => (s.pot.lifted ? "stop" : undefined) },
  },
});
```

<sub>`docs/examples/guide-mental-model.ts`</sub>

Line by line:

- `key: "pot"` is the name the feature's state is stored and saved under. It is written out by hand, never worked out
  from the feature's position in a list, so that reordering your features never breaks a save. A key cannot contain a
  dot, and `clock` is taken (more on that below).
- `initial` returns the state a brand-new player starts with: no bubbles, pot on the stove. The engine calls it more
  often than you might think (once when the game is defined, again on every reset), so keep it cheap and keep it free
  of side effects.
- `actions` returns the things a player can do: `tap` and `lift`. You will see what `api.set` does in a moment.
- `steps` says what the feature does as time passes. This one has a single step, in the phase called `guard`. Phases
  get their own section below.

The state a feature holds is its [slice](../glossary.md#slice). The pot's slice is `{ bubbles, lifted }`. Every
feature has exactly one slice, under its key.

## The game and the store

`defineGame` collects the features into a [game](../glossary.md#game):

```ts
export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  features: [pot, stove, lid],
  // The lid's doubling must land after the stove sets the rate. Pinned here, it holds whatever the list order.
  order: { rates: ["stove.rates.heat", "lid.rates.trap"] },
});
```

<sub>`docs/examples/guide-mental-model.ts`</sub>

The game is only a description. Nothing runs yet. `defineGame` checks the description and throws, naming the
feature, if something is wrong: two features with one key, a feature that reaches one the game does not list, an
`order` entry that names a step nobody declares. It also adds one feature you did not write, the clock, under the key
`clock`. You will meet it later in this chapter.

To play the game you make a [store](../glossary.md#store) from it:

```ts
const store = createIdleStore(game, { now: () => Date.now() });
```

The store holds the whole game's state as one object, with each slice under its feature's key:
`store.getState().pot.bubbles`, `store.getState().stove.burners`. It is a [zustand](https://zustand.docs.pmnd.rs/)
store, so anything that works with zustand (subscribing, selecting) works with it. It also loads the save when it is
made and writes it back as the state changes; [chapter 9](09-saving-and-time-away.md) covers that.

You never write the store's type yourself. TypeScript reads it off the feature list, so adding a field to the pot's
`initial` makes `store.getState().pot.<field>` exist everywhere at once. `StateOf<typeof game.features>` names that
type when you need to write it down.

## Actions sit beside state

Look at where the pot's actions end up:

```ts
store.getState().pot.tap();
store.getState().pot.bubbles;
```

The [actions](../glossary.md#action) are spread into the same object as the slice. `tap` sits next to `bubbles`. You
call an action where you read the state it changes, and a React component that reads `s.pot` gets both.

The store adds a few actions of its own at the top level, beside the features: `tick`, `catchUp`, `gameNow`,
`resetRun`, `resetProfile`, `exportProfile` and `importProfile`. These are the root actions, and this chapter
explains most of them. A game can add its own top-level actions with `defineGame({ actions })`.

One thing the engine does not check: if an action has the same name as a field in `initial`, the action silently
replaces the field. Give actions verb names (`tap`, `buyBurner`) and state noun names (`bubbles`, `burners`) and you will not
meet this.

## Drafts and recipes

Inside an action, you change the game with `api.set`, and you hand it a function:

```ts
api.set((s) => {
  s.pot.bubbles = s.pot.bubbles.add(1);
});
```

That function is a [recipe](../glossary.md#recipe), and `s` is a [draft](../glossary.md#draft). The draft looks like
the whole game state, and you change it by assigning to it as if it were a plain object. Behind it is
[immer](https://immerjs.github.io/immer/): when the recipe returns, immer turns your assignments into a new state
object, leaving the old one untouched, and the store publishes the new one. Components that read a part that did not
change see the same object as before and do not redraw.

Every recipe sees the whole game, not only its own slice. That is why the pot writes `s.pot.bubbles` and not
`s.bubbles`. Which parts of the game the recipe is allowed to see is a matter of types, covered under `reach` below.

### Why Decimals are reassigned

Idle games outgrow JavaScript numbers, so watchpot counts big things with [Decimal](../glossary.md#decimal) (from
`break_eternity.js`). [Chapter 4](04-words-and-numbers.md) covers them properly. One rule matters here: a Decimal
never changes. `add`, `sub` and `mul` each return a new Decimal and leave the one you called them on as it was.

So this line does nothing at all:

```ts
s.pot.bubbles.add(1); // computes a new Decimal and throws it away
```

There is no error and no warning. The fix is to assign the result back, which is also how immer learns that something
changed:

```ts
s.pot.bubbles = s.pot.bubbles.add(1);
```

Plain numbers and booleans in the draft (`s.stove.burners += 1`, `s.pot.lifted = !s.pot.lifted`) are assignments
already, so they need no special care.

### An action that returns a value

`api.set` returns nothing, so an action that wants to say whether it worked has to carry the answer out of the recipe
in a variable. The stove's `buyBurner` does this:

```ts
buyBurner: (): boolean => {
  let bought = false;
  api.set((s) => {
    const cost = burnerPrice(s.stove.burners);
    if (s.pot.bubbles.lt(cost)) return;
    s.pot.bubbles = s.pot.bubbles.sub(cost);
    s.stove.burners += 1;
    bought = true;
  });
  return bought;
},
```

<sub>`docs/examples/guide-mental-model.ts`</sub>

The recipe runs straight away, inside `api.set`, so `bought` is set by the time the action returns. Returning early
from a recipe (`if (...) return;`) leaves the draft as it was, which is how a refused purchase changes nothing.

One more limit: a recipe cannot call another action. Actions call `api.set`, and a `set` inside a `set` does not
work. When two actions need the same change, write it once as a plain function that takes the draft, and call that
function from both recipes.

## Reach: one feature touching another

The stove spends the pot's bubbles and pays bubbles back. For that its recipes need `s.pot`. A feature says which
other features it touches with [`reach`](../glossary.md#reach):

```ts
const stove = feature({
  key: "stove",
  reach: [pot],
  initial: () => ({ burners: 0, perSecond: ZERO }),
  // ...
});
```

<sub>`docs/examples/guide-mental-model.ts`</sub>

`reach: [pot]` does two things:

1. It types the draft. Inside the stove's actions and steps, `s` has `s.stove` and `s.pot`, both fully typed, with
   no annotation from you. Without the `reach`, `s.pot` is a type error.
2. It is checked. If the game lists the stove but not the pot, `defineGame` throws.

`reach` is not transitive. The lid below reaches the stove, and the stove reaches the pot, but the lid's draft has
no `s.pot`. Each feature lists what it touches itself.

Here is the lid, the new feature this chapter adds. With the lid on, the stove works twice as hard:

```ts
const lid = feature({
  key: "lid",
  reach: [stove],
  initial: () => ({ on: false }),
  derive: (s) => {
    if (s.lid.on) s.stove.perSecond = s.stove.perSecond.mul(2);
  },
  actions: (api) => ({
    toggle: () =>
      api.set((s) => {
        s.lid.on = !s.lid.on;
      }),
  }),
  steps: {
    rates: {
      trap: (s) => {
        if (s.lid.on) s.stove.perSecond = s.stove.perSecond.mul(2);
      },
    },
  },
});
```

<sub>`docs/examples/guide-mental-model.ts`</sub>

Ignore `derive` for now; it is near the end of the chapter. The step `trap` writes into another feature's slice, which
`reach` allows. Whether it gives the right answer depends on when it runs, and that is what the tick is about.

If two features need to reach each other, `reach` cannot express it (each would have to be declared before the
other). In that case you annotate one recipe's draft parameter with the whole game's state type yourself. Most games
never need this.

## The tick

An idle game moves forward even when the player does nothing. In watchpot that movement happens in a
[tick](../glossary.md#tick): the store's `tick(dtMs)` action runs once for every slice of time that passes, usually
ten times a second, with `dtMs` the length of that slice in milliseconds.

A tick does not call one big update function. It runs every feature's [steps](../glossary.md#step), sorted into eight
[phases](../glossary.md#phase) that always run in the same order. A step is a function that takes the draft and a
context:

```ts
(s, ctx) => {
  s.pot.bubbles = s.pot.bubbles.add(s.stove.perSecond.mul(ctx.dtMs / 1000));
}
```

`ctx.dtMs` is how much time the tick covers, `ctx.now` is the game time it ends at, and `ctx.pass` says which pass is
running (the next section). Every step of one tick runs inside a single recipe, so the page sees the whole tick land
at once, never half of it.

You place a step by writing it under its phase in `steps`, with a name: `steps.rates.heat`. Its id is
`<feature>.<phase>.<name>`, here `stove.rates.heat`. Ids are how you refer to a step from `order`, and how the engine
names it in errors.

### The eight phases

```text
guard     decide whether this pass does any work at all; return "stop" to refuse it
sync      bring time-driven state up to now: expire what ended, arrive what is due
rates     work out how fast things happen this pass, from the state as it stands
produce   pay out: rate times time
automate  spend on the player's behalf: autobuyers, standing orders
settle    look at the result: goals met, achievements earned, a run that ends
commit    record that the pass happened (the clock's lastSeen); always runs
after     the epilogue: work that must follow every pass; always runs
```

The engine only fixes the names and the order. What goes in each phase is a convention, but the engine's own systems
follow it, so following it too keeps your steps in step with theirs: the buff and spawn systems expire and arrive in
`sync`, generators work out their rates in `rates` and pay in `produce`, autobuyers buy in `automate`, achievements
and challenge goals are checked in `settle`.

The order is the point. Rates are worked out before anything is paid, so a purchase made a moment ago counts in the
very next payout. Payment happens before automation, so an autobuyer spends this tick's income. Achievements are
checked last, against the state after everything else has moved.

Simmer's stove follows this:

```ts
steps: {
  // Both passes: the rate is worked out before anything is paid.
  rates: {
    heat: (s) => {
      s.stove.perSecond = heatOf(s.stove.burners);
    },
  },
  produce: {
    // Live play pays in full.
    boil: {
      pass: "tick",
      run: (s, ctx) => {
        s.pot.bubbles = s.pot.bubbles.add(s.stove.perSecond.mul(ctx.dtMs / 1000));
      },
    },
    // ...
  },
},
```

<sub>`docs/examples/guide-mental-model.ts`</sub>

### Order inside a phase

Several features can have steps in the same phase. Inside one phase the steps run in this order:

1. the step ids the game lists for that phase in `defineGame({ order })`, in the order given;
2. every other step, in the order the features are listed in `features`;
3. the clock's own steps, last.

That is why the lid needs `order`. Both `stove.rates.heat` and `lid.rates.trap` are in `rates`. `heat` sets the
rate; `trap` doubles it. If `trap` ran first, `heat` would overwrite the doubled rate and the lid would do nothing.
With the features listed as `[pot, stove, lid]` the list order happens to be right, but nothing would stop someone
from tidying the list later. The game pins it:

```ts
order: { rates: ["stove.rates.heat", "lid.rates.trap"] },
```

When you want to see the real order, `resolvedSteps(game, pass)` returns every step id a pass runs, in order. The
example prints it. For a live tick it should read:

```text
pot.guard.lifted, clock.guard.dt, stove.rates.heat, lid.rates.trap, stove.produce.boil, clock.commit.lastSeen
```

A test that asserts this list is a cheap way to make sure a later change does not reorder your steps by accident.

### What "stop" does

A step may return the string `"stop"`. The pot's guard does, when the pot has been lifted off the stove:

```ts
guard: { lifted: (s) => (s.pot.lifted ? "stop" : undefined) },
```

`"stop"` from a step in any phase from `guard` to `settle` skips the rest of that phase and every later phase up to
`settle`. Then `commit` and `after` run anyway. So a lifted pot boils nothing, buys nothing and checks nothing, but
the clock still records that the time passed. That last part matters: the time the pot spent off the stove is spent.
It is not owed to the player later.

`"stop"` from a `commit` or `after` step is ignored. A step that returns nothing just carries on.

The clock uses `"stop"` itself. A tick with `dtMs` of 0 (the engine sends one when the tab is hidden, to flush the
save) is stopped by `clock.guard.dt` and only commits.

## Two passes: the tick and the catch-up

Ticks cover time while the game is open. When the player comes back after closing the tab, the time they were away
has to be paid for too, and running thousands of tiny ticks to cover it would be slow. So the store has a second
[pass](../glossary.md#pass), the [catch-up](../glossary.md#catch-up): the root action `catchUp()` runs the same eight
phases once, with `ctx.dtMs` set to the whole gap since the clock last committed.

A step can say which pass it belongs to:

- A bare function runs in **both** passes. That suits `rates.heat`: the rate has to be right before anything is paid,
  whichever pass is paying.
- `{ pass: "tick", run }` runs only in live ticks.
- `{ pass: "catchUp", run }` runs only in catch-ups.

The stove uses both forms in `produce`, so live play and time away pay differently:

```ts
// Time away pays half, for two hours at most.
away: {
  pass: "catchUp",
  run: (s, ctx) => {
    const credited = Math.min(ctx.dtMs, AWAY_CAP_MS) * OFFLINE_RATE;
    s.pot.bubbles = s.pot.bubbles.add(s.stove.perSecond.mul(credited / 1000));
  },
},
```

<sub>`docs/examples/guide-mental-model.ts`</sub>

Why not let `boil` run in both passes? Because then a player away for a week is paid for a full week at the live
rate, with no cap. That may be what your game wants, but it should be a choice. Most idle games pay time away at a
lower rate and up to a limit, which is what `away` does. [Chapter 9](09-saving-and-time-away.md) goes further,
including games whose growth compounds and cannot be paid with one multiplication.

The step form is written as an object literal, `{ pass, run }`, every time. A small helper like `onTick(run)` looks
tidier but breaks the type inference that gives the draft its type.

Two details of the catch-up:

- The very first catch-up of a new profile has `dtMs` 0, because there is no "last seen" yet. It also sets the
  clock's `createdAt`, the moment the profile began.
- A catch-up with no gap stops at the end of `produce` (the clock's `produce.gap` step returns `"stop"`). Your
  `produce` steps still run, with `dtMs` 0; `automate` and `settle` are skipped.

## Game time and wall time

The engine never reads the clock on the wall to know what time it is in the game: there is no `Date.now()` anywhere in
it. You give the store one function that does, the `now` option of `createIdleStore`, and every time the engine needs
the game's time it asks the store. (A few helpers that measure a duration, such as how long an animation has
run, default to `performance.now()`; that is never game time.)

The reason is control. A test passes a fake clock and moves it by hand, so a test of "an hour away" takes no time at
all. The sim lab plays a game for days in seconds the same way. The example does it too:

```ts
let wall = 1_000_000;
const store = createIdleStore(game, {
  now: () => wall,
  storage: createGameStorage(createMemoryBackend(), { durable: false }),
});
const play = store.getState;

play().catchUp(); // the first catch-up: no gap yet, so nothing is paid
for (let i = 0; i < 10; i++) play().pot.tap();
console.log("bought a burner:", play().stove.buyBurner()); // true: 10 bubbles spent
play().lid.toggle();

wall += 1000;
play().tick(1000); // one second live: 1 burner, doubled by the lid
console.log("after a second:", fmt(play().pot.bubbles).text);

wall += 60_000;
play().catchUp(); // a minute away, paid at half rate
console.log("after a minute away:", fmt(play().pot.bubbles).text);
```

<sub>`docs/examples/guide-mental-model.ts`</sub>

Run it and you should see 2 bubbles after the live second (one burner, doubled) and 62 after the minute away (30
seconds' worth at the doubled rate, since time away pays half).

The store does not use your wall time directly either. It keeps a [game time](../glossary.md#game-time):

```text
game time = your now() + the clock's offset
```

`store.getState().gameNow()` returns it, actions read it as `api.now()`, and steps get it as `ctx.now`. The offset
starts at 0, so game time and wall time agree until something moves it. What moves it is a deliberate skip forward:
the dev panel's time warp, or `warpClock(store, ms)` from `watchpot/react`. Moving the offset is how you jump an hour
ahead without lying to the player's computer. Read time through `gameNow()` and a warp works everywhere; read
`Date.now()` in your own code and that code will disagree with the rest of the game after a warp.

## The clock

The clock is the one feature every game has without writing it. `defineGame` adds it under the key `clock`, so do not
give a feature of your own that key. Its slice is three numbers:

- `createdAt`: the game time the profile began (0 until the first catch-up sets it);
- `lastSeen`: the game time the last pass committed, which the next catch-up measures its gap from;
- `offsetMs`: the offset between wall time and game time.

Its steps are the ones you have already met, all running last in their phases: `clock.guard.dt` (a tick with no time
only commits), `clock.guard.createdAt` (catch-up only), `clock.produce.gap` (a catch-up with no gap stops) and
`clock.commit.lastSeen` (every pass, stopped or not).

The clock feature stores time. Something still has to call `tick` and `catchUp`. That is `startGameClock`:

```ts
const clock = startGameClock(store);
```

It does this, in order:

1. Runs one `catchUp`, for whatever time passed since the save was last written, and flushes the save.
2. Starts an interval that fires every 100 ms (`TICK_INTERVAL_MS`) and sends the elapsed time to `tick`. A frame
   longer than a second (`MAX_STEP_MS`) is split into several ticks of at most a second each.
3. Treats a gap longer than 5 seconds (`AWAY_AFTER_MS`), such as a laptop waking from sleep, as time away and sends
   it to `catchUp` instead.
4. When the tab is hidden, stops the interval, sends `tick(0)` and flushes the save. When the tab comes back, sends the
   hidden time to `catchUp`.

It returns a `Clock`; `clock.stop()` stops it. If a tick throws ten times in a row, the clock stops itself and calls
the `onFail` option, so a broken step does not spin forever.

In React you do not call it yourself. `useGameClock(store)` (or `useGameRuntime`, which includes it) starts the clock
when the component mounts and stops it when it unmounts. That is how Simmer's page in chapter 2 keeps time.

## Two kinds of reset

Most idle games have a reset the player chooses: give up this run's progress for something that makes the next run
faster. watchpot calls that a [run reset](../glossary.md#run-reset), the root action `resetRun()`. Each feature
decides what a run reset does to its slice with its `reset` rule. Left unsaid, the rule is `"run"`: the slice goes
back to `initial`. `"never"` leaves it alone, and `{ keep: ["field"] }` resets everything but the named fields. The
clock keeps its offset and moves `createdAt` and `lastSeen` to now.

Notice the default. A feature that says nothing is wiped by every run reset, which is right for the pot's bubbles and
wrong for, say, a settings feature. [Chapter 7](07-the-first-reset.md) covers the rules, reset layers and a step that
ends a run.

A [profile reset](../glossary.md#profile-reset), `resetProfile()`, is the other kind: every feature back to
`initial`, the offset back to zero, as if the player had never played. It ignores the `reset` rules. It is the "delete
my save" button, not a game mechanic.

## State that does not save: `transient` and `derive`

Not everything in a slice belongs in the save. The stove's `perSecond` is worked out from `burners` on every pass;
saving it would only store a number that could go stale. So the stove lists it as
[transient](../glossary.md#transient):

```ts
initial: () => ({ burners: 0, perSecond: ZERO }),
transient: ["perSecond"],
derive: (s) => {
  s.stove.perSecond = heatOf(s.stove.burners);
},
```

<sub>`docs/examples/guide-mental-model.ts`</sub>

A transient key never reaches the save. After a load it comes back as whatever `initial` says, here zero, until a
`rates` step works it out again. That leaves a gap: on the first pass after a load, a `guard` or `sync` step that
reads `perSecond` would read zero. [`derive`](../glossary.md#derive) closes it. The store runs every feature's
`derive` whenever transient state is made fresh (a new store, a load, an import, either kind of reset), so the value
is right before any pass begins. It must be pure: read the state, write the transient fields, nothing else.

You can see why the lid has a `derive` too: its doubling is part of `perSecond`, so it has to be applied wherever the
stove's is. [Chapter 9](09-saving-and-time-away.md) goes into saving in depth.

## Things that bite

- **Forgetting to reassign a Decimal.** `s.x.add(1)` alone does nothing and raises nothing, because Decimals never
  change. Always `s.x = s.x.add(1)`.
- **A bare step runs in both passes.** A `produce` step without `pass: "tick"` pays time away at the full live rate
  with no cap. Decide on purpose.
- **A short hide counts as time away.** When the tab comes back, `startGameClock` sends the whole hidden time to
  `catchUp`, even if it was two seconds of switching windows. So a catch-up rate below the live rate also applies to a
  quick switch between tabs, not only to a closed game. Keep that in mind when you set an offline rate; chapter 9
  returns to it.
- **The clock's steps run last in their phase.** So your `guard` steps run before the clock refuses a zero-length
  tick, and on a catch-up with no gap your `produce` steps run with `dtMs` 0 before the clock stops the pass. Write
  steps that do nothing when `dtMs` is 0 (multiplying by it does that for you) and do not count on a guard of your own
  running after the clock's.
- **`derive` runs in feature-list order, not in `order`.** The `order` option sorts steps only. If one feature's
  `derive` builds on another's, as the lid's does on the stove's, list the features in that order too.
- **The default reset is `"run"`.** A feature that should survive a run reset has to say so.
- **The key `clock` is taken,** and feature keys cannot contain a dot.

## Next

[Chapter 4, Words and numbers](04-words-and-numbers.md): Decimals properly, formatting numbers for a player, and
naming your currencies once so the whole game agrees on them.

## Reference

- [Start a game](../start-a-game.md), [Add a generator](../add-a-generator.md) and [Time away](../time-away.md) on the
  reference shelf, and [The stat graph](../stat-graph.md) for "The first pass after a load".
- `api/core/feature.d.ts`: `feature`, `FeatureDef`, `FeatureApi`, `Step`, `StepDef`, `StepContext`, `PHASES`,
  `Pass`, `ResetRule`, `DeriveContext`, `StateOf`.
- `api/core/game.d.ts`: `defineGame`, `GameDef`, `StepOrder`.
- `api/core/store.d.ts`: `createIdleStore`, `IdleStoreOptions`, `RootActions`.
- `api/core/tick.d.ts`: `resolvedSteps`, `passSteps`.
- `api/core/clock-feature.d.ts`: `clockFeature`, `ClockState`, `startGameClock`, `GameClockOptions`.
- `api/core/clock.d.ts`: `TICK_INTERVAL_MS`, `MAX_STEP_MS`, `AWAY_AFTER_MS`, `createClock`.
- `api/react/gameClock.d.ts` (`useGameClock`) and `api/react/clock.d.ts` (`warpClock`).
