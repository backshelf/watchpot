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
  expect(existsSync(join(game, "src", "ui", "Button.module.css"))).toBe(false);
  expect(readFileSync(join(game, "src", "ui", "Button.tsx"), "utf8")).not.toContain("module.css");

  // The game has no node_modules of its own: Bun, Tailwind and watchpot resolve from the package's, up the tree.
  const built = await run([process.execPath, "build.ts"], game);
  expect(built.code, built.output).toBe(0);
  expect(existsSync(join(game, "dist", "index.html")), built.output).toBe(true);
  expect(builtCss(join(game, "dist"))).toContain(".bg-ui-surface");
}, 180_000);

test("create-watchpot --vite --tailwind writes a Vite game whose registry is Tailwind and whose build runs", async () => {
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

  const vite = join(PACKAGE, "node_modules", "vite", "bin", "vite.js");
  const built = await run(["node", vite, "build"], game);
  expect(built.code, built.output).toBe(0);
  expect(existsSync(join(game, "dist", "index.html")), built.output).toBe(true);
  expect(builtCss(join(game, "dist"))).toContain(".bg-ui-surface");
}, 180_000);
