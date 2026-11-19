# create-watchpot

Makes a new idle game on the watchpot engine.

```sh
bun create watchpot        # or: npm create watchpot
```

It asks a few questions, writes the game into a new folder named after it, and installs its packages.

## What you get

A bare game: one button, one number that goes up, and a saved setting (reduce motion). It has the boilerplate done (the
store and its save, the clock that catches up the time away, the typed hooks, the build, the lint and the typecheck) and
nothing else: no mechanic, no look, plain HTML. Every choice below adds to that; none of them adds a mechanic.

## The prompts

1. **Name.** The game's title (default `My Idle Game`). Its folder is the name's slug, in the current folder; a folder
   that already holds files is refused.
2. **Which template?** Bun (the default under Bun) or Vite on Node.
3. **Tailwind CSS?** No by default. Yes wires Tailwind v4 into the build and adds `src/index.css`, which imports it. It
   adds no styled component: you write the classes.
4. **Starter components?** No by default. Yes copies in `src/ui/`: ready-made buttons, panels, sheets, counters and
   more over the engine's headless `watchpot/ui`, with the colour and type tokens they read (`design/tokens.json`,
   compiled to `src/tokens.css`), and a page built on them. They are CSS modules, or Tailwind utilities when Tailwind
   is on. They are the game's own after that: restyle or delete them.
5. **3D stage?** No by default. Yes adds `three` and `@react-three/fiber` to the game, at the same versions the engine
   itself uses.
6. **AI agent skills?** No by default. Yes adds `AGENTS.md` and the engine's watchpot skills (including the
   `watchpot-init` one), then asks where: `.claude/skills` (Claude Code), `.agents/skills` (Codex and others),
   `.cursor/skills` (Cursor). At least one.

Ctrl-C at any prompt cancels and exits 0.

## Flags

```sh
bun create watchpot --name "Tap Jar" --tailwind --components --three --skills=.claude/skills,.agents/skills --no-install --yes
```

- `--name <name>`, `--vite`, `--tailwind`, `--components`, `--three`, `--skills=<dir,dir>`: answer that prompt with the
  flag, so it is not asked.
- `--yes`: take the default for every prompt that has no flag.
- `--no-install`: write the game and stop, without `bun install` (or `npm install`).

The boolean flags (`--vite`, `--tailwind`, `--components`, `--three`, `--no-install`, `--yes`) take no value:
`--vite=false` is an error, not a way to turn it off.

## What it does

The game is written from the engine's bare template (`templates/bare/`), with the name given. The engine is the
installed `watchpot` package, so the game's `watchpot` dependency is `^<the engine's version>`, from npm. The fuller
template with every system (`templates/game/`) is what the engine's watchpot skills fill from an interview.

The Bun game runs on Bun: after `cd <slug>`, `bun run dev` serves it at `http://localhost:3000`. Get Bun at
https://bun.sh. The Vite game runs on Node 20 or later: `npm run dev` serves it on Vite's dev server (usually
`http://localhost:5173`), with hot reload.

## Development

```sh
bun run build    # bundles src/index.ts into dist/index.js (Node 20+, runs under Bun too)
```

The engine's slow test `test/tooling/create-watchpot.slow.test.ts` builds this and runs it against the checkout.
