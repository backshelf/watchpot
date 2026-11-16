#!/usr/bin/env bun
/**
 * 0.18.0: the pure helper `catchUp` is `offlineCredit`, and `catchUpSteps` is `offlineSteps` (their types `CatchUp`
 * and `CatchUpSteps` are `OfflineCredit` and `OfflineSteps`), so `catchUp` names only the store's action. The old names
 * stay as deprecated aliases, so nothing breaks: this moves a game to the new ones. Run from the game's root:
 *
 *   bun node_modules/watchpot/codemods/0.18.0-offline-credit.ts [--write]
 *
 * It renames each old name in a `watchpot/core` import or export-from, and every use of the name that import brought
 * in (`catchUp(...)`, `CatchUp` in a type, `core.catchUp` through a namespace import). It never touches a member
 * (`store.getState().catchUp()`, the store's action), a string (`pass: "catchUp"`), a comment, or a name imported
 * under an alias. A name that reads as an object key (`catchUp: ...`) or a re-export, it lists for a human.
 *
 * A dry run by default: it prints the files it would change and changes nothing until `--write`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { code, gameFiles } from "./0.9.0-sound";

/** Each old name and the new one. */
export const RENAMED: Readonly<Record<string, string>> = {
  catchUp: "offlineCredit",
  catchUpSteps: "offlineSteps",
  CatchUp: "OfflineCredit",
  CatchUpSteps: "OfflineSteps",
};

const OLD = Object.keys(RENAMED).join("|");
/** A braced import or export-from of `watchpot/core`, from its keyword. */
const STATEMENT = /(import|export)(\s+type)?\s*\{([^}]*)\}\s*from\s*(["'])watchpot\/core\4/y;
const NAMESPACE = /import\s+(?:type\s+)?\*\s+as\s+([\w$]+)\s+from\s*(["'])watchpot\/core\2/y;
/** One name in braces: `type` before it, `as` after it. */
const SPEC = /^(\s*(?:type\s+)?)([\w$]+)(\s+as\s+[\w$]+)?(\s*)$/;

/** What the codemod found in one file. */
export interface FilePlan {
  file: string;
  /** The source after the edits (the same text when there are none). */
  after: string;
  edits: number;
  human: { line: number; why: string }[];
}

const lineAt = (src: string, at: number) => src.slice(0, at).split("\n").length;

/** Plans one file: the renames, and what is left for a human. */
export function planFile(file: string, src: string): FilePlan {
  const masked = code(src);
  const edits: { at: number; from: string; to: string }[] = [];
  const human: FilePlan["human"] = [];
  /** Local names the file's imports brought in under an old name, and namespace names of `watchpot/core`. */
  const locals = new Set<string>();
  const namespaces: string[] = [];
  const covered: [number, number][] = [];

  for (const m of masked.matchAll(/\b(?:import|export)\b/g)) {
    const at = m.index;
    STATEMENT.lastIndex = at;
    const st = STATEMENT.exec(src);
    if (st) {
      covered.push([at, at + st[0].length]);
      const inner = st[3] as string;
      let offset = at + st[0].indexOf("{") + 1;
      for (const part of inner.split(",")) {
        const spec = SPEC.exec(part);
        const name = spec?.[2];
        if (spec && name && name in RENAMED) {
          edits.push({ at: offset + (spec[1] as string).length, from: name, to: RENAMED[name] as string });
          if (st[1] === "export" && !spec[3])
            human.push({
              line: lineAt(src, at),
              why: `${name} is re-exported as ${RENAMED[name]} now: rename it where the game imports it`,
            });
          else if (!spec[3]) locals.add(name);
        }
        offset += part.length + 1;
      }
      continue;
    }
    NAMESPACE.lastIndex = at;
    const ns = NAMESPACE.exec(src);
    if (ns) namespaces.push(ns[1] as string);
  }

  if (locals.size > 0) {
    const names = [...locals].join("|");
    for (const u of masked.matchAll(new RegExp(`(?<![\\w$.])(${names})(?![\\w$])`, "g"))) {
      if (covered.some(([from, to]) => u.index >= from && u.index < to)) continue;
      const name = u[1] as string;
      if (/^\s*:(?!:)/.test(masked.slice(u.index + name.length)) && !/\?\s*$/.test(masked.slice(0, u.index)))
        human.push({
          line: lineAt(src, u.index),
          why: `${name} reads as an object key here: rename it by hand if it is the helper`,
        });
      else edits.push({ at: u.index, from: name, to: RENAMED[name] as string });
    }
  }
  for (const ns of namespaces) {
    const use = new RegExp(`(?<![\\w$.])${ns.replace(/\$/g, "\\$")}\\s*\\.\\s*(${OLD})(?![\\w$])`, "g");
    for (const u of masked.matchAll(use)) {
      const name = u[1] as string;
      edits.push({ at: u.index + u[0].length - name.length, from: name, to: RENAMED[name] as string });
    }
  }

  let after = src;
  for (const e of [...edits].sort((a, b) => b.at - a.at))
    after = after.slice(0, e.at) + e.to + after.slice(e.at + e.from.length);
  human.sort((a, b) => a.line - b.line);
  return { file, after, edits: edits.length, human };
}

if (import.meta.main) {
  const write = process.argv.includes("--write");
  let files = 0;
  let renames = 0;
  for (const file of gameFiles(".")) {
    const src = readFileSync(join(".", file), "utf8");
    const p = planFile(file, src);
    for (const h of p.human) console.log(`  ${file}:${h.line}  for a human: ${h.why}`);
    if (p.edits === 0) continue;
    files++;
    renames += p.edits;
    console.log(`${file}  ${p.edits} renamed`);
    if (write) writeFileSync(join(".", file), p.after);
  }
  console.log(
    `${renames} names in ${files} files ${write ? "renamed" : "would be renamed (run again with --write)"}`,
  );
}
