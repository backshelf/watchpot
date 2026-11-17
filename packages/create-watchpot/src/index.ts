#!/usr/bin/env node
/**
 * Makes a new idle game on the watchpot engine: `bun create watchpot` or `npm create watchpot`.
 *
 * It asks for a name, a template (Bun or Vite), Tailwind for the UI, a 3D stage and agent skills, then writes the game
 * from the engine's template (the engine is the installed `watchpot` package, whose `templates/game` the files are read
 * from at run time), copies the skills in, and installs. The Vite template converts the written game (`./vite.ts`), and
 * the Tailwind one swaps the UI registry for Tailwind's copies (`./tailwind.ts`). Runs on Node 20+ and on Bun.
 *
 * Non-interactive (tests, scripts): `--name <n> --vite --tailwind --three --skills=.claude/skills,.agents/skills --no-install --yes`.
 * Any answer given as a flag skips its prompt; `--yes` takes the default for every answer not given.
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import * as p from "@clack/prompts";
import { generate, slugify } from "../../../templates/game/.scaffold/generate";
import { toTailwind } from "./tailwind";
import { toVite } from "./vite";

const DEFAULT_NAME = "My Idle Game";

/** Where the agent skills go: each target folder gets a copy of every skill the engine ships. */
const TARGETS: readonly { value: string; label: string }[] = [
  { value: ".claude/skills", label: "Claude Code (.claude/skills)" },
  { value: ".agents/skills", label: "Codex and others (.agents/skills)" },
  { value: ".cursor/skills", label: "Cursor (.cursor/skills)" },
];

interface Flags {
  name?: string;
  vite?: boolean;
  tailwind?: boolean;
  three?: boolean;
  skills?: string[];
  install: boolean;
  yes: boolean;
}

interface Choices {
  name: string;
  vite: boolean;
  tailwind: boolean;
  three: boolean;
  skills: string[];
}

class UsageError extends Error {}

const USAGE =
  "usage: create-watchpot [--name <name>] [--vite] [--tailwind] [--three] [--skills=<dir,dir>] [--no-install] [--yes]\n" +
  `  --skills takes any of: ${TARGETS.map((t) => t.value).join(", ")}`;

function parseFlags(argv: readonly string[]): Flags {
  const flags: Flags = { install: true, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    const eq = arg.indexOf("=");
    const key = arg.startsWith("--") && eq > 0 ? arg.slice(0, eq) : arg;
    const take = (): string => {
      const value = eq > 0 ? arg.slice(eq + 1) : argv[++i];
      if (value === undefined || value.startsWith("--")) throw new UsageError(`${key} needs a value`);
      return value;
    };
    switch (key) {
      case "--name":
        flags.name = take();
        break;
      case "--vite":
        flags.vite = true;
        break;
      case "--tailwind":
        flags.tailwind = true;
        break;
      case "--three":
        flags.three = true;
        break;
      case "--skills": {
        const dirs = take()
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const bad = dirs.filter((d) => !TARGETS.some((t) => t.value === d));
        if (bad.length) throw new UsageError(`--skills: unknown ${bad.join(", ")}\n${USAGE}`);
        flags.skills = dirs;
        break;
      }
      case "--no-install":
        flags.install = false;
        break;
      case "--yes":
        flags.yes = true;
        break;
      default:
        throw new UsageError(`unknown option ${arg}\n${USAGE}`);
    }
  }
  return flags;
}

/** The folder a game of this name is written to: its slug, in the current folder. */
const folderOf = (name: string) => resolve(process.cwd(), slugify(name.trim()));

/** Whether `dir` exists and holds something. */
function held(dir: string): boolean {
  return existsSync(dir) && readdirSync(dir).length > 0;
}

/** Why a name will not do, or undefined when it will. */
function nameProblem(name: string): string | undefined {
  if (!name.trim()) return "give the game a name";
  if (!slugify(name.trim())) return "the name needs a letter or a digit (its folder is named from it)";
  const dir = folderOf(name);
  if (held(dir)) return `${slugify(name.trim())}/ already holds files here: pick another name`;
  return undefined;
}

/** Exits 0 with "Cancelled" when a prompt was cancelled (Ctrl-C). */
function answered<T>(value: T): Exclude<T, symbol> {
  if (p.isCancel(value)) {
    p.cancel("Cancelled");
    process.exit(0);
  }
  return value as Exclude<T, symbol>;
}

/** The answers: each flag's, else the default under `--yes`, else the prompt's. */
async function choose(flags: Flags): Promise<Choices> {
  const name =
    flags.name ??
    (flags.yes
      ? DEFAULT_NAME
      : answered(
          await p.text({
            message: "What is the game called?",
            placeholder: DEFAULT_NAME,
            defaultValue: DEFAULT_NAME,
            validate: (v) => nameProblem(v ?? ""),
          }),
        ));
  const problem = nameProblem(name);
  if (problem) throw new UsageError(`name: ${problem}`);

  // Bun when given no flag (`--yes` included); at the prompt, the runtime's own is the default.
  const vite =
    flags.vite ??
    (flags.yes
      ? false
      : answered(
          await p.select<"bun" | "vite">({
            message: "Which template?",
            options: [
              { value: "bun", label: "Bun (recommended)" },
              { value: "vite", label: "Vite (Node)" },
            ],
            initialValue: process.versions.bun !== undefined ? "bun" : "vite",
          }),
        ) === "vite");

  const tailwind =
    flags.tailwind ??
    (flags.yes
      ? false
      : answered(
          await p.confirm({
            message: "Tailwind CSS?",
            initialValue: false,
          }),
        ));

  const three =
    flags.three ??
    (flags.yes
      ? false
      : answered(
          await p.confirm({
            message: "Add a 3D stage (three.js and react-three-fiber)?",
            initialValue: false,
          }),
        ));

  let skills = flags.skills ?? [];
  if (flags.skills === undefined && !flags.yes) {
    const agents = answered(
      await p.confirm({
        message: "Add AI agent skills (the watchpot-init skill, and an AGENTS.md)?",
        initialValue: false,
      }),
    );
    if (agents)
      skills = answered(
        await p.multiselect<string>({
          message: "Where do the skills go? (space to pick, enter to confirm)",
          options: TARGETS.map((t) => ({ value: t.value, label: t.label })),
          required: true,
        }),
      );
  }
  return { name: name.trim(), vite, tailwind, three, skills };
}

/** The engine: the installed `watchpot` package (or `WATCHPOT_ENGINE_DIR`, for the tests against a checkout). */
function engineRoot(): string {
  const override = process.env.WATCHPOT_ENGINE_DIR;
  if (override) return resolve(override);
  // `watchpot/package.json` is not an exported subpath, so find the package from an entry it does export.
  let dir = dirname(createRequire(import.meta.url).resolve("watchpot/core"));
  for (;;) {
    const manifest = join(dir, "package.json");
    if (
      existsSync(manifest) &&
      (JSON.parse(readFileSync(manifest, "utf8")) as { name?: string }).name === "watchpot"
    )
      return dir;
    const up = dirname(dir);
    if (up === dir) throw new Error("create-watchpot: cannot find the installed watchpot package");
    dir = up;
  }
}

interface EnginePackage {
  version: string;
  devDependencies?: Record<string, string>;
}

/** Writes the game: the template, its content from the fixture with the name given, and (with skills) the agent docs. */
async function writeGame(engine: string, choice: Choices, out: string, pkg: EnginePackage) {
  const template = join(engine, "templates", "game");
  const fixture = join(template, ".scaffold", "fixtures", "smallest-clicker.json");
  const temp = mkdtempSync(join(tmpdir(), "create-watchpot-"));
  try {
    const answers = JSON.parse(readFileSync(fixture, "utf8")) as Record<string, unknown>;
    const file = join(temp, "answers.json");
    writeFileSync(file, `${JSON.stringify({ ...answers, name: choice.name }, null, 2)}\n`);
    await generate({
      answers: file,
      out,
      engine: `v${pkg.version}`,
      mode: "full",
      agents: choice.skills.length > 0,
      template,
    });
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

/** The game's package.json: the engine from npm, and the 3D stage's two packages at the engine's own versions. */
function fixManifest(out: string, choice: Choices, pkg: EnginePackage) {
  const file = join(out, "package.json");
  const manifest = JSON.parse(readFileSync(file, "utf8")) as { dependencies: Record<string, string> };
  const deps: Record<string, string> = { ...manifest.dependencies, watchpot: `^${pkg.version}` };
  if (choice.three) {
    for (const name of ["three", "@react-three/fiber"]) {
      const version = pkg.devDependencies?.[name];
      if (!version) throw new Error(`create-watchpot: the engine does not pin ${name}`);
      deps[name] = version;
    }
  }
  manifest.dependencies = Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

/** Copies every skill the engine ships into each chosen folder of the game. */
function copySkills(engine: string, out: string, targets: readonly string[]) {
  const source = join(engine, ".agents", "skills");
  for (const target of targets) {
    for (const skill of readdirSync(source)) {
      const from = join(source, skill);
      if (!statSync(from).isDirectory()) continue;
      mkdirSync(join(out, target), { recursive: true });
      cpSync(from, join(out, target, skill), { recursive: true });
    }
  }
}

/** Installs with the package manager that is running this (Bun's own, else npm); the Vite game always uses npm. */
function install(dir: string, vite: boolean) {
  const bun = !vite && process.versions.bun !== undefined;
  const cmd = bun ? process.execPath : "npm";
  // npm is a `.cmd` shim on Windows, which only a shell runs.
  const r = spawnSync(cmd, ["install"], {
    cwd: dir,
    stdio: "inherit",
    shell: !bun && process.platform === "win32",
  });
  if (r.error || r.status !== 0) throw new Error(`${bun ? "bun" : "npm"} install failed in ${dir}`);
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const choice = await choose(flags);
  const engine = engineRoot();
  const pkg = JSON.parse(readFileSync(join(engine, "package.json"), "utf8")) as EnginePackage;
  const out = folderOf(choice.name);
  const slug = slugify(choice.name);
  // Re-checked: the name's folder can fill while the prompts run.
  const problem = nameProblem(choice.name);
  if (problem) throw new UsageError(`name: ${problem}`);

  p.intro(`create-watchpot: ${choice.name}`);
  const step = p.spinner();
  step.start(`Writing ${slug}/`);
  await writeGame(engine, choice, out, pkg);
  fixManifest(out, choice, pkg);
  copySkills(engine, out, choice.skills);
  if (choice.vite) toVite(out, engine);
  if (choice.tailwind) toTailwind(out, engine, choice.vite ? "vite" : "bun");
  step.stop(`Wrote ${slug}/`);

  const pm = choice.vite ? "npm" : process.versions.bun !== undefined ? "bun" : "npm";
  if (flags.install) {
    p.log.step(`Installing (${pm} install)`);
    install(out, choice.vite);
  }

  const runner = choice.vite ? "npm" : "bun";
  const next = [`cd ${slug}`, ...(flags.install ? [] : [`${runner} install`]), `${runner} run dev`];
  p.note(next.join("\n"), "Next steps");
  p.outro(
    choice.vite
      ? "The game runs on Node (`npm run dev` serves it at the URL Vite prints, usually http://localhost:5173). Happy idling."
      : "The game runs on Bun (https://bun.sh): `bun run dev` serves it at http://localhost:3000. Happy idling.",
  );
}

main().catch((err: unknown) => {
  if (err instanceof UsageError) {
    console.error(`create-watchpot: ${err.message}`);
    process.exit(2);
  }
  console.error(`create-watchpot: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
