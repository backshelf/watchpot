// `watchpot doctor`: one line per check for a game's setup, then a summary. A `✗` is a problem and fails the run;
// a `!` is a warning that does not.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  compareVersions,
  engineSkillDir,
  engineSkills,
  findEngine,
  isDir,
  parseVersion,
  readEngine,
  SKILL_DIRS,
  sameTree,
} from "./engine";

export type Mark = "✓" | "!" | "✗";
export interface Line {
  mark: Mark;
  text: string;
}
export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

const REGISTRY_LATEST = "https://registry.npmjs.org/watchpot/latest";

/** The tsconfig fields a watchpot game needs, and the value each must have. */
const TSCONFIG_WANTS: [string, unknown][] = [
  ["moduleResolution", "bundler"],
  ["jsx", "react-jsx"],
  ["strict", true],
];

/** Every check, in order. The engine's folder is found once and shared by the checks that read it. */
export async function doctorLines(
  cwd: string,
  env: Record<string, string | undefined>,
  fetcher: FetchLike,
): Promise<Line[]> {
  const engine = findEngine(cwd, env);
  const lines: Line[] = [];
  lines.push(...bunLines(engine ? readEngine(engine).engines?.bun : undefined));
  lines.push(...(await engineLines(engine, fetcher)));
  lines.push(...tsconfigLines(cwd));
  lines.push(...skillLines(cwd, engine));
  return lines;
}

/** Runs the checks in `cwd` and writes them through `out`. Returns the exit code: 1 when a check is a `✗`. */
export async function doctor(
  cwd: string,
  env: Record<string, string | undefined>,
  fetcher: FetchLike,
  out: (line: string) => void,
): Promise<number> {
  const lines = await doctorLines(cwd, env, fetcher);
  for (const l of lines) out(`${l.mark} ${l.text}`);
  const problems = lines.filter((l) => l.mark === "✗").length;
  const warnings = lines.filter((l) => l.mark === "!").length;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  out("");
  out(
    problems === 0 && warnings === 0
      ? "all checks pass."
      : `${plural(problems, "problem")}, ${plural(warnings, "warning")}.`,
  );
  return problems > 0 ? 1 : 0;
}

/** 1. Bun: installed, and at least the engine's `engines.bun`. The sim needs it; a Vite game runs without it. */
function bunLines(required: string | undefined): Line[] {
  // Windows runs `bun` through the shell (a `.cmd` shim or a PATH alias); elsewhere it is a plain spawn.
  const r =
    process.platform === "win32"
      ? spawnSync("bun --version", { encoding: "utf8", shell: true })
      : spawnSync("bun", ["--version"], { encoding: "utf8" });
  if (r.error || r.status !== 0)
    return [{ mark: "!", text: "bun is not installed: the sim needs it (a Vite game runs without it)" }];
  const version = r.stdout.trim();
  const need = parseVersion(required);
  const have = parseVersion(version);
  if (need && have && compareVersions(have, need) < 0)
    return [{ mark: "!", text: `bun ${version} is older than the engine's ${required}` }];
  return [{ mark: "✓", text: `bun ${version}` }];
}

/** 2. The engine: installed, its version, and whether the registry has a newer one (skipped on any failure). */
async function engineLines(engine: string | undefined, fetcher: FetchLike): Promise<Line[]> {
  if (!engine)
    return [
      {
        mark: "✗",
        text: "watchpot is not installed: node_modules/watchpot/package.json is missing; run bun install",
      },
    ];
  const { version } = readEngine(engine);
  const lines: Line[] = [{ mark: "✓", text: `watchpot ${version}` }];
  const latest = await latestVersion(fetcher);
  const have = parseVersion(version);
  const newest = parseVersion(latest);
  if (latest && have && newest && compareVersions(newest, have) > 0)
    lines.push({ mark: "!", text: `watchpot ${latest} is out; this game has ${version}` });
  return lines;
}

/** The latest published version, or undefined when the registry cannot say (no network, a 404, a timeout). */
async function latestVersion(fetcher: FetchLike): Promise<string | undefined> {
  try {
    const res = await fetcher(REGISTRY_LATEST, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return undefined;
    const body = (await res.json()) as { version?: unknown };
    return typeof body.version === "string" ? body.version : undefined;
  } catch {
    return undefined;
  }
}

/** 3. The game's tsconfig: each field a watchpot game needs, one `✗` for each that is wrong. */
function tsconfigLines(cwd: string): Line[] {
  const path = join(cwd, "tsconfig.json");
  if (!existsSync(path)) return [{ mark: "✗", text: "tsconfig.json is missing" }];
  let options: Record<string, unknown>;
  try {
    const json = JSON.parse(stripJsonc(readFileSync(path, "utf8"))) as { compilerOptions?: unknown };
    options = (json.compilerOptions ?? {}) as Record<string, unknown>;
  } catch (err) {
    return [{ mark: "✗", text: `tsconfig.json does not parse: ${(err as Error).message}` }];
  }
  const lines: Line[] = [];
  for (const [key, want] of TSCONFIG_WANTS) {
    const got = options[key];
    if (got !== want)
      lines.push({
        mark: "✗",
        text: `tsconfig.json: compilerOptions.${key} is ${got === undefined ? "missing" : JSON.stringify(got)}, want ${JSON.stringify(want)}`,
      });
  }
  if (lines.length === 0)
    lines.push({ mark: "✓", text: "tsconfig.json: moduleResolution, jsx and strict are set" });
  return lines;
}

/**
 * JSON with comments and trailing commas (tsconfig's JSONC) made plain JSON: comments go, and a comma that comes
 * just before `}` or `]` goes. Strings are left as they are.
 */
export function stripJsonc(text: string): string {
  let out = "";
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const c = text.charAt(i);
    if (inString) {
      out += c;
      if (c === "\\") {
        out += text.charAt(i + 1);
        i += 2;
        continue;
      }
      if (c === '"') inString = false;
      i++;
    } else if (c === '"') {
      inString = true;
      out += c;
      i++;
    } else if (c === "/" && text.charAt(i + 1) === "/") {
      while (i < text.length && text.charAt(i) !== "\n") i++;
    } else if (c === "/" && text.charAt(i + 1) === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
    } else if (c === "," && /^\s*[}\]]/.test(text.slice(i + 1))) {
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/**
 * 4. Agent skills: each skill a game holds that the engine also ships, compared file by file with the engine's copy.
 * One `!` for each that differs.
 */
function skillLines(cwd: string, engine: string | undefined): Line[] {
  if (!engine) return [];
  const skills = engineSkills(engine);
  const installed: string[] = [];
  const older: string[] = [];
  for (const dir of SKILL_DIRS)
    for (const skill of skills) {
      const mine = join(cwd, dir, skill);
      if (!isDir(mine)) continue;
      const shown = `${dir}/${skill}`;
      installed.push(shown);
      if (!sameTree(engineSkillDir(engine, skill), mine)) older.push(shown);
    }
  if (installed.length === 0)
    return [{ mark: "✓", text: "no agent skills installed (watchpot skills add installs them)" }];
  if (older.length === 0) return [{ mark: "✓", text: `${installed.length} agent skill(s) match the engine` }];
  return older.map((shown) => ({
    mark: "!",
    text: `${shown} is older than the engine's: run \`watchpot skills update\``,
  }));
}
