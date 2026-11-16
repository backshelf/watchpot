import { expect, test } from "bun:test";
import { annotate, annotator, lexicon, type Segment } from "watchpot/core";

const lex = lexicon([
  { id: "core", words: ["core", "cores"] },
  { id: "kept", words: ["cores kept"] },
  { id: "head", words: ["the head", "head"] },
  { id: "free", words: ["free"] },
  { id: "stand", words: ["hands-free stand"] },
]);

/** The marks alone, as `id:text`. */
const marks = (segments: Segment[]) => segments.filter((s) => s.id).map((s) => `${s.id}:${s.text}`);

test("the longest phrase at a word wins, and nothing inside it is marked again", () => {
  const out = annotate(lex, "the cores kept stay. more cores.");
  expect(marks(out)).toEqual(["kept:cores kept", "core:cores"]);
  expect(out.map((s) => s.text).join("")).toBe("the cores kept stay. more cores.");
});

test("an entry is marked once, where it first turns up", () => {
  expect(marks(annotate(lex, "a core, a core, and the cores"))).toEqual(["core:core"]);
});

test("whole words only: not inside a longer word, not across a hyphen, but before an apostrophe", () => {
  expect(marks(annotate(lex, "encore. scores. corespun. a freehold. hands-free."))).toEqual([]);
  expect(marks(annotate(lex, "the head's heat"))).toEqual(["head:the head"]);
  expect(marks(annotate(lex, "a hands-free stand, free"))).toEqual(["stand:hands-free stand", "free:free"]);
});

test("any case matches, and the text keeps its own", () => {
  expect(marks(annotate(lex, "CORES. The Head."))).toEqual(["core:CORES", "head:The Head"]);
});

test("an entry that is not allowed is passed over, and a shorter one may take its place", () => {
  const allow = (id: string) => id !== "kept";
  expect(marks(annotate(lex, "the cores kept", allow))).toEqual(["core:cores"]);
  expect(marks(annotate(lex, "the cores kept", () => false))).toEqual([]);
});

test("the memory answers by scope, and hands the same segments back", () => {
  const mark = annotator(lex, { scopes: 2, texts: 2 });
  const open = mark("cores", "open");
  expect(mark("cores", "open")).toBe(open);
  expect(marks(mark("cores", "shut", () => false))).toEqual([]);
  expect(marks(mark("cores", "open"))).toEqual(["core:cores"]);
});

test("a phrase two entries share goes to the earlier one, and spaces in a phrase are tidied", () => {
  const shared = lexicon([
    { id: "a", words: ["  Warm   Start ", ""] },
    { id: "b", words: ["warm start", "start"] },
  ]);
  expect(marks(annotate(shared, "a warm start, then a start"))).toEqual(["a:warm start", "b:start"]);
});

test("the segments joined are the text, whatever it holds, and an empty text has none", () => {
  for (const text of ["", "no terms here", "CORES KEPT!", "\u0130stanbul core", "  the head  "]) {
    const out = annotate(lex, text);
    expect(out.map((s) => s.text).join("")).toBe(text);
    expect(out.every((s) => s.text !== "")).toBe(true);
  }
  expect(annotate(lex, "")).toEqual([]);
  // A letter whose lowercase is longer than itself would move every index: such a text is left plain.
  expect(marks(annotate(lex, "\u0130stanbul core"))).toEqual([]);
});

test("the memory is capped: the oldest scope goes, and a full scope starts over", () => {
  const mark = annotator(lex, { scopes: 2, texts: 2 });
  const first = mark("cores", "one");
  mark("cores", "two");
  mark("cores", "three"); // "one" is the oldest, and goes
  expect(mark("cores", "one")).not.toBe(first);
  const kept = mark("head", "one");
  mark("free", "one"); // the scope is full: it starts over
  expect(mark("head", "one")).not.toBe(kept);
});
