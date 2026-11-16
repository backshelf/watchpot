#!/usr/bin/env bun
/**
 * 0.18.0: `achievements` takes its type parameters as key, state, effect (`achievements<K, G, E = never>`), the order
 * of `Achievement<G, E>` and `AchievementsDef<K, G, E>`. It was key, effect, state. A call that wrote them out now
 * reads them the other way round. Run from the game's root:
 *
 *   bun ../watchpot/codemods/0.18.0-achievements-generics.ts [--write]
 *
 * It rewrites every explicit `achievements<...>(` call in the game's `.ts` and `.tsx` files to keep its meaning: three
 * arguments swap their last two (`<K, E, G>` to `<K, G, E>`), two arguments gain the old default state
 * (`<K, E>` to `<K, object, E>`). A call with one argument means the same in both orders and is left alone.
 *
 * Left to hand: every call it rewrote is listed. Most games write none: the three infer from the definition. A game
 * that wrote them backwards on purpose to name its state (`achievements<"k", State, never>`, which the old order read
 * as an effect type of `State` and a state of `never`, turning off the check on `when`) should drop the arguments or
 * write `achievements<"k", State>` after the run.
 *
 * A dry run by default: it lists the files it would change and changes nothing until `--write`.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SKIP: ReadonlySet<string> = new Set(["node_modules", "dist", ".git"]);

/** One call the codemod rewrote, by its 1-based line, for a human to read. */
export interface HumanItem {
  readonly line: number;
  readonly why: string;
}

/** The type arguments inside `<...>` from `open` (the index after `<`), split at top-level commas, and the end. */
function typeArgs(src: string, open: number): { args: string[]; end: number } | null {
  const args: string[] = [];
  let depth = 0;
  let start = open;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === "<" || ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === ">" && src[i - 1] !== "=") {
      if (depth === 0) {
        args.push(src.slice(start, i));
        return { args, end: i };
      }
      depth--;
    } else if (ch === "," && depth === 0) {
      args.push(src.slice(start, i));
      start = i + 1;
    }
  }
  return null;
}

/** The file's text with every explicit `achievements<...>(` call in the new order, and the calls it rewrote. */
export function planFile(_path: string, src: string): { after: string; human: HumanItem[] } {
  const human: HumanItem[] = [];
  const call = /\bachievements\s*</g;
  let out = "";
  let from = 0;
  for (let m = call.exec(src); m; m = call.exec(src)) {
    const open = m.index + m[0].length;
    const parsed = typeArgs(src, open);
    if (!parsed || !/^\s*\(/.test(src.slice(parsed.end + 1))) continue;
    const args = parsed.args.map((a) => a.trim());
    let next: string[] | null = null;
    if (args.length === 3) next = [args[0] as string, args[2] as string, args[1] as string];
    else if (args.length === 2) next = [args[0] as string, "object", args[1] as string];
    if (!next) continue;
    out += `${src.slice(from, open)}${next.join(", ")}`;
    from = parsed.end;
    const line = src.slice(0, m.index).split("\n").length;
    human.push({
      line,
      why: `type arguments reordered to key, state, effect (${next.join(", ")}); if the state was written second on purpose, drop the arguments`,
    });
    call.lastIndex = parsed.end;
  }
  return { after: out + src.slice(from), human };
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
  for (const path of walk(".").filter((p) => /\.tsx?$/.test(p))) {
    const before = readFileSync(path, "utf8");
    const { after, human } = planFile(path, before);
    if (after === before) continue;
    count++;
    for (const item of human) console.log(`${path}:${item.line}: ${item.why}`);
    if (write) writeFileSync(path, after);
  }
  console.log(`${count} files ${write ? "changed" : "would change (run again with --write)"}`);
}
