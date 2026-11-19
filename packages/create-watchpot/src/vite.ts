/**
 * The Vite flavour: turns the Bun game that `writeGame()` just wrote into a game that runs on Node. The game's own files
 * (`src/`, `index.html`, and `design/` once the starter components are in) are untouched; this swaps the dev server,
 * the build and the manifest's scripts and types, and rewrites the commands the README and `AGENTS.md` carry. It reads
 * no engine file that the scaffold did not already read.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { formatWithBiome } from "./biome";

/** The Vite flavour's own dependencies: the latest majors, as caret ranges. */
const VITE_DEV_DEPENDENCIES: Record<string, string> = {
  vite: "^8.3.8",
  "@vitejs/plugin-react": "^6.3.0",
};

const VITE_CONFIG = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({ plugins: [react()] });
`;

/** The README's command block and the line the Vite flavour adds after it. */
const README_DEV_COMMENT = "# http://localhost:3000 (PORT=<n> for another)";
const README_DEV_COMMENT_VITE = "# the URL Vite prints, usually http://localhost:5173";
/** The runtime line: the Vite game typechecks with `tsc`, so it needs Node rather than Bun. */
const README_BUN_REQUIREMENT = "Needs Bun 1.4.3 or later (`bun check` typechecks).";
const README_NODE_REQUIREMENT = "Needs Node 20 or later (`npm run typecheck` typechecks).";
/** Said only when the game has the starter components, whose tokens script is the one thing that runs on Bun. */
const README_BUN_NOTE = "`npm run tokens` needs Bun installed: https://bun.sh";

/** The `AGENTS.md` dev line, and what it says under Vite: a reloading dev server on its own port. */
const AGENTS_DEV_LINE =
  "`bun run dev`: the game at http://localhost:3000. Hot reload is off: refresh after a change.";
const AGENTS_DEV_LINE_VITE =
  "`npm run dev`: the game on Vite's dev server (usually http://localhost:5173) with hot reload.";

/**
 * Converts the written game in `out` to the Vite flavour. `engine` is the watchpot package the game was written from;
 * `components` is whether the game has the starter components (and so a tokens script).
 */
export function toVite(out: string, engine: string, components: boolean) {
  rmSync(join(out, "dev.ts"));
  writeFileSync(join(out, "vite.config.ts"), VITE_CONFIG);
  convertManifest(out);
  convertTsconfig(out);
  convertReadme(out, components);
  convertAgents(out);
  formatWithBiome(out, engine, ["package.json", "tsconfig.json", "vite.config.ts"]);
}

/** The scripts: `dev`, `build`, `typecheck` become Vite's, and every `bun run` in a script becomes `npm run`. */
function convertManifest(out: string) {
  const file = join(out, "package.json");
  const manifest = JSON.parse(readFileSync(file, "utf8")) as {
    scripts: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  const overrides: Record<string, string> = {
    dev: "vite",
    build: "vite build",
    typecheck: "tsc --noEmit",
  };
  for (const name of Object.keys(overrides))
    if (!(name in manifest.scripts)) throw new Error(`create-watchpot: the game has no "${name}" script`);

  const scripts: Record<string, string> = {};
  for (const [name, command] of Object.entries(manifest.scripts)) {
    scripts[name] = overrides[name] ?? command.replaceAll("bun run ", "npm run ");
    if (name === "build") scripts.preview = "vite preview";
  }
  manifest.scripts = scripts;

  const deps = { ...manifest.devDependencies, ...VITE_DEV_DEPENDENCIES };
  manifest.devDependencies = Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * Vite's client types join Bun's (the tokens build in `design/`, when the starter components are in, still runs on Bun);
 * `dev.ts` goes, the config comes.
 */
function convertTsconfig(out: string) {
  const file = join(out, "tsconfig.json");
  const tsconfig = JSON.parse(readFileSync(file, "utf8")) as {
    compilerOptions: { types: string[] };
    include: string[];
  };
  tsconfig.compilerOptions.types = ["bun", "vite/client"];
  tsconfig.include = [...tsconfig.include.filter((entry) => entry !== "dev.ts"), "vite.config.ts"];
  writeFileSync(file, `${JSON.stringify(tsconfig, null, 2)}\n`);
}

/** The commands section runs through npm, and (with the starter components) says the tokens script still needs Bun. */
function convertReadme(out: string, components: boolean) {
  const file = join(out, "README.md");
  let text = readFileSync(file, "utf8");
  if (!text.includes(README_BUN_REQUIREMENT))
    throw new Error("create-watchpot: the README's Bun requirement has changed");
  text = text.replace(README_BUN_REQUIREMENT, README_NODE_REQUIREMENT);
  const start = text.indexOf("## Commands");
  const end = text.indexOf("\n## Where things are");
  if (start < 0 || end < 0) throw new Error("create-watchpot: the game's README has no commands section");
  let commands = text.slice(start, end);
  if (!commands.includes(README_DEV_COMMENT))
    throw new Error("create-watchpot: the README's dev line has changed");
  commands = commands
    .replace(README_DEV_COMMENT, README_DEV_COMMENT_VITE)
    .replace(/\bbun (install|run )/g, "npm $1");
  text = `${text.slice(0, start)}${commands}${components ? `\n${README_BUN_NOTE}\n` : ""}${text.slice(end)}`;
  writeFileSync(file, text);
}

/**
 * The agent docs' commands run through npm. `AGENTS.md` is only there when the skills were asked for, so a game without
 * them has nothing to rewrite.
 */
function convertAgents(out: string) {
  const file = join(out, "AGENTS.md");
  if (!existsSync(file)) return;
  const text = readFileSync(file, "utf8");
  if (!text.includes(AGENTS_DEV_LINE)) throw new Error("create-watchpot: the AGENTS.md dev line has changed");
  writeFileSync(
    file,
    text
      .replace(AGENTS_DEV_LINE, AGENTS_DEV_LINE_VITE)
      .replaceAll("`bun run verify`", "`npm run verify`")
      .replaceAll("`bun run gates`", "`npm run gates`"),
  );
}
