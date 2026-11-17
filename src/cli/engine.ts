// What the `watchpot` command reads from the engine and the game: the engine's folder, its manifest and skills, and
// the skill folders a game keeps. Node built-ins only: the command runs on Node 20+ and on Bun.
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";

/** The folders a game keeps its agent skills in: the three the tools read. */
export const SKILL_DIRS = [".claude/skills", ".agents/skills", ".cursor/skills"] as const;

export interface EnginePackage {
  version: string;
  engines?: { bun?: string };
}

/**
 * The engine's folder: `WATCHPOT_ENGINE_DIR` when it is set (tests), else the `watchpot` package the game has
 * installed, found from an entry it exports and walked up to its `package.json`. Undefined when there is none.
 */
export function findEngine(cwd: string, env: Record<string, string | undefined>): string | undefined {
  const override = env.WATCHPOT_ENGINE_DIR;
  if (override) {
    const dir = resolve(cwd, override);
    return existsSync(join(dir, "package.json")) ? dir : undefined;
  }
  try {
    // `watchpot/package.json` is not an exported subpath, so start from an entry it does export.
    let dir = dirname(createRequire(join(cwd, "package.json")).resolve("watchpot/core"));
    for (;;) {
      const manifest = join(dir, "package.json");
      if (existsSync(manifest) && readJson<{ name?: string }>(manifest).name === "watchpot") return dir;
      const up = dirname(dir);
      if (up === dir) return undefined;
      dir = up;
    }
  } catch {
    return undefined;
  }
}

export function readEngine(engine: string): EnginePackage {
  return readJson<EnginePackage>(join(engine, "package.json"));
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/** The engine's skill folders, by name. */
export function engineSkills(engine: string): string[] {
  const dir = join(engine, ".agents", "skills");
  if (!isDir(dir)) return [];
  return readdirSync(dir)
    .filter((name) => isDir(join(dir, name)))
    .sort();
}

export function engineSkillDir(engine: string, skill: string): string {
  return join(engine, ".agents", "skills", skill);
}

export function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Every file under `dir`, as forward-slash paths relative to it. */
function filesOf(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(relative(dir, p).split(sep).join("/"));
    }
  };
  walk(dir);
  return out.sort();
}

/** Whether two skill folders hold the same files, and each file the same bytes. */
export function sameTree(a: string, b: string): boolean {
  const files = filesOf(a);
  if (!isDir(b)) return false;
  const theirs = filesOf(b);
  if (files.length !== theirs.length || files.some((f, i) => f !== theirs[i])) return false;
  return files.every((f) => readFileSync(join(a, f)).equals(readFileSync(join(b, f))));
}

/** Replaces `to` with a copy of `from`: the old folder goes first, so a file the engine dropped goes too. */
export function replaceSkill(from: string, to: string): void {
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
}

/** The first `x.y.z` in a version or range (`>=1.4.3` is `1.4.3`), or undefined. */
export function parseVersion(text: string | undefined): [number, number, number] | undefined {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(text ?? "");
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined;
}

/** Negative, zero or positive as `a` is older than, the same as or newer than `b`. */
export function compareVersions(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
