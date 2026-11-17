/**
 * The Vite flavour: turns the Bun game that `generate()` just wrote into a game that runs on Node. The game's own files
 * (`src/`, `sim/`, `design/`, `index.html`) are untouched; this swaps the dev server, the build and the manifest's
 * scripts and types, and reads no engine file that the scaffold did not already read.
 */
import { readFileSync, rmSync, writeFileSync } from "node:fs";
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
const README_DEV_COMMENT = "# http://localhost:3000 (PORT=<n> for another); #dev opens the dev panel";
const README_DEV_COMMENT_VITE =
  "# the URL Vite prints, usually http://localhost:5173; #dev opens the dev panel";
const README_BUN_NOTE =
  "The pacing sim (`npm run sim`) and `npm run tokens` need Bun installed: https://bun.sh";

/** Converts the written game in `out` to the Vite flavour. `engine` is the watchpot package the game was written from. */
export function toVite(out: string, engine: string) {
  rmSync(join(out, "dev.ts"));
  writeFileSync(join(out, "vite.config.ts"), VITE_CONFIG);
  convertManifest(out);
  convertTsconfig(out);
  convertReadme(out);
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

/** Vite's client types join Bun's (the `sim/` and `design/` files still run on Bun); `dev.ts` goes, the config comes. */
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

/** The commands section runs through npm, and says that the sim and the tokens still need Bun. */
function convertReadme(out: string) {
  const file = join(out, "README.md");
  let text = readFileSync(file, "utf8");
  const start = text.indexOf("## Commands");
  const end = text.indexOf("\n## Where things are");
  if (start < 0 || end < 0) throw new Error("create-watchpot: the game's README has no commands section");
  let commands = text.slice(start, end);
  if (!commands.includes(README_DEV_COMMENT))
    throw new Error("create-watchpot: the README's dev line has changed");
  commands = commands
    .replace(README_DEV_COMMENT, README_DEV_COMMENT_VITE)
    .replace(/\bbun (install|run )/g, "npm $1");
  text = `${text.slice(0, start)}${commands}\n${README_BUN_NOTE}\n${text.slice(end)}`;
  writeFileSync(file, text);
}
