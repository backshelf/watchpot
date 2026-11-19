/**
 * The Tailwind flavour: wires Tailwind v4 into the game that was written (and converted, for the Vite flavour): its
 * packages, the plugin of the flavour (Vite's, or Bun's with a `build.ts` and a `bunfig.toml`), and Biome's reading of
 * Tailwind's at-rules. It adds no component. A game that asked for the starter components gets Tailwind's copies of
 * them from `./components` (their `theme.css` is what imports Tailwind); a game that did not gets one stylesheet,
 * `src/index.css`, that imports it and nothing more.
 */
import { readFileSync, writeFileSync } from "node:fs";
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

/**
 * Writes the Tailwind flavour into the game in `out`. `flavour` is the template the game was written as;
 * `components` is whether the starter components (whose `theme.css` imports Tailwind) are in the game.
 */
export function toTailwind(out: string, engine: string, flavour: "bun" | "vite", components: boolean) {
  const changed: string[] = ["biome.json"];
  allowTailwindDirectives(out);
  if (!components) {
    writeFileSync(join(out, "src", "index.css"), '@import "tailwindcss";\n');
    importStylesheet(out);
    changed.push("src/main.tsx");
  }

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
  // Biome formats what it changed, as the scaffold's own pass does: the manifests, the config and the entry.
  formatWithBiome(out, engine, [...changed, "package.json"]);
}

/** The page's entry imports the stylesheet, after the store's import. */
function importStylesheet(out: string) {
  const file = join(out, "src", "main.tsx");
  const line = 'import { createGameStore } from "./game/store";\n';
  const text = readFileSync(file, "utf8");
  if (!text.includes(line))
    throw new Error("create-watchpot: src/main.tsx has changed; cannot add Tailwind to it");
  writeFileSync(file, text.replace(line, `${line}import "./index.css";\n`));
}

/** Biome reads Tailwind's at-rules (`@import "tailwindcss"`, `@theme`) only when its CSS parser is told to. */
function allowTailwindDirectives(out: string) {
  const file = join(out, "biome.json");
  const config = JSON.parse(readFileSync(file, "utf8")) as { css?: { parser?: Record<string, unknown> } };
  config.css = { ...config.css, parser: { ...config.css?.parser, tailwindDirectives: true } };
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
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
