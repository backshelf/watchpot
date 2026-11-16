# Codemods

A release that breaks a consumer's code ships a codemod beside it, so a game upgrades by running one script.

- **When**: any change to the public API report (`api/`) that removes, renames or retypes an export, or changes what
  a saved key or a tick phase means, is breaking. Additions are not.
- **One per breaking release**, named `<version>-<what>.ts` (`0.2.0-rename-reach.ts`), run from the game's root:
  `bun node_modules/watchpot/codemods/<file>.ts [--write]` (the installed package carries them; a sibling checkout's
  `bun ../watchpot/codemods/<file>.ts` works too). It prints the edits it would make and applies them only with
  `--write`. It rewrites imports and call sites it can prove; what it cannot prove, it lists for a human.
- **The changelog entry** for that version names the codemod and says what it leaves to hand.
- **A save-shape change** is never a codemod: it is a `migrations` step with a fixture, in the engine.
- **No codemod, no breaking release.** If a break is too tangled to script, it waits for a minor bump with a
  written upgrade note in `CHANGELOG.md` instead, and says so.

## So far

- `0.3.0-headless-kit.ts`: the styled kit retires; imports split by where each name lives now, with `--vendor` to copy
  the retired sources into the game.
- `0.9.0-sound.ts`: the sound comes from `watchpot/sound` alone. It moves the sound names a game imports from
  `watchpot/kit`, and lists every use of `createStems`, `stemOffset`, `mixLayers`, `soundSamples` and `.context()` with
  what to write instead. A game that already imports `watchpot/sound` (the template, the example) has nothing to
  rewrite and only the listed call sites to read.
- `0.17.0-watchpot.ts`: the package's old codename becomes `watchpot` in a game's specifiers, dependency and docs.
