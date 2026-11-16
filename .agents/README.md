# .agents

Agent skills that ship with the engine. A skill is a folder with a `SKILL.md` (a name, a description that says when
to use it, and the instructions) and whatever it reads (`references/`, `scripts/`). They are plain files: any agent
that reads skills can use them, and so can a person who wants the checklist.

| Skill | What it is for |
| --- | --- |
| [`watchpot-init`](skills/watchpot-init/SKILL.md) | Make a new game on the engine: an interview, the scaffold (`templates/game/.scaffold/`), then the build that makes it its own. |

## Installing one

Copy the skill's folder, or link it, into the skills directory of the agent or the project that should use it. For
Claude Code that is `~/.claude/skills/` (every project) or `<project>/.claude/skills/` (one project); the folder
keeps its name, so `watchpot-init` is invoked as `/watchpot-init`.

```sh
# from a checkout of the engine, or an install of it (node_modules/watchpot)
cp -r .agents/skills/watchpot-init ~/.claude/skills/            # a copy: update it by copying again
ln -s "$PWD/.agents/skills/watchpot-init" ~/.claude/skills/watchpot-init   # a link: follows the checkout
```

A skill reads the engine's own files (the scaffold's recipe, the docs), so it works against whichever engine version
sits beside it or is installed in the project; update the engine and the skill's source of truth moves with it. The
skills' code examples are type-checked with the engine (`bun check`), so a copy is as current as the engine it came
from.
