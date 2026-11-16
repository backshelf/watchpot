// A small TypeScript colourer for the code box while the reader types: comments, strings, numbers, keywords and calls,
// in the listings' own colours. Not a parser: good enough to read by, never used to decide anything.

export type LiteToken = [
  text: string,
  kind: "" | "comment" | "string" | "number" | "keyword" | "function" | "punct",
];

const KEYWORDS = new Set(
  "as async await break case catch class const continue default do else export extends false finally for from function if import in instanceof let new null of return satisfies static super switch this throw true try type typeof undefined var void while yield".split(
    " ",
  ),
);

const PATTERN =
  /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|(\b\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?\b)|([A-Za-z_$][\w$]*)(\s*\()?|([{}()[\];,.:=<>+\-*/!?&|%^~]+)/g;

/** The text, cut into runs and what each run is. Every character of the text is in exactly one run. */
export function liteTokens(text: string): LiteToken[] {
  const out: LiteToken[] = [];
  let at = 0;
  for (const m of text.matchAll(PATTERN)) {
    const start = m.index ?? 0;
    if (start > at) out.push([text.slice(at, start), ""]);
    const [whole, comment, str, num, word, call, punct] = m;
    if (comment) out.push([comment, "comment"]);
    else if (str) out.push([str, "string"]);
    else if (num) out.push([num, "number"]);
    else if (word) {
      out.push([word, KEYWORDS.has(word) ? "keyword" : call ? "function" : ""]);
      if (call) out.push([call, "punct"]);
    } else if (punct) out.push([punct, "punct"]);
    else out.push([whole, ""]);
    at = start + whole.length;
  }
  if (at < text.length) out.push([text.slice(at), ""]);
  return out;
}
