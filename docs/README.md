# watchpot recipes

One page per recipe, each with a complete example in `examples/` that `bun run verify` type-checks and, where the page
says so, runs with `bun docs/examples/<name>.ts`. They share the words in [`examples/vocab.ts`](examples/vocab.ts).

| Recipe | Page | Example |
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

The systems (the README's `Systems` section), one page each:

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

Examples import from `watchpot/core`, `watchpot/sim`, `watchpot/test`, `watchpot/react`, `watchpot/kit`, `watchpot/ui`,
`watchpot/shader`, `watchpot/sound`, `watchpot/sound/pack` and `watchpot/three` as a consumer would. The reference for every entry is the root [README](../README.md); the types are in [`api/`](../api).
