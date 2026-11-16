// Marks the entries of a lexicon in running text: a string in, the same string out in segments, each either plain
// or one entry's word. For a glossary whose terms are marked wherever they turn up (a tip on each, a link, a
// colour): the page draws the segments. Pure string work: no state, no DOM; `annotator` keeps what it has worked out.

/** Something to mark: its id, and every spelling of it (a phrase may hold spaces, hyphens and apostrophes). */
export interface LexiconEntry {
  id: string;
  words: readonly string[];
}

/** A run of the text: plain, or the word of the entry `id`. */
export interface Segment {
  text: string;
  id?: string;
}

/** A lexicon made ready to match (by `lexicon`): every phrase, lowercased, under its first word, longest first. */
export interface Lexicon {
  byFirst: ReadonlyMap<string, readonly { phrase: string; id: string }[]>;
}

/** A letter, a digit or an underscore, and a hyphen too: `hands-free` is one word, so `free` is not found in it. */
const isWordChar = (ch: string | undefined): boolean => ch !== undefined && /[\p{L}\p{N}_-]/u.test(ch);

const tidy = (phrase: string): string => phrase.trim().replace(/\s+/g, " ").toLowerCase();

/** The first word of a phrase: everything up to its first character that is not part of a word. */
function firstWord(phrase: string): string {
  let end = 0;
  while (end < phrase.length && isWordChar(phrase[end])) end++;
  return phrase.slice(0, end);
}

/**
 * Makes a lexicon ready, once, for any number of texts. Spaces in a phrase are tidied and its case dropped. A
 * phrase two entries share goes to the earlier one; an empty phrase is dropped.
 */
export function lexicon(entries: readonly LexiconEntry[]): Lexicon {
  const byFirst = new Map<string, { phrase: string; id: string }[]>();
  const taken = new Set<string>();
  for (const entry of entries)
    for (const word of entry.words) {
      const phrase = tidy(word);
      const first = firstWord(phrase);
      if (first === "" || taken.has(phrase)) continue;
      taken.add(phrase);
      const list = byFirst.get(first);
      if (list) list.push({ phrase, id: entry.id });
      else byFirst.set(first, [{ phrase, id: entry.id }]);
    }
  for (const list of byFirst.values()) list.sort((a, b) => b.phrase.length - a.phrase.length);
  return { byFirst };
}

/**
 * `text` in segments. Whole words only (a hyphen joins a word: `hands-free` holds no `free`), any case, and each
 * entry is marked once, where it first turns up. At each word, the longest phrase starting there whose entry is
 * allowed and not yet marked is marked; the scan carries on after it, so marks never overlap. `allow` leaves an
 * entry out (and lets a shorter phrase of another entry be found in its place): what the player has not met yet.
 * The segments' texts joined are `text`, exactly. Its work grows with the text's length, not the lexicon's.
 */
export function annotate(lex: Lexicon, text: string, allow?: (id: string) => boolean): Segment[] {
  const lower = text.toLowerCase();
  // A letter whose lowercase is longer than itself would move every index after it: such a text is left plain.
  if (lower.length !== text.length || lex.byFirst.size === 0) return text === "" ? [] : [{ text }];
  const out: Segment[] = [];
  const seen = new Set<string>();
  let plainFrom = 0;
  let i = 0;
  while (i < text.length) {
    if (!isWordChar(lower[i]) || isWordChar(lower[i - 1])) {
      i++;
      continue;
    }
    let end = i;
    while (end < text.length && isWordChar(lower[end])) end++;
    const candidates = lex.byFirst.get(lower.slice(i, end));
    let hit: { phrase: string; id: string } | undefined;
    if (candidates)
      for (const c of candidates) {
        if (seen.has(c.id) || (allow && !allow(c.id))) continue;
        if (!lower.startsWith(c.phrase, i) || isWordChar(lower[i + c.phrase.length])) continue;
        hit = c;
        break;
      }
    if (!hit) {
      i = end;
      continue;
    }
    if (i > plainFrom) out.push({ text: text.slice(plainFrom, i) });
    out.push({ text: text.slice(i, i + hit.phrase.length), id: hit.id });
    seen.add(hit.id);
    i += hit.phrase.length;
    plainFrom = i;
  }
  if (plainFrom < text.length) out.push({ text: text.slice(plainFrom) });
  return out;
}

/** What `annotator` takes: how many scopes and how many texts a scope it keeps before it starts over. */
export interface AnnotatorOptions {
  /** The scopes kept; the oldest goes when another arrives. Default 8. */
  scopes?: number;
  /** The texts a scope keeps before it starts over. Default 4000. */
  texts?: number;
}

/**
 * `annotate` with a memory: the segments of a text are worked out once per `scope` (whatever `allow` depends on,
 * as a string) and handed back the same array after. Meant for a fixed set of texts drawn again and again; a text
 * that holds a moving figure should not be passed through it, so the memory is capped all the same (the oldest
 * scope goes first, and a scope that fills up starts over).
 */
export function annotator(
  lex: Lexicon,
  options: AnnotatorOptions = {},
): (text: string, scope: string, allow?: (id: string) => boolean) => Segment[] {
  const { scopes = 8, texts = 4000 } = options;
  const memory = new Map<string, Map<string, Segment[]>>();
  return (text: string, scope: string, allow?: (id: string) => boolean): Segment[] => {
    let known = memory.get(scope);
    if (!known) {
      if (memory.size >= scopes) {
        const oldest = memory.keys().next().value;
        if (oldest !== undefined) memory.delete(oldest);
      }
      known = new Map();
      memory.set(scope, known);
    }
    const had = known.get(text);
    if (had) return had;
    if (known.size >= texts) known.clear();
    const segments = annotate(lex, text, allow);
    known.set(text, segments);
    return segments;
  };
}
