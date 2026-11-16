# watchpot docs

These docs are written to be read front to back by a developer new to watchpot. Start with the guide: thirteen short
chapters that build a tiny game, Simmer, and then show each idea on the code of a real one, VOID IF REMOVED. After the
guide come the showcases, the glossary and the reference shelf, which you will keep coming back to once you know the
words.

## The guide

Read these in order. Each chapter opens with what you will have by the end and closes with the things that tend to go
wrong, a link to the next chapter, and the reference pages for what it covered.

1. [**What watchpot is**](guide/01-what-watchpot-is.md): what the engine does for you and what it leaves to you, the
   twelve entries, and what you need installed.
2. [**Your first game**](guide/02-your-first-game.md): Simmer, from an empty folder to a page that ticks, saves and
   pays for time away.
3. [**The mental model**](guide/03-the-mental-model.md): features and slices, reach, derived values, the store, the
   tick and its eight phases, game time and the clock.
4. [**Words and numbers**](guide/04-words-and-numbers.md): Decimals, printing numbers for a player, the vocabulary and
   the wallet.
5. [**A real game**](guide/05-a-real-game.md): how VOID IF REMOVED is laid out, and one purchase followed from content
   to screen.
6. [**The first page**](guide/06-the-first-page.md): the systems behind an opening page: a clicker, a gauge,
   generators, a shop, spawns and buffs.
7. [**The first reset**](guide/07-the-first-reset.md): runs, reset rules, depth, prestige, and achievements that also
   open pages.
8. [**Effects**](guide/08-effects.md): stats, effects and the stats feature (`defineStats`), a tooltip that says where a number comes
   from, and an effect that reads the state.
9. [**Saving and time away**](guide/09-saving-and-time-away.md): what is saved and when, migrations, and paying and
   reporting the time a player was gone.
10. [**The page**](guide/10-the-page.md): reading the store from React, the runtime hook, headless UI, tokens, feel
    and the dev panel.
11. [**Look and sound**](guide/11-look-and-sound.md): a shader backdrop driven by the game, and a first sound table.
12. [**Proving the pacing**](guide/12-proving-the-pacing.md): the sim lab, the auto-player's objective, pacing
    contracts, the test kit, and plan and fit with the fit kit for a large game.
13. [**From the template**](guide/13-from-the-template.md): starting a real project from the game template in one
    command, the daily loop, and changing the engine and a game together.

In a hurry: read chapters 2 and 3, then jump to the chapter for whatever you are building.

## After the guide

- [**Showcases**](showcases.md): nine engine systems doing jobs their names do not suggest, and the questions that
  find uses like these in your own game.
- [**Glossary**](glossary.md): every term the guide uses, a sentence or two each, with the chapter that teaches it.

## The reference shelf

One reference page per task or system. Each has a complete example in [`examples/`](examples) that `bun run verify`
type-checks and, where the page says so, runs with `bun docs/examples/<name>.ts`. They share the words in
[`examples/vocab.ts`](examples/vocab.ts). The pages assume the vocabulary from chapters 2 to 4 of the guide.

### By task

| Task | Page | Example |
| --- | --- | --- |
| Start a game | [start-a-game](start-a-game.md) | `start-a-game.ts` |
| Add a currency | [add-a-currency](add-a-currency.md) | `add-a-currency.ts` |
| A generator | [add-a-generator](add-a-generator.md) | `add-a-generator.ts` |
| An upgrade tree | [upgrade-tree](upgrade-tree.md) | `upgrade-tree.ts` |
| A gacha (catalogue and roll) | [gacha](gacha.md) | `gacha.ts` |
| A timed event with a board | [timed-event](timed-event.md) | `timed-event.ts` |
| A prestige layer | [prestige-layer](prestige-layer.md) | `prestige-layer.ts` |
| A save migration | [migration](migration.md) | `migration.ts` |
| A pacing contract | [pacing-contract](pacing-contract.md) | `pacing-contract.ts` |
| The auto-player and fixture plays | [persona](persona.md) | `persona.ts` |
| The test kit: a fresh store, fixture saves, playing time in a test | [test-kit](test-kit.md) | `test-kit.ts` |
| The React runtime: mounting, the clock hooks, motion and scheme | [react-runtime](react-runtime.md) | `react-runtime.tsx` |
| A theme | [theme](theme.md) | `theme.ts` |
| A sound table: cues, takes, the governor | [sound-table](sound-table.md) | `sound-table.ts` |
| The mix: buses, effects, scenes, the mod matrix, placement | [sound-mix](sound-mix.md) | `sound-mix.ts` |
| Music: the transport, harmony, a score, sequences | [sound-music](sound-music.md) | `sound-music.ts` |
| The instruments: grains, the freeze, babble, generators, the tap | [sound-dsp](sound-dsp.md) | `sound-dsp.ts` |
| Sound packs: samples built from downloads | [sound-packs](sound-packs.md) | `sound-pack.ts` |
| A reveal | [reveal](reveal.md) | `reveal.tsx` |
| The dev-panel workflow | [dev-panel-workflow](dev-panel-workflow.md) | `dev-panel.tsx` |
| Stats | [stat-graph](stat-graph.md) | `stat-graph.ts` |
| Time away, a journal and a deep fill | [time-away](time-away.md) | `time-away.ts` |
| Plan and fit | [plan-and-fit](plan-and-fit.md) | `plan-and-fit.ts` |
| The fit kit: the live table, snapshots, resuming, the proof, the profiler | [fit-kit](fit-kit.md) | `fit-kit.ts` |
| A 3D stage | [three](three.md) | `three-stage.tsx` |
| Headless UI (behaviour from the engine, look from the game) | [ui](ui.md) | `ui.tsx` |
| Feel: answer the player, ration the machine | [feel](feel.md) | (inline) |
| Shaders for feel | [shader](shader.md) | `shader.tsx` |

### By system

The engine's systems, one page each:

| System | Page | Example |
| --- | --- | --- |
| Generators: the building list, cycles, milestones, bulk buys | [generators](generators.md) | `generators.ts` |
| Dimensions: a chain where each tier makes the one below | [dimensions](dimensions.md) | `dimensions.ts` |
| A clicker: crits, a combo, a rate cap | [clicker](clicker.md) | `clicker.ts` |
| Stacked reset layers | [layers](layers.md) | `layers.ts` |
| An achievement wall | [achievements](achievements.md) | `achievements.ts` |
| Challenges | [challenges](challenges.md) | `challenges.ts` |
| Autobuyers | [autobuyers](autobuyers.md) | `autobuyers.ts` |
| Buffs: timed effects | [buffs](buffs.md) | `buffs.ts` |
| Spawns: random catchable arrivals | [spawns](spawns.md) | `spawns.ts` |
| Allocation: a pool split between sinks | [allocation](allocation.md) | `allocation.ts` |
| A board: pieces on a grid that read their neighbours | [board](board.md) | `board.ts` |
| Branches: the game copied, played on several ways, one adopted | [branches](branches.md) | `branches.ts` |
| A sweep: a timing bar with graded strikes | [sweep](sweep.md) | `sweep.ts` |
| Stages: tracks of walls worn down by a force | [stages](stages.md) | `stages.ts` |
| Missions | [missions](missions.md) | `missions.ts` |
| A market: prices that wander, buy low and sell high | [market](market.md) | `market.ts` |
| Crafting recipes | [recipes](recipes.md) | `recipes.ts` |
| Levels and experience curves | [levels](levels.md) | `levels.ts` |
| Records: run, lifetime and best | [records](records.md) | `records.ts` |
| A daily streak | [streak](streak.md) | `streak.ts` |
| Notations | [notations](notations.md) | `notations.ts` |
| A gauge: a level that fills, drains and can trip | [gauge](gauge.md) | `gauge.ts` |
| Loadouts | [loadouts](loadouts.md) | `loadouts.ts` |
| Prefs and the pace clock | [prefs](prefs.md) | `prefs.ts` |
| Settings and seen-once flags | [settings](settings.md) | `settings.ts` |
| Events: a framework for timed events | [events](events.md) | `events.ts` |

## The API report

[`api/`](../api) holds the generated type declarations for the twelve entries, with a doc line on each export. When
the guide or a reference page and `api/` disagree, `api/` is right. The two build-tool paths, `watchpot/kit/theme`
and `watchpot/sound/pack`, are under `api/kit/theme/` and `api/sound/pack/`.

Examples import from `watchpot/core`, `watchpot/sim`, `watchpot/test`, `watchpot/react`, `watchpot/kit`, `watchpot/ui`,
`watchpot/shader`, `watchpot/sound`, `watchpot/sound/pack` and `watchpot/three` as a consumer would.

### By entry

The long-form reference for each entry, with the options and rules the topic pages leave to the signatures:

| Entry | Page |
| --- | --- |
| `watchpot/core`: features and the store, vocabularies, gacha, events, saves | [core](core.md) |
| `watchpot/sim` | [sim](sim.md) |
| `watchpot/test` | [test-kit](test-kit.md) |
| `watchpot/react` | [react](react.md) |
| `watchpot/devtools` | [devtools](devtools.md) |
| `watchpot/ui` | [ui](ui.md) |
| `watchpot/kit`, with theme, scenes and the reveal | [kit](kit.md) |
| `watchpot/shader` | [shader](shader.md) |
| `watchpot/three` | [three](three.md) |
| `watchpot/sound` | [sound](sound.md) |
| `watchpot/sound/pack` | [sound-packs](sound-packs.md) |

## Install, imports and migrating

- [**Installing**](installing.md): install, peers, changing the engine and a game together, and the shape of the package.
- [**What each entry may import**](imports.md): the import rules, generated from `scripts/rules.ts`.
- [**Migrating to 1.0**](migrating-to-1.0.md): every breaking change from 0.18, old to new.

## Keeping the docs' examples true

For whoever edits the docs. The code and output a guide chapter or a reference page quotes are checked against the
runnable files in `docs/examples/` by `test/docs/guide-examples.slow.test.ts` (`bun run test:slow`, about two
seconds). The check reads one-line HTML comments in the pages, each naming an example by its path under
`docs/examples/` (a marker may be indented, inside a list item):

- `<!-- example-output: guide-pacing.ts -->` above a fenced block: the block is what the example prints on stdout.
  `lines=3-7` makes it lines 3 to 7 of that output (1-based, inclusive), for a block that quotes part of it.
- `<!-- example-code: simmer/game.ts -->` above a fenced block: the code is in the example file. Lines compare
  trimmed. A line that is only `// ...` marks something left out, and the parts either side must appear in order. The
  quote may also leave out the example's whole-line comments.
- `<!-- example-prints: guide-effects.ts | first text | second text -->` above a paragraph (no block): each text is a
  whole line the example prints. Use it where prose or a code comment quotes a printed value.

Rules for the examples: one that a chapter quotes the output of must have an `import.meta.main` block, print the same
every run, and hand the engine its own clock and seed (the engine reads no wall clock). It runs as `bun <file>` from
the repository root.

When an example's output changes on purpose, run `bun scripts/guide-examples.ts --write`: it rewrites every
`example-output` block from the real output (code and `prints` markers need a hand edit). Run
`bun scripts/guide-examples.ts` alone for the same findings the test gives. The test also fails on a marker that
names a missing file, on a `guide-*` or `simmer/` example no chapter mentions, and on any other example no page
mentions. A new chapter block that quotes an
example gets a marker; an excerpt that is rewritten or only inspired by an example does not.
