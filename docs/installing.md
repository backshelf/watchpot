# Installing, and the shape of the package

How to install watchpot, how to change the engine and a game together, and what the twelve entries are and may rely on. Which entry may import which is in [imports](imports.md).

## Install

**Requirements:** Bun 1.4.3 or later (`engines.bun`; every typecheck script runs `bun check`, which older Bun does
not know).

watchpot 1.0 is meant to be published on npm as `watchpot` under the MIT licence: `bun add watchpot`. A release that
is not on npm yet installs by git tag. Each release is an annotated tag `vX.Y.Z` (see `CHANGELOG.md`). In a game's
`package.json`:

```json
"watchpot": "git+ssh://github.com/backshelf/watchpot.git#vX.Y.Z"
```

While the repository is private, Bun runs git for a `git+ssh://` URL (HTTPS first, then SSH), so the machine's own git
credentials serve it. `github:backshelf/watchpot#vX.Y.Z` and `git+https://github.com/...` go only to the api.github.com
tarball endpoint and 404 on a private repo (oven-sh/bun#19618), so do not use them. The game installs the peers in
`peerDependencies` itself. Write no user in the URL (`github.com`, not `git@github.com`): Bun's HTTPS try keeps it
as the username, and `gh auth git-credential` answers only for its own login. Once per machine: `gh auth login`,
then `gh auth setup-git`.

`package.json`'s `files` names what a consumer or the scaffold needs (`src/`, `api/`, `docs/`, `templates/`,
`codemods/`, the env declarations, the README and the changelog), and a packed tarball carries only those; Bun's git
install ignores `files` and checks out the whole tree. A game's typecheck needs no engine declarations: `watchpot/devtools`, the one entry with CSS modules, carries its own
references.

A page whose imports reach no CSS module needs no dev script: `bun ./index.html [--port=N]` serves it and hot-reloads
it. `watchpot/devtools` reaches one (the dev panel's), as does any game CSS module, so the template's `dev.ts` serves the
page with HMR off instead, working around Bun's CSS-module reload (oven-sh/bun#18258).

## Developing the engine and a game together

1. Change the engine; `bun run verify`, commit (an export change regenerates `api/`).
2. Release it: bump `version`, add a `CHANGELOG.md` line, `bun run gates`, `git tag -a vX.Y.Z -m vX.Y.Z`, push the
   branch and the tag.
3. In the game, change the tag in `package.json` and run `bun install`. A breaking release names its codemod in
   `CHANGELOG.md`; run it from the game's root, `bun node_modules/watchpot/codemods/<file>.ts [--write]`
   ([`codemods/README.md`](codemods/README.md)).

To try an unreleased engine change in a game before tagging it, point the dependency at a sibling checkout,
`"watchpot": "file:../watchpot"`, and run `bun install`. Restore the tag before committing the game: a `file:`
dependency builds nowhere else.

`node_modules` links are absolute paths: after moving or renaming the checkout's folder, run `bun install` again, or
`bun check`, Biome and the examples fail on links into the old location.

## What it is

A framework-light idle-game engine, a Bun package in its own repository. Twelve entries: `watchpot/core` (kernel:
Decimals, formatting, rng, time, clock, save codec, stats; the feature store, the vocabularies, the systems and the
events framework below), `watchpot/sim` (the sim lab), `watchpot/test` (the test kit), `watchpot/react` (the store
hooks, the clocks, the runtime, boot, hotkeys, news, prefs, and the page layout; it reaches no stylesheet), `watchpot/devtools` (the
dev panel and the sound desk, the one entry with a stylesheet; a game imports it in its dev build), `watchpot/kit` (effects with
no look and the reveal's mechanism; plus `watchpot/kit/theme`, the token compiler), `watchpot/sound` (the sound
engine on its own; plus `watchpot/sound/pack`, the build-time sample-pack pipeline), `watchpot/ui` (headless primitives), `watchpot/shader` (a container for a game's own fragment
shaders) and `watchpot/three` (3D on three and r3f). The package never imports `src/`; `core` and `sim` never import
React. The engine reads no wall clock for game time: the caller passes `now` (`test/rules/wall-clock.test.ts`), while
duration timers for motion and pacing default to `performance.now()`. Its tests live in `test/<entry>/`.

**The split: mechanism and behaviour from the engine, every look from the game.** The engine owns state, rules,
timing, keyboard, focus, ARIA, `data-*` state, effects' motion and the GPU plumbing; it ships no stylesheet (the dev
panel's self-contained CSS aside) and the kit writes no class name of its own (`test/rules/headless.test.ts` checks
both); by convention it also sets no font, no colour and no English default outside the dev panel. A game's look lives in its own `src/ui/`: thin wrappers over `watchpot/ui` with a CSS
module each, copied in from the template's registry ([`templates/game/src/ui/`](templates/game/src/ui/README.md),
the token contract and every component) and then restyled, rewritten or deleted as the game's own. Its backdrops,
foils and transitions are its own GLSL run by `watchpot/shader`.

A game imports its hooks from `watchpot/react` (the template does). `watchpot/react` holds the store hooks, the clocks, `useGameClock`
(the running clock and the other-tab watch alone: `useGameRuntime` without the motion, scheme and sound), `useBoot`,
`useHotkeys`, `useNews`, `useLayerSwap`, the page layout and the tab title, the same bindings as `watchpot/react`, and
the runtime hooks, on an entry that reaches no stylesheet (`test/rules/react-entry.test.ts`).

`@number-flow/react` (the kit's `Ticker`) and `canvas-confetti` (the kit's `burst`) are optional peers: only
`watchpot/kit` reaches them (`test/rules/peers.test.ts` walks the imports of every other entry and proves it).
Install them when the game imports the kit. The other optional peers serve one entry each: `zzfx` is
`watchpot/sound`'s (loaded on the first sound), `three` and `@react-three/fiber` are `watchpot/three`'s, and
`@testing-library/react` is `watchpot/test`'s `renderWith`.
