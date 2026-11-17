// `watchpot skills add|update`: copies the engine's agent skills into a game, or refreshes the ones it already holds.
import { join, resolve } from "node:path";
import { engineSkillDir, engineSkills, findEngine, isDir, replaceSkill, SKILL_DIRS } from "./engine";

const DEFAULT_TO = ".agents/skills";

/** Runs `watchpot skills <args>`. Returns the exit code; throws a message for a usage error. */
export function skills(
  args: readonly string[],
  cwd: string,
  env: Record<string, string | undefined>,
  out: (line: string) => void,
): number {
  const [sub, ...rest] = args;
  if (sub !== "add" && sub !== "update")
    throw new Error(`skills takes add or update, not ${sub === undefined ? "nothing" : `"${sub}"`}`);
  const engine = findEngine(cwd, env);
  if (!engine) throw new Error("the watchpot package is not installed here: run bun install");
  const names = engineSkills(engine);
  if (names.length === 0) throw new Error("the engine ships no skills");

  if (sub === "update") {
    let updated = 0;
    for (const dir of SKILL_DIRS)
      for (const skill of names) {
        const to = join(cwd, dir, skill);
        if (!isDir(to)) continue;
        replaceSkill(engineSkillDir(engine, skill), to);
        out(`updated ${dir}/${skill}`);
        updated++;
      }
    if (updated === 0) out("no skills installed: nothing to update (watchpot skills add installs them)");
    return 0;
  }

  const targets = parseTo(rest);
  for (const target of targets)
    for (const skill of names) {
      replaceSkill(engineSkillDir(engine, skill), resolve(cwd, target, skill));
      out(`added ${target}/${skill}`);
    }
  return 0;
}

/** The folders `--to` names (`--to a,b` or `--to=a,b`), default `.agents/skills`. */
export function parseTo(args: readonly string[]): string[] {
  let to: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === "--to") {
      to = args[++i];
      if (to === undefined) throw new Error("--to needs a folder");
    } else if (arg.startsWith("--to=")) to = arg.slice("--to=".length);
    else throw new Error(`skills add: unknown option "${arg}"`);
  }
  const folders = (to ?? DEFAULT_TO)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (folders.length === 0) throw new Error("--to needs a folder");
  return folders;
}
