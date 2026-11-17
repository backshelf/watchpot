---
name: watchpot-init
description: >
  Make a new idle game on the watchpot engine, start to finish: a short shape interview (fiction and voice, the
  shape of the loop and which engine systems carry it, the words, the session length, the look and its shader
  language), a scaffold that writes a running, saving, paced game into a new repository from the engine's template,
  then the build, where the game is actually made: its loop and one invented mechanic, content in depth, a page that
  is its own, shaders in 2D or 3D as the material of the look, feel, and the one moment it is built around. Built on
  the engine throughout. Use when the user types `/watchpot-init`, asks to start, make, scaffold or spin up a new idle
  game, an incremental, a clicker, a dimensions or layers game, or "a game on the engine". Not for changing an
  existing game (work in that repository) or the engine itself.
argument-hint: "[a pitch, or a path to an answers.json to scaffold without the interview]"
---

# watchpot-init

A new idle game is a handful of things the user decides and everything else. The user decides what the game is
about and how it sounds, what shape its loop has, what the player collects and spends, how long a sitting is, and
what it looks like. Everything else is yours, and it splits in two:

- **The scaffold** (minutes, mechanical): ids, numbers, file layout, which engine system carries what, the pacing
  bands. A script in the engine writes it from an answers file.
- **The build** (most of the session): what makes this game unlike the last one. Its loop and an invention, content
  with depth, a page of its own, a shader language, feel, the moment. The engine exists so the time goes here.

A game that stops at the scaffold is a template with new nouns. Never report one as done.

## The engine

`watchpot` is a Bun + TypeScript + React idle-game engine. Throughout this skill **`ENGINE`** is the root of a
checkout of its repository, or `node_modules/watchpot` in a project that has it installed. This skill ships inside the
engine (`ENGINE/.agents/skills/watchpot-init/`); if it was copied or linked elsewhere and no project at hand has the
engine, install it in a scratch folder first (`bun add watchpot`).

What is in `ENGINE`, and read from there rather than from this skill:

- `README.md` is the reference; `docs/` is the guide (`docs/guide/`), a recipe and a type-checked example per system,
  the glossary, and `docs/migrating-to-1.0.md` for anything written against 0.x.
- `templates/game/` is the template this skill fills, and `templates/game/.scaffold/` is the recipe: `README.md`
  (what the scaffold wires, how it is gated), **`answers.md` (the answers file's schema: read it first, so every
  interview question lands on a field)**, `new.ts` (the one command), `generate.ts`, and `fixtures/` (the smallest
  answers files).
- The subpaths a game imports: `watchpot/core` (the store, saves, big numbers, the clock and offline time, and the
  **systems**: `references/systems.md`), `watchpot/ui` (headless components: behaviour, keyboard, focus, ARIA; no
  look), `watchpot/shader`, `watchpot/three`, `watchpot/kit` (effects with no look), `watchpot/sound`,
  `watchpot/react`, `watchpot/sim` (the auto-player, the pacing contract, the fit kit), `watchpot/test`,
  `watchpot/devtools` (the dev panel). A game installs the engine as an ordinary dependency;
  `ENGINE/templates/game/.scaffold/README.md` says which version the scaffold pins and how to change it.

**Engine first, always.** Before writing a mechanic, a component's behaviour, a price curve, a formatter, a fold of
effects or a reset's pace, find it in the engine (`references/systems.md`, the README, `docs/`). If the engine lacks
something, build it in the game, on the engine's primitives. Never edit `node_modules/watchpot` and never copy engine
source into a game.

## This skill's references

All in `references/`: `systems.md` (which engine system carries what, the shapes to offer, how features connect, what
to do when the engine lacks something), `build.md` (the seven passes of the build), `look.md` and `type.md` (palettes,
surfaces, font pairings with checked specs), `shaders.md` (the shader floor and how to drive it), and `examples/`
(`invention.ts`, `sim-and-tests.ts`, `shader-surface.tsx`: code the engine type-checks, so it is current with the API).

## Lines that do not move

- **Product and look questions only.** Never ask about ids, numbers, folder layout, primitives or internals.
- **Questions with options, the recommendation first** and marked "(Recommended)" (the `AskUserQuestion` tool where
  the agent has one): the best game, not the cheapest build, with any cost stated beside it as a fact. Options are
  concrete (names, hexes, font names, a sentence of what the player sees), never "something cosy". The user's own
  words are always an answer.
- **Three rounds at most, then one confirm.** Assert what a pitch already says instead of asking it again.
- **The scaffold runs from an answers file.** The interview's only output is `answers.json` (schema:
  `ENGINE/templates/game/.scaffold/answers.md`); the script does the rest and runs the same with no interview.
- **Shaders are the look's material, in 2D as much as 3D** (`references/shaders.md`): every game has a backdrop that
  is the place, a hero surface, light as feedback and a shader in its moment, all written for it and driven by its
  numbers. The scaffold's backdrop is a placeholder.
- **Every look is the game's own.** The template's components are plain skeletons to be restyled; no vendor shader
  or UI package; nothing lifted from another game's files.
- **Fonts are Google-hosted** (the template links them; nothing is downloaded), from `references/type.md`.
  **Sounds** start as the template's zzfx voices and are designed in the build (retuned, or recordings built into a
  pack with the zzfx voice kept as the fallback).
- **Never push.** The scaffold commits on `main` in the new repository; pushing, and creating a GitHub repository,
  are the user's call, asked at the end.
- **Project and user rules win** where an `AGENTS.md`, a `CLAUDE.md` or another skill says otherwise.

## The interview

It is a design brief for a game: purpose and player, the material, the look, then a brief to confirm. Read
`ENGINE/templates/game/.scaffold/answers.md` first so every question lands on a field, and `references/systems.md` so
the shapes you offer are real.

**Before round 1**, from the pitch (if any), assert in one short message: the fiction as you read it, the player
and the use scene (where and how long they play), the shape you would pick, and whether it is 2D (the default) or
3D (only when the pitch is about a place or an object to look at; see "A 3D game"). A precise pitch can skip the
questions its assertion covers.

**Round 1: the game** (one call, up to four questions):

1. **Fiction.** Three premises, each a title and one sentence, far apart in setting (and far from the games already
   made unless asked); the pitch's own reading first when there is one.
2. **Shape.** Three shapes composed for this fiction from `references/systems.md` (a core loop plus the systems that
   make it a genre), each one sentence of what the player does in a minute and in a day, not a list of features:
   "press the bell, hire ringers, catch the comet when it passes, melt it all down for a bigger bell". Recommend the
   one with a reset and something to chase: an idle game without them runs out by day two.
3. **Session length:** a glance (many check-ins of a minute or two), short sessions (a handful a day, about ten
   minutes; recommended for a desk game), or long sittings (two or three a day, most of an hour, tab left open).
   This shapes the days after the first: the first three or four hours of any idle game are played straight, and
   pacing is planned and measured in played hours (`references/build.md` › Feel).
4. **Voice:** three registers, each with a sample line in it (a producer's flavour line).

**Round 2: the words** (one call, up to four questions, each option a complete set written in the voice; ask only
what the shape has):

1. **Currencies:** the main currency (what the core makes), and the premium one if a gacha: three pairs.
2. **Stats:** the names of output, offline share and (with a reset) the reset's gain: three sets.
3. **The reset** (if any): its name, the button's verb and the currency it pays: three sets.
4. **The ladder** (gacha only): three, four or five rungs named in the fiction. Or, for a clicker with no gacha,
   **the thing pressed**: its name and the press's verb.

The producers, the tree, the gacha's items, the achievements, the visitor, the tab names and every word not asked are
yours to write, in the voice. They show in the confirm.

**Round 3: the look** (one call, four questions; `references/look.md`, `references/type.md`):

1. **Palette:** three palettes built for the fiction, each named and described in a line, with its hexes. At least
   one dark and one light.
2. **Type:** three pairings, each with what it says about the game.
3. **The surface:** three shader languages, each a sentence the player could picture, naming what moves and what the
   game's numbers do to it. This is the brief every shader in the game is written against.
4. **The moment:** three candidates for the one memorable moment the look is built around (the first top-rung pull,
   the first reset, a wall falling), each a sentence of what the player sees. The build makes it for real.

**The confirm.** Write `answers.json` (in a scratch folder), then one message: the brief, compressed (job and player,
the loop, the words, the look, the surface, the moment), the generated lists, **the invention** (one line: the
mechanic this game will have that the engine does not hand it), the target folder (a new folder named for the slug, wherever the user keeps their games; theirs to say) and
the engine version it will pin (default: the engine's own). Then one question: build it (recommended) / change
something. Take a change, rewrite the file, ask again.

When the user is away, take every recommended option, write the answers, list the calls at the top of the report,
scaffold and build.

## The scaffold

Run the engine's own command (`ENGINE` is its path), with the answers file and an empty or missing target:

```sh
bun ENGINE/templates/game/.scaffold/new.ts <answers.json> <target> --agents [--engine <tag>] [--no-install]
```

`--agents` is on because a game made through this skill is being built with an agent: it adds a short `AGENTS.md`
and puts the concept and the answers in `design/`, where the build reads them.

It copies the template, writes the game from the answers (content, `design/tokens.json`, the starter backdrop, the
`*.tmpl` files), compiles the tokens, installs and formats, and refuses a non-empty target or an answers
file with a problem (it lists every problem at once). What it wires, how the template is gated by flag, what
`--engine` pins and how to install the engine from the npm package instead of a git tag are in
`ENGINE/templates/game/.scaffold/README.md`; read it rather than this file.

Then, in the new game's folder:

```sh
git init -b main
bun run gates                    # typecheck, lint and the production build, before anything is committed
bun run sim -- --contract       # the pacing contract on played hours
git add -A && git commit -m "feat: scaffold <name> on watchpot <version>"
```

Stop at the first failing step and name it to the user. A fresh scaffold that fails is a bug in the engine's
template, not in the game: say so, and fix only what the game needs to run.

## The build

Go straight on from the scaffold (one line to the user that it is up and where; no question). Follow
`references/build.md`, in order, a commit per pass with `bun run verify` green. The seven passes:

1. **Shape:** the systems the scaffold does not wire, what to take out, and the invention (engine first, built in
   the game).
2. **Content:** depth, in the voice, all in `src/content/`.
3. **Identity:** restyle every copied component and compose the screens for this game.
4. **Shaders:** the surface (`references/shaders.md`).
5. **Feel:** sound, numbers that land where the action was, big events that feel big, reduced motion honoured.
6. **The moment**, built and watched.
7. **Proof:** `gates:full`, the browser at desktop and phone width with a clean console.

Do the passes yourself. Fan out to subagents only if the user asked for that (and give its cost first).

### A 3D game

When the pitch is a place or an object to look at, the game's page is a scene on `watchpot/three` (three's WebGPU
renderer, TSL materials, `@react-three/fiber`; `ENGINE/docs/three.md` and `docs/examples/three-stage.tsx`). Scaffold as
usual for the economy, saves and sim, then in the build replace the shell's main screen with a `Stage`: the
game writes its meshes, materials and content and takes the frame loop, post stack, quality tiers, boot, camera and
world-pinned labels from the engine. A change to rendering counts only after it has drawn in a browser.

## After

Report in a few lines: where the game is, its shape, what was invented, the sim's day-7 row, and the commands
(`bun run dev`, `bun run sim -- --contract`). Then ask one thing: whether to create the GitHub repository and push
(`gh repo create <slug> --private --source . --push`), or start playing first.

## What goes wrong

- **Trusting the sim on boredom.** Its player never gets bored. A page the sim trades happily can leave a person
  waiting twenty minutes for anything to happen. Work out the real-minute wait between payoffs on every active
  mechanic and keep it under about two minutes.
- **Stopping at the scaffold.** It runs and it is green, so it feels finished. It is the first ten minutes.
- **Hand-writing what the engine has.** A price loop, a buy-max, an achievement check, a focus trap, a countdown, a
  fold of effects, a reset's pace and peak. Search `references/systems.md` and the engine README first.
- **The template's look, recoloured.** New tokens on the skeleton are not an identity; neither is the starter
  backdrop in new colours.
- **A shader nobody would miss.** Put the effort where the player looks and where the numbers are.
- **A sim that is not the game.** The sim runs on a plain store; if the game has something only the real store has,
  the fitted numbers are for another game. `plainParity` (`watchpot/test`) checks the two agree.
- **Asking about internals.** "How fast should costs grow?" is yours; "how long is a sitting?" is the user's. The
  pacing contract turns the second into the first.
- **Vague options.** A palette without hexes, a voice without a sample line, a surface without a sentence: the user
  cannot pick what they cannot see.
- **A font outside `references/type.md`.** A css2 spec that asks for a weight the family lacks fails the whole
  request, and the game falls back to system fonts silently.
