# What watchpot is

By the end of this chapter you will know what watchpot does for you and what it leaves to you, which part of it
answers which need of an idle game, what you need installed to use it, and how the rest of this guide is laid out.
It is the short chapter: read it to decide whether to read on.

## An engine for idle games

An idle game is a game that keeps playing while you look away. Numbers grow on their own, you spend them on things
that make them grow faster, and every so often you give most of it up to start again stronger. Underneath, every
idle game needs the same machinery: numbers too big for JavaScript's `number`, a clock that keeps ticking, a save
that survives a closed tab, a fair account of the hours you were away, a way to reset a run without losing
everything, and a page that shows it all without stuttering.

watchpot is that machinery, written in TypeScript for [Bun](https://bun.sh) and React 19. You describe your game as a
list of [features](../glossary.md#feature) (a piece of state plus the rules that change it), and watchpot builds the
[store](../glossary.md#store) that holds them, runs them on a clock, saves them and brings them back.

Here is a taste: the heart of Simmer, the game the guide builds, a pot you tap for bubbles that also simmers them up
on its own.

<!-- example-code: simmer/game.ts -->

```ts
import { costAt, createIdleStore, D, defineFeature, defineGame, ZERO } from "watchpot/core";

// ...

/** The pot: the bubbles you have, the tap that makes one, and the simmer that makes them over time. */
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

// ...

/** The game: its features, and where and at which version it saves. */
export const game = defineGame({
  id: "simmer",
  save: { key: "simmer.save", version: 1 },
  features: [pot, stove],
});
```

*watchpot, `docs/examples/simmer/game.ts`*

The parts left out are a constant, `SIMMER_PER_SECOND` (one bubble a second), and a second feature, the `stove`,
whose burners you buy with bubbles. You do not need to follow every line yet. [Chapter 2](02-your-first-game.md) builds this game properly, puts it on
a page and makes it save, and [chapter 3](03-the-mental-model.md) explains what each part is doing.

## The one split

One rule explains most of how watchpot is shaped:

**The engine gives you mechanism and behaviour. Your game gives every look.**

The engine owns state, rules, timing, saving, keyboard handling, focus, accessibility attributes and the plumbing
that gets a shader onto the GPU. It ships no stylesheet (the dev panel, a developer's tool, has its own), no class
name, no font, no colour and no English text. A test in the repository (`test/rules/headless.test.ts`) fails the
build if a stylesheet or a class name of the engine's own creeps in; the rest is kept by review.

The reason is that idle games live or die on how they feel, and a default look is a look every game would have to
fight. So a dialog from watchpot knows how to trap focus and close on Escape, and reports whether it is open on a
`data-*` attribute, but it has no idea what it looks like. Your game styles it.

You do not start from a blank page, though. The game template ships a set of styled components (buttons, panels,
sheets, tabs and the rest) that a new game copies into its own `src/ui/` folder. From then on they are your code to
restyle, rewrite or delete. [Chapter 10](10-the-page.md) and [chapter 11](11-look-and-sound.md) cover this.

## What is in the box

watchpot is one package with twelve entries, each imported on its own path: ten a game imports, and two for build
scripts. A game takes the ones it needs.

| Entry | What it gives you |
| --- | --- |
| `watchpot/core` | The kernel: big numbers, formatting, seeded randomness, the clock, saving, the feature store, and the ready-made systems (generators, prestige, upgrade trees, achievements and about twenty more). No React. |
| `watchpot/sim` | The sim lab: an auto-player that plays your game at machine speed on a schedule, so you can measure pacing. No React. |
| `watchpot/test` | The test kit: fresh stores, saves for a given point in a game, a fake clock and render helpers. |
| `watchpot/react` | React bindings: store hooks, the running clock, the page runtime, layout and hotkeys. No stylesheet. |
| `watchpot/devtools` | The dev panel and the sound desk, for a development build. The one entry that carries a stylesheet. |
| `watchpot/kit` | Effects with no look: number tickers, confetti bursts, gesture tracking, a director that paces celebrations, and the mechanism for a reveal. |
| `watchpot/ui` | Headless components: dialogs, tabs, tooltips, toasts, grids, focus helpers. Behaviour and accessibility, no style. |
| `watchpot/shader` | A canvas that runs your own 2D fragment shaders, with a library of GLSL pieces to build them from. |
| `watchpot/sound` | A sound engine: cues, buses, mixing and music, on its own WebAssembly audio core, playing recordings and zzfx voices. |
| `watchpot/three` | A 3D stage on three.js and React Three Fiber. |

The other two are for build scripts rather than games: `watchpot/kit/theme` (the compiler that turns a design token
file into CSS) and `watchpot/sound/pack` (a tool that turns downloaded samples into a sound pack). They come up in
[chapter 11](11-look-and-sound.md).

Two boundaries hold across all of them. `core` and `sim` never import React, so your game's rules run and test
without a browser. And the engine never names a game: nothing in it knows what your currency is called.

## What it deliberately does not do

- **It has no look.** See above. Expect to write CSS, or to restyle the template's.
- **It never reads the wall clock.** You pass `now` when you create the store, and the engine asks you for the time.
  That is what lets the sim lab play a week in a second and lets a test move time by hand.
- **It does not write your game.** The systems in `core` are mechanism (how a generator's cost grows, how a prestige
  pays out). Which generators exist, what they cost and what they are called is content you write.
- **It has no server.** Saves go to the browser's local storage by default, or to any storage backend you hand it.
  There are no accounts, leaderboards or cloud saves.
- **It is not on npm.** See the next section.

## What you need

- **Bun 1.4.3 or newer.** watchpot runs, bundles and tests on Bun, and its typecheck command is `bun check`, which
  arrived in Bun 1.4.3. Its `package.json` states the minimum under `engines`, and so does the template's. The
  repository is developed on 1.4.4. Node is not needed.
- **git, with read access to the watchpot repository on GitHub.** watchpot is a private package. It is not
  published to any registry; a game installs a released version by its git tag:

  ```json
  "watchpot": "git+ssh://github.com/backshelf/watchpot.git#v1.0.0"
  ```

  Bun fetches that with your machine's own git credentials, so the install works only for a GitHub account that
  can read the repository: today, its owner and anyone they add to it. If you cannot clone
  `github.com/backshelf/watchpot`, you cannot install it either. The [README](../../README.md#install) has the
  one-time `gh auth` setup and the URL forms that do not work.
- **The peer packages.** React 19 (`react` and `react-dom`), immer, zustand and break_eternity.js are peers: your
  game installs them itself. The rest are optional, each needed only by the entry that uses it: zzfx by
  `watchpot/sound`, three.js and React Three Fiber by `watchpot/three`, canvas-confetti and `@number-flow/react` by
  `watchpot/kit`, and `@testing-library/react` by `watchpot/test`. watchpot's own `package.json` lists the version
  ranges under `peerDependencies`, and the template's `package.json.tmpl` pins the ones a new game installs.

## How this was made

Most of watchpot's code was written by an AI model, Anthropic's Claude. A person set the direction, built games on
it, reviewed what came back and decided what stayed. That holds for the tests and the docs too, this guide
included. It is said here, near the start, so you can read the code and judge it knowing that.

## How to read this guide

The guide is meant to be read front to back. Each chapter starts with what you will have by the end and finishes
with the things that tend to go wrong, a link to the next chapter, and links to the reference pages for what it
covered.

Two games run through it. **Simmer** is a tiny game about a pot on a stove, written for this guide. You build it in
chapters 2 to 4, and it keeps growing: each later chapter that needs a small example adds its piece to the same
game rather than starting a new one. **VOID IF REMOVED** is a real
game built on watchpot. From chapter 5 on, each idea is shown on its real code, as short excerpts captioned with the
game's name and the file. Its repository is not public, so the guide names files rather than linking them. Its
owner is still playing it for the first time, so the guide only ever shows what a player meets in the first hour.

1. **What watchpot is**: this chapter.
2. [**Your first game**](02-your-first-game.md): Simmer, from an empty folder to a page that ticks and saves.
3. [**The mental model**](03-the-mental-model.md): features, the store, the tick and its phases, game time.
4. [**Words and numbers**](04-words-and-numbers.md): big numbers, formatting, and naming your game's things.
5. [**A real game**](05-a-real-game.md): how VOID IF REMOVED is put together.
6. [**The first page**](06-the-first-page.md): the systems behind a game's opening screen.
7. [**The first reset**](07-the-first-reset.md): runs, resets and prestige.
8. [**Effects**](08-effects.md): how upgrades and bonuses add up to the numbers you see.
9. [**Saving and time away**](09-saving-and-time-away.md): saves, migrations and the catch-up when a player returns.
10. [**The page**](10-the-page.md): reading the store from React, the runtime, headless UI.
11. [**Look and sound**](11-look-and-sound.md): themes, feel, shaders and sound.
12. [**Proving the pacing**](12-proving-the-pacing.md): the sim lab, pacing contracts and the test kit.
13. [**From the template**](13-from-the-template.md): starting a real game from the template in one command.

After the chapters:

- [**Showcases**](../showcases.md): what has been built on watchpot.
- [**Glossary**](../glossary.md): every term the guide uses, in one place.
- **The reference shelf**: the per-system pages in [`docs/`](../README.md), one per system or task. They assume you
  know the vocabulary from chapters 2 to 4, and they are where to look things up once you do.
- **`api/`**: the generated type declarations for the twelve entries, with a doc line on each export. When the guide
  and `api/` disagree, `api/` is right.

If you are in a hurry, read chapters 2 and 3, then jump to the chapter for whatever you are building.

## Things that bite

- **The install fails with a 404 or an auth error.** The repository is private, so the shorter
  `github:backshelf/watchpot` form and plain `git+https://` URLs fail even with access: they go through an
  endpoint that cannot see private repositories. Use the `git+ssh://github.com/...` form above, with no user name in
  it.
- **An older Bun fails on `bun check`.** The typecheck script needs Bun 1.4.3 or newer. Run `bun upgrade`.
- **Nothing looks like anything.** That is the split working as designed. The engine's components are unstyled
  until your game styles them; start from the template's `src/ui/` rather than from bare `watchpot/ui`.

## Next

[Chapter 2: Your first game](02-your-first-game.md) builds Simmer from an empty folder.

## Reference

- [`README.md`](../../README.md): install, and a map of the entries; [`docs/core.md`](../core.md),
  [`docs/react.md`](../react.md) and their siblings for the long-form reference.
- [`docs/README.md`](../README.md): the index of the reference shelf.
- [`templates/game/src/ui/README.md`](../../templates/game/src/ui/README.md): the copy-in components and their token
  contract.
- `api/core/index.d.ts`, `api/react/index.d.ts`, `api/ui/index.d.ts` and the other `api/<entry>/index.d.ts` files:
  what each entry exports. The two build-tool paths are under `api/kit/theme/` and `api/sound/pack/`.
