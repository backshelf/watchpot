// The game scaffold runs on Node as well as Bun (so `npm create watchpot` can run it): `new.ts` is bundled for Node
// beside `generate.ts` (so the template path still resolves), run with plain `node` on the smallest fixture, and the
// game it writes is checked. `--no-install`: no network, no package manager.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const SCAFFOLD = join(ROOT, "templates", "game", ".scaffold");
const BUNDLE = join(SCAFFOLD, ".node-check.mjs");
const FIXTURE = join(SCAFFOLD, "fixtures", "smallest-clicker.json");
let out = "";

async function run(cmd: string[], cwd: string) {
  const p = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  return { code, output: `${stdout}${stderr}` };
}

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), "watchpot-node-"));
});

afterAll(() => {
  rmSync(BUNDLE, { force: true });
  if (out) rmSync(out, { recursive: true, force: true });
});

test("new.ts bundles for Node and runs under plain node, writing a game", async () => {
  if (!Bun.which("node")) {
    console.warn("scaffold-node: node is not on PATH; skipped the plain-Node scaffold check");
    return;
  }
  const built = await run(
    ["bun", "build", join(SCAFFOLD, "new.ts"), "--target=node", "--outfile", BUNDLE],
    ROOT,
  );
  expect(built.code, built.output).toBe(0);

  const game = join(out, "game");
  const ran = await run(["node", BUNDLE, FIXTURE, game, "--no-install"], ROOT);
  expect(ran.code, ran.output).toBe(0);
  for (const rel of ["package.json", "src/tokens.css", "src/game/game.ts"]) {
    expect(existsSync(join(game, rel)), rel).toBe(true);
  }
}, 120_000);
