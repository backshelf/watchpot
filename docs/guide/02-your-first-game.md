# Your first game

By the end of this chapter you will have Simmer running in your browser: a pot you tap for bubbles, a stove whose
burners make bubbles every second, a save that survives a reload, and a note that tells you what the pot made while
the tab was closed. You will write five small files by hand, and every line in them is explained here.

Simmer is deliberately tiny. It is the cookie-clicker shape every idle game starts from, and it is enough to show the
four things the engine does for you: it holds the state, ticks it forward, saves it, and pays for time away.

## Before you start

You need three things. [Chapter 1](01-what-watchpot-is.md#what-you-need) explains each one.

- **Bun 1.4.3 or newer.** Check with `bun --version`; `bun upgrade` fixes an older one.
- **Read access to the watchpot repository on GitHub.** The engine is installed from its git tag, with your own git
  credentials (Bun tries HTTPS first, then SSH). If you cannot `git clone` the repository either way, the install
  below will fail too.
- **A browser,** with its developer tools, for step 4.

Nothing else. There is no template and no generator in this chapter; that path is
[chapter 13](13-from-the-template.md), and it makes more sense once you have seen what it generates.

## The five files

Make an empty folder called `simmer` and open a terminal in it. By the end it will hold:

```
simmer/
  package.json     what to install
  tsconfig.json    how TypeScript reads your code
  index.html       the page the browser loads
  game.ts          the game: its state, its rules, its store
  main.tsx         the page: React components that show the game
```

The first three never change after this section. The last two grow, step by step.

### package.json

```json
{
  "name": "simmer",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun ./index.html",
    "build": "bun build ./index.html --outdir dist --production",
    "typecheck": "bun check"
  },
  "dependencies": {
    "watchpot": "git+ssh://github.com/backshelf/watchpot.git#v0.17.0",
    "break_eternity.js": "2.1.3",
    "immer": "11.2.9",
    "react": "19.3.1",
    "react-dom": "19.3.1",
    "zustand": "5.0.16",
    "zzfx": "1.4.0"
  },
  "devDependencies": {
    "@types/bun": "^1.4.4",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "typescript": "^7.0.2"
  }
}
```

Line by line:

- `"type": "module"` makes every file an ES module, which is what the engine is written as.
- The three scripts are the only commands you will run: `dev` serves the page while you work, `build` bundles it for
  the web, and `typecheck` runs `bun check`, Bun's typecheck command.
- `watchpot` is the engine, pinned to a released version by its git tag. Write the URL exactly as shown: the
  `github:` shorthand and `git+https://` forms do not work for this repository, and the URL must not contain a user
  name.
- The next six are the engine's [peers](../glossary.md#peer): packages the engine imports but does not install, so that your game and
  the engine share one copy of each. `break_eternity.js` is the big-number library (more on it in step 1), `immer`
  and `zustand` hold the state, `react` and `react-dom` draw the page, and `zzfx` is the sound synthesiser. Simmer
  makes no sound, but the engine still expects `zzfx` to be installed.
- The dev dependencies are types for Bun and React, and the TypeScript compiler `bun check` uses.

The engine is published as TypeScript source, not compiled JavaScript. That is why Bun matters here: it reads `.ts`
files directly, both when it bundles and when it runs a script. A tool chain that cannot read TypeScript inside
`node_modules` cannot use watchpot.

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "module": "Preserve",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "allowImportingTsExtensions": true,
    "types": ["bun"]
  },
  "include": ["*.ts", "*.tsx", "node_modules/watchpot/env.d.ts", "node_modules/watchpot/src/css-vars.d.ts"]
}
```

These are the same compiler options the engine and its game template use. The ones that matter to you:
`"moduleResolution": "bundler"` lets you import `watchpot/core` the way a bundler resolves it, `"jsx": "react-jsx"`
lets `.tsx` files hold JSX without importing React, and `"noEmit": true` says TypeScript only checks; Bun does the
building.

The `include` line needs a word. The first two entries are your own files. The last two are declaration files that
live inside the engine. Because the engine ships source, TypeScript checks the engine's files too, and a few of them
(the development panel, which you will meet in a later chapter) import CSS modules and set CSS custom properties.
Those two files teach TypeScript what a CSS import is and that `--name` is a valid style key. Leave them out and
`bun check` reports about twenty errors, all inside `node_modules/watchpot`, none of them yours.

### index.html

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Simmer</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

An HTML page that points straight at a `.tsx` file. Bun's dev server and bundler both start from this file, follow
the script tag, and compile everything it imports. The empty `<div id="root">` is where the game will draw; the
engine looks for that id and throws `No #root element` if it is missing.

Now install:

```sh
bun install
```

This is the step that needs your GitHub access. When it finishes you have a `node_modules` folder with the engine
and its peers in it.

## Step 1: a pot you can tap

Create `game.ts`:

```ts
import { createIdleStore, defineGame, feature, ZERO } from "watchpot/core";

const pot = feature({
  key: "pot",
  initial: () => ({ bubbles: ZERO }),
  actions: (api) => ({
    tap: () =>
      api.set((s) => {
        s.pot.bubbles = s.pot.bubbles.add(1);
      }),
  }),
});

export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  features: [pot],
});

export const store = createIdleStore(game, { now: Date.now });
```

*The first version of `docs/examples/simmer/game.ts`; the finished file, at the end of the chapter, grows from it.*

Three calls make a game. Here is what each one does.

**`feature` declares one part of the game.** A [feature](../glossary.md#feature) is a piece of state together with
everything that changes it. The pot is one:

- `key: "pot"` is its name. Its state lives under that key, so you will read it as `s.pot.bubbles`.
- `initial` returns the state a brand-new player starts with: no bubbles. `ZERO` is the number zero as a
  [Decimal](../glossary.md#decimal), the engine's number type. Idle games outgrow JavaScript's numbers (they top out
  near 1.8e308, and a long game passes that), so balances are Decimals from `break_eternity.js`. A Decimal is
  immutable: `bubbles.add(1)` returns a new Decimal and leaves `bubbles` alone, which is why the line assigns the
  result back.
- `actions` are the things a player can do. An [action](../glossary.md#action) changes state through `api.set`,
  which hands you a draft of the whole game state, `s`. You change the draft as if it were a plain object, and the
  engine turns your changes into a new state when the function returns. (That is what `immer` is for.)

**`defineGame` lists the features and says where the game saves.** `id` names the game. `save.key` is the key its
save is stored under, and `save.version` is the version of the save's shape; you bump it when the shape changes,
which [chapter 9](09-saving-and-time-away.md) covers. `features` is the list. Right now it is one.

**`createIdleStore` runs the game.** The [store](../glossary.md#store) holds the current state of every feature, the
actions next to it, and a handful of actions of its own. The one option you must pass is `now`, the function that
tells the store what time it is. The engine never reads the clock itself; your game hands it `Date.now` here, once.
That is what lets tests and simulations run a game at any speed they like.

You can try it already, without a page:

```sh
bun -e 'import { store } from "./game.ts"; store.getState().pot.tap(); console.log(store.getState().pot.bubbles.toString())'
```

It prints `1`. `store.getState()` returns everything the store holds; `.pot` is the pot's state, and its action
`tap` sits right beside `bubbles` on the same object.

## Step 2: a page with a button

Create `main.tsx`:

```tsx
import { fmt } from "watchpot/core";
import { createRuntimeHooks, mountGame } from "watchpot/react";
import { store } from "./game";

const { useGameStore, useGameState } = createRuntimeHooks<typeof store>();

function Pot() {
  const game = useGameStore();
  const bubbles = useGameState((s) => s.pot.bubbles);
  return (
    <section>
      <h1>{fmt(bubbles).text} bubbles</h1>
      <button type="button" onClick={() => game.getState().pot.tap()}>
        Tap the pot
      </button>
    </section>
  );
}

function App() {
  return (
    <main>
      <Pot />
    </main>
  );
}

mountGame(store, <App />);
```

*The first version of `docs/examples/simmer/main.tsx`.*

Start the dev server:

```sh
bun run dev
```

Open the address it prints. (To choose the port, add `--port=4231` or any free number after the command:
`bun run dev --port=4231`.) You should see `0 bubbles` and a button. Tap it, and the number goes up by one each time.

What is new here:

- **`createRuntimeHooks<typeof store>()`** makes the two React hooks your components use, typed for this game's
  store. You call it once, at the top of the file, and use what it returns everywhere.
- **`useGameState(selector)`** reads one value out of the store and re-renders the component when that value
  changes. Pick out exactly the value you show, as `(s) => s.pot.bubbles` does. A selector that builds a new object
  every time (`(s) => ({ a: s.pot.bubbles })`) looks equal to nothing, so the component re-renders until React gives
  up with an error;
  [chapter 10](10-the-page.md) shows the ways to read many values at once.
- **`useGameStore()`** returns the store itself. In a click handler you call `game.getState()` and then the action.
  Reading state with `getState()` during render would not re-render anything; that is what `useGameState` is for.
- **`fmt(value)`** formats a number the way idle games do: plain digits with separators below 100,000, then
  `152.00K`, `1.52M` and so on. It returns an object (the digits, the suffix, the sign and the full string), so you write
  `.text` to get the string. It always rounds down, so the player never sees a number they do not have.
- **`mountGame(store, <App />)`** finds `#root`, makes the store available to every hook below it, and renders.

If you wait a second and reload the page, the count is still there. Nothing you wrote asked for that. Step 4
explains it, and why the second matters.

## Step 3: the clock

An idle game is a game that plays while you watch. So far Simmer only changes when you tap. Two changes make it
simmer on its own: a [step](../glossary.md#step) on the pot that adds bubbles over time, and a clock that runs the
steps ten times a second.

In `game.ts`, add two constants above the pot, and give the pot a `steps` field after its `actions`:

```ts
/** Bubbles a second the pot makes on its own, and each burner adds. */
export const SIMMER_PER_SECOND = 1;
export const BURNER_PER_SECOND = 1;

// ...

/** The pot: the bubbles you have, the tap that makes one, and the simmer that makes them over time. */
const pot = feature({
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
      simmer: (s, ctx) => {
        s.pot.bubbles = s.pot.bubbles.add((SIMMER_PER_SECOND * ctx.dtMs) / 1000);
      },
    },
  },
});
```

*`docs/examples/simmer/game.ts`. `BURNER_PER_SECOND` is used in step 6; you can add it now or then.*

A step is a function the engine calls on every [tick](../glossary.md#tick), the small slice of time the game moves
forward by. It gets the same kind of draft an action gets, plus `ctx`, which says how long this tick was in
milliseconds (`ctx.dtMs`). Multiplying the rate by `dtMs / 1000` makes the pot pay one bubble per second whether
ticks arrive ten times a second or once.

Steps are grouped by [phase](../glossary.md#phase). A phase is a named stage of the tick, and every step in one phase runs before any step
in the next. `produce` is the phase where income is paid. There are eight phases in all; you will need only
`produce` until [chapter 3](03-the-mental-model.md) walks through the rest. `simmer` is just this step's name.

A step does nothing until something ticks the store. In `main.tsx`, add `useGameClock` to the import and call it at
the top of `App`:

```tsx
import { createRuntimeHooks, mountGame, useGameClock } from "watchpot/react";

// ...

function App() {
  useGameClock(store);
  return (
    <main>
      <Pot />
    </main>
  );
}
```

Save both files and look at the page. The count now climbs by one every second, and taps still add one on top.

`useGameClock` starts the engine's clock when the page mounts and stops it when the page goes away. Call it once, in
the component at the top of your page. While it runs it ticks the store every 100 milliseconds. It also does two
things you will see in the next two steps: it saves when the tab is hidden, and when the page opens it first pays for
the time since the game last ran.

## Step 4: the save

You did not write any saving code, and the game saves anyway. When you call `createIdleStore` without a `storage`
option, the store saves to the browser's `localStorage` under the key you gave as `save.key`.

See it for yourself. Open the browser's developer tools, find **Application** (Chrome, Edge) or **Storage** (Firefox),
then **Local Storage** and your page's address. There is one entry, `simmer.save`. Its value looks like this:

```json
{"state":{"pot":{"bubbles":{"$d":"23.155"}},"clock":{"lastSeen":1794800722325,"createdAt":1794800704074,"offsetMs":0}},"version":1}
```

Three things are in it:

- **`pot`**, your feature's state. The Decimal is written as `{"$d": "..."}` so it comes back as a Decimal, not a
  string. Functions, such as the `tap` action, are never saved.
- **`clock`**, the state of a feature you did not write. `defineGame` adds the engine's own clock feature to every
  game. `lastSeen` is the last moment the game ran, and step 5 depends on it.
- **`version`**, the `save.version` you set.

Now reload the page. The count picks up where it was.

Saving is not instant. The store waits until a second has passed without a change before it writes, so a game that
changes ten times a second does not write ten times a second. When the tab is hidden or closed, the clock writes at
once, so nothing is lost when the player leaves. In step 2 there was no clock yet, which is why a reload had to wait
for that second.

If the browser has no `localStorage` at all (some privacy modes block it), the store keeps the save in memory instead
and the game still runs; it just forgets everything when the tab closes.

## Step 5: time away

Close the tab. Wait at least half a minute. Open the page again.

The count is higher than when you left: the pot kept simmering while the tab was closed. That is the
[catch-up](../glossary.md#catch-up). When the page opens, the clock does not start ticking straight away. First it
runs the steps once over the whole gap since `lastSeen`, with `ctx.dtMs` set to the length of that gap. Your `simmer`
step does not know or care whether it is paying for 100 milliseconds or for a week: it multiplies by `dtMs` either way.

Paying for the time is half of it. The other half is telling the player. Add a note that appears when they come back.
In `main.tsx`, add `fmtPlayed` to the import from `watchpot/core`, and `type AwayReturn`, `type StoreState` and
`useAwayReport` to the import from `watchpot/react`. Then, below the line that calls `createRuntimeHooks`:

```tsx
type State = StoreState<typeof store>;

// ...

/** What the pot made while you were away, from the state before the catch-up and the state after. */
function summarize({ before, after, ms }: AwayReturn<State>) {
  return { made: after.pot.bubbles.sub(before.pot.bubbles), ms };
}

/** The welcome back. A child of `App`, so it is listening before the clock's first catch-up. */
function AwayNote() {
  const { report, dismiss } = useAwayReport(summarize);
  if (!report) return null;
  return (
    <aside>
      <p>
        While you were away ({fmtPlayed(report.ms)}), the pot made {fmt(report.made).text} bubbles.
      </p>
      <button type="button" onClick={dismiss}>
        Nice
      </button>
    </aside>
  );
}
```

*`docs/examples/simmer/main.tsx`*

And put the note at the top of `App`:

```tsx
function App() {
  useGameClock(store);
  return (
    <main>
      <AwayNote />
      <Pot />
    </main>
  );
}
```

Close the tab again, wait half a minute or more, and open it. A line at the top reads something like "While you were
away (0m 48s), the pot made 48 bubbles."

How it works:

- **`useAwayReport(summarize)`** watches the store for a catch-up. When one covers 30 seconds or more, it calls
  `summarize` with the whole state from just before the catch-up (`before`), the state just after (`after`), and the
  time it covered (`ms`). Whatever `summarize` returns becomes `report`, until `dismiss` clears it. Shorter absences
  are paid for silently; you can change the threshold with the `minMs` option.
- **`StoreState<typeof store>`** is the type of the store's state, so `before.pot.bubbles` is typed.
- **`fmtPlayed(ms)`** prints a length of time: `0m 48s`, or `4h 25m` past an hour.
- **`AwayNote` is a child of `App`, and that matters.** The clock pays the catch-up the moment `App` mounts. React
  starts a child's effects before its parent's, so the child is already listening when that happens. Call
  `useAwayReport` in `App` itself, after `useGameClock`, and the first catch-up has already happened by the time it
  starts listening.

## Step 6: a burner you can buy

The last piece is what makes it a game: something to spend bubbles on that makes more bubbles. That is the
[generator](../glossary.md#generator), the building every idle game has. Simmer's is a burner. Each burner you light adds a bubble a second,
and each one costs more than the last.

This needs a second feature, the stove, which spends the pot's bubbles. In `game.ts`, add `costAt` and `D` to the
import from `watchpot/core`, then add this between the pot and `defineGame`:

```ts
/** The first burner costs 10 bubbles; each one after costs 15% more than the last, rounded up to whole bubbles. */
export const BURNER_COST = { base: 10, growth: 1.15, round: "ceil" } as const;

/** The price of the next burner when `owned` are lit. */
export function burnerPrice(owned: number) {
  return costAt(BURNER_COST, owned);
}

/** The stove: how many burners are lit, buying one, and the heat they add. */
const stove = feature({
  key: "stove",
  reach: [pot],
  initial: () => ({ burners: 0 }),
  actions: (api) => ({
    buyBurner: () =>
      api.set((s) => {
        const price = burnerPrice(s.stove.burners);
        if (s.pot.bubbles.lt(price)) return;
        s.pot.bubbles = s.pot.bubbles.sub(price);
        s.stove.burners += 1;
      }),
  }),
  steps: {
    produce: {
      heat: (s, ctx) => {
        const made = D(s.stove.burners * BURNER_PER_SECOND).mul(ctx.dtMs / 1000);
        s.pot.bubbles = s.pot.bubbles.add(made);
      },
    },
  },
});
```

*`docs/examples/simmer/game.ts`*

Then list the stove in the game, and add a helper the page will use for the rate:

```ts
export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  features: [pot, stove],
});
```

```ts
/** What the whole stove makes a second with `burners` lit. */
export function perSecond(burners: number): number {
  return SIMMER_PER_SECOND + burners * BURNER_PER_SECOND;
}
```

What is new:

- **`reach: [pot]`** is how one feature touches another. Without it, the stove's draft has only `s.stove`. With it,
  `s.pot` is there too, typed, and `defineGame` checks that the pot really is in the game.
- **`costAt(curve, owned)`** is the price of the next one when `owned` are already bought. The curve here is
  geometric: 10, then 10 × 1.15, then 10 × 1.15², and so on. `round: "ceil"` rounds each price up to a whole number.
  Without it the second burner would cost 11.5 bubbles, `fmt` would show it as 11, and the player would see a button
  they cannot press with 11 bubbles in the pot.
- **`buyBurner` checks before it spends.** `lt` is "less than"; Decimals compare with methods, not `<`. If the pot
  cannot pay, the action returns without changing anything.
- **`burners` is a plain number.** You will never own more burners than JavaScript can count. Only amounts that grow
  without limit, like bubbles, need to be Decimals. `D(n)` turns a plain number into a Decimal when the two meet.
- **`heat` is a second `produce` step.** Both the pot's `simmer` and the stove's `heat` run every tick, and both run
  in the catch-up, so burners earn while you are away too.

Now the page. In `main.tsx`, add `fmtCounted` and `fmtRate` to the import from `watchpot/core`, and import
`burnerPrice` and `perSecond` from `./game` next to `store`. Then add a `Stove` component and a rate line on the pot:

```tsx
/** The pot: the count, the rate, and the button that taps it. */
function Pot() {
  const game = useGameStore();
  const bubbles = useGameState((s) => s.pot.bubbles);
  const burners = useGameState((s) => s.stove.burners);
  return (
    <section>
      <h1>{fmt(bubbles).text} bubbles</h1>
      <p>{fmtRate(perSecond(burners))}</p>
      <button type="button" onClick={() => game.getState().pot.tap()}>
        Tap the pot
      </button>
    </section>
  );
}

/** The stove: how many burners are lit, and the button that buys the next. */
function Stove() {
  const game = useGameStore();
  const burners = useGameState((s) => s.stove.burners);
  const price = burnerPrice(burners);
  const canAfford = useGameState((s) => s.pot.bubbles.gte(price));
  return (
    <section>
      <p>{fmtCounted(burners, ["burner", "burners"])} lit</p>
      <button type="button" disabled={!canAfford} onClick={() => game.getState().stove.buyBurner()}>
        Light a burner for {fmt(price).text} bubbles
      </button>
    </section>
  );
}
```

*`docs/examples/simmer/main.tsx`*

Put `<Stove />` after `<Pot />` in `App`. On the page, the rate reads `1.0/s`. Once you have 10 bubbles the burner
button lights up; press it and the rate reads `2.0/s`, the count drops by 10, and the next burner costs 12. Reload,
and the burner is still lit: the stove's state is in the save next to the pot's, with no extra work.

Two details in the components:

- `canAfford` is a selector that returns a boolean. It re-renders `Stove` only when the answer flips, not every time
  the bubble count moves.
- `fmtRate` prints a rate per second (`3.0/s`), and `fmtCounted` picks the singular or the plural (`1 burner`,
  `2 burners`).

You wrote the burner by hand on purpose, so that nothing in it is hidden. A real game has many generators, several
currencies and a reset, and the engine has factories that write this code for you: `currencies` for balances, in
[chapter 4](04-words-and-numbers.md), and `generators` for the building list, in [chapter 6](06-the-first-page.md).
They do what the stove does here, with buy-many, buy-max and milestones on top.

## The whole game

Here are both files as they stand at the end. They are the exact contents of `docs/examples/simmer/`, which the
engine's own typecheck and linter cover.

```ts
import { costAt, createIdleStore, D, defineGame, feature, ZERO } from "watchpot/core";

/** Bubbles a second the pot makes on its own, and each burner adds. */
export const SIMMER_PER_SECOND = 1;
export const BURNER_PER_SECOND = 1;

/** What the whole stove makes a second with `burners` lit. */
export function perSecond(burners: number): number {
  return SIMMER_PER_SECOND + burners * BURNER_PER_SECOND;
}

/** The pot: the bubbles you have, the tap that makes one, and the simmer that makes them over time. */
const pot = feature({
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
      simmer: (s, ctx) => {
        s.pot.bubbles = s.pot.bubbles.add((SIMMER_PER_SECOND * ctx.dtMs) / 1000);
      },
    },
  },
});

/** The first burner costs 10 bubbles; each one after costs 15% more than the last, rounded up to whole bubbles. */
export const BURNER_COST = { base: 10, growth: 1.15, round: "ceil" } as const;

/** The price of the next burner when `owned` are lit. */
export function burnerPrice(owned: number) {
  return costAt(BURNER_COST, owned);
}

/** The stove: how many burners are lit, buying one, and the heat they add. */
const stove = feature({
  key: "stove",
  reach: [pot],
  initial: () => ({ burners: 0 }),
  actions: (api) => ({
    buyBurner: () =>
      api.set((s) => {
        const price = burnerPrice(s.stove.burners);
        if (s.pot.bubbles.lt(price)) return;
        s.pot.bubbles = s.pot.bubbles.sub(price);
        s.stove.burners += 1;
      }),
  }),
  steps: {
    produce: {
      heat: (s, ctx) => {
        const made = D(s.stove.burners * BURNER_PER_SECOND).mul(ctx.dtMs / 1000);
        s.pot.bubbles = s.pot.bubbles.add(made);
      },
    },
  },
});

/** The game: its features, and where and at which version it saves. */
export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  features: [pot, stove],
});

/** The store the page reads. `now` is the one place the game reads the wall clock. */
export const store = createIdleStore(game, { now: Date.now });
```

*`docs/examples/simmer/game.ts`*

```tsx
import { fmt, fmtCounted, fmtPlayed, fmtRate } from "watchpot/core";
import {
  type AwayReturn,
  createRuntimeHooks,
  mountGame,
  type StoreState,
  useAwayReport,
  useGameClock,
} from "watchpot/react";
import { burnerPrice, perSecond, store } from "./game";

/** The store hooks, typed for this game. Made once, used by every component. */
const { useGameStore, useGameState } = createRuntimeHooks<typeof store>();

type State = StoreState<typeof store>;

/** The pot: the count, the rate, and the button that taps it. */
function Pot() {
  const game = useGameStore();
  const bubbles = useGameState((s) => s.pot.bubbles);
  const burners = useGameState((s) => s.stove.burners);
  return (
    <section>
      <h1>{fmt(bubbles).text} bubbles</h1>
      <p>{fmtRate(perSecond(burners))}</p>
      <button type="button" onClick={() => game.getState().pot.tap()}>
        Tap the pot
      </button>
    </section>
  );
}

/** The stove: how many burners are lit, and the button that buys the next. */
function Stove() {
  const game = useGameStore();
  const burners = useGameState((s) => s.stove.burners);
  const price = burnerPrice(burners);
  const canAfford = useGameState((s) => s.pot.bubbles.gte(price));
  return (
    <section>
      <p>{fmtCounted(burners, ["burner", "burners"])} lit</p>
      <button type="button" disabled={!canAfford} onClick={() => game.getState().stove.buyBurner()}>
        Light a burner for {fmt(price).text} bubbles
      </button>
    </section>
  );
}

/** What the pot made while you were away, from the state before the catch-up and the state after. */
function summarize({ before, after, ms }: AwayReturn<State>) {
  return { made: after.pot.bubbles.sub(before.pot.bubbles), ms };
}

/** The welcome back. A child of `App`, so it is listening before the clock's first catch-up. */
function AwayNote() {
  const { report, dismiss } = useAwayReport(summarize);
  if (!report) return null;
  return (
    <aside>
      <p>
        While you were away ({fmtPlayed(report.ms)}), the pot made {fmt(report.made).text} bubbles.
      </p>
      <button type="button" onClick={dismiss}>
        Nice
      </button>
    </aside>
  );
}

/** The page. It starts the clock once, for the whole game. */
function App() {
  useGameClock(store);
  return (
    <main>
      <AwayNote />
      <Pot />
      <Stove />
    </main>
  );
}

mountGame(store, <App />);
```

*`docs/examples/simmer/main.tsx`*

## Check it and ship it

Two commands are worth running now and after every change:

```sh
bun run typecheck
bun run build
```

`typecheck` should end with `No type errors`. `build` writes the finished page to `dist/`: an `index.html` and one
minified script, about 300 KB before compression. `--production` also leaves out the engine's development-only code.
Put `dist/` on any static host and the game runs there, saving to each player's own browser.

## Things that bite

- **Forgetting to assign a Decimal.** `s.pot.bubbles.add(1)` on its own line does nothing: Decimals never change in
  place, so the new value is thrown away. Always write `s.pot.bubbles = s.pot.bubbles.add(1)`.
- **Time away is paid in full, with no limit.** A step written as a plain function runs in both the live tick and the
  catch-up, so a player who leaves for a month comes back to a month of income at the full rate. That is fine for
  Simmer and wrong for most games. [Chapter 9](09-saving-and-time-away.md) shows how to pay a share of the time, up to
  a cap.
- **A brief switch to another tab counts as time away too.** When a hidden tab comes back, the clock pays the gap as a catch-up, not
  as ticks. With full-rate steps you cannot tell the difference. Once you pay time away at a lower rate (chapter 9),
  you will see a brief switch to another tab earn at that lower rate.
- **Deleting the save while the page is open does not delete it.** If you remove `simmer.save` in the developer tools
  and reload, the page writes its save one last time as it unloads, and the old game comes back. To start over, close
  every tab of the game before deleting the entry, or give yourself a button that calls the store's own reset:
  `<button type="button" onClick={() => store.getState().resetProfile()}>Start over</button>`.
- **A second tab stops the first.** Open Simmer in two tabs and the one that saved last wins: the other tab notices
  the newer save, stops its clock and stops writing, so it can never overwrite the newer game. It does not say so on
  screen unless you show it; `useGameClock` returns `{ taken }` for that.
- **The away note needs 30 seconds and the right place in the tree.** Shorter absences are paid but not reported.
  And `useAwayReport` must be in a component below the one that calls `useGameClock` (step 5 explains why).
- **`fmt` returns an object.** `{fmt(n)}` in JSX is an error; write `{fmt(n).text}`. And because `fmt` rounds down,
  a price with a fraction shows lower than it is: round prices to whole numbers (`round: "ceil"`), as the burner does.
- **`bun check` fails inside `node_modules/watchpot`.** If you see about twenty errors in the engine's development
  panel files about `.module.css` or `--` style keys, the two engine declaration files are missing from your
  `tsconfig.json`'s `include`.

## Next

[Chapter 3: The mental model](03-the-mental-model.md) names every part of what you just built (features, the store,
the tick and its phases, the clock and the catch-up) and shows the order they run in.

## Reference

- [`docs/start-a-game.md`](../start-a-game.md): the same three calls as a short reference page.
- [`docs/add-a-generator.md`](../add-a-generator.md) and [`docs/generators.md`](../generators.md): generators beyond
  one hand-written burner.
- [`docs/time-away.md`](../time-away.md): capping and reporting time away.
- [`README.md`](../../README.md#install): install, and the React section on the store hooks.
- `api/core/feature.d.ts` (`feature`, steps and phases), `api/core/game.d.ts` (`defineGame`),
  `api/core/store.d.ts` (`createIdleStore`, `IdleStoreOptions`, the root actions), `api/core/storage.d.ts` (the
  save's storage), `api/core/cost.d.ts` (`costAt`), `api/core/fmt.d.ts` (`fmt`, `fmtRate`, `fmtCounted`,
  `fmtPlayed`), `api/core/decimal.d.ts` (`D`, `ZERO`).
- `api/react/store.d.ts` (`createRuntimeHooks`, `mountGame`, `StoreState`), `api/react/gameClock.d.ts`
  (`useGameClock`), `api/react/away.d.ts` (`useAwayReport`, `AwayReturn`).
