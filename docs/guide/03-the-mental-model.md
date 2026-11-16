# The mental model

In chapter 2 you built Simmer and watched the pot fill. This chapter names every part of what you built, so the rest
of the guide can use those names without stopping to explain them. By the end you will know what a feature is, how
the store is made from features, what happens in one tick and in what order, how the engine tells time, and where a
reset and a save fit in.

Along the way your Simmer grows. The stove learns to work out its price and its rate from its state, to pay less for time
away, and to be switched off; a new feature, a lid, makes the stove work twice as hard; and a small stats feature
becomes the one place every multiplier on the stove goes. The last section lists every
change to your `game.ts` in one place, so you can read first and type after, or type as you go.

The runnable copy of this chapter's Simmer is [`docs/examples/guide-mental-model.ts`](../examples/guide-mental-model.ts).
It imports chapter 2's pot and burner price from [`docs/examples/simmer/game.ts`](../examples/simmer/game.ts), adds
the new stove, the lid and the stats, and plays a few seconds on a fake clock:

```sh
bun docs/examples/guide-mental-model.ts
```

## Features and slices

A game in watchpot is a list of [features](../glossary.md#feature). A feature is one part of the game, declared in one
place: the state it saves, the things a player can do to it, and what it does as time passes. Simmer's pot is a
feature. So is its stove.

Here is the pot, exactly as you wrote it in chapter 2:

<!-- example-code: simmer/game.ts -->

```ts
export const pot = defineFeature({
  key: "pot",
  initial: () => ({ bubbles: ZERO }),
  actions: (api) => ({
    tap: () =>
      api.set((s) => {
        s.pot.bubbles = s.pot.bubbles.add(1);
      }),
  }),
  steps: {
    produce: {
      // Runs on every live tick and on the catch-up after time away.
      simmer: {
        pass: "both",
        run: (s, ctx) => {
          s.pot.bubbles = s.pot.bubbles.add((SIMMER_PER_SECOND * ctx.dtMs) / 1000);
        },
      },
    },
  },
});
```

<sub>`docs/examples/simmer/game.ts`</sub>

Line by line:

- `key: "pot"` is the name the feature's state is stored and saved under. It is written out by hand, never worked out
  from the feature's position in a list, so that reordering your features never breaks a save. A key cannot contain a
  dot, and `clock` is taken (more on that below).
- `initial` returns the state a brand-new player starts with. The engine calls it more often than you might think
  (once when the game is defined, again on every reset), so keep it cheap and keep it free of side effects.
- `actions` returns the things a player can do: here, `tap`. You will see what `api.set` does in a moment.
- `steps` says what the feature does as time passes. The pot has one step, `simmer`, in the phase called `produce`.
  Phases get their own section below.

The state a feature holds is its [slice](../glossary.md#slice). The pot's slice is `{ bubbles }`. Every feature has
exactly one slice, under its key.

## The game and the store

`defineGame` collects the features into a [game](../glossary.md#game). With the lid and the stats added, Simmer's
reads:

<!-- example-code: guide-mental-model.ts -->

```ts
export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  vocab: WORDS,
  features: [pot, stove, lid, stats],
});
```

<sub>`docs/examples/guide-mental-model.ts`</sub>

`vocab: WORDS` is the game's words, the next chapter's subject; for now they name the one stat, `heat`. The game is
only a description. Nothing runs yet. `defineGame` checks the description and throws, naming the
feature, if something is wrong: two features with one key, a feature that reaches one the game does not list, an
action named like a piece of state, or a step that says it runs after a step nobody declares. It also adds one feature
you did not write, the clock, under the key `clock`. You will meet it later in this chapter.

To play the game you make a [store](../glossary.md#store) from it, as chapter 2's `game.ts` does on its last line:

<!-- example-code: simmer/game.ts -->

```ts
export const store = createIdleStore(game, { now: Date.now });
```

<sub>`docs/examples/simmer/game.ts`</sub>

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

Because actions and state share one object, an action may not share a name with a field of its feature's `initial`,
and `defineGame` throws if one does. Give actions verb names (`tap`, `buyBurner`) and state noun names (`bubbles`,
`burners`) and you will not meet it.

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

Plain numbers and booleans in the draft (`s.stove.burners += 1`, `s.lid.on = !s.lid.on`) are assignments already, so
they need no special care.

### An action that returns a value

`api.set` returns whatever the recipe returns. The stove's `buyBurner` uses that to say whether it bought:

<!-- example-code: guide-mental-model.ts -->

```ts
buyBurner: () =>
  api.set((s) => {
    if (!s.stove.canBuy) return false;
    s.pot.bubbles = s.pot.bubbles.sub(s.stove.nextPrice);
    s.stove.burners += 1;
    return true;
  }),
```

<sub>`docs/examples/guide-mental-model.ts`</sub>

`s.stove.canBuy` and `s.stove.nextPrice` are whether the pot can pay for the next burner and its price, which the
stove works out for itself (derived values: their own section is below). The recipe runs straight away, inside `api.set`, so the answer is there when the action returns. Returning early from
a recipe (`return false`) leaves the draft as it was, which is how a refused purchase changes nothing.

A recipe cannot call another action: the engine throws if you try, because the inner change would be lost. When two
actions need the same change, write it once as a plain function that takes the draft, and call that function from
both recipes. Chapter 4's wallet is built that way.

## Reach: one feature touching another

The stove spends the pot's bubbles and pays bubbles back, and how fast it burns depends on the heat, a number another
feature keeps (below). For that it needs `s.pot` and `s.stats`. A feature says which other features it touches with
[`reach`](../glossary.md#reach):

<!-- example-code: guide-mental-model.ts -->

```ts
export const stove = defineFeature({
  key: "stove",
  // A function, so it may name the stats, which are declared further down.
  reach: () => [pot, stats],
  initial: () => ({ burners: 0, off: false }),
  // ...
});
```

<sub>`docs/examples/guide-mental-model.ts`</sub>

`reach` does two things:

1. It types the draft. Inside the stove's actions and steps, `s` has `s.stove`, `s.pot` and `s.stats`, all fully
   typed, with no annotation from you. Without the `reach`, `s.pot` is a type error.
2. It is checked. If the game lists the stove but not the pot, `defineGame` throws.

`reach` may be a plain list (`reach: [pot]`) or a function that returns one. The function form is read only when the
game is defined, so it may name a feature further down the file, as the stove names the stats here.

The stove's slice has grown a field since chapter 2: `off`, a switch you will meet under "What stop does".

Here is the lid, the new feature this chapter adds:

<!-- example-code: guide-mental-model.ts -->

```ts
export const lid = defineFeature({
  key: "lid",
  initial: () => ({ on: false }),
  actions: (api) => ({
    toggle: () =>
      api.set((s) => {
        s.lid.on = !s.lid.on;
      }),
  }),
});
```

<sub>`docs/examples/guide-mental-model.ts`</sub>

The lid knows nothing of the stove, and the stove knows nothing of the lid. The lid's doubling is a source of heat,
declared in the stats feature (under "A first stat" below), and the stove reads only the heat.

`reach` is not transitive. The stove reaches the stats and the stats reach the lid, but the stove's draft has no
`s.lid`. Each feature lists what it touches itself.

Two features that read each other cannot both name the other: each one's type would depend on the other's. One side
names the other by value, and the other names it by its state type, `reach<{ stove: { burners: number } }>()`.
`defineGame` checks that a feature with that key and that state is really in the game. From chapter 4 on, Simmer's
stove names the stats this way, because later chapters' stats read the stove (a medal for ten burners, in chapter 8).

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

You place a step by writing it under its phase in `steps`, with a name: `steps.produce.burn`. Its id is
`<feature>.<phase>.<name>`, here `stove.produce.burn`. Ids are how one step refers to another (below), and how the
engine names it in errors.

### The eight phases

```text
guard     decide whether this pass does any work at all; return "stop" to refuse it
sync      bring time-driven state up to now: expire what ended, arrive what is due
rates     work out a rate that needs the time or the pass (most rates are derived values instead)
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

The order is the point. Payment happens before automation, so an autobuyer spends this tick's income. Achievements
are checked last, against the state after everything else has moved.

In chapter 2 the stove worked out its rate inside its `produce` step. Now the rate has a name of its own, and `burn`
only pays it:

<!-- example-code: guide-mental-model.ts -->

```ts
produce: {
  // Live play pays in full.
  burn: {
    pass: "tick",
    run: (s, ctx) => {
      s.pot.bubbles = s.pot.bubbles.add(s.stove.perSecond.mul(ctx.dtMs / 1000));
    },
  },
  // ...
},
```

<sub>`docs/examples/guide-mental-model.ts`</sub>

Where `s.stove.perSecond` comes from is the next two sections.

### Derived values

The stove now has three values that no step sets and the save never holds: the price of the next burner, the rate,
and whether the pot can pay for that burner. Each is a [derived value](../glossary.md#derived-value): worked out by
the stove from the state, declared once beside `initial`:

<!-- example-code: guide-mental-model.ts -->

```ts
initial: () => ({ burners: 0, off: false }),
derived: [
  {
    // The price of the next burner, worked out from how many are lit. Never saved.
    nextPrice: (s) => burnerPrice(s.stove.burners),
    // The burners' flame, times heat: the one number every multiplier on the stove goes into.
    perSecond: (s) => flameOf(s.stove.burners).mul(s.stats.heat),
  },
  // A second layer sees the first: whether the pot holds enough for the next burner.
  { canBuy: (s) => s.pot.bubbles.gte(s.stove.nextPrice) },
],
```

<sub>`docs/examples/guide-mental-model.ts`</sub>

Take `nextPrice` first. It is chapter 2's `burnerPrice(burners)`, but it lives on the state: `s.stove.nextPrice` in a
recipe (as `buyBurner` reads it above), `store.getState().stove.nextPrice` on the page. Its type is whatever the
function returns, here a Decimal. Four things make it different from a field in `initial`:

- **It is never saved.** A save holds `burners` and `off`; the price comes back from them on load.
- **It cannot be written.** Assigning to it throws. To change it, change what it reads: buy a burner.
- **It is always current.** The engine works it out on load and on reset, and again whenever a slice it read has been
  changed. Buy a burner and the next thing that reads `s.stove.nextPrice` sees the new price, whether that is a step,
  an action or the page. (Within one step it is as of the start of that step: a step sees what earlier steps did, not
  its own writes.)
- **It reads, and nothing else.** The function sees the feature's saved state and what it reaches. It must not write,
  draw a random number or read the clock.

Then `canBuy`: a boolean, true while the pot holds at least the next price. It reads `nextPrice`, another derived value
of the same stove, so it sits in a second layer: `derived` may be a list of blocks, and each block sees the values of
the blocks before it on `s.stove`. (With nothing reading a sibling, one plain block is enough, as in most features.)
The layers are only how the types are read. You never say what is worked out first: the engine follows what each value
actually reads, and throws, naming the loop, if two read each other. `buyBurner` asks `canBuy`, and a page could grey
out its button on it.

The example prints both right after buying the first burner, with no pass in between:

<!-- example-prints: guide-mental-model.ts | the next one costs: 12 | can buy it: false -->

`the next one costs: 12`, ten bubbles times 1.15 rounded up, and `can buy it: false`: the pot spent its ten.
A number that needs the time (a buff that ends at a given moment) or the pass (a different rate while away) cannot be
a derived value, because a derived value never reads the clock. That is what the `rates` phase is for: a step there
works the number out with `ctx` in hand, into a field listed as `transient` (below). The engine's generators do this,
because a running buff can change their rate. Most numbers are like the stove's and need neither.

### A first stat

The rate is the stove's flame times `s.stats.heat`. `flameOf` is a small helper beside the stove: the stove's own
rate, before anything multiplies it.

<!-- example-code: guide-mental-model.ts -->

```ts
/** The stove's own rate, in bubbles a second, before anything multiplies it. */
export const flameOf = (burners: number) => D(burners * BURNER_PER_SECOND);
```

<sub>`docs/examples/guide-mental-model.ts`</sub>

Heat is a [stat](../glossary.md#stat): a named number that many things can change. Right now one thing does, the
lid. Later chapters add an upgrade, a timed boost, a medal and a reset bonus, and every one of them changes heat, not
the stove. The stove reads heat and never needs to know what raised it. The stats live in one feature of their own,
made by the engine's `defineStats`:

<!-- example-code: guide-mental-model.ts -->

```ts
export const stats = defineStats({
  key: "stats",
  vocab: WORDS,
  reach: [lid],
  stats: { heat: { base: 1 } },
  sources: [{ label: "The lid", owner: "lid", active: (q) => q.lid.on, effects: [{ stat: "heat", mul: 2 }] }],
});
```

<sub>`docs/examples/guide-mental-model.ts`</sub>

- `stats: { heat: { base: 1 } }` declares the stat and what it is with nothing raising it: 1, because heat multiplies.
- `sources` is what raises it. The lid's is one line: while `active` says the lid is on, heat is multiplied by 2.
- `reach: [lid]` lets the source read `q.lid`, as any feature's reach does.

Each stat is a derived value of the stats feature, `s.stats.heat`, a Decimal. So the stove's `perSecond` is one
derived value reading another. You never say which goes first: the engine works them out in the order they read each
other (heat, then the rate), and throws, naming the loop, if two read each other. The example prints both right after
the lid goes on:

<!-- example-prints: guide-mental-model.ts | heat: 2 | the stove's rate: 2 -->

`heat: 2` and `the stove's rate: 2`: the lid doubled the heat, and one burner at double heat makes two bubbles a second.
[Chapter 8](08-effects.md) is about stats in depth: adding sources from upgrades and boosts, and a tooltip that says
where a number came from.
### Order inside a phase

Several features can have steps in the same phase. Inside one phase the steps run in the order the features are
listed in `features`, and the clock's own steps run last. A step that must run after another says so itself, with
`after` (or `before`), naming a step id or a whole feature's key in the same phase:

```ts
produce: {
  tally: { pass: "both", after: "stove.produce.burn", run: (s) => { /* ... */ } },
},
```

A name that matches no step in that phase makes `defineGame` throw. Simmer's steps need no order of their own: the
pot and the stove each pay into the pot, and either can go first. If you find yourself ordering a step so that it
works a number out before another reads it, make the number a derived value instead: it needs no order.

When you want to see the real order, `resolvedSteps(game, pass)` returns every step id a pass runs, in order. The
example prints it. For a live tick it reads:

<!-- example-output: guide-mental-model.ts lines=9-9 -->

```text
tick: stove.guard.cold, clock.guard.dt, pot.produce.simmer, stove.produce.burn, clock.commit.lastSeen
```

A test that asserts this list is a cheap way to make sure a later change does not reorder your steps by accident.

### What "stop" does

A step may return the string `"stop"`. The stove's guard does, when the stove is switched off:

<!-- example-code: guide-mental-model.ts -->

```ts
// A stove that is off heats nothing: stop the pass before any work phase runs.
guard: { cold: (s) => (s.stove.off ? "stop" : undefined) },
```

<sub>`docs/examples/guide-mental-model.ts`</sub>

The switch is an ordinary action, `toggle`, that flips `s.stove.off`.

`"stop"` from a step in any phase from `guard` to `settle` skips the rest of that phase and every later phase up to
`settle`. Then `commit` and `after` run anyway. So with the stove off, nothing is paid (not even the pot's own
simmer, which is in `produce` too), nothing is bought and nothing is checked, but the clock still records that the
time passed. That last part matters: the time the stove spent off is spent. It is not owed to the player later.

`"stop"` from a `commit` or `after` step is ignored. A step that returns nothing just carries on.

The clock uses `"stop"` itself. A tick with `dtMs` of 0 is stopped by `clock.guard.dt` and only commits.

## Two passes: the tick and the catch-up

Ticks cover time while the game is open. When the player comes back after closing the tab, the time they were away
has to be paid for too, and running thousands of tiny ticks to cover it would be slow. So the store has a second
[pass](../glossary.md#pass), the [catch-up](../glossary.md#catch-up): the root action `catchUp()` runs the same eight
phases once, with `ctx.dtMs` set to the whole gap since the clock last committed.

A step can say which pass it belongs to:

- `{ pass: "both", run }` runs in both. The pot's `simmer` says so, so the pot simmers at its full rate while you are
  away.
- `{ pass: "tick", run }` runs only in live ticks.
- `{ pass: "catchUp", run }` runs only in catch-ups.

A step in `produce`, the phase that pays, must say one of the three: `defineGame` refuses a `produce` step without a
`pass`, because paying the live rate for a week away is a decision, not a default. A step in any other phase may be a
bare function, `(s, ctx) => …`, and then runs in both (the stove's guard is one).

The stove uses both forms in `produce`, so live play and time away pay differently:

<!-- example-code: guide-mental-model.ts -->

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

with the two numbers it uses declared beside the stove:

<!-- example-code: guide-mental-model.ts -->

```ts
/** How much of an absence the stove pays for, and for how long at most. */
export const OFFLINE_RATE = 0.5;
export const AWAY_CAP_MS = 2 * 60 * 60 * 1000;
```

<sub>`docs/examples/guide-mental-model.ts`</sub>

Why not let `burn` run in both passes? Because then a player away for a week is paid for a full week at the live
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

<!-- example-code: guide-mental-model.ts -->

```ts
let wall = 1_000_000;
const store = createIdleStore(game, {
  now: () => wall,
  storage: createGameStorage(createMemoryBackend()),
});
const play = store.getState;

play().catchUp(); // the first catch-up: no gap yet, so nothing is paid
for (let i = 0; i < 10; i++) play().pot.tap();
console.log("bought a burner:", play().stove.buyBurner()); // true: 10 bubbles spent
console.log("the next one costs:", fmt(play().stove.nextPrice).text); // 12: worked out from one burner lit
console.log("can buy it:", play().stove.canBuy); // false: the pot is empty
play().lid.toggle();
console.log("heat:", fmt(play().stats.heat).text); // 2: the lid doubles it
console.log("the stove's rate:", fmt(play().stove.perSecond).text); // 2: one burner at double heat

wall += 1000;
play().tick(1000); // one second live: the pot's 1, plus the stove's 2
console.log("after a second:", fmt(play().pot.bubbles).text);

wall += 60_000;
play().catchUp(); // a minute away: the pot's simmer in full, the stove at half rate
console.log("after a minute away:", fmt(play().pot.bubbles).text);

play().stove.toggle(); // the stove off: the guard stops every pass
wall += 1000;
play().tick(1000);
console.log("a second with the stove off:", fmt(play().pot.bubbles).text);
```

<sub>`docs/examples/guide-mental-model.ts`</sub>

<!-- example-prints: guide-mental-model.ts | after a second: 3 | after a minute away: 123 | a second with the stove off: 123 -->

`createMemoryBackend()` keeps the save in memory, so the script touches nothing on disk. Run it and you should see 3
bubbles after the live second (the pot's 1, plus one burner doubled to 2), 123 after the minute away (the pot's 60 in
full, plus the stove's 120 paid at half), and still 123 after a second with the stove off.

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
3. Treats a gap longer than 5 seconds (`AWAY_AFTER_MS`), such as a laptop waking from sleep, as time away: it sends
   that to `catchUp` instead, and flushes the save.
4. When the tab is hidden, stops the interval and flushes the save. When the tab comes back, it pays the hidden time
   the same way: as ticks if it was 5 seconds or less, as a catch-up if it was longer.

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

## State that does not save: `transient`

A derived value is never saved, and that covers most numbers worked out from the state. The other kind of unsaved
state is a field a step or an action sets that means nothing after a reload: a sheet that is open, a pointer, a rate a
`rates` step worked out from the clock. A feature lists those in `transient`:

```ts
initial: () => ({ burners: 0, sheetOpen: false }),
transient: ["sheetOpen"],
```

A transient key never reaches the save. After a load it comes back as whatever `initial` says. Simmer has none yet.
[Chapter 9](09-saving-and-time-away.md) goes into saving in depth.

## Your `game.ts` after this chapter

Open the `game.ts` you wrote in chapter 2 and make five changes. The pot does not change.

1. **Add the stove's numbers and its rate helper** below `burnerPrice`: `OFFLINE_RATE` and `AWAY_CAP_MS` (from "Two
   passes") and `flameOf` (from "A first stat"), and the game's words, `WORDS` (below).
2. **Replace the stove** with this one. Compared with chapter 2's, it reaches the stats too; it has a new field, `off`,
   and three derived values, `nextPrice`, `perSecond` and `canBuy`; a second action, `toggle`; and its one `produce` step, `burn`,
   has become the guard `cold` and two pass-limited payments, `burn` and `away`. `buyBurner` reads `canBuy` and the price off
   the state.

   <!-- example-code: guide-mental-model.ts -->

   ```ts
   export const stove = defineFeature({
     key: "stove",
     // A function, so it may name the stats, which are declared further down.
     reach: () => [pot, stats],
     initial: () => ({ burners: 0, off: false }),
     derived: [
       {
         // The price of the next burner, worked out from how many are lit. Never saved.
         nextPrice: (s) => burnerPrice(s.stove.burners),
         // The burners' flame, times heat: the one number every multiplier on the stove goes into.
         perSecond: (s) => flameOf(s.stove.burners).mul(s.stats.heat),
       },
       // A second layer sees the first: whether the pot holds enough for the next burner.
       { canBuy: (s) => s.pot.bubbles.gte(s.stove.nextPrice) },
     ],
     actions: (api) => ({
       buyBurner: () =>
         api.set((s) => {
           if (!s.stove.canBuy) return false;
           s.pot.bubbles = s.pot.bubbles.sub(s.stove.nextPrice);
           s.stove.burners += 1;
           return true;
         }),
       toggle: () =>
         api.set((s) => {
           s.stove.off = !s.stove.off;
         }),
     }),
     steps: {
       // A stove that is off heats nothing: stop the pass before any work phase runs.
       guard: { cold: (s) => (s.stove.off ? "stop" : undefined) },
       produce: {
         // Live play pays in full.
         burn: {
           pass: "tick",
           run: (s, ctx) => {
             s.pot.bubbles = s.pot.bubbles.add(s.stove.perSecond.mul(ctx.dtMs / 1000));
           },
         },
         // Time away pays half, for two hours at most.
         away: {
           pass: "catchUp",
           run: (s, ctx) => {
             const credited = Math.min(ctx.dtMs, AWAY_CAP_MS) * OFFLINE_RATE;
             s.pot.bubbles = s.pot.bubbles.add(s.stove.perSecond.mul(credited / 1000));
           },
         },
       },
     },
   });
   ```

   <sub>`docs/examples/guide-mental-model.ts`</sub>

3. **Add the lid** (from "Reach") and **the stats** (from "A first stat") after the stove.
4. **Add the words** above the stove:

   <!-- example-code: guide-mental-model.ts -->

   ```ts
   export const WORDS = vocab({ currencies: ["bubbles"], stats: ["heat"] });
   ```

5. **Change `defineGame`** to take `vocab: WORDS` and list `[pot, stove, lid, stats]`, as in "The game and the store".

Add `defineStats` and `vocab` to the import from `watchpot/core` (`D` was already there for chapter 2's stove). Your
save keeps working: the new field is not in it yet, so it starts at its `initial` value.

Your page needs no change, and it still runs. Two things on it are not aware of this chapter yet: it has no buttons
for the lid or the stove's switch, and its rate line, `perSecond(burners)`, does not count the heat. That is fine for
now; to try them, run the example. [Chapter 6](06-the-first-page.md) builds the page properly.
## Things that bite

- **Forgetting to reassign a Decimal.** `s.x.add(1)` alone does nothing and raises nothing, because Decimals never
  change. Always `s.x = s.x.add(1)`.
- **`pass: "both"` on a payment pays time away in full.** A `produce` step that runs in the catch-up at the live rate
  pays a week away at the live rate with no cap. Decide on purpose.
- **A derived value cannot be written, or read the clock.** Assigning to `s.stove.nextPrice` throws. A number that
  needs `now` (a buff running, a timer) belongs in a `rates` step and a `transient` field instead.
- **The clock's steps run last in their phase.** So your `guard` steps run before the clock refuses a zero-length
  tick, and on a catch-up with no gap your `produce` steps run with `dtMs` 0 before the clock stops the pass. Write
  steps that do nothing when `dtMs` is 0 (multiplying by it does that for you) and do not count on a guard of your own
  running after the clock's.
- **A value that reads another of the same feature goes in a later layer.** In one block, each function sees the
  feature's saved state and its reach, not its siblings: `canBuy` sits in a second block to read `nextPrice`. A value
  of another feature (`s.stats.heat`) reads plainly through `reach`.
- **The default reset is `"run"`.** A feature that should survive a run reset has to say so.
- **The key `clock` is taken,** and feature keys cannot contain a dot.

## Next

[Chapter 4, Words and numbers](04-words-and-numbers.md): Decimals properly, formatting numbers for a player, and
naming your currencies once so the whole game agrees on them. Simmer's bubbles move into a wallet.

## Reference

- [Start a game](../start-a-game.md), [Add a generator](../add-a-generator.md) and [Time away](../time-away.md) on the
  reference shelf.
- `api/core/feature.d.ts`: `feature`, `reach`, `FeatureDef` (`derived`, `transient`), `FeatureApi`, `Step`,
  `StepDef` (`pass`, `after`, `before`), `StepContext`, `PHASES`, `EARNING_PHASES`, `Pass`, `ResetRule`, `StateOf`.
- `api/core/game.d.ts`: `defineGame`, `GameDef`.
- `api/core/stats.d.ts`: `defineStats`; `api/core/vocab.d.ts`: `vocab`.
- `api/core/store.d.ts`: `createIdleStore`, `IdleStoreOptions`, `RootActions`.
- `api/core/tick.d.ts`: `resolvedSteps`, `passSteps`.
- `api/core/clock-feature.d.ts`: `clockFeature`, `ClockState`, `startGameClock`, `GameClockOptions`.
- `api/core/clock.d.ts`: `TICK_INTERVAL_MS`, `MAX_STEP_MS`, `AWAY_AFTER_MS`, `createClock`.
- `api/react/gameClock.d.ts` (`useGameClock`) and `api/react/clock.d.ts` (`warpClock`).
