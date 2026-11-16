# Orbital Orchard

An idle game on the watchpot engine. Bun + TypeScript + React 19, one player (the owner), vibe mode: make the calls,
commit to `main`; the lead pushes (implementer agents never do). The concept, voice and look are in
`.claude/specs/concept.md` (the interview's answers beside it in `answers.json`); the engine's guide is its
`README.md` and its `docs/`, two folders up.

A lone caretaker on a derelict space station grows fruit trees in orbit for a planet that stopped answering. The fruit keeps coming. Somebody should be there to pick it.

**Voice.** Quiet, dry, a little hopeful. Short lines, said to nobody in particular. No exclamation marks; the jokes are deadpan and the hope is understated.

**The moment the look is built around.** The first heirloom graft blooms: the bench goes dark, one bud swells in rose light on the stage, and every pane of the station's glass catches it.

## Map

- `src/content/` the data: words (the vocabulary), generators, and one file per feature; `pacing.ts` is the session
  schedule and the pacing contract
- `src/game/` the features (`wallet`, `generators`, the tree, the gacha, prestige, `settings`), the stats, `game.ts`
  (`defineGame`) and the store; `src/game/events/` the events feature (the meteor shower's runtime), its board registry and one
  folder per event's board (`shower/`: the sky and its rules)
- `src/app/` the page (`App.tsx` over the game's `Shell`, the dev panel on `#dev`), the tabs, the header, the
  sheets (the about sheet holds the settings and the save as text), the icons, the sounds (zzfx only) ·
  `src/screens/` one screen per tab, and the graft reveal (the game's `Reveal`)
- `src/ui/` the game's own components, copied from the template's registry and restyled to the station's terminal
  look: thin wrappers over the engine's headless `watchpot/ui` (and, for `Reveal`, its headless reveal sequence),
  each with its CSS module; `theme.css` maps the `--ui-*` token contract onto `src/tokens.css` and holds the page's base
- `design/tokens.json` the palette and type, compiled to `src/tokens.css` by `bun run tokens` (commit both); the
  fonts are Google-hosted, linked from `index.html`
- `sim/` the headless sim and its timeline row · `test/` the game's tests

## Commands

- `bun run dev` serves the game at http://localhost:3000 (HMR off: refresh).
- `bun run verify`: typecheck, lint, the tests the change touches. Green before every commit.
- `bun run gates`: typecheck, lint, every fast test, the build. `bun run gates:full` adds the slow tier and the
  pacing contract.
- `bun run sim -- --player=auto [--days=7] [--seed=sim] [--contract]`: one run for a ballpark, never a loop.
- `bun run sim -- --straight=<hours> [--seed=sim]`: one unbroken sitting with the tab open, the same table.
- `bun run tokens` after editing `design/tokens.json`. `bun run lint:fix` formats.
- Never name a package script `check` (Bun 1.4.3+ typechecks with `bun check`).

## The engine

This game is the engine's reference game and lives inside the engine's repository (`examples/orbital-orchard`).
It does not install `watchpot` by tag: the engine's root `package.json` lists `examples/*` as workspaces and the game
depends on `"watchpot": "workspace:*"`, so `watchpot/*` resolves to the engine's own `src/` and an engine fix applies
at once. `bun install` (here or at the root) installs the whole workspace at the engine's root, one `react` for both. A change the
game needs from the engine is an engine commit with its own test (the engine's `.claude/CLAUDE.md`), never a
workaround here.

## Making a change

1. Fix it where the rule lives: numbers and words in `src/content/`, rules in the feature in `src/game/`, looks in
   the screen or `design/tokens.json`.
2. Pin it with a test that fails on the old code, or say in the commit why it cannot be.
3. A change to a saved shape bumps `save.version` in `src/game/game.ts` with a migration step.
4. A tuning change runs the sim once with `--contract`; a band moved on purpose says why in the commit.
5. `bun run verify`, Conventional Commit on `main`, no trailers.

## Code rules

- Screens read the store only through `useGameState` and `useGameStore` (`src/app/hooks.ts`).
- `src/ui` components take props only and hold no English: words come from the screens and `src/content/`. Their CSS
  reads colour, type and corners only from the `--ui-*` tokens in `theme.css`. Place or recolour one through a wrapper
  or a custom property, never by a second class on its element (two CSS modules on one element resolve by bundle
  order).
- `motion/react` owns `transform` and `opacity` on what it animates. Never name a CSS `container`. Biome refuses
  `!important`.
- One wall-clock read: `createGameStore`'s `now`. Game logic reads `api.now()` or the step's `ctx`.
- Sounds are zzfx voices in `src/app/sound.ts`; no downloaded audio.
- `bun test` runs on happy-dom: no CSS, no layout. Assert elements by name. A test over a second is `*.slow.test.ts`.

## Git

Conventional Commits, imperative and lowercase (`type(scope): summary`). No `Co-authored-by` or other trailers.
Never force-push. Git Bash crash dumps (`bash.exe.stackdump`) are never staged.
