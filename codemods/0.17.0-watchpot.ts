#!/usr/bin/env bun
/**
 * 0.17.0: the engine has a name. The package `idleslop` is `watchpot`, at `github.com/backshelf/watchpot`. Nothing
 * else about it changed: every export is where it was. Run from the game's root:
 *
 *   bun ../watchpot/codemods/0.17.0-watchpot.ts [--write]
 *
 * It rewrites the old name wherever a game's own text says it: module specifiers (`idleslop/ui` and the rest), the
 * dependency in `package.json` (its key and its address; the tag is left for the game to set), and prose in the
 * game's docs. It walks the game's files and skips `node_modules`, `dist`, `.git` and anything binary.
 *
 * Left to hand: `bun.lock` (set the dependency's tag, then `bun install` rewrites it), and two browser storage
 * keys the engine names by default, which start over under the new name unless the game passed its own:
 * `idleslop.soundDesk` (the mix desk's layout) and `idleslop.three.quality`.
 *
 * A dry run by default: it lists the files it would change and changes nothing until `--write`.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OLD = "idleslop";
const NEW = "watchpot";
const SKIP: ReadonlySet<string> = new Set(["node_modules", "dist", ".git", "bun.lock"]);

/** `text` under the new name: the old address first, then the name in each of its cases. */
export function renamed(text: string): string {
  return text
    .replace(/github\.com\/[\w-]+\/idleslop/g, `github.com/backshelf/${NEW}`)
    .replaceAll(OLD, NEW)
    .replaceAll("Idleslop", "Watchpot")
    .replaceAll("IDLESLOP", "WATCHPOT");
}

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

if (import.meta.main) {
  const write = process.argv.includes("--write");
  let count = 0;
  for (const path of walk(".")) {
    const bytes = readFileSync(path);
    if (bytes.subarray(0, 8000).includes(0)) continue;
    const before = bytes.toString("utf8");
    const after = renamed(before);
    if (after === before) continue;
    count++;
    console.log(path);
    if (write) writeFileSync(path, after);
  }
  console.log(`${count} files ${write ? "changed" : "would change (run again with --write)"}`);
  console.log("by hand: set the dependency's tag in package.json, then `bun install`");
}
