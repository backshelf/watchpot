// A JavaScript error, said the way a person new to it can act on: what happened, in plain words, and which line of
// the code box it came from. Pure, so the worker and the tests share it.
import type { Problem } from "./host";
import { functionLineOffset, sourceUrl } from "./run";

/** Where an error's first frame in the reader's module points, as a line of that module (1-based). */
export function frameIn(stack: string, path: string): { line: number; column: number } | null {
  const url = sourceUrl(path).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`${url}:(\\d+):(\\d+)`).exec(stack);
  if (!m) return null;
  return { line: Number(m[1]) - functionLineOffset(), column: Number(m[2]) };
}

/** A line of the module as a line of the box, or undefined when it falls outside the box. */
function inBox(line: number | undefined, first: number, last: number): number | undefined {
  if (line === undefined || line < first || line > last) return undefined;
  return line - first + 1;
}

const where = (line?: number) => (line ? `On line ${line}: ` : "");

/**
 * A syntax error from sucrase (`Unexpected token (3:5)`): the code is not yet code. `first` and `last` are the lines
 * of the module the box holds.
 */
export function syntaxProblem(error: unknown, first: number, last: number): Problem {
  const raw = (error instanceof Error ? error.message : String(error)).replace(
    /^Error transforming [^:]+:\s*/,
    "",
  );
  const m = /\((\d+):(\d+)\)\s*$/.exec(raw);
  const line = inBox(m ? Number(m[1]) : undefined, first, last);
  const message = raw.replace(/\s*\(\d+:\d+\)\s*$/, "");
  const expected = /Unexpected token, expected "([^"]+)"/.exec(message)?.[1];
  let detail = "The code stops making sense around here. Look for a missing bracket, comma or quote mark.";
  if (/Unterminated string/i.test(message)) detail = "A piece of text in quote marks is never closed.";
  else if (/Unterminated template/i.test(message)) detail = "A piece of text in backticks is never closed.";
  else if (expected)
    detail = `JavaScript expected \`${expected}\` here. Usually a bracket opened on this line is never closed, or a comma is missing between two entries.`;
  else if (/Unexpected token/i.test(message) && line === undefined)
    detail =
      "The code ends before it is finished: a bracket opened somewhere is never closed. Count the brackets in the box.";
  return {
    title: `${where(line)}this is not valid code yet`,
    detail,
    line,
    column: m && line !== undefined ? Number(m[2]) + 1 : undefined,
    raw,
  };
}

/** An error thrown while the game was being made or run: a missing name, a call on nothing, the engine refusing. */
export function runProblem(error: unknown, path: string, first: number, last: number, when: string): Problem {
  const e = error instanceof Error ? error : new Error(String(error));
  const at = frameIn(String(e.stack ?? ""), path);
  const line = inBox(at?.line, first, last);
  const raw = `${e.name}: ${e.message}`;
  let title = `${where(line)}the code threw an error ${when}`;
  let detail = e.message;
  const missing = e.name === "ReferenceError" ? /^(\S+) is not defined/.exec(e.message) : null;
  // V8 says "Cannot read properties of undefined (reading 'add')"; SpiderMonkey says "s.pot.bubbels is undefined".
  const nothing =
    e.name === "TypeError"
      ? /Cannot read propert(?:y|ies) of (undefined|null)(?: \(reading '([^']+)'\))?/.exec(e.message)
      : null;
  const nothingNamed = e.name === "TypeError" ? /^(\S+) is (undefined|null)$/.exec(e.message) : null;
  const notCallable = e.name === "TypeError" ? /(\S+) is not a function/.exec(e.message) : null;
  if (missing) {
    title = `${where(line)}there is nothing called \`${missing[1]}\``;
    detail = `\`${missing[1]}\` is used but never made. Check its spelling against where it is declared, or whether it needs importing at the top of the file.`;
  } else if (nothing) {
    title = `${where(line)}something here is ${nothing[1]}`;
    detail = nothing[2]
      ? `The code asked for \`${nothing[2]}\` of something that is not there. Check the name just before \`.${nothing[2]}\`: a feature only sees its own state and what it reaches.`
      : "The code asked for a property of something that is not there.";
  } else if (nothingNamed) {
    title = `${where(line)}\`${nothingNamed[1]}\` is not there`;
    detail = `The code reads \`${nothingNamed[1]}\`, and it is ${nothingNamed[2]}. Check its spelling: a feature only sees its own state and what it reaches.`;
  } else if (notCallable) {
    title = `${where(line)}\`${notCallable[1]}\` is not something you can call`;
    detail = `The code calls \`${notCallable[1]}\` with brackets, but it is not a function. Check the spelling, and whether it is a value rather than an action.`;
  } else if (e.name === "TypeError" && /Assignment to constant/.test(e.message)) {
    title = `${where(line)}a \`const\` cannot be given a new value`;
    detail = "Declare it with `let` if it has to change.";
  } else if (/must|cannot|refuse|not allowed|unknown|missing|duplicate/i.test(e.message)) {
    title = `${where(line)}the engine refused the game ${when}`;
    detail = e.message;
  }
  return { title, detail, line, column: line !== undefined ? at?.column : undefined, raw };
}
