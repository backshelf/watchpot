#!/usr/bin/env node
// The `watchpot` command (`bunx watchpot <cmd>`, `npx watchpot <cmd>`). Under Bun the source runs with no build, so a
// stale `dist/` in the repository never shadows it; Node runs the compiled command in `dist/cli`. Plain JS so Node
// can start it before anything is compiled.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// `sim` is Bun-only (the desk imports the game's TypeScript), but `bunx` honours the node shebang above, so
// `bunx watchpot sim` lands here under Node. Hand the command to Bun when it is on the PATH; without it, `main` says
// that Bun is needed.
if (process.versions.bun === undefined && process.argv[2] === "sim") {
  const bun = spawnSync("bun", [fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: "inherit" });
  if (!bun.error) process.exit(bun.status ?? 1);
}
const built = join(root, "dist", "cli", "index.js");
const source = join(root, "src", "cli", "index.ts");

let entry;
if (process.versions.bun !== undefined && existsSync(source)) entry = source;
else if (existsSync(built)) entry = built;
else {
  console.error("watchpot: run `bun run build` in the engine first");
  process.exit(1);
}

const { main } = await import(pathToFileURL(entry).href);
process.exitCode = await main(process.argv.slice(2), process.cwd());
