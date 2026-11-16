// Public API report for watchpot: declarations of the twelve entries, normalised, in api/.
// `bun run api` writes it; `bun run api:check` regenerates to a temp folder and fails on any difference.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const PKG = ROOT;
const REPORT = process.env.WATCHPOT_API_DIR ?? join(ROOT, "api");
// Each entry's source under src/, as package.json exports it.
const ENTRIES = [
  "core/index.ts",
  "sim/index.ts",
  "test/index.ts",
  "react/index.ts",
  "devtools/index.ts",
  "kit/index.ts",
  "kit/theme/build.ts",
  "sound/index.ts",
  "sound/pack/index.ts",
  "three/index.ts",
  "ui/index.ts",
  "shader/index.ts",
];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

// Emit declarations for every entry into `out`, then normalise them in place.
async function generate(out: string): Promise<Map<string, string>> {
  const work = mkdtempSync(join(tmpdir(), "watchpot-api-"));
  try {
    const cfg = join(work, "tsconfig.json");
    writeFileSync(
      cfg,
      JSON.stringify({
        extends: join(ROOT, "tsconfig.json"),
        compilerOptions: {
          noEmit: false,
          declaration: true,
          emitDeclarationOnly: true,
          declarationMap: false,
          outDir: join(work, "out"),
          rootDir: join(PKG, "src"),
          allowImportingTsExtensions: true,
          types: ["bun"],
          typeRoots: [join(ROOT, "node_modules", "@types")],
        },
        include: [join(ROOT, "env.d.ts"), join(ROOT, "src", "css-vars.d.ts")],
        files: ENTRIES.map((e) => join(PKG, "src", e)),
      }),
    );
    const tsc = join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "tsc.exe" : "tsc");
    const p = Bun.spawn([tsc, "-p", cfg], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
    const [text] = await Promise.all([new Response(p.stdout).text(), p.exited]);
    const emitted = walk(join(work, "out")).filter((f) => f.endsWith(".d.ts"));
    if (emitted.length === 0) throw new Error(`api report: tsc emitted nothing\n${text}`);
    const files = new Map<string, string>();
    for (const f of emitted.sort()) {
      const name = relative(join(work, "out"), f).replaceAll("\\", "/");
      const body = readFileSync(f, "utf8")
        .replace(/\r\n/g, "\n")
        .replace(/^\/\/# sourceMappingURL=.*\n?/gm, "");
      files.set(name, body);
    }
    return files;
  } finally {
    rmSync(work, { recursive: true, force: true });
    void out;
  }
}

const current = (): Map<string, string> =>
  new Map(
    walk(REPORT)
      .map((f) => [relative(REPORT, f).replaceAll("\\", "/"), readFileSync(f, "utf8")] as const)
      .sort(([a], [b]) => a.localeCompare(b)),
  );

const mode = process.argv[2];
const fresh = await generate(REPORT);

if (mode === "check") {
  let old = new Map<string, string>();
  try {
    old = current();
  } catch {}
  const changed: string[] = [];
  for (const [name, body] of fresh) {
    if (!old.has(name)) changed.push(`added   ${name}`);
    else if (old.get(name) !== body) changed.push(`changed ${name}`);
  }
  for (const name of old.keys()) if (!fresh.has(name)) changed.push(`removed ${name}`);
  if (changed.length > 0) {
    console.error(
      `watchpot API report is out of date:\n  ${changed.join("\n  ")}\nReview the change, then run \`bun run api\` and commit api/.`,
    );
    process.exit(1);
  }
  console.log(`watchpot API report is current (${fresh.size} files)`);
} else {
  rmSync(REPORT, { recursive: true, force: true });
  for (const [name, body] of fresh) {
    const dest = join(REPORT, name);
    mkdirSync(join(dest, ".."), { recursive: true });
    writeFileSync(dest, body);
  }
  console.log(`wrote ${fresh.size} files to api/`);
}
