#!/usr/bin/env node
/**
 * Makes a new idle game on the watchpot engine: `bun create watchpot` or `npm create watchpot`.
 *
 * It asks for a name, a template (Bun or Vite), Tailwind, the starter components, a 3D stage and agent skills, then
 * writes the game from the engine's bare template (the engine is the installed `watchpot` package, whose
 * `templates/bare` the files are read from at run time), copies the skills in, and installs. The bare game is one
 * button and one number, with no look: plain HTML. The Vite template converts the written game (`./vite.ts`);
 * Tailwind only wires Tailwind into the build (`./tailwind.ts`); the starter components (`./components.ts`) are the
 * template's UI registry, copied in only when asked for, in Tailwind's copies when Tailwind is on. Runs on Node 20+
 * and on Bun.
 *
 * Non-interactive (tests, scripts): `--name <n> --vite --tailwind --components --three --skills=.claude/skills,.agents/skills --no-install --yes`.
 * Any answer given as a flag skips its prompt; `--yes` takes the default for every answer not given.
 */
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";
import * as p from "@clack/prompts";
import { slugify } from "../../../templates/game/.scaffold/generate";
import { addComponents } from "./components";
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
  components?: boolean;
  three?: boolean;
  skills?: string[];
  install: boolean;
  yes: boolean;
}

interface Choices {
  name: string;
  vite: boolean;
  tailwind: boolean;
  components: boolean;
  three: boolean;
  skills: string[];
}

class UsageError extends Error {}

const USAGE =
  "usage: create-watchpot [--name <name>] [--vite] [--tailwind] [--components] [--three] [--skills=<dir,dir>] [--no-install] [--yes]\n" +
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
      case "--components":
        flags.components = true;
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
            message: "Tailwind CSS? (wires it into the build; adds no components)",
            initialValue: false,
          }),
        ));

  const components =
    flags.components ??
    (flags.yes
      ? false
      : answered(
          await p.confirm({
            message: `Add starter components (buttons, panels, sheets and more, ready-made${tailwind ? ", in Tailwind" : ""})?`,
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
  return { name: name.trim(), vite, tailwind, components, three, skills };
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

/** What the bare template holds that the game does not: its own README and agent docs, and the page's other version. */
const NOT_COPIED = new Set(["README.md", "AGENTS.md", "components", "node_modules"]);

const htmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The line the game's README says about what its page is made of. */
function componentsLine(choice: Choices): string {
  if (choice.components)
    return `- \`src/ui/\` the starter components over the engine's headless \`watchpot/ui\`${choice.tailwind ? ", each styled with Tailwind utilities" : ", each with its CSS module"} (\`src/ui/README.md\` lists them and the tokens they read); \`design/tokens.json\` is compiled to \`src/tokens.css\` by \`bun run tokens\`.\n`;
  if (choice.tailwind) return "- `src/index.css` imports Tailwind. No component is styled yet.\n";
  return "";
}

/** The `*.tmpl` files of the written game, by relative path. */
function templates(dir: string, rel = ""): string[] {
  return readdirSync(join(dir, rel), { withFileTypes: true }).flatMap((e) => {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) return e.name === "node_modules" ? [] : templates(dir, r);
    return e.name.endsWith(".tmpl") ? [r] : [];
  });
}

/**
 * Writes the game: the bare template (one button, one number, a saved setting), with its name, its slug and the
 * engine's version put in, and (with skills) the agent docs. No look, no component, no mechanic.
 */
function writeGame(engine: string, choice: Choices, out: string, pkg: EnginePackage) {
  const template = join(engine, "templates", "bare");
  const slug = slugify(choice.name);
  cpSync(template, out, {
    recursive: true,
    filter: (src) => src === template || !NOT_COPIED.has(basename(src)),
  });
  // The template keeps its ignore file as `gitignore`: npm leaves every `.gitignore` out of a published package.
  renameSync(join(out, "gitignore"), join(out, ".gitignore"));

  const vars: Record<string, string> = {
    name: choice.name,
    nameHtml: htmlEscape(choice.name),
    slug,
    engine: `v${pkg.version}`,
    componentsLine: componentsLine(choice),
  };
  for (const rel of templates(out)) {
    const file = join(out, rel);
    const text = readFileSync(file, "utf8").replace(/\{\{(\w+)\}\}/g, (m, key: string) => {
      const value = vars[key];
      if (value === undefined) throw new Error(`create-watchpot: ${rel}: unknown placeholder ${m}`);
      return value;
    });
    writeFileSync(file.slice(0, -".tmpl".length), text);
    rmSync(file);
  }

  // The game's name and save stem: the template's own words, rewritten.
  const words = join(out, "src", "game", "words.ts");
  const source = readFileSync(words, "utf8");
  const nameLine = /^export const NAME = .*;$/m;
  const slugLine = /^export const SLUG = .*;$/m;
  if (!nameLine.test(source) || !slugLine.test(source))
    throw new Error("create-watchpot: src/game/words.ts has changed; cannot name the game");
  writeFileSync(
    words,
    source
      .replace(nameLine, () => `export const NAME = ${JSON.stringify(choice.name)};`)
      .replace(slugLine, () => `export const SLUG = ${JSON.stringify(slug)};`),
  );

  if (choice.skills.length > 0) copyFileSync(join(template, "AGENTS.md"), join(out, "AGENTS.md"));
}

/** Any valid answers file, for the one thing that wants one: the tokens' palette and type (the template's defaults). */
function fixtureAnswers(engine: string): Record<string, unknown> {
  const fixture = join(engine, "templates", "game", ".scaffold", "fixtures", "smallest-clicker.json");
  return JSON.parse(readFileSync(fixture, "utf8")) as Record<string, unknown>;
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
  // The scaffold formats what it writes with the game's Biome, which only exists once the install is done: format
  // now, so a new game passes its own `verify` from the first run.
  const fmt = spawnSync(cmd, ["run", "lint:fix"], {
    cwd: dir,
    stdio: "ignore",
    shell: !bun && process.platform === "win32",
  });
  if (fmt.error || fmt.status !== 0) console.warn("create-watchpot: run `lint:fix` in the game to format it");
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
  writeGame(engine, choice, out, pkg);
  fixManifest(out, choice, pkg);
  copySkills(engine, out, choice.skills);
  if (choice.components)
    await addComponents(out, engine, {
      tailwind: choice.tailwind,
      name: choice.name,
      answers: fixtureAnswers(engine),
    });
  if (choice.vite) toVite(out, engine, choice.components);
  if (choice.tailwind) toTailwind(out, engine, choice.vite ? "vite" : "bun", choice.components);
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
