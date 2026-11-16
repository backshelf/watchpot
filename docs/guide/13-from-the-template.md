# From the template

By the end of this chapter you will have started a real project the way watchpot games are started: from the
engine's game template, scaffolded by hand, step by step, into a folder that installs, typechecks, passes its tests
and holds its pacing. You will also know the loop you work in every day after that, how to change the engine and a
game together, and how a change to the engine reaches your game.

Every command in the scaffolding section was run, in order, on the engine at `v0.17.0`, on Windows with Bun 1.4.4.
The end of that section says exactly what was checked and what was not.

## Why a template at all

Simmer, the game you wrote by hand in [chapter 2](02-your-first-game.md), is five small files. That was the right
size for learning: every line was yours, and you could see the whole game at once. It is the wrong size for a game
you mean to finish. A finished game needs a page that works on a phone and a desktop, a save the player can move
between machines, settings, sound, a look that is not the browser's default, a headless run that proves the pacing,
tests, and a set of checks you trust before every commit.

You could build all of that by hand, and [chapter 5](05-a-real-game.md) showed what it looks like in a real game. The
[template](../glossary.md#template) is that same shape, already written and already passing its checks. It lives in
the engine's repository at `templates/game/`. You copy it, answer a short list of questions about your game, and a
script turns the copy into your game's first ten minutes.

Here is what you get over hand-written Simmer:

| Piece | Where it lands | What it is |
| --- | --- | --- |
| The layout | `src/content/`, `src/game/`, `src/app/`, `src/screens/`, `src/ui/` | Words and numbers apart from rules, rules apart from the page ([chapter 5](05-a-real-game.md)) |
| A wallet | `src/game/wallet.ts` | One [feature](../glossary.md#feature) that holds every currency, so the rest of the game spends through one place |
| A stats feature | `src/game/stats.ts`, `src/game/bus.ts` | Every contribution to output and the offline share, worked out on each pass ([chapter 8](08-effects.md)) |
| A core | `src/game/generators.ts` or `src/game/dimensions.ts` | The thing that makes the currency: [generators](../glossary.md#generator) (3 to 8) or [dimensions](../glossary.md#dimensions) (4 to 8 tiers) |
| The systems you chose | one content file, one feature, one screen each | Any of a clicker, an upgrade tree, a gacha, a prestige reset, an achievement wall and a visitor |
| Settings and the save as text | `src/game/settings.ts`, `src/app/AboutSheet.tsx` | Sound on or off, still the motion, and "Copy save" / "Read save" |
| The styled components | `src/ui/` | The [registry](../glossary.md#registry): your own copies of a button, a panel, a sheet and more, on the engine's headless `watchpot/ui` |
| [Tokens](../glossary.md#token) | `design/tokens.json`, compiled to `src/tokens.css` | Your palette and type in one file ([chapter 11](11-look-and-sound.md)) |
| A backdrop shader | `src/shaders/` | A starter in one of four directions, fed by how well the run is going |
| A sim | `sim/run.ts`, `src/content/pacing.ts` | A headless player and a [pacing contract](../glossary.md#pacing-contract) ([chapter 12](12-proving-the-pacing.md)) |
| Tests | `test/` | A game test and a page test, on happy-dom |
| Scripts | `package.json` | `dev`, `verify`, `gates`, `gates:full`, `sim`, `tokens` and the rest |

### When to use it, and when not

Use the template for any game you mean to keep. It costs you a few minutes and an answers file, and it saves you
days of wiring you would otherwise write and get subtly wrong.

Stay with a hand-written game like Simmer when you are learning a system, sketching a mechanic you may throw away, or
making something the template cannot express. Today that last case is real: the template insists on at least three
generators (four for dimensions), a font for each of three roles, a palette, a backdrop and a sentence describing the game's big
moment. A pure clicker with no generators cannot be written as an answers file at all.

## How the template works

Before you run anything, it helps to know what the script does, because it is not what most scaffolders do.

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

The script, `templates/game/.scaffold/generate.ts`, reads an [answers file](../glossary.md#answers-file) and then does
four things to a folder:

1. Writes your content: `src/content/*.ts` (the words, the economy, the core's list, one file per system,
   `pacing.ts`), `design/tokens.json`, and `.claude/specs/answers.json` and `concept.md`.
2. Deletes every file and block whose flag you did not choose.
3. Renders the five files whose names would clash with the engine's own (`package.json`, `biome.json`,
   `index.html`, `README.md`, `.claude/CLAUDE.md`) from their `*.tmpl` versions.
4. Prints warnings about your colours, if any pair is hard to read.

Notice what is missing from that list: it never copies the template. It rewrites, in place, a folder that is already
a copy. That one fact explains the first step below.

## Scaffolding by hand, step by step

### Before you start

You need three things on the machine:

- **Bun 1.4.3 or later.** The scripts typecheck with `bun check`, which arrived in 1.4.3. `bun --version` tells you.
  Nothing enforces it: neither the engine's nor the template's `package.json` has an `engines` field.
- **git**, and **read access to the engine's repository.** watchpot is a private package installed by git tag, not
  from a registry. If you cannot clone `github.com/backshelf/watchpot`, nothing below will install.
- **GitHub credentials git can use.** Once per machine, run `gh auth login`, then `gh auth setup-git`. That lets both
  `git clone` and Bun's install reach the private repository over HTTPS.

### 1. Get the template at a tag

The template you copy should come from the same engine version your game will install, so its code matches the
engine's exports. Each release is an annotated [tag](../glossary.md#tag). Clone just that tag:

```sh
git clone --depth 1 --branch v0.17.0 https://github.com/backshelf/watchpot.git watchpot-v0.17.0
```

To see which tags exist, run `git ls-remote --tags https://github.com/backshelf/watchpot.git`. At the time of
writing there is one, `v0.17.0`: the repository's published history starts there.

### 2. Copy the template into your new folder

The generator does not copy, so you do. Copy `templates/game/` (with its hidden `.scaffold/` and `.claude/`
folders) to where your game will live:

```sh
cp -r watchpot-v0.17.0/templates/game simmer
```

In PowerShell, `Copy-Item -Recurse watchpot-v0.17.0/templates/game simmer` does the same.

Two things go wrong here, and neither one complains:

- If you skip the copy and point the generator at an empty folder, it writes your eight content files, finds nothing
  to gate or render, and prints `generated Simmer (full)` as if it had worked.
- If you point it at `templates/game/` itself, it rewrites the template in place.

### 3. Write the answers file

The answers file is JSON that describes your game. Here is a full one for Simmer as a real project: the pot you tap
becomes the template's clicker, and the burner becomes the first of three generators, since the template needs at
least three.

```json
{
  "name": "Simmer",
  "slug": "simmer-stove",
  "premise": "A pot on a stove. Tap it and it bubbles; light burners and it bubbles on its own.",
  "voice": "Warm, short, a little sleepy.",
  "currencies": { "main": { "name": "Bubble", "glyph": "drop" } },
  "stats": { "output": "Boil", "offline": "Simmer" },
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
    "type": {
      "display": { "family": "Work Sans", "spec": "Work+Sans:ital,wght@0,100..900;1,100..900" },
      "ui": { "family": "Work Sans", "spec": "Work+Sans:ital,wght@0,100..900;1,100..900" },
      "num": { "family": "JetBrains Mono", "spec": "JetBrains+Mono:wght@100..800" }
    },
    "surface": { "base": "weather", "line": "Steam rising off the pot, thicker as the boil grows." },
    "moment": "The first range: every ring lights at once and the steam fills the window."
  }
}
```

Save it beside the game folder, not inside it, as `simmer-answers.json`. Going through it:

- `name` is shown to the player. `slug` is the game's id, its save key's stem and its package name. Leave it out
  and it is made from `name`. Here it is set on purpose: the template saves under `<slug>.save`, chapter 2's
  Simmer already saves under `simmer.save`, and two games served from `localhost:3000` share one browser storage.
  The same slug would put both games in one save slot.
- `premise` and `voice` are a sentence or two each. They go into the concept file and the game's README.
- `currencies.main` names the one currency. Its id is made from the plural (`bubbles`). A `glyph` is one of `coin`,
  `drop`, `gem`, `leaf`, `star`, `moon`, `bolt`, `shell`, `flame`, `key`, `sun` or `seed`.
- `stats` names the two numbers the stats feature always tracks: output, and the share earned while away.
- `generators` lists the core, cheapest first, each with a one-line description.
- `features` picks the systems: any of `clicker`, `tree`, `gacha`, `prestige`, `achievements` and `visitor`. Each one
  you pick needs its own block (`clicker` here). Leave `core` out for generators, or set it to `"dimensions"`.
- `session` is `glance`, `short` or `long`, and sets the schedule the sim plays.
- `look` is your palette as `#rrggbb` (the ground, the ink, and the signal colour for buttons and highlights), three
  Google Fonts by family and their exact `css2` spec, a starter backdrop (`weather`, `print`, `signal` or `cells`)
  with the sentence it should answer to, and one sentence about the moment the look is built around.

Where the full list of fields lives needs a word of honesty. The template's own README sends you to a file inside an
AI skill that is not in the repository. The real schema is the `Answers` interface near the top of
`templates/game/.scaffold/generate.ts`, and the rules are in its `plan()` function just below. Two complete files
sit beside it to copy from: `.scaffold/fixtures/smallest.json` (the least a valid file says) and
`.scaffold/answers.example.json` (every system).

You do not have to get it right first time. `plan()` checks the whole file and lists every problem in one error.

### 4. Generate

From inside the copy, run the generator and name the engine tag your game will install:

```sh
cd simmer
bun .scaffold/generate.ts --answers ../simmer-answers.json --out . --engine v0.17.0
```

You should see one line:

```
generated Simmer (full): generators, clicker, weather backdrop
```

Always pass `--engine`. Without it the generated `package.json` pins the engine at `v0.3.1`, a tag that does not
exist in the repository, and the install in step 7 fails.

If a `look:` line appears above it, one of your colour pairs reads poorly. The check rounds to one decimal place, so
you can see a message as odd as `text on the signal is 4.5:1 (needs 4.5:1)`, which means just under. Move the
signal colour a little further from the text drawn on it (darker if that text is white, lighter if it is near-black)
and generate again from a fresh copy.

### 5. Remove the scaffold folder

```sh
rm -r .scaffold
```

The generator skips `.scaffold/` but leaves it in place. Your game does not need it.

### 6. Start the repository

```sh
git init -b main
```

Do this before you need `verify`. Its "only the tests this change touches" step runs `bun test --changed=main`,
which fails outside a git repository and fails again until `main` has a first commit.

### 7. Install

```sh
bun install
```

This fetches the engine by tag, from the line the generator wrote into `package.json`:

```json
"watchpot": "git+ssh://github.com/backshelf/watchpot.git#v0.17.0"
```

Keep that URL form. `github:backshelf/watchpot#v0.17.0` and `git+https://...` go to an endpoint that answers 404 for
a private repository, and a URL with a user in it (`git@github.com`) breaks the credentials from `gh`.

### 8. Build the tokens

```sh
bun run tokens
```

This compiles `design/tokens.json` into `src/tokens.css`, which `src/main.tsx` imports. The template does not ship
that file, and nothing tells you it is missing in the usual places: `bun check` still passes, because `env.d.ts`
declares every `.css` import. Only the bundle fails, with `Could not resolve: "./tokens.css"`. Run this step again
whenever you edit `design/tokens.json`, and commit both files.

### 9. Format

```sh
bun run lint:fix
```

The generator deletes blocks without tidying what is left, so a fresh game fails `bun run lint` on import order and
spacing in about thirty files. This fixes all of them.

### 10. Run the checks once

```sh
bun run typecheck
bun run lint
bun test
bun run sim -- --player=auto --contract
```

Typecheck and lint should be clean, the tests should pass (17 of them, in two files, for this shape), and the sim
should end with every row of its contract table marked `in`.

### 11. The first commit

```sh
git add -A
git commit -m "feat: scaffold simmer from the watchpot template"
bun run verify
```

`verify` now has a `main` to compare against, and passes.

### 12. Play it

```sh
bun run dev
```

Open `http://localhost:3000`. The dev server runs with hot reload off (a Bun bug drops CSS-module imports while it is
on), so refresh to see a change.

### What was verified

On a fresh copy of the template from a shallow clone at `v0.17.0`, with the answers file above: the generator ran
and printed the line in step 4; `bun install` fetched the engine by tag; the build failed on the missing
`tokens.css` before step 8 and succeeded after it; lint failed before step 9 and passed after it; typecheck, lint,
the 17 tests and the sim's contract all passed; `verify` failed before a first commit and passed after it. The
generator's behaviour on an empty folder was checked too. The dev server was not started and the page was not
opened in a browser.

## What you have now

The folder follows the layout from [chapter 5](05-a-real-game.md). In brief:

- `src/content/` holds your words and numbers. The generator wrote it from your answers and it is now yours: edit it
  freely.
- `src/game/` holds the features, on the engine's factories, and the store. `game.ts` lists them in the order each
  pass runs them.
- `src/app/` and `src/screens/` are the page: the shell, the tabs, the header, the about sheet, and a screen per tab.
- `src/ui/` is the registry, 16 components for this shape out of the template's 21. Its `README.md` lists the `--ui-*`
  tokens every component reads. These are your copies: restyle, rewrite or delete them. Nothing upstream changes
  them later.
- `design/`, `sim/` and `test/` are what their names say.

One folder is not for you. `.claude/` holds notes written for an AI coding agent, which assume the game is being
built that way. Read them if you are curious, delete them if you are not.

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

The one difference worth seeing is in `gates:full`: the template's version ends by running the sim's contract, and
this one does not, because the game proves its pacing with a fit of its own instead (the large-game route in
[chapter 12](12-proving-the-pacing.md)). It also dropped the `tokens` script. The scripts are yours to change.

## The daily loop

Three commands carry almost all of your working day. They are ordered by cost, and you run the cheap one most.

- **`bun run verify`**: typecheck, lint, and only the tests your change touches. Run it before every commit. It takes
  seconds.
- **`bun run gates`**: typecheck, lint, every fast test, and a production build. Run it when a piece of work is done,
  before you push. The build is there because a page can typecheck and still fail to bundle, as step 8 showed.
- **`bun run gates:full`**: the gates, plus the slow tests (files named `*.slow.test.ts`) and the pacing contract.
  Run it at a checkpoint, not on every change.

The sim is a measuring tool, not a test. Run `bun run sim -- --player=auto` once after a change to numbers, read the
table, and add `--contract` when you want the verdict. [Chapter 12](12-proving-the-pacing.md) covers what to look for.

### The dev panel

The [dev panel](../glossary.md#dev-panel) docks over the running game in a development build. It warps time
forward, jumps to day N, shows each feature's saved state, and lets you export, edit, check and import the save as
text. It is how you test a day away without waiting a day.

The template does not mount it, so add it yourself. It needs a route that changes when the address does and, by
convention, a production check written inline in the JSX:

```tsx
export function useRoute() {
  const [route, setRoute] = useState(() => location.hash);
  useEffect(() => {
    const on = () => setRoute(location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export function DevRoute() {
  const route = useRoute();
  return (
    <>
      {process.env.NODE_ENV !== "production" && route === "#dev" && (
        <DevPanel onClose={() => (location.hash = "")} />
      )}
    </>
  );
}
```

*watchpot, `docs/examples/guide-template.tsx`*

Line by line:

- `useRoute` keeps the page's hash in React state and updates it on `hashchange`. Reading `location.hash` once at
  mount is not enough: the panel's close button clears the hash, and without the listener the page never hears
  about it.
- `process.env.NODE_ENV !== "production"` is the check the engine's docs and its reference game write. The bundler
  replaces it with `false` in a production build and drops everything after it.
- That check is a second lock, not the only one. `DevPanel` as `watchpot/react` exports it already draws nothing in a
  production build and reaches the panel's module only through a dynamic import behind the same test, so the panel's
  code and styles stay out of your bundle even if you move or drop the check here. Keep it anyway: it also keeps
  the route's own code out, and it matches every other example you will read.
- `DevPanel` comes from `watchpot/react` and reads the store from context, so `<DevRoute />` goes anywhere inside the tree `mountGame` builds. In the
  template, inside `<Shell>` in `src/app/App.tsx` is a good place.

Then open `http://localhost:3000/#dev`.

## Changing the engine and a game together

Sooner or later your game needs something the engine lacks: a rule, a hook, an effect. The engine's convention is
that whatever is not specific to your game's fiction goes into the engine, generic and named for no game, with
tests, a README section and a `CHANGELOG.md` line. Only what is truly your game's own stays in the game.

The game installs the engine by tag, so an engine change reaches it in three moves:

1. **In the engine**, make the change and run `bun run verify`. If you added, removed or retyped an export,
   regenerate the API report with `bun run api` in the same commit.
2. **Release it.** Bump `version` in the engine's `package.json`, add a `CHANGELOG.md` line, commit, run
   `bun run gates`, then tag and push (here the next version is `v0.18.0`):

   ```sh
   git tag -a v0.18.0 -m v0.18.0
   git push origin main v0.18.0
   ```

3. **In the game**, change the tag at the end of the `watchpot` line in `package.json` and run `bun install`.

A release that breaks existing code ships a [codemod](../glossary.md#codemod): a script in the engine's `codemods/`
that rewrites a game's imports and calls, prints what it would change, and applies it only with `--write`. The
`CHANGELOG.md` entry names it and says what it leaves for you to do by hand. The installed package carries most of the
engine's repository, so after `bun install` the codemods for the new version are in
`node_modules/watchpot/codemods/`. Their README shows them run from a sibling checkout of the engine instead.

Between releases there is one way to have a game see engine changes as you make them, and it is the one the
engine's reference game uses: `examples/orbital-orchard/` lives inside the engine's repository as a workspace and
depends on `"watchpot": "workspace:*"`. An engine edit reaches it at once, and the engine's own typecheck, lint and
tests cover it. A game in its own repository has no documented equivalent today, so it moves by tag.

## The AI route

The engine was built alongside an AI skill for Claude Code that interviews you about the game (its fiction, its
loop, its look), writes the answers file, and runs every step above for you, ending with a first commit. The
template's README and the engine's README refer to it as `/watchpot`. It is not in this repository, and it is not
something you can install from here today. If you have it, it saves you the steps above. If you do not, the steps
above are the whole of what it does, and you have just done them.

## Things that bite

- **The generator does not copy.** It rewrites a folder that is already a copy of the template. Given an empty
  folder, it writes eight files and reports success.
- **The default engine tag is stale.** Leave out `--engine` and `package.json` pins `v0.3.1`, which does not exist,
  so the install fails. Pass the tag you cloned.
- **`tokens.css` is missing until you build it.** Typecheck passes without it, because `env.d.ts` declares every
  `.css` import. The bundle, and so the dev page, fails. Run `bun run tokens` after every edit to `tokens.json`.
- **A fresh game fails lint.** The gating leaves imports out of order and blocks unformatted. `bun run lint:fix`
  once, before your first check.
- **`verify` needs git.** Its changed-tests step compares against `main`, so it fails until the folder is a
  repository with a first commit on a branch called `main`.
- **Two games can share a save.** Every game on `localhost:3000` shares one browser storage, and the save key is
  made from the slug. Give each game its own `slug`.
- **The dev panel needs a live route.** Read `location.hash` once at mount and the panel never opens on a later
  `#dev` and never closes, because nothing re-renders when the hash changes. Listen for `hashchange`.
- **The answers schema is not where the README says.** It is the `Answers` interface and `plan()` in
  `.scaffold/generate.ts`, with complete examples in `.scaffold/fixtures/`.
- **You need access.** The engine is a private repository. Without read access and `gh auth setup-git`, neither the
  clone nor `bun install` works.

## Next

This is the last chapter of the guide. From here, [the showcases](../showcases.md) show what has been built on the
engine, [the glossary](../glossary.md) holds every term the guide introduced, and
[the reference shelf](../README.md#the-reference-shelf) has a page per system for when your game needs one the
template did not wire.

## Reference

- The template: `templates/game/.scaffold/README.md`, `templates/game/.scaffold/generate.ts` (the `Answers`
  interface and `plan()`), `templates/game/.scaffold/fixtures/`, `templates/game/src/ui/README.md` (the token
  contract)
- [The dev-panel workflow](../dev-panel-workflow.md), with [`examples/dev-panel.tsx`](../examples/dev-panel.tsx)
- [A theme](../theme.md), for `design/tokens.json` and `buildTokens`
- [A pacing contract](../pacing-contract.md) and [plan and fit](../plan-and-fit.md), for the sim
- [Headless UI](../ui.md), for what the registry's components wrap
- [A save migration](../migration.md), for when your saved shape changes
- The engine's `README.md` › Install and › Developing the engine and a game together, `CHANGELOG.md`, and
  `codemods/README.md`
- `api/react/dev/DevPanel.d.ts` (`DevPanel`, `DevPanelProps`), `api/react/clock.d.ts` (`warpClock`),
  `api/react/runtime.d.ts` (`useGameRuntime`), `api/react/store.d.ts` (`mountGame`, `createRuntimeHooks`)
