/**
 * Formats the files a flavour changed with the game's Biome (its own `biome.json`), as the scaffold's own pass does: the
 * game's install when it has one, else the engine's. Without Biome the files are left as written, and the game's
 * `lint:fix` after the install formats them.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";

export function formatWithBiome(out: string, engine: string, files: string[]) {
  let bin: string;
  try {
    bin = createRequire(join(out, "package.json")).resolve("@biomejs/biome/bin/biome");
  } catch {
    try {
      bin = createRequire(join(engine, "package.json")).resolve("@biomejs/biome/bin/biome");
    } catch {
      console.warn(
        "create-watchpot: no Biome to format the changed files with; run the game's `lint:fix` after the install",
      );
      return;
    }
  }
  const p = spawnSync(process.execPath, [bin, "check", "--write", ...files], { cwd: out, encoding: "utf8" });
  if (p.status !== 0) throw new Error(`biome check --write failed in ${out}:\n${p.stdout}${p.stderr}`);
}
