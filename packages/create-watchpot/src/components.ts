/**
 * The starter components: the one thing a bare game gets only when asked. It copies the template's UI registry
 * (`templates/game/src/ui/`, CSS modules, or `templates/tailwind/src/ui/` for a Tailwind game) into `src/ui/`, writes
 * the design tokens the registry reads (`design/tokens.json`, compiled to `src/tokens.css`), swaps the page for one
 * built on the components, and adds what they need to the manifest. Components of the template's own features (a
 * tree, an achievement wall, a backdrop on the shader canvas) are left out: a bare game has none of those.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildTokens } from "../../../src/kit/theme/build";
import { type Answers, gate, plan, tokens } from "../../../templates/game/.scaffold/generate";
import { formatWithBiome } from "./biome";

/** What the components import beyond the bare game's own: the counter's rolling digits, and the kit's barrel. */
const DEPENDENCIES: Record<string, string> = { "@number-flow/react": "0.6.2", "canvas-confetti": "1.9.4" };
const DEV_DEPENDENCIES: Record<string, string> = { "@types/canvas-confetti": "^1.9.0" };

/** Components a bare game leaves out whatever the flags: the backdrop draws on the shader canvas. */
const LEFT_OUT = new Set(["Backdrop"]);

const stemOf = (file: string) => file.replace(/(\.module)?\.(tsx|css)$/, "");

/** Copies the registry into `out/src/ui/`, keeping what no feature of the full template owns. */
function copyRegistry(source: string, ui: string) {
  mkdirSync(ui, { recursive: true });
  const nothing: ReadonlySet<string> = new Set();
  for (const file of readdirSync(source)) {
    if (file === "index.ts" || LEFT_OUT.has(stemOf(file))) continue;
    // A file whose first line is `// @feature <flag>` belongs to a feature the bare game has not got.
    const text = gate(readFileSync(join(source, file), "utf8"), nothing, file);
    if (text !== null) writeFileSync(join(ui, file), text);
  }
  // The barrel keeps the exports whose component is there, and no marker comments.
  const lines = gate(readFileSync(join(source, "index.ts"), "utf8"), nothing, "index.ts")?.split("\n") ?? [];
  const kept = lines.filter((line) => {
    const from = line.match(/from "\.\/(\w+)"/);
    return !from || existsSync(join(ui, `${from[1]}.tsx`));
  });
  writeFileSync(join(ui, "index.ts"), kept.join("\n"));
}

/** The registry's tokens: the template's default palette and system type, compiled to `src/tokens.css`. */
async function writeTokens(out: string, engine: string, name: string, answers: Record<string, unknown>) {
  const pl = plan({ ...answers, name } as unknown as Answers);
  const design = join(out, "design");
  mkdirSync(design, { recursive: true });
  const file = join(design, "tokens.json");
  writeFileSync(file, `${JSON.stringify(tokens(pl, []), null, 2)}\n`);
  copyFileSync(
    join(engine, "templates", "game", "design", "build-tokens.ts"),
    join(design, "build-tokens.ts"),
  );
  await buildTokens({ tokens: file, out: join(out, "src", "tokens.css") });
}

function editJson<T>(file: string, edit: (json: T) => void) {
  const json = JSON.parse(readFileSync(file, "utf8")) as T;
  edit(json);
  writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
}

const sorted = (r: Record<string, string>) =>
  Object.fromEntries(Object.entries(r).sort(([a], [b]) => a.localeCompare(b)));

/** Adds the starter components to the bare game in `out`. `answers` is any valid answers file (the fixture's). */
export async function addComponents(
  out: string,
  engine: string,
  opts: { tailwind: boolean; name: string; answers: Record<string, unknown> },
) {
  const registry = join(engine, "templates", opts.tailwind ? "tailwind" : "game", "src", "ui");
  copyRegistry(registry, join(out, "src", "ui"));
  await writeTokens(out, engine, opts.name, opts.answers);

  // The page on the components, and the two stylesheets it needs.
  copyFileSync(join(engine, "templates", "bare", "components", "App.tsx.tmpl"), join(out, "src", "App.tsx"));
  writeFileSync(
    join(out, "src", "main.tsx"),
    `import { mountGame } from "watchpot/react";
import { App } from "./App";
import { createGameStore } from "./game/store";
import "./tokens.css";
import "./ui/theme.css";

// The one store, built at the root; hydration from the save is synchronous.
mountGame(createGameStore(), <App />);
`,
  );
  const html = join(out, "index.html");
  writeFileSync(
    html,
    readFileSync(html, "utf8").replace('<html lang="en">', '<html lang="en" data-theme="game">'),
  );

  editJson<{
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  }>(join(out, "package.json"), (m) => {
    m.scripts = { ...m.scripts, tokens: "bun design/build-tokens.ts" };
    m.dependencies = sorted({ ...m.dependencies, ...DEPENDENCIES });
    m.devDependencies = sorted({ ...m.devDependencies, ...DEV_DEPENDENCIES });
  });
  editJson<{ include: string[] }>(join(out, "tsconfig.json"), (t) => {
    t.include = [...t.include, "design"];
  });
  editJson<{ files: { includes: string[] } }>(join(out, "biome.json"), (b) => {
    b.files.includes = [
      ...b.files.includes.filter((g) => !g.startsWith("!")),
      "design/**",
      "!src/tokens.css",
    ];
  });
  formatWithBiome(out, engine, [
    "src/main.tsx",
    "src/App.tsx",
    "package.json",
    "tsconfig.json",
    "biome.json",
  ]);
}
