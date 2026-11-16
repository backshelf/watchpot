# watchpot docs

These docs are written to be read front to back by a developer new to watchpot. Start with the guide: thirteen short
chapters that build a tiny game, Simmer, and then show each idea on the code of a real one, VOID IF REMOVED. After the
guide come the showcases, the glossary and the reference shelf, which you will keep coming back to once you know the
words.

## The guide

Read these in order. Each chapter opens with what you will have by the end and closes with the things that tend to go
wrong, a link to the next chapter, and the reference pages for what it covered.

1. [**What watchpot is**](guide/01-what-watchpot-is.md): what the engine does for you and what it leaves to you, the
   ten entries, and what you need installed.
2. [**Your first game**](guide/02-your-first-game.md): Simmer, from an empty folder to a page that ticks, saves and
   pays for time away.
3. [**The mental model**](guide/03-the-mental-model.md): features and slices, the store, the tick and its eight
   phases, game time and the clock.
4. [**Words and numbers**](guide/04-words-and-numbers.md): Decimals, printing numbers for a player, the vocabulary and
   the wallet.
5. [**A real game**](guide/05-a-real-game.md): how VOID IF REMOVED is laid out, and one purchase followed from content
   to screen.
6. [**The first page**](guide/06-the-first-page.md): the systems behind an opening page: a clicker, a gauge,
   generators, a shop, spawns and buffs.
7. [**The first reset**](guide/07-the-first-reset.md): runs, reset rules, depth, prestige, and achievements that also
   open pages.
8. [**Effects**](guide/08-effects.md): stats, effects and the stat bus, a tooltip that says where a number comes from,
   and the live graph.
9. [**Saving and time away**](guide/09-saving-and-time-away.md): what is saved and when, migrations, and paying and
   reporting the time a player was gone.
10. [**The page**](guide/10-the-page.md): reading the store from React, the runtime hook, headless UI, tokens, feel
    and the dev panel.
11. [**Look and sound**](guide/11-look-and-sound.md): a shader backdrop driven by the game, and a first sound table.
12. [**Proving the pacing**](guide/12-proving-the-pacing.md): the sim lab, pacing contracts, the test kit, and plan
    and fit for a large game.
13. [**From the template**](guide/13-from-the-template.md): starting a real project from the game template, the daily
    loop, and changing the engine and a game together.

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
| A persona | [persona](persona.md) | `persona.ts` |
| A theme | [theme](theme.md) | `theme.ts` |
| A sound table: cues, takes, the governor | [sound-table](sound-table.md) | `sound-table.ts` |
| The mix: buses, effects, scenes, the mod matrix, placement | [sound-mix](sound-mix.md) | `sound-mix.ts` |
| Music: the transport, harmony, a score, sequences | [sound-music](sound-music.md) | `sound-music.ts` |
| The instruments: grains, the freeze, babble, generators, the tap | [sound-dsp](sound-dsp.md) | `sound-dsp.ts` |
| Sound packs: samples built from downloads | [sound-packs](sound-packs.md) | `sound-pack.ts` |
| A reveal | [reveal](reveal.md) | `reveal.tsx` |
| The dev-panel workflow | [dev-panel-workflow](dev-panel-workflow.md) | `dev-panel.tsx` |
| A live stat graph | [stat-graph](stat-graph.md) | `stat-graph.ts` |
| Time away, a journal and a deep fill | [time-away](time-away.md) | `time-away.ts` |
| Plan and fit | [plan-and-fit](plan-and-fit.md) | `plan-and-fit.ts` |
| A 3D stage | [three](three.md) | `three-stage.tsx` |
| Headless UI (behaviour from the engine, look from the game) | [ui](ui.md) | `ui.tsx` |
| Feel: answer the player, ration the machine | [feel](feel.md) | (inline) |
| Shaders for feel | [shader](shader.md) | `shader.tsx` |

### By system

The systems of the root README's `Systems` section, one page each:

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
| A sweep: a timing bar with graded strikes | [sweep](sweep.md) | `sweep.ts` |
| Stages: tracks of walls worn down by a force | [stages](stages.md) | `stages.ts` |
| Missions | [missions](missions.md) | `missions.ts` |
| A market: prices that wander, buy low and sell high | [market](market.md) | `market.ts` |
| Crafting recipes | [recipes](recipes.md) | `recipes.ts` |
| Levels and experience curves | [levels](levels.md) | `levels.ts` |
| Records: run, lifetime and best | [records](records.md) | `records.ts` |
| A daily streak | [streak](streak.md) | `streak.ts` |
| Notations | [notations](notations.md) | `notations.ts` |

The gauge has no page of its own yet; it is the [Gauges](../README.md#gauges) section of the root README.

## The API report

[`api/`](../api) holds the generated type declarations for the ten entries, with a doc line on each export. When the
guide or a reference page and `api/` disagree, `api/` is right. The two build-tool paths, `watchpot/kit/theme` and
`watchpot/sound/pack`, have no file there; read their source under `src/kit/theme/` and `src/sound/pack/`.

Examples import from `watchpot/core`, `watchpot/sim`, `watchpot/test`, `watchpot/react`, `watchpot/kit`, `watchpot/ui`,
`watchpot/shader`, `watchpot/sound`, `watchpot/sound/pack` and `watchpot/three` as a consumer would. The long-form
reference for every entry is the root [README](../README.md).
