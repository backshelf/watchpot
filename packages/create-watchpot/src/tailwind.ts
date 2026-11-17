/**
 * The Tailwind flavour: turns the game that `generate()` wrote (and `toVite()` converted, for the Vite flavour) into one
 * whose UI registry (`src/ui/`) is Tailwind utilities over the `--ui-*` tokens, not CSS modules. The copies are the
 * engine's `templates/tailwind/src/ui/`. The screens outside `src/ui/` keep their CSS modules: Tailwind v4 and CSS
 * modules share a page.
 */
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { formatWithBiome } from "./biome";

/** The Tailwind packages, as caret ranges: the latest v4 at the time of writing. */
const TAILWIND_DEPENDENCIES: Record<string, string> = { tailwindcss: "^4.3.5" };
const VITE_DEPENDENCIES: Record<string, string> = { "@tailwindcss/vite": "^4.3.5" };
const BUN_DEPENDENCIES: Record<string, string> = { "bun-plugin-tailwind": "^0.1.2" };

/** The Bun game's build: `Bun.build` with the Tailwind plugin, which has no CLI of its own. */
const BUILD_TS = `// The production build: index.html and everything it imports, with Tailwind's CSS, into dist/ (\`bun run build\`).
import tailwind from "bun-plugin-tailwind";

const built = await Bun.build({
  entrypoints: ["./index.html"],
  outdir: "dist",
  minify: true,
  sourcemap: "linked",
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  plugins: [tailwind],
});
if (!built.success) {
  for (const log of built.logs) console.error(log);
  process.exit(1);
}
`;

/** The dev server (\`bun dev.ts\`) serves the HTML through \`Bun.serve\`, so this plugin builds its CSS there too. */
const BUNFIG = `[serve.static]
plugins = ["bun-plugin-tailwind"]
`;

/** Writes the Tailwind flavour into the game in `out`. `flavour` is the template the game was written as. */
export function toTailwind(out: string, engine: string, flavour: "bun" | "vite") {
  const source = join(engine, "templates", "tailwind", "src", "ui");
  const ui = join(out, "src", "ui");
  const changed: string[] = [];

  // Each component the scaffold kept is replaced by its Tailwind copy; the CSS modules go with them.
  for (const file of readdirSync(ui)) {
    if (!file.endsWith(".tsx")) continue;
    const from = join(source, file);
    if (!existsSync(from))
      throw new Error(`create-watchpot: the engine has no Tailwind copy of src/ui/${file}`);
    copyFileSync(from, join(ui, file));
    changed.push(join("src", "ui", file));
  }
  for (const file of readdirSync(ui)) if (file.endsWith(".module.css")) rmSync(join(ui, file));
  for (const file of ["theme.css", "pageRoot.ts", "README.md"]) {
    copyFileSync(join(source, file), join(ui, file));
    changed.push(join("src", "ui", file));
  }
  writeIndex(source, ui);
  changed.push(join("src", "ui", "index.ts"));
  describeReadme(out);
  allowTailwindDirectives(out);
  changed.push("biome.json");

  writeManifest(out, flavour);
  if (flavour === "vite") {
    addVitePlugin(out);
    changed.push("vite.config.ts");
  } else {
    writeFileSync(join(out, "build.ts"), BUILD_TS);
    writeFileSync(join(out, "bunfig.toml"), BUNFIG);
    addToTsconfig(out, "build.ts");
    changed.push("build.ts", "tsconfig.json");
  }
  // Biome formats what it changed, as the scaffold's own pass does: the copies, the theme, the README, the manifests.
  formatWithBiome(out, engine, [...changed, "package.json"]);
}

/**
 * The engine's `index.ts` with its gates resolved against the components the game kept: a line that exports a
 * component the game dropped goes, and the marker comments go with the gates.
 */
function writeIndex(source: string, ui: string) {
  const lines = readFileSync(join(source, "index.ts"), "utf8").split("\n");
  const kept = lines.filter((line) => {
    if (/^\s*\/\/ @(if|end)\b/.test(line)) return false;
    const from = line.match(/from "\.\/(\w+)"/);
    return !from || existsSync(join(ui, `${from[1]}.tsx`));
  });
  writeFileSync(join(ui, "index.ts"), kept.join("\n"));
}

/** Biome reads Tailwind's at-rules (`@import "tailwindcss"`, `@theme`) only when its CSS parser is told to. */
function allowTailwindDirectives(out: string) {
  const file = join(out, "biome.json");
  const config = JSON.parse(readFileSync(file, "utf8")) as { css?: { parser?: Record<string, unknown> } };
  config.css = { ...config.css, parser: { ...config.css?.parser, tailwindDirectives: true } };
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
}

/** The game's README says its components are CSS-module styled; under Tailwind that one line is wrong, so it is said right. */
function describeReadme(out: string) {
  const file = join(out, "README.md");
  const text = readFileSync(file, "utf8");
  const said = "each with its CSS module";
  if (!text.includes(said))
    throw new Error("create-watchpot: the game's README does not describe its CSS modules");
  writeFileSync(file, text.replace(said, "each styled with Tailwind utilities"));
}

/** The game's dependencies: Tailwind, the plugin of its flavour, and the Bun game's build script. */
function writeManifest(out: string, flavour: "bun" | "vite") {
  const file = join(out, "package.json");
  const manifest = JSON.parse(readFileSync(file, "utf8")) as {
    scripts: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  const extra = flavour === "vite" ? VITE_DEPENDENCIES : BUN_DEPENDENCIES;
  const deps = { ...manifest.devDependencies, ...TAILWIND_DEPENDENCIES, ...extra };
  manifest.devDependencies = Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)));
  if (flavour === "bun") {
    if (!("build" in manifest.scripts)) throw new Error('create-watchpot: the game has no "build" script');
    manifest.scripts.build = "bun build.ts";
  }
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

/** The Vite config's one plugin list gets Tailwind's Vite plugin after React's. */
function addVitePlugin(out: string) {
  const file = join(out, "vite.config.ts");
  const react = 'import react from "@vitejs/plugin-react";\n';
  const plugins = "plugins: [react()]";
  const text = readFileSync(file, "utf8");
  if (!text.includes(react) || !text.includes(plugins))
    throw new Error("create-watchpot: the Vite config has changed; cannot add Tailwind to it");
  writeFileSync(
    file,
    text
      .replace(react, `${react}import tailwindcss from "@tailwindcss/vite";\n`)
      .replace(plugins, "plugins: [react(), tailwindcss()]"),
  );
}

/** Adds one file to the game's `tsconfig.json` `include`, so it is type-checked. */
function addToTsconfig(out: string, entry: string) {
  const file = join(out, "tsconfig.json");
  const tsconfig = JSON.parse(readFileSync(file, "utf8")) as { include: string[] };
  if (!tsconfig.include.includes(entry)) tsconfig.include.push(entry);
  writeFileSync(file, `${JSON.stringify(tsconfig, null, 2)}\n`);
}
