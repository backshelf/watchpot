# watchpot

A framework-light engine for idle and incremental games, in TypeScript on Bun and React. You describe a game as
features (saved state, actions, tick steps, a reset rule); the engine runs the clock, the big numbers, saving, time
away, the systems idle games share (currencies, generators, upgrade trees, prestige, gacha, events) and a sim lab
that proves the pacing. It is for developers who want to build an idle game and keep the look, the words and the
rules their own: the engine ships mechanism and behaviour, never a stylesheet.

**How this was made.** Most of the code here was written by an AI model (Anthropic's Claude), working with a person
who set the direction, built games on it, reviewed what came back and decided what stayed. That goes for the tests
and the docs too. It is said here so nobody has to guess: read it, use it and judge it knowing that.

## Install

Needs Bun 1.4.3 or later. watchpot 1.0 is meant to be public on npm as `watchpot` (MIT):

```sh
bun add watchpot
```

A release that is not on npm yet installs by git tag instead, with `"watchpot": "git+ssh://github.com/backshelf/watchpot.git#vX.Y.Z"`
in `package.json`. [Installing](docs/installing.md) has the details and the peers each entry needs.

## The smallest game

One feature with a derived value, two actions and a tick step, then a store and a clock. The file is
[`docs/examples/readme-smallest.ts`](docs/examples/readme-smallest.ts), and `bun check` type-checks it.

```ts
import { createIdleStore, D, defineGame, feature, startGameClock } from "watchpot/core";

const bakery = feature({
  key: "bakery",
  initial: () => ({ loaves: D(0), ovens: 1 }),
  derived: { perSecond: (s) => D(s.bakery.ovens) },
  actions: (api) => ({
    bake: () =>
      api.set((s) => {
        s.bakery.loaves = s.bakery.loaves.add(1);
      }),
    buyOven: () =>
      api.set((s) => {
        s.bakery.ovens += 1;
      }),
  }),
  steps: {
    produce: {
      ovens: {
        pass: "both",
        run: (s, ctx) => {
          s.bakery.loaves = s.bakery.loaves.add(s.bakery.perSecond.mul(ctx.dtMs / 1000));
        },
      },
    },
  },
});

export const game = defineGame({
  id: "bakery",
  save: { key: "bakery.save", version: 1 },
  features: [bakery],
});
export const store = createIdleStore(game, { now: () => Date.now() });
export const stopClock = startGameClock(store); // one catch-up for time away, then ticking; it saves too
```

The guide builds a bigger one, step by step, in [Your first game](docs/guide/02-your-first-game.md).

## The entries

Twelve entries, one line each. Which may import which is in [imports](docs/imports.md).

| Entry | What it is |
| --- | --- |
| [`watchpot/core`](docs/core.md) | The kernel: Decimals, formatting, rng, the clock, saves, the feature store and the systems built on it. No React. |
| [`watchpot/sim`](docs/sim.md) | The sim lab: an auto-player, pacing contracts, plan and fit. No React. |
| [`watchpot/test`](docs/test-kit.md) | The test kit: a fresh store, fixture saves, playing time in a test. |
| [`watchpot/react`](docs/react.md) | Store hooks, the clocks, the runtime hook and the page layout. Reaches no stylesheet. |
| [`watchpot/devtools`](docs/devtools.md) | The dev panel and the sound desk. The one entry with a stylesheet; only a game imports it. |
| [`watchpot/ui`](docs/ui.md) | Headless primitives: behaviour, focus, ARIA and `data-*` state, with no look. |
| [`watchpot/kit`](docs/kit.md) | Effects with no look, the reveal's mechanism and the theme compiler (`watchpot/kit/theme`). |
| [`watchpot/shader`](docs/shader.md) | A canvas for a game's own fragment shaders. |
| [`watchpot/three`](docs/three.md) | A 3D stage on three and react-three-fiber. |
| [`watchpot/sound`](docs/sound.md) | The sound engine on its own. |
| [`watchpot/sound/pack`](docs/sound-packs.md) | The build-time sample-pack pipeline, run in Bun. |

Every export carries a doc line, and the generated declarations are in [`api/`](api/).

## Where things are

- **The guide**, in [`docs/`](docs/README.md): read it front to back. It starts at
  [what watchpot is](docs/guide/01-what-watchpot-is.md) and [your first game](docs/guide/02-your-first-game.md),
  then goes deeper chapter by chapter.
- **The reference pages**, by topic: one page per task or system (a currency, a generator, an upgrade tree, a gacha,
  a prestige layer, a pacing contract, a theme, a sound table and the rest), each with a worked example in
  `docs/examples/` that `bun run verify` type-checks. They are listed in the [docs index](docs/README.md#the-reference-shelf).
- **Migrating a game to 1.0**: [`docs/migrating-to-1.0.md`](docs/migrating-to-1.0.md), every breaking change as old
  to new.
- **The glossary**: [`docs/glossary.md`](docs/glossary.md), every term the guide uses.
- **Showcases**: [`docs/showcases.md`](docs/showcases.md), systems doing jobs their names do not suggest.
- **A new game** starts from the template, [`templates/game/`](templates/game/.scaffold/README.md);
  [`examples/orbital-orchard/`](examples/orbital-orchard/README.md) is the reference game built on it.
- `CHANGELOG.md` lists every release; [`codemods/`](codemods/README.md) holds the codemods a breaking one ships.

## Working on the engine

- `bun run verify`: typecheck, lint, the tests the change touches, then the source-text rules. Green before a commit.
- `bun run gates`: typecheck, lint, `api:check` and the whole fast suite, before a release. `bun run gates:full` adds
  the slow tier.
- `bun run api` regenerates `api/` after an export changes; `bun run api:check` fails when it is stale.
- `bun scripts/rules.ts --doc` regenerates [`docs/imports.md`](docs/imports.md) after an import rule changes.

## Licence

MIT. See [`LICENSE`](LICENSE).
