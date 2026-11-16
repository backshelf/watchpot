# The game template

`templates/game/` is what a new game is made from. As it stands it is the union of everything it can generate (both
cores, every feature, all four starter backdrops) with the example content in `answers.example.json`: the engine's
`bun check` type-checks it, its tests run in the engine's suite, and `bun templates/game/sim/run.ts --contract` holds
its pacing (wide bands: the union runs two incomes into one wallet, so it is faster than any real shape).

## Making a game

Write an answers file (`answers.md` is the reference; `fixtures/smallest-clicker.json` is the least one says,
`answers.example.json` a full one), then, from a checkout of the engine or an install of it:

```sh
bun templates/game/.scaffold/new.ts my-answers.json ../my-game        # in a checkout
bun node_modules/watchpot/templates/game/.scaffold/new.ts my-answers.json my-game   # from an install
```

`new.ts` copies the template into the folder (missing or empty), writes the game from the answers, compiles
`src/tokens.css`, runs `bun install` (the engine at `--engine <tag>`, by default this engine's own version) and
`bun run lint:fix`, then prints the next steps: `git init -b main`, the first commit, `bun run verify`, `bun run dev`.
`--no-install` stops after the files are written. Nothing else is needed: no agent, no skill.

## The parts

- **`new.ts`** the whole sequence above.
- **`generate.ts`** the generation alone: `--answers <file> --out <dir> [--engine <tag>] [--mode full|content]`. In
  `full` mode (the default) it copies the template into an empty `--out`, writes `src/content/*`,
  `design/tokens.json` and `.claude/specs/`, drops the files and blocks of the flags not chosen, renders each
  `*.tmpl` (the files whose name would clash with the engine's own: `package.json`, `biome.json`, `index.html`, the
  README and the game's `.claude/CLAUDE.md`), compiles `src/tokens.css` and formats the result with Biome. It
  refuses the template folder itself and a non-empty folder with no `*.tmpl` in it.
- **What it wires.** The wallet, the `stats` feature (every contribution to output, the offline share and the
  prestige gain, worked out each pass) and the core: `generators` (3 to 8, the engine's `generators`; none beside a
  clicker) or `dimensions` (4 to 8 tiers, the engine's `dimensions`). Then any of `clicker` (`clicker`), `tree`
  (`upgradeTree`), `gacha` (the gacha kernel), `prestige` (`prestige`), `achievements` (`achievements`, eight to a
  row) and `visitor` (`spawns` paying a `buffs` buff), each with its content file, its feature, its screen or part of
  the main screen, its sim column and its tests. `look.surface.base` picks the starter backdrop in `src/shaders/`;
  without a surface the page has none.
- **The sim.** `sim/run.ts` plays the auto-player on `activeSchedule` (played hours) and judges the contract in
  `src/content/pacing.ts` at hours 1, 2 and 4; `--sessions` plays the session schedule for a week, never judged.
- **Gating.** The flags are the features, the core (when it has producers) and the backdrop's base. `// @feature
  <flag>` (or `/* @feature <flag> */` in CSS) as a file's first line keeps the file only with that flag; `// @if
  <flag>` (or `!<flag>`, or `a|b`) to `// @end` keeps the lines between only then, and nests; in JSX,
  `{/* @if <f> */}` and `{/* @end */}`; in CSS, `/* @if <f> */` and `/* @end */`. A game without a feature has no
  file, import, tab, column or test for it. The raw template keeps every block, so a block must also make sense
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
tests and runs the contract on the result. Before a release, run `new.ts` on them into `.scratch/` too: each must
install, pass `bun run typecheck`, `bun run lint` and `bun test`, and hold its contract there.
