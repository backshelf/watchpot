# From the template

By the end of this chapter you will have started a real project the way watchpot games are started: from the
engine's game template, with one command, into a folder that installs, typechecks, passes its tests and holds its
pacing. You will also know the loop you work in every day after that, how to change the engine and a game together,
and how a change to the engine reaches your game.

Every command in the scaffolding section was run, in order, on Windows with Bun 1.4.4. The end of that section says
exactly what was checked and what was not.

## Why a template at all

Simmer, the game you wrote by hand in [chapter 2](02-your-first-game.md), is a few small files. That was the right
size for learning: every line was yours, and you could see the whole game at once. It is the wrong size for a game
you mean to finish. A finished game needs a page that works on a phone and a desktop, a save the player can move
between machines, settings, sound, a look that is not the browser's default, a headless run that proves the pacing,
tests, and a set of checks you trust before every commit.

You could build all of that by hand, and [chapter 5](05-a-real-game.md) showed what it looks like in a real game. The
[template](../glossary.md#template) is that same shape, already written and already passing its checks. It lives in
the engine's repository at `templates/game/`. You answer a short list of questions about your game, and one command
turns the template into your game's first ten minutes.

Here is what you get over hand-written Simmer:

| Piece | Where it lands | What it is |
| --- | --- | --- |
| The layout | `src/content/`, `src/game/`, `src/app/`, `src/screens/`, `src/ui/` | Words and numbers apart from rules, rules apart from the page ([chapter 5](05-a-real-game.md)) |
| A wallet | `src/game/wallet.ts` | One [feature](../glossary.md#feature) that holds every currency, so the rest of the game spends through one place |
| A stats feature | `src/game/stats.ts`, `src/game/bus.ts` | Every contribution to output and the offline share, worked out on each pass ([chapter 8](08-effects.md)) |
| A core | `src/game/generators.ts` or `src/game/dimensions.ts` | The thing that makes the currency: [generators](../glossary.md#generator) (3 to 8) or [dimensions](../glossary.md#dimensions) (4 to 8 tiers), or none at all when a clicker is the whole game |
| The systems you chose | one content file, one feature, one screen each | Any of a clicker, an upgrade tree, a gacha, a prestige reset, an achievement wall and a visitor |
| Settings and the save as text | `src/game/settings.ts`, `src/app/AboutSheet.tsx` | Sound on or off, still the motion, and "Copy save" / "Read save" |
| The styled components | `src/ui/` | The [registry](../glossary.md#registry): your own copies of a button, a panel, a sheet and more, on the engine's headless `watchpot/ui` |
| [Tokens](../glossary.md#token) | `design/tokens.json`, compiled to `src/tokens.css` | Your palette and type in one file ([chapter 11](11-look-and-sound.md)) |
| A backdrop shader | `src/shaders/` | A starter in one of four directions, fed by how well the run is going, if you ask for one |
| The dev panel | `src/app/App.tsx` | The engine's [dev panel](../glossary.md#dev-panel), already mounted on `#dev` |
| A sim | `sim/run.ts`, `src/content/pacing.ts` | A headless player and a [pacing contract](../glossary.md#pacing-contract) judged on played hours ([chapter 12](12-proving-the-pacing.md)) |
| Tests | `test/` | A game test and a page test, on happy-dom |
| Scripts | `package.json` | `dev`, `verify`, `gates`, `gates:full`, `sim`, `tokens` and the rest |

### When to use it, and when not

Use the template for any game you mean to keep. It costs you a minute and an answers file, and it saves you days of
wiring you would otherwise write and get subtly wrong.

Stay with a hand-written game like Simmer when you are learning a system, sketching a mechanic you may throw away, or
making something the template cannot express. The template's core is fixed in size: three to eight generators, four
to eight dimensions, or none beside a clicker. A game built around something else at the bottom of its loop starts
from the nearest shape and replaces that part.

## How the template works

Before you run anything, it helps to know what the command does, because it is not what most scaffolders do.

`templates/game/` is not a skeleton with holes in it. It is a complete, running game that holds every option at
once: both cores, every system, all four backdrops. The engine's own checks typecheck it and run its tests as it
stands, which is how the engine knows the template still works.

Your choices are recorded as comments in that code. A line `// @if clicker` opens a block that stays only if you chose
the clicker, and `// @end` closes it. Here is the top of the template's game definition:

```ts
// ...
import { wallet } from "./wallet";
// @if generators
import { producers } from "./generators";
// @end
// @if dimensions
import { chain } from "./dimensions";
// @end
// @if clicker
import { press } from "./clicker";
// @end
```

*watchpot, `templates/game/src/game/game.ts`*

A file whose first line is `// @feature <flag>` is kept only when that flag is chosen. JSX uses `{/* @if <flag> */}`
and CSS uses `/* @if <flag> */`, with matching ends. The flags are the systems you pick, the core, and the backdrop.

The command, `templates/game/.scaffold/new.ts`, reads an [answers file](../glossary.md#answers-file) and does this to
a new folder:

1. Copies the template into it, leaving out the scaffold's own `.scaffold/` folder.
2. Writes your content: `src/content/*.ts` (the words, the economy, the core's list, one file per system,
   `pacing.ts`), `design/tokens.json`, and `.claude/specs/answers.json` and `concept.md`.
3. Deletes every file and block whose flag you did not choose.
4. Renders the five files whose names would clash with the engine's own (`package.json`, `biome.json`,
   `index.html`, `README.md`, `.claude/CLAUDE.md`) from their `*.tmpl` versions.
5. Compiles `design/tokens.json` into `src/tokens.css`, and formats what the gating left with Biome.
6. Runs `bun install`, which fetches the engine by tag, then `bun run lint:fix` with the game's own Biome.
7. Prints any warnings about your colours, and the next steps.

Steps 1 to 5 are `generate.ts` beside it, which you can run on its own (`.scaffold/README.md` has its flags).
`new.ts` refuses a folder that already holds anything, and `generate.ts` refuses the template folder itself, so a
slip of the path cannot overwrite your work or the template.

## Scaffolding a game

### Before you start

You need three things on the machine:

- **Bun 1.4.3 or later.** The scripts typecheck with `bun check`, which arrived in 1.4.3. `bun --version` tells you;
  the engine's and the template's `package.json` both state the minimum under `engines`.
- **git**, and **read access to the engine's repository.** watchpot is a private package installed by git tag, not
  from a registry. If you cannot clone `github.com/backshelf/watchpot`, nothing below will install.
- **GitHub credentials git can use.** Once per machine, run `gh auth login`, then `gh auth setup-git`. That lets both
  `git clone` and Bun's install reach the private repository over HTTPS.

### 1. Get the template at a tag

The template should come from the same engine version your game will install, so its code matches the engine's
exports. Each release is an annotated [tag](../glossary.md#tag). Clone just that tag:

```sh
git clone --depth 1 --branch v0.18.0 https://github.com/backshelf/watchpot.git watchpot-v0.18.0
```

`git ls-remote --tags https://github.com/backshelf/watchpot.git` lists the tags. The one-command scaffold arrived in
0.18.0. An older tag has only `generate.ts` and the by-hand steps in its own `.scaffold/README.md`.

### 2. Write the answers file

The answers file is JSON that describes your game. The least one can say is the template's smallest fixture, a
clicker alone with the default look:

```json
{
  "name": "Tap Jar",
  "premise": "A jar on a counter that fills one tap at a time.",
  "voice": "Short and dry.",
  "features": ["clicker"],
  "currencies": { "main": { "name": "Tap" } },
  "stats": { "output": "Knack", "offline": "Echo" },
  "clicker": { "name": "Jar", "verb": "Tap", "line": "It rings a little." },
  "session": "glance"
}
```

*watchpot, `templates/game/.scaffold/fixtures/smallest-clicker.json`*

Here is one for Simmer as a real project: the pot you tap becomes the template's clicker, and the burner becomes the
first of three generators, since a generators core needs at least three.

```json
{
  "name": "Simmer",
  "slug": "simmer-stove",
  "premise": "A pot on a stove. Tap it and it bubbles; light burners and it bubbles on its own.",
  "voice": "Warm, short, a little sleepy.",
  "currencies": { "main": { "name": "Bubble", "glyph": "drop" } },
  "stats": { "output": "Fizz", "offline": "Warmth" },
  "generators": [
    { "name": "Burner", "line": "A small blue flame." },
    { "name": "Double burner", "line": "Two flames, one pot." },
    { "name": "Range", "line": "Every ring lit." }
  ],
  "features": ["clicker"],
  "clicker": { "name": "The pot", "verb": "Tap", "line": "One bubble a tap." },
  "session": "short",
  "look": {
    "palette": { "ground": "#f3efe6", "ink": "#1d1a16", "signal": "#b8461f" },
    "surface": { "base": "weather", "line": "Steam rising off the pot, thicker as the pot fills." },
    "moment": "The first range: every ring lights at once and the steam fills the window."
  }
}
```

Save it beside where the game will go, not inside it, as `simmer-answers.json`. Going through it:

- `name` is shown to the player. `slug` is the game's id, its save key's stem and its package name. Leave it out
  and it is made from `name`. Here it is set on purpose: the template saves under `<slug>.save`, chapter 2's
  Simmer already saves under `simmer.save`, and two games served from `localhost:3000` share one browser storage.
  The same slug would put both games in one save slot.
- `premise` and `voice` are a sentence or two each. They go into the concept file and the game's README.
- `currencies.main` names the one currency. Its id is made from the plural (`bubbles`). A `glyph` is one of `coin`,
  `drop`, `gem`, `leaf`, `star`, `moon`, `bolt`, `shell`, `flame`, `key`, `sun` or `seed`.
- `stats` names the two numbers the stats feature always tracks: output, and the share earned while away.
- `generators` lists the core, cheapest first, each with a one-line description. Leave it out for a clicker alone.
- `features` picks the systems: any of `clicker`, `tree`, `gacha`, `prestige`, `achievements` and `visitor`. Each one
  you pick needs its own block (`clicker` here). Leave `core` out for generators, or set it to `"dimensions"`.
- `session` is `glance`, `short` or `long`: how you expect the game to be played, which sets the week of comings and
  goings the sim can play.
- `look` is optional, and so is every part of it. Here it sets the palette as `#rrggbb` (the ground, the ink, and the
  signal colour for buttons and highlights), a starter backdrop (`weather`, `print`, `signal` or `cells`) with the
  sentence it should answer to, and one sentence about the moment the look is built around. It leaves the fonts to
  the system's own. Left out entirely, a game gets system fonts, a default palette and no backdrop.

Every field, with its rules, is in `templates/game/.scaffold/answers.md`, and `.scaffold/answers.example.json` is a
complete file that picks every system. You do not have to get it right first time: the command checks the whole file
and lists every problem in one error before it writes anything.

### 3. Run the command

From the folder that holds both the clone and the answers file:

```sh
bun watchpot-v0.18.0/templates/game/.scaffold/new.ts simmer-answers.json simmer
```

It takes a few seconds. You should see, with the install's package list cut short:

```
== generate (watchpot v0.18.0)
wrote ...\simmer\src\tokens.css (95 lines)

== install
bun install v1.4.4 (38afee6c8)
...
56 packages installed [4.21s]

== format
$ biome check --write .
Checked 82 files in 46ms. No fixes applied.

new: Simmer is at ...\simmer.
Next:
  cd simmer
  git init -b main && git add -A && git commit -m "feat: scaffold the game"
  bun run verify     # typecheck, lint, tests
  bun run dev        # http://localhost:3000, and play it
```

The game installs the engine at the clone's own version. To pin another tag, add `--engine v0.18.0` (or any tag).
`--no-install` stops after the files are written, for when you want to look before anything is fetched.

If a `look:` line appears, one of your colour pairs reads poorly. It names the two colours and the ratio they reach
against the one they need (`7:1` for ink on the ground, `4.5:1` for text on the signal). Move the signal colour a
little further from the text drawn on it (darker if that text is white, lighter if it is near-black) and run again
into a fresh folder. It is a warning, not a refusal: the game is written either way.

The engine is installed from the line the command wrote into `package.json`:

```json
"watchpot": "git+ssh://github.com/backshelf/watchpot.git#v0.18.0"
```

Keep that URL form. `github:backshelf/watchpot#v0.18.0` and `git+https://...` go to an endpoint that answers 404 for
a private repository, and a URL with a user in it (`git@github.com`) breaks the credentials from `gh`.

### 4. Commit, check, play

Do what it printed:

```sh
cd simmer
git init -b main && git add -A && git commit -m "feat: scaffold the game"
bun run verify
bun run dev
```

`verify` is typecheck and lint. Open `http://localhost:3000`. The dev server runs with hot reload off (a Bun bug drops
CSS-module imports while it is on), so refresh to see a change.

To hear the sim's verdict once, run `bun run sim -- --contract`. It plays four hours on the auto-player and checks
the contract in `src/content/pacing.ts` at hours 1, 2 and 4: every row should be marked `in`.

### What was verified

`new.ts` was run on the smallest-clicker fixture above and on the Simmer answers file, each into a new folder, from
the engine's checkout just before 0.18.0 was tagged. There the default tag was still `v0.17.0`, so both games
installed v0.17.0; the output above is the Simmer run's, with that tag shown as the clone's. Both generated, compiled
their tokens, installed the engine by tag and formatted clean. In each, typecheck and lint were clean, the tests
passed (12 in two files for the clicker alone, 18 for Simmer), the production build succeeded, and the sim's
contract held at all three hours. In the clicker game, `verify` passed after the first commit. The dev server was
not started and the page was not opened in a browser.

## What you have now

The folder follows the layout from [chapter 5](05-a-real-game.md), and its own `README.md` lists the commands and
where things are. In brief:

- `src/content/` holds your words and numbers. The command wrote it from your answers and it is now yours: edit it
  freely.
- `src/game/` holds the features, on the engine's factories, and the store. `game.ts` lists them in the order each
  pass runs them.
- `src/app/` and `src/screens/` are the page: the shell, the tabs, the header, the about sheet, and a screen per tab.
- `src/ui/` is the registry, 16 components for this shape out of the template's 21. Its `README.md` lists the `--ui-*`
  tokens every component reads. These are your copies: restyle, rewrite or delete them. Nothing upstream changes
  them later.
- `src/tokens.css` is compiled from `design/tokens.json`. Run `bun run tokens` after every edit to the JSON, and
  commit both.
- `sim/` is the pacing sim: the auto-player and the contract it is held to.

There is no `test/` folder. The engine's own checks prove the template builds, typechecks and holds its contract, so
a new game starts with nothing to keep green but its own code. When you want tests of your own, `watchpot/test` is
the kit for them ([chapter 12](12-proving-the-pacing.md)).

There are no notes for an AI coding agent unless you ask for them. Run the command with `--agents` and it also
writes a short `AGENTS.md` (where the engine's docs are, the commands, the engine's rules that are easy to break) and
puts the concept and your answers in `design/`.

The template is a floor. VOID IF REMOVED started from it, kept most of its scripts and its install line, and has
since renamed, restyled or replaced most of the components in its `src/ui/`. Its `package.json` still reads much
like yours:

```json
"scripts": {
  "dev": "bun dev.ts",
  // ...
  "verify": "bun run typecheck && bun run lint && bun run test:changed",
  "gates": "bun run typecheck && bun run lint && bun test && bun run build",
  "gates:full": "bun run gates && bun run test:slow"
},
"dependencies": {
  "watchpot": "git+ssh://github.com/backshelf/watchpot.git#v0.17.0",
  // ...
}
```

*VOID IF REMOVED, `package.json`*

Two differences are worth seeing. VOID IF REMOVED added tests of its own on `watchpot/test`, so its `verify` and
`gates` run them, where the template's run none. And its `gates:full` does not end by running the sim's contract,
because the game proves its pacing with a fit of its own instead (the large-game route in
[chapter 12](12-proving-the-pacing.md)). It also dropped the `tokens` script. The scripts are yours to change.

## The daily loop

Three commands carry almost all of your working day. They are ordered by cost, and you run the cheap one most.

- **`bun run verify`**: typecheck and lint. Run it before every commit. It takes seconds.
- **`bun run gates`**: typecheck, lint and a production build. Run it when a piece of work is done, before you
  push. The build is there because a page can typecheck and still fail to bundle: a missing
  `src/tokens.css`, say, which typecheck never sees because `env.d.ts` declares every `.css` import.
- **`bun run gates:full`**: the gates, plus the pacing contract. Run it at a checkpoint, not on every change.

When you add tests of your own, add them to these scripts too: `bun test` in `gates`, and the slow ones (files named
`*.slow.test.ts`) in `gates:full`.

The sim is a measuring tool, not a test. Run `bun run sim` once after a change to numbers and read the table, add
`--contract` when you want the verdict, and `--sessions` to watch a week of a person coming and going (never judged).
[Chapter 12](12-proving-the-pacing.md) covers what to look for.

### The dev panel

The [dev panel](../glossary.md#dev-panel) docks over the running game in a development build. It warps time
forward, jumps to day N, shows each feature's saved state, and lets you export, edit, check and import the save as
text. It is how you test a day away without waiting a day.

The template mounts it already: open `http://localhost:3000/#dev`, and its close button clears the hash. A game you
wrote by hand, like Simmer, mounts it in a few lines:

<!-- example-code: guide-template.tsx -->

```tsx
export function DevRoute() {
  const [route, go] = useHashRoute();
  return (
    <>{process.env.NODE_ENV !== "production" && route === "dev" && <DevPanel onClose={() => go("")} />}</>
  );
}
```

*watchpot, `docs/examples/guide-template.tsx`*

Line by line:

- `useHashRoute` from `watchpot/react` hands back the page's hash without its `#`, kept current on every
  `hashchange`, and `go` to change it. The listener matters: the panel's close button clears the hash, and a page
  that read `location.hash` once at mount would never hear about it.
- `process.env.NODE_ENV !== "production"` is the check the engine's docs and its reference game write. The bundler
  replaces it with `false` in a production build and drops everything after it.
- That check is a second lock, not the only one. `DevPanel` as `watchpot/devtools` exports it already draws nothing in a
  production build and reaches the panel's module only through a dynamic import behind the same test, so the panel's
  code and styles stay out of your bundle even if you move or drop the check here. Keep it anyway: it also keeps
  the route's own code out, and it matches every other example you will read.
- `DevPanel` reads the store from context, so `<DevRoute />` goes anywhere inside the tree `mountGame` builds.

## Changing the engine and a game together

Sooner or later your game needs something the engine lacks: a rule, a hook, an effect. The engine's convention is
that whatever is not specific to your game's fiction goes into the engine, generic and named for no game, with
tests, a README section and a `CHANGELOG.md` line. Only what is truly your game's own stays in the game.

The game installs the engine by tag, so an engine change reaches it in three moves:

1. **In the engine**, make the change and run `bun run verify`. If you added, removed or retyped an export,
   regenerate the API report with `bun run api` in the same commit.
2. **Release it.** Bump `version` in the engine's `package.json`, add a `CHANGELOG.md` line, commit, run
   `bun run gates`, then tag and push (here the next version is `v0.19.0`):

   ```sh
   git tag -a v0.19.0 -m v0.19.0
   git push origin main v0.19.0
   ```

3. **In the game**, change the tag at the end of the `watchpot` line in `package.json` and run `bun install`.

A release that breaks existing code ships a [codemod](../glossary.md#codemod): a script in the engine's `codemods/`
that rewrites a game's imports and calls, prints what it would change, and applies it only with `--write`. The
`CHANGELOG.md` entry names it and says what it leaves for you to do by hand. The installed package carries the
engine's whole repository, so after `bun install` you run it from the game's root:
`bun node_modules/watchpot/codemods/<file>.ts`, then again with `--write`.

To try an engine change in your game before you tag it, point the dependency at a checkout of the engine beside
the game, `"watchpot": "file:../watchpot"`, and run `bun install`. Put the tag back before you commit the game: a
`file:` dependency builds on no other machine. The engine's reference game, `examples/orbital-orchard/`, goes one
step further: it lives inside the engine's repository as a workspace, so an engine edit reaches it at once and the
engine's own checks cover it.

## The AI route

The engine was built alongside an AI skill for Claude Code, `/watchpot`, that interviews you about the game (its
fiction, its loop, its look), writes the answers file, runs the same `new.ts`, and goes on to help build the game.
It is not in this repository, and nothing above needs it: the command is the whole scaffold.

## Things that bite

- **Two games can share a save.** Every game on `localhost:3000` shares one browser storage, and the save key is
  made from the slug. Give each game its own `slug`.
- **The folder must be new or empty.** `new.ts` refuses a folder that holds anything, so a second run goes into a
  fresh one. Delete the failed attempt first if you want the same name.
- **A path with spaces.** The `cd` line the command prints is not quoted. Quote it yourself when your folder's path
  has a space in it.
- **Scaffolding inside another repository.** Until you run `git init` in the new folder, git sees the repository
  around it, so `verify` compares against that one's `main` and may run no tests. Run `git init` first, as the
  printed steps say, or scaffold outside any repository.
- **You need access.** The engine is a private repository. Without read access and `gh auth setup-git`, neither the
  clone nor the install works.

## Next

This is the last chapter of the guide. From here, [the showcases](../showcases.md) show what has been built on the
engine, [the glossary](../glossary.md) holds every term the guide introduced, and
[the reference shelf](../README.md#the-reference-shelf) has a page per system for when your game needs one the
template did not wire.

## Reference

- The template: `templates/game/.scaffold/README.md`, `templates/game/.scaffold/new.ts`,
  `templates/game/.scaffold/answers.md` (every field and its rules), `templates/game/.scaffold/fixtures/`,
  `templates/game/src/ui/README.md` (the token contract)
- [The dev-panel workflow](../dev-panel-workflow.md), with [`examples/dev-panel.tsx`](../examples/dev-panel.tsx)
- [A theme](../theme.md), for `design/tokens.json` and `buildTokens`
- [A pacing contract](../pacing-contract.md) and [plan and fit](../plan-and-fit.md), for the sim
- [Headless UI](../ui.md), for what the registry's components wrap
- [A save migration](../migration.md), for when your saved shape changes
- [Installing](../installing.md) (install, and developing the engine and a game together), `CHANGELOG.md`, and
  `codemods/README.md`
- `api/devtools/DevPanel.d.ts` (`DevPanel`, `DevPanelProps`), `api/react/hashRoute.d.ts` (`useHashRoute`),
  `api/react/clock.d.ts` (`warpClock`), `api/react/runtime.d.ts` (`useGameRuntime`), `api/react/store.d.ts`
  (`mountGame`, `createRuntimeHooks`)
