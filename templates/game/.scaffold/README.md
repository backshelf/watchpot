# The game template

`templates/game/` is what a new game is made from. As it stands it is the union of everything it can generate (both
cores, every feature, all four starter backdrops) with the example content in `answers.example.json`: the engine's
`bun check` type-checks it, the engine's suite builds it in production, and `bun templates/game/sim/run.ts --contract`
holds its pacing (wide bands: the union runs two incomes into one wallet, so it is faster than any real shape).

## Making a game

Write an answers file (`answers.md` is the reference; `fixtures/smallest-clicker.json` is the least one says,
`answers.example.json` a full one), then, from a checkout of the engine or an install of it (from the npm package or
by tag; either way the files are the same):

```sh
bun templates/game/.scaffold/new.ts my-answers.json ../my-game        # in a checkout
bun node_modules/watchpot/templates/game/.scaffold/new.ts my-answers.json my-game   # from an install
```

Add `--agents` to either to also write a generic `AGENTS.md` (from `templates/agents/AGENTS.md`) and the concept
and answers in `design/` (`concept.md`, `answers.json`). Without it a new game ships no agent docs.

`new.ts` copies the template into the folder (missing or empty), writes the game from the answers, compiles
`src/tokens.css`, runs `bun install` and `bun run lint:fix`, then prints the next steps: `git init -b main`, the
first commit, `bun run verify`, `bun run dev`. `--no-install` stops after the files are written. Nothing else is
needed to scaffold: no agent, no skill. The `/watchpot-init` skill (`.agents/skills/watchpot-init/`, which ships with
the engine) is the interview that writes the answers file and the build that makes the game after it; it runs this
command and nothing of its own.

**How the game installs the engine.** The template's `package.json` names the engine as a dependency, and `--engine
<tag>` (default: `v` and this engine's own version) is the tag it writes there, as a git dependency:
`"watchpot": "git+ssh://github.com/backshelf/watchpot.git#<tag>"`. A game that takes the engine from the npm package
instead replaces that one line with `"watchpot": "^<version>"` (or runs `bun add watchpot`): run `new.ts` with
`--no-install`, make that change, then `bun install && bun run lint:fix`. Moving to a newer engine later is the same
one line (a new tag, or a new version) and `bun install`. Nothing else in the template depends on which: it reads the
engine only through the `watchpot/*` imports.

## The parts

- **`new.ts`** the whole sequence above.
- **`generate.ts`** the generation alone: `--answers <file> --out <dir> [--engine <tag>] [--mode full|content] [--agents]`. In
  `full` mode (the default) it copies the template into an empty `--out`, writes `src/content/*` and
  `design/tokens.json`, drops the files and blocks of the flags not chosen, renders each `*.tmpl` (the files whose
  name would clash with the engine's own: `package.json`, `biome.json`, `index.html`, the README), compiles
  `src/tokens.css` and formats the result with Biome. `--agents` also writes `AGENTS.md` and `design/concept.md`
  and `design/answers.json`. It refuses the template folder itself and a non-empty folder with no `*.tmpl` in it.
- **What it wires.** The wallet (`defineCurrencies`), the `stats` feature (`defineStats`: every contribution to
  output, the offline share and the prestige gain, each a derived value on the state) and the core:
  `defineGenerators` (3 to 8; none beside a clicker) or `defineDimensions` (4 to 8 tiers). Then any of `clicker`
  (`defineClicker`), `tree` (`defineUpgradeTree`), `gacha` (`defineGacha`), `prestige` (`definePrestige`),
  `achievements` (`defineAchievements`, eight to a row) and `visitor` (`defineSpawns` paying a `defineBuffs` buff),
  each with its content file, its feature, its screen or part of the main screen and its sim column.
  `look.surface.base` picks the starter backdrop in `src/shaders/`; without a surface the page has none.
- **The sim.** `sim/run.ts` plays the auto-player on `activeSchedule` (played hours), on the plain store, and judges
  the contract in `src/content/pacing.ts` at hours 1, 2 and 4; `--sessions` plays the session schedule for a week,
  never judged. The engine's fit kit (`fitTable`, snapshots, `proveFit`, the profiler: `docs/fit-kit.md`) is for a
  game big enough to need it; the template has none.
- **No tests.** The template ships none (the engine's gates prove it); a game that wants them writes its own on the
  engine's test kit (`watchpot/test`: `freshStore`, `fixtureSave`, `renderWith`, `plainParity`,
  `decimalComparisons`).
- **Gating.** The flags are the features, the core (when it has producers) and the backdrop's base. `// @feature
  <flag>` (or `/* @feature <flag> */` in CSS) as a file's first line keeps the file only with that flag; `// @if
  <flag>` (or `!<flag>`, or `a|b`) to `// @end` keeps the lines between only then, and nests; in JSX,
  `{/* @if <f> */}` and `{/* @end */}`; in CSS, `/* @if <f> */` and `/* @end */`. A game without a feature has no
  file, import, tab or column for it. The raw template keeps every block, so a block must also make sense
  beside every other.
- **The example content** is regenerated with
  `bun templates/game/.scaffold/generate.ts --answers templates/game/.scaffold/answers.example.json --out templates/game --mode content`.
  Change the generator, regenerate, and commit both.

## Checking a change

`fixtures/` holds five shapes: `everything.json` (generators and every feature), `dimensions.json` (the dimensions
core with a clicker and achievements), `dimensions-reset.json` (the dimensions core with a tree, a reset and a
visitor, in long sittings), `smallest.json` (three generators and the default look) and `smallest-clicker.json` (a
clicker alone). `bun templates/game/.scaffold/shape.ts <answers> .scratch/shapes/<name>` writes one inside the engine
checkout with no install; `test/tooling/template-shapes.slow.test.ts` does that for each fixture and type-checks,
builds and runs the contract on the result. Before a release, run `new.ts` on them into `.scratch/` too: each must
install, pass `bun run gates` (typecheck, lint, the build), and hold its contract there.
