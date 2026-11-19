// `create-watchpot` (`bun create watchpot`): the package is built, then its bundle runs under plain node in a temp
// folder, pointed at this checkout as the engine, and the game it writes is checked. `--no-install`: no network.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const PACKAGE = join(ROOT, "packages", "create-watchpot");
const BUNDLE = join(PACKAGE, "dist", "index.js");
const VERSION = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string }).version;
const dirs: string[] = [];
/** Where the Vite test writes its game: inside the package, so the repo's node_modules (Vite, React, watchpot) resolve. */
const TEST_OUT = join(PACKAGE, ".test-out");

async function run(cmd: string[], cwd: string, env: Record<string, string> = {}) {
  const p = Bun.spawn(cmd, { cwd, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  return { code, output: `${stdout}${stderr}` };
}

beforeAll(async () => {
  const built = await run([process.execPath, "run", "build"], PACKAGE);
  expect(built.code, built.output).toBe(0);
});

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  rmSync(TEST_OUT, { recursive: true, force: true });
});

const scratch = () => {
  const dir = mkdtempSync(join(tmpdir(), "create-watchpot-"));
  dirs.push(dir);
  return dir;
};

test("create-watchpot writes a game with a 3D stage and agent skills", async () => {
  if (!Bun.which("node")) {
    console.warn("create-watchpot: node is not on PATH; skipped the plain-Node scaffold check");
    return;
  }
  const dir = scratch();
  const ran = await run(
    [
      "node",
      BUNDLE,
      "--name",
      "Tap Jar",
      "--three",
      "--skills=.claude/skills,.agents/skills",
      "--no-install",
      "--yes",
    ],
    dir,
    { WATCHPOT_ENGINE_DIR: ROOT },
  );
  expect(ran.code, ran.output).toBe(0);

  const game = join(dir, "tap-jar");
  const manifest = JSON.parse(readFileSync(join(game, "package.json"), "utf8")) as {
    name: string;
    dependencies: Record<string, string>;
  };
  expect(manifest.name).toBe("tap-jar");
  expect(manifest.dependencies.three).toBeDefined();
  expect(manifest.dependencies["@react-three/fiber"]).toBeDefined();
  expect(manifest.dependencies.watchpot).toBe(`^${VERSION}`);
  for (const rel of [
    "AGENTS.md",
    join(".claude", "skills", "watchpot-init", "SKILL.md"),
    join(".agents", "skills", "watchpot-init", "SKILL.md"),
  ]) {
    expect(existsSync(join(game, rel)), rel).toBe(true);
  }
}, 120_000);

test("create-watchpot with no skills and no 3D stage writes neither", async () => {
  if (!Bun.which("node")) return;
  const dir = scratch();
  const ran = await run(["node", BUNDLE, "--no-install", "--yes"], dir, { WATCHPOT_ENGINE_DIR: ROOT });
  expect(ran.code, ran.output).toBe(0);

  const game = join(dir, "my-idle-game");
  const manifest = JSON.parse(readFileSync(join(game, "package.json"), "utf8")) as {
    dependencies: Record<string, string>;
  };
  expect(manifest.dependencies.three).toBeUndefined();
  expect(existsSync(join(game, "AGENTS.md"))).toBe(false);
  expect(existsSync(join(game, ".claude"))).toBe(false);
  expect(existsSync(join(game, ".agents"))).toBe(false);
}, 120_000);

/** Every file of a written game, by relative path (no `node_modules`). */
const filesOf = (dir: string) =>
  readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => !f.includes("node_modules"))
    .map((f) => f.replaceAll("\\", "/"));

test("create-watchpot writes a bare game: one button and one number, no mechanic, no look, no component", async () => {
  if (!Bun.which("node")) return;
  mkdirSync(TEST_OUT, { recursive: true });
  const dir = mkdtempSync(join(TEST_OUT, "bare-"));
  dirs.push(dir);
  const ran = await run(["node", BUNDLE, "--no-install", "--yes"], dir, { WATCHPOT_ENGINE_DIR: ROOT });
  expect(ran.code, ran.output).toBe(0);

  const game = join(dir, "my-idle-game");
  const files = filesOf(game);
  // Nothing of the template's systems, screens, registry, tokens or sim.
  for (const gone of ["src/ui", "src/app", "src/screens", "src/content", "src/shaders", "design", "sim"])
    expect(
      files.filter((f) => f === gone || f.startsWith(`${gone}/`)),
      gone,
    ).toEqual([]);
  expect(files).not.toContain("src/tokens.css");
  expect(files.filter((f) => f.endsWith(".css"))).toEqual([]);
  expect(files).toContain("src/App.tsx");
  const src = files
    .filter((f) => f.startsWith("src/") && /\.tsx?$/.test(f))
    .map((f) => readFileSync(join(game, f), "utf8"))
    .join("\n");
  for (const mechanic of ["defineClicker", "crit", "combo", "defineGenerators", "defineUpgradeTree", "sound"])
    expect(src, mechanic).not.toContain(mechanic);
  // The name reaches the page, the save and the README; the placeholders are all filled.
  expect(readFileSync(join(game, "src", "game", "words.ts"), "utf8")).toContain('NAME = "My Idle Game"');
  expect(readFileSync(join(game, "src", "game", "words.ts"), "utf8")).toContain('SLUG = "my-idle-game"');
  expect(readFileSync(join(game, "index.html"), "utf8")).toContain("<title>My Idle Game</title>");
  for (const file of ["README.md", "index.html", "package.json", "biome.json"])
    expect(readFileSync(join(game, file), "utf8"), file).not.toContain("{{");
  const manifest = JSON.parse(readFileSync(join(game, "package.json"), "utf8")) as {
    dependencies: Record<string, string>;
  };
  expect(Object.keys(manifest.dependencies).sort()).toEqual([
    "break_eternity.js",
    "immer",
    "react",
    "react-dom",
    "watchpot",
    "zustand",
  ]);

  // It type-checks and builds as it stands (its imports resolve from the checkout, up the tree).
  const typed = await run([process.execPath, "check"], game);
  expect(typed.code, typed.output).toBe(0);
  const built = await run([process.execPath, "build", "./index.html", "--outdir", "dist"], game);
  expect(built.code, built.output).toBe(0);
  expect(existsSync(join(game, "dist", "index.html"))).toBe(true);
}, 180_000);

test("create-watchpot --vite writes a game that Vite builds", async () => {
  if (!Bun.which("node")) return;
  mkdirSync(TEST_OUT, { recursive: true });
  const dir = mkdtempSync(join(TEST_OUT, "vite-"));
  dirs.push(dir);
  const ran = await run(["node", BUNDLE, "--name", "Vite Jar", "--vite", "--yes", "--no-install"], dir, {
    WATCHPOT_ENGINE_DIR: ROOT,
  });
  expect(ran.code, ran.output).toBe(0);

  const game = join(dir, "vite-jar");
  expect(existsSync(join(game, "dev.ts"))).toBe(false);
  expect(existsSync(join(game, "vite.config.ts"))).toBe(true);
  const manifest = JSON.parse(readFileSync(join(game, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  expect(manifest.scripts.dev).toBe("vite");
  expect(manifest.scripts.build).toBe("vite build");
  expect(manifest.devDependencies.vite).toBeDefined();
  expect(manifest.devDependencies["@vitejs/plugin-react"]).toBeDefined();

  // The game has no node_modules of its own: Vite, React and watchpot resolve from the package's, up the tree.
  const vite = join(PACKAGE, "node_modules", "vite", "bin", "vite.js");
  const built = await run(["node", vite, "build"], game);
  expect(built.code, built.output).toBe(0);
  expect(existsSync(join(game, "dist", "index.html")), built.output).toBe(true);
}, 180_000);

/** The CSS a build wrote into `dist/` (Vite puts it under `assets/`), all of it, as one string. */
const builtCss = (dist: string) =>
  readdirSync(dist, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(".css"))
    .map((f) => readFileSync(join(dist, f), "utf8"))
    .join("\n");

test("create-watchpot --tailwind writes a Bun game whose registry is Tailwind and whose build runs", async () => {
  if (!Bun.which("node")) return;
  mkdirSync(TEST_OUT, { recursive: true });
  const dir = mkdtempSync(join(TEST_OUT, "tailwind-"));
  dirs.push(dir);
  const ran = await run(
    ["node", BUNDLE, "--name", "Tailwind Jar", "--tailwind", "--yes", "--no-install"],
    dir,
    {
      WATCHPOT_ENGINE_DIR: ROOT,
    },
  );
  expect(ran.code, ran.output).toBe(0);

  const game = join(dir, "tailwind-jar");
  const manifest = JSON.parse(readFileSync(join(game, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  expect(manifest.scripts.build).toBe("bun build.ts");
  expect(manifest.devDependencies.tailwindcss).toBeDefined();
  expect(manifest.devDependencies["bun-plugin-tailwind"]).toBeDefined();
  expect(manifest.devDependencies["@tailwindcss/vite"]).toBeUndefined();
  expect(readFileSync(join(game, "bunfig.toml"), "utf8")).toContain('plugins = ["bun-plugin-tailwind"]');
  // Tailwind alone: one stylesheet that imports it, and no component.
  expect(existsSync(join(game, "src", "ui"))).toBe(false);
  expect(readFileSync(join(game, "src", "index.css"), "utf8")).toContain('@import "tailwindcss"');
  expect(readFileSync(join(game, "src", "main.tsx"), "utf8")).toContain('import "./index.css"');

  // The game has no node_modules of its own: Bun, Tailwind and watchpot resolve from the package's, up the tree.
  const built = await run([process.execPath, "build.ts"], game);
  expect(built.code, built.output).toBe(0);
  expect(existsSync(join(game, "dist", "index.html")), built.output).toBe(true);
  expect(builtCss(join(game, "dist"))).toMatch(/box-sizing:\s*border-box/);
}, 180_000);

test("create-watchpot --vite --tailwind writes a Vite game that Tailwind styles and whose build runs", async () => {
  if (!Bun.which("node")) return;
  mkdirSync(TEST_OUT, { recursive: true });
  const dir = mkdtempSync(join(TEST_OUT, "vite-tailwind-"));
  dirs.push(dir);
  const ran = await run(
    ["node", BUNDLE, "--name", "Vite Tailwind", "--vite", "--tailwind", "--yes", "--no-install"],
    dir,
    {
      WATCHPOT_ENGINE_DIR: ROOT,
    },
  );
  expect(ran.code, ran.output).toBe(0);

  const game = join(dir, "vite-tailwind");
  const manifest = JSON.parse(readFileSync(join(game, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  expect(manifest.scripts.build).toBe("vite build");
  expect(manifest.devDependencies["@tailwindcss/vite"]).toBeDefined();
  expect(manifest.devDependencies["bun-plugin-tailwind"]).toBeUndefined();
  expect(readFileSync(join(game, "vite.config.ts"), "utf8")).toContain("plugins: [react(), tailwindcss()]");
  expect(existsSync(join(game, "bunfig.toml"))).toBe(false);
  expect(existsSync(join(game, "src", "ui"))).toBe(false);

  const vite = join(PACKAGE, "node_modules", "vite", "bin", "vite.js");
  const built = await run(["node", vite, "build"], game);
  expect(built.code, built.output).toBe(0);
  expect(existsSync(join(game, "dist", "index.html")), built.output).toBe(true);
  expect(builtCss(join(game, "dist"))).toMatch(/box-sizing:\s*border-box/);
}, 180_000);

/** Writes a game with the starter components into `TEST_OUT` and returns its folder. */
async function componentsGame(prefix: string, name: string, flags: string[]) {
  mkdirSync(TEST_OUT, { recursive: true });
  const dir = mkdtempSync(join(TEST_OUT, `${prefix}-`));
  dirs.push(dir);
  const ran = await run(
    ["node", BUNDLE, "--name", name, "--components", ...flags, "--yes", "--no-install"],
    dir,
    {
      WATCHPOT_ENGINE_DIR: ROOT,
    },
  );
  expect(ran.code, ran.output).toBe(0);
  return join(dir, name.toLowerCase().replaceAll(" ", "-"));
}

test("create-watchpot --components writes the registry on CSS modules, with its tokens, and the game builds", async () => {
  if (!Bun.which("node")) return;
  const game = await componentsGame("components", "Parts Jar", []);
  const files = filesOf(game);
  expect(files).toContain("src/ui/Button.tsx");
  expect(files).toContain("src/ui/Button.module.css");
  expect(files).toContain("src/ui/theme.css");
  expect(files).toContain("design/tokens.json");
  expect(files).toContain("src/tokens.css");
  // Only what a bare game can use: nothing of the template's own features, nor the shader backdrop.
  for (const left of ["Backdrop", "Tree", "AchievementWall", "Arrival", "BuffChip", "RarityChip"])
    expect(
      files.filter((f) => f.startsWith(`src/ui/${left}.`)),
      left,
    ).toEqual([]);
  const index = readFileSync(join(game, "src", "ui", "index.ts"), "utf8");
  expect(index).not.toContain("@if");
  expect(index).not.toContain("Backdrop");
  expect(index).toContain('from "./Button"');
  expect(readFileSync(join(game, "index.html"), "utf8")).toContain('data-theme="game"');
  expect(readFileSync(join(game, "src", "App.tsx"), "utf8")).toContain('from "./ui/Button"');
  const manifest = JSON.parse(readFileSync(join(game, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
  };
  expect(manifest.scripts.tokens).toBe("bun design/build-tokens.ts");
  expect(manifest.dependencies["@number-flow/react"]).toBeDefined();

  // It type-checks (Biome's own organised imports aside) and builds.
  const typed = await run([process.execPath, "check"], game);
  expect(typed.code, typed.output).toBe(0);
  const built = await run([process.execPath, "build", "./index.html", "--outdir", "dist"], game);
  expect(built.code, built.output).toBe(0);
  expect(builtCss(join(game, "dist"))).toContain("--ui-accent");
}, 180_000);

test("create-watchpot --tailwind --components writes the registry in Tailwind, and the game builds", async () => {
  if (!Bun.which("node")) return;
  const game = await componentsGame("components-tailwind", "Parts Utility", ["--tailwind"]);
  const files = filesOf(game);
  expect(files).toContain("src/ui/Button.tsx");
  expect(files.filter((f) => f.endsWith(".module.css"))).toEqual([]);
  expect(files).not.toContain("src/index.css");
  expect(readFileSync(join(game, "src", "ui", "Button.tsx"), "utf8")).not.toContain("module.css");
  expect(readFileSync(join(game, "src", "ui", "theme.css"), "utf8")).toContain('@import "tailwindcss"');

  const typed = await run([process.execPath, "check"], game);
  expect(typed.code, typed.output).toBe(0);
  const built = await run([process.execPath, "build.ts"], game);
  expect(built.code, built.output).toBe(0);
  expect(builtCss(join(game, "dist"))).toContain(".bg-ui-surface");
}, 180_000);

test("create-watchpot --vite --tailwind --components writes the registry in Tailwind, and Vite builds it", async () => {
  if (!Bun.which("node")) return;
  const game = await componentsGame("components-vite-tailwind", "Parts Vite", ["--vite", "--tailwind"]);
  expect(existsSync(join(game, "src", "ui", "Button.tsx"))).toBe(true);
  expect(readFileSync(join(game, "README.md"), "utf8")).toContain("`npm run tokens` needs Bun");

  const vite = join(PACKAGE, "node_modules", "vite", "bin", "vite.js");
  const built = await run(["node", vite, "build"], game);
  expect(built.code, built.output).toBe(0);
  expect(builtCss(join(game, "dist"))).toContain(".bg-ui-surface");
}, 180_000);

test("create-watchpot --vite --components --skills writes CSS modules and Vite's commands into the docs", async () => {
  if (!Bun.which("node")) return;
  const game = await componentsGame("components-vite-skills", "Parts Node", [
    "--vite",
    "--skills=.claude/skills",
  ]);

  // The registry is the CSS-module copy (Tailwind is off), and the skills wrote the agent docs.
  expect(filesOf(game)).toContain("src/ui/Button.tsx");
  expect(filesOf(game)).toContain("src/ui/Button.module.css");
  expect(existsSync(join(game, ".claude", "skills", "watchpot-init", "SKILL.md"))).toBe(true);

  // `AGENTS.md` says the commands of a Vite game: npm, a reloading dev server, and no Bun dev port.
  const agents = readFileSync(join(game, "AGENTS.md"), "utf8");
  expect(agents).toContain("`npm run dev`");
  expect(agents).toContain("`npm run verify`");
  expect(agents).not.toContain("localhost:3000");
  expect(agents).not.toContain("Hot reload is off");

  // The README's runtime line is the Node one, and its tokens script is still the one command that needs Bun.
  const readme = readFileSync(join(game, "README.md"), "utf8");
  expect(readme).toContain("npm run typecheck");
  expect(readme).toContain("npm run tokens");
  expect(readme).not.toContain("bun check");

  const vite = join(PACKAGE, "node_modules", "vite", "bin", "vite.js");
  const built = await run(["node", vite, "build"], game);
  expect(built.code, built.output).toBe(0);
  expect(existsSync(join(game, "dist", "index.html")), built.output).toBe(true);
  expect(builtCss(join(game, "dist"))).toContain("--ui-accent");
}, 180_000);

test("create-watchpot rejects a value on a boolean flag: --vite=false is a usage error", async () => {
  if (!Bun.which("node")) return;
  const dir = scratch();
  const ran = await run(["node", BUNDLE, "--vite=false", "--no-install", "--yes"], dir, {
    WATCHPOT_ENGINE_DIR: ROOT,
  });
  expect(ran.code, ran.output).toBe(2);
  expect(ran.output).toContain("--vite takes no value");
  // Nothing is written: the flags are read before the game is.
  expect(readdirSync(dir)).toEqual([]);
}, 120_000);
