# create-watchpot

Makes a new idle game on the watchpot engine.

```sh
bun create watchpot        # or: npm create watchpot
```

It asks a few questions, writes the game into a new folder named after it, and installs its packages.

## The prompts

1. **Name.** The game's title (default `My Idle Game`). Its folder is the name's slug, in the current folder; a folder
   that already holds files is refused.
2. **3D stage?** No by default. Yes adds `three` and `@react-three/fiber` to the game, at the same versions the engine
   itself uses.
3. **AI agent skills?** No by default. Yes adds `AGENTS.md` and the engine's `watchpot-init` skill, then asks where:
   `.claude/skills` (Claude Code), `.agents/skills` (Codex and others), `.cursor/skills` (Cursor). At least one.

Ctrl-C at any prompt cancels and exits 0.

## Flags

```sh
bun create watchpot --name "Tap Jar" --three --skills=.claude/skills,.agents/skills --no-install --yes
```

- `--name <name>`, `--three`, `--skills=<dir,dir>`: answer that prompt with the flag, so it is not asked.
- `--yes`: take the default for every prompt that has no flag.
- `--no-install`: write the game and stop, without `bun install` (or `npm install`).

## What it does

The game is written from the engine's own template and its smallest answers fixture, with the name given. The engine is
the installed `watchpot` package, so the game's `watchpot` dependency is `^<the engine's version>`, from npm.

The game runs on Bun: after `cd <slug>`, `bun run dev` serves it at `http://localhost:3000`. Get Bun at https://bun.sh.

## Development

```sh
bun run build    # bundles src/index.ts into dist/index.js (Node 20+, runs under Bun too)
```

The engine's slow test `test/tooling/create-watchpot.slow.test.ts` builds this and runs it against the checkout.
