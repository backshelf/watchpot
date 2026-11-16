# Product

<!-- impeccable:product-schema 1 -->

Written from the owner's brief for the site and from the repository (`README.md`, `docs/`, `CHANGELOG.md`). No
interview was held for this file: the session that built the site ran unattended, so everything below is the brief or
the repository, and anything inferred says so.

## Platform

web

## Stack

Delegated: a static site built by Bun's own bundler (`bun build` over HTML entries, React 19 for the live demos),
served from a GitHub Pages project path (`/watchpot/`), so every URL in it is relative.

## Users

People who make idle and incremental games (or are thinking about one) and read TypeScript: they arrive from the
repository, a link, or a game made on the engine, and want to know in a minute what watchpot is, whether it is real,
and where to start reading. Second: someone already building on it who wants the docs in a form easier to follow than
a folder of markdown. (Inferred from the brief; the engine's only player today is its owner.)

## Product Purpose

watchpot is a framework-light idle-game engine: a Bun + TypeScript + React 19 package. The site shows what it is and
what it can do with its features running in the page, hosts the docs in a readable form, and says plainly how the
code was made. Success: a visitor has watched the engine work before reading a claim about it, and can find any
recipe in the docs in a few seconds.

## Positioning

The split no neighbouring library makes: mechanism and behaviour come from the engine, every look comes from the
game. It ships no stylesheet, no class name, no font, no colour and no English default, and it never reads the wall
clock. A game is a tuple of features; the same game definition runs in the browser and in a headless sim that plays
days of it in milliseconds and judges the pacing against a contract.

## Operating Context

Installed by git tag from a private repository (`git+ssh://github.com/backshelf/watchpot.git#vX.Y.Z`); not on a
registry. Entries: `core`, `sim`, `test`, `react`, `hooks`, `kit`, `kit/theme`, `sound`, `sound/pack`, `ui`,
`shader`, `three`. A new game is scaffolded from `templates/game/`; `examples/orbital-orchard/` is the reference game.

## Capabilities and Constraints

- Twenty systems as feature factories over pure kernels (generators, dimensions, clicker, layers, achievements,
  challenges, autobuyers, buffs, spawns, allocation, board, sweep, stages, missions, market, crafting, levels,
  records, streak, prefs), each with a recipe page and a type-checked example.
- Decimals past 1e308, five notations, save codec with migrations, a sim lab with a pacing-contract DSL and an
  auto-player, headless UI primitives, a shader container with a GLSL chunk library, a sound engine whose graph is a
  Rust crate compiled to WebAssembly in one AudioWorklet, a 3D stage on three's WebGPU renderer.
- The repository is private today. Publishing the site is the owner's decision; nothing on it may assume the
  repository is readable by the visitor.
- Nothing on the site names the owner personally. It is published under the `backshelf` identity.

## Brand Commitments

- The name is `watchpot`, lowercase.
- The "how this was made" statement from the top of `README.md` appears plainly on the site, not buried: most of the
  code was written by an AI model (Anthropic's Claude), working with a person who set the direction.
- Kin to VOID IF REMOVED (the game built on the engine) but clearly its own thing: less upfront and less bold; where
  the game is flashy, the site is technically impressive. Shaders carry the point. High definition.
- No fonts or scripts fetched from a third party; anything used is self-hosted under a licence that allows it.

## Evidence on Hand

- The engine itself, runnable in the page: `watchpot/core` (a real store ticking), `watchpot/shader`, `watchpot/ui`,
  `watchpot/sound`, `watchpot/sim` (a real pacing run).
- `docs/` (recipes and system pages, a guide landing under `docs/guide/`), `docs/examples/` (type-checked),
  `CHANGELOG.md`, `api/`.
- VOID IF REMOVED in play: captures of its opening pages only (its owner is playing it blind).
- Absent, never to be invented: users, stars, downloads, benchmarks against other engines, testimonials, a licence
  (the repository states none), a registry install line.

## Product Principles

- Shown working, not described: wherever the page makes a claim, the engine is running beside it.
- Plain about what it is: one person's engine, mostly written by a model, private today.
- The engine has no look; the site has one of its own and never implies it ships with the package.
- Docs are for reading: calm column, real wayfinding, nothing performing behind the text.

## Accessibility & Inclusion

Keyboard reachable throughout, sane for a screen reader, reduced motion honoured (shaders hold a frame), WCAG AA
contrast for text, sound only behind an explicit press.
