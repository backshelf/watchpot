// The `watchpot` command, in-process: `main` takes its output and its registry fetch, so no test reaches the network.
// Each test works in a temp game folder; the engine is this checkout, through `WATCHPOT_ENGINE_DIR`.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SKILL_DIRS } from "../../src/cli/engine";
import { main } from "../../src/cli/index";

const ROOT = join(import.meta.dir, "..", "..");
const ENGINE_VERSION = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string })
  .version;
const SKILL = "watchpot-init";
const engineSkill = join(ROOT, ".agents", "skills", SKILL);

const GOOD_TSCONFIG = `{
  // a game's tsconfig, with the comments and trailing commas tsconfig allows
  "compilerOptions": {
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
  },
}
`;

const offline = async () => {
  throw new Error("offline");
};
const registry = (version: string) => async () => new Response(JSON.stringify({ version }));

const made: string[] = [];

function game(tsconfig: string | null = GOOD_TSCONFIG): string {
  const dir = mkdtempSync(join(tmpdir(), "watchpot-cli-"));
  made.push(dir);
  if (tsconfig !== null) writeFileSync(join(dir, "tsconfig.json"), tsconfig);
  return dir;
}

async function run(argv: string[], cwd: string, fetch: (url: string) => Promise<Response> = offline) {
  const lines: string[] = [];
  const errors: string[] = [];
  const code = await main(argv, cwd, {
    out: (l) => lines.push(l),
    err: (l) => errors.push(l),
    fetch: (url) => fetch(url),
    env: { WATCHPOT_ENGINE_DIR: ROOT },
  });
  return { code, lines, errors, text: [...lines, ...errors].join("\n") };
}

const doctor = (cwd: string, fetch?: (url: string) => Promise<Response>) => run(["doctor"], cwd, fetch);

afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

describe("watchpot doctor", () => {
  test("a good game has no problems and exits 0", async () => {
    const r = await doctor(game(), registry(ENGINE_VERSION));
    expect(r.lines.filter((l) => l.startsWith("✗"))).toEqual([]);
    expect(r.code).toBe(0);
    expect(r.text).toContain(`watchpot ${ENGINE_VERSION}`);
  });

  test("moduleResolution other than bundler is a problem that names it", async () => {
    const r = await doctor(game(GOOD_TSCONFIG.replace('"bundler"', '"node"')));
    expect(r.code).toBe(1);
    const bad = r.lines.filter((l) => l.startsWith("✗"));
    expect(bad).toHaveLength(1);
    expect(bad[0]).toContain("compilerOptions.moduleResolution");
    expect(bad[0]).toContain('want "bundler"');
  });

  test("each wrong tsconfig field is its own problem; a missing one says so", async () => {
    const r = await doctor(game('{ "compilerOptions": { "jsx": "preserve", "strict": false } }'));
    const bad = r.lines.filter((l) => l.startsWith("✗"));
    expect(bad).toHaveLength(3);
    expect(bad.join("\n")).toContain('compilerOptions.jsx is "preserve", want "react-jsx"');
    expect(bad.join("\n")).toContain("compilerOptions.strict is false, want true");
    expect(bad.join("\n")).toContain("compilerOptions.moduleResolution is missing");
  });

  test("a missing tsconfig is a problem", async () => {
    const r = await doctor(game(null));
    expect(r.code).toBe(1);
    expect(r.text).toContain("✗ tsconfig.json is missing");
  });

  test("a newer published version is a warning, not a problem", async () => {
    const r = await doctor(game(), registry("99.0.0"));
    expect(r.code).toBe(0);
    expect(r.text).toContain("! watchpot 99.0.0 is out");
  });

  test("the registry failing, or a 404, is skipped silently", async () => {
    expect((await doctor(game(), offline)).text).not.toContain("is out");
    const missing = async () => new Response("nope", { status: 404 });
    const r = await doctor(game(), missing);
    expect(r.text).not.toContain("is out");
    expect(r.code).toBe(0);
  });

  test("no engine installed is a problem that says to run bun install", async () => {
    const dir = game();
    const lines: string[] = [];
    const code = await main(["doctor"], dir, {
      out: (l) => lines.push(l),
      fetch: offline,
      env: { WATCHPOT_ENGINE_DIR: join(dir, "nowhere") },
    });
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("run bun install");
  });

  test("tsconfig comments and trailing commas parse", async () => {
    const r = await doctor(game(GOOD_TSCONFIG));
    expect(r.text).toContain("✓ tsconfig.json: moduleResolution, jsx and strict are set");
  });
});

describe("watchpot skills", () => {
  test("add, then doctor finds no stale skill; an edit is a warning; update restores it byte for byte", async () => {
    const dir = game();
    const added = await run(["skills", "add"], dir);
    expect(added.code).toBe(0);
    expect(added.text).toContain(`added .agents/skills/${SKILL}`);

    const before = await doctor(dir, registry(ENGINE_VERSION));
    expect(before.text).not.toContain("older than the engine's");

    const installed = join(dir, ".agents", "skills", SKILL, "SKILL.md");
    writeFileSync(installed, `${readFileSync(installed, "utf8")}\nan edit\n`);
    const stale = await doctor(dir, registry(ENGINE_VERSION));
    expect(stale.code).toBe(0);
    expect(stale.text).toContain(
      `! .agents/skills/${SKILL} is older than the engine's: run \`watchpot skills update\``,
    );

    const updated = await run(["skills", "update"], dir);
    expect(updated.text).toContain(`updated .agents/skills/${SKILL}`);
    const files = ["SKILL.md", "references/build.md", "references/examples/invention.ts"];
    for (const f of files)
      expect(
        readFileSync(join(dir, ".agents", "skills", SKILL, f)).equals(readFileSync(join(engineSkill, f))),
      ).toBe(true);
    expect((await doctor(dir, registry(ENGINE_VERSION))).text).not.toContain("older than the engine's");
  });

  test("update drops a file the engine no longer ships", async () => {
    const dir = game();
    await run(["skills", "add"], dir);
    const extra = join(dir, ".agents", "skills", SKILL, "stale.md");
    writeFileSync(extra, "gone\n");
    await run(["skills", "update"], dir);
    expect(() => readFileSync(extra)).toThrow();
  });

  test("update with no skills installed says so and writes nothing", async () => {
    const dir = game();
    const r = await run(["skills", "update"], dir);
    expect(r.code).toBe(0);
    expect(r.text).toContain("no skills installed");
    for (const d of SKILL_DIRS) expect(() => readFileSync(join(dir, d, SKILL, "SKILL.md"))).toThrow();
  });

  test("add --to copies into each folder named, comma or repeated flag", async () => {
    const dir = game();
    const r = await run(["skills", "add", "--to", ".claude/skills,.cursor/skills"], dir);
    expect(r.code).toBe(0);
    for (const d of [".claude/skills", ".cursor/skills"])
      expect(readFileSync(join(dir, d, SKILL, "SKILL.md"), "utf8")).toBe(
        readFileSync(join(engineSkill, "SKILL.md"), "utf8"),
      );
    expect(() => readFileSync(join(dir, ".agents", "skills", SKILL, "SKILL.md"))).toThrow();
  });

  test("skills with no subcommand or an unknown option is a usage error", async () => {
    const dir = game();
    expect((await run(["skills"], dir)).code).toBe(1);
    expect((await run(["skills", "add", "--bogus"], dir)).text).toContain('unknown option "--bogus"');
  });
});

describe("the command's help and dispatch", () => {
  test("help and no command print both commands and exit 0", async () => {
    for (const argv of [[], ["help"]]) {
      const r = await run(argv, game());
      expect(r.code).toBe(0);
      expect(r.text).toContain("watchpot doctor");
      expect(r.text).toContain("watchpot skills add|update");
    }
  });

  test("an unknown command prints usage on stderr and exits 1", async () => {
    const r = await run(["frobnicate"], game());
    expect(r.code).toBe(1);
    expect(r.errors[0]).toContain('unknown command "frobnicate"');
    expect(r.text).toContain("watchpot doctor");
  });
});

describe("bin/watchpot.mjs", () => {
  test("runs under Bun with no build: help exits 0 and prints both commands", () => {
    const p = Bun.spawnSync(["bun", "bin/watchpot.mjs", "help"], {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = p.stdout.toString();
    expect(p.exitCode).toBe(0);
    expect(out).toContain("watchpot doctor");
    expect(out).toContain("watchpot skills add|update");
  });
});
