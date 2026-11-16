# The game template

`templates/game/` is what `/watchpot` copies into a new repository. As it stands it is the union of everything it can
generate (both cores, every feature, all four starter backdrops) with the example content in `answers.example.json`:
the engine's `bun check` type-checks it, its tests run in the engine's suite, and `bun templates/game/sim/run.ts
--contract` holds its pacing (wide bands: the union runs two incomes into one wallet, so it is faster than any real
shape).

- **`generate.ts`** turns an answers file (schema: the `/watchpot` skill's `references/answers.md`) into a game: it
  writes `src/content/*`, `design/tokens.json` and `.claude/specs/`, drops the files and blocks of the flags not
  chosen, and renders each `*.tmpl` (the files whose name would clash with the engine's own: `package.json`,
  `biome.json`, `index.html`, the README and the game's `.claude/CLAUDE.md`). The skill's scaffold script copies the
  template, runs it, then installs, builds the tokens, checks, runs the sim and the contract, and commits.
- **What it wires.** The wallet, the `stats` feature (every contribution to output, the offline share and the
  prestige gain, worked out each pass) and the core: `generators` (3 to 8, the engine's `generators`) or
  `dimensions` (4 to 8 tiers, the engine's `dimensions`). Then any of `clicker` (`clicker`), `tree`
  (`upgradeTree`), `gacha` (the gacha kernel), `prestige` (`prestige`), `achievements` (`achievements`, eight to a
  row) and `visitor` (`spawns` paying a `buffs` buff), each with its content file, its feature, its screen or part of
  the main screen, its sim column and its tests. `look.surface.base` picks the starter backdrop in `src/shaders/`.
- **Gating.** The flags are the features, the core and the backdrop's base. `// @feature <flag>` (or
  `/* @feature <flag> */` in CSS) as a file's first line keeps the file only with that flag; `// @if <flag>` (or
  `!<flag>`, or `a|b`) to `// @end` keeps the lines between only then, and nests; in JSX, `{/* @if <f> */}` and
  `{/* @end */}`; in CSS, `/* @if <f> */` and `/* @end */`. A game without a feature has no file, import, tab,
  column or test for it. The raw template keeps every block, so a block must also make sense beside every other.
- **The example content** is regenerated with
  `bun templates/game/.scaffold/generate.ts --answers templates/game/.scaffold/answers.example.json --out templates/game --mode content`.
  Change the generator, regenerate, and commit both.
- **Checking a change.** `fixtures/` holds four shapes: `everything.json` (generators and every feature),
  `dimensions.json` (the dimensions core with a clicker and achievements), `dimensions-reset.json` (the dimensions
  core with a tree, a reset and a visitor, in long sittings) and `smallest.json` (the least a valid answers file
  says). `bun templates/game/.scaffold/shape.ts <answers> .scratch/shapes/<name>` writes one inside the
  engine checkout with no install; `test/tooling/template-shapes.slow.test.ts` does that for each fixture and
  type-checks, tests and runs the contract on the result. Before a release, run the real scaffold
  (`~/.claude/skills/watchpot/scripts/scaffold.ts <answers> <out> --template <this folder> --no-commit`) on them too:
  each must install, pass its checks and hold its contract there.
