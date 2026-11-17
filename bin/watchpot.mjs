#!/usr/bin/env node
// The `watchpot` command (`bunx watchpot <cmd>`, `npx watchpot <cmd>`). Under Bun the source runs with no build, so a
// stale `dist/` in the repository never shadows it; Node runs the compiled command in `dist/cli`. Plain JS so Node
// can start it before anything is compiled.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
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
