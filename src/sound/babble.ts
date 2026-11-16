/**
 * The babble voice: a line of text spoken as syllables of shaped buzz, with a call as each one starts so the page
 * can print along.
 *
 * `syllables` turns a line into syllable events on the main thread (pure, deterministic); a voice posts them to the
 * core as `BABBLE_SAY` records, one a syllable stamped with the frame it starts on, and maps the core's `STEP`
 * answers back to `onChar`. Where the core cannot speak (locked, the fallback, every voice taken) the line is
 * timed by the main thread instead, so a page printing along still prints.
 */
import { NO_LINK } from "./desk";
import type { CorePort, SoundHost } from "./port";
import { concat, encode, LIMITS, STEP_SOURCE } from "./protocol";
import type { Babble, BabbleDef } from "./types";

/** One syllable of a line: when it starts and how it is shaped. */
export interface Syllable {
  /** The index in the text of the syllable's first character. */
  index: number;
  /** Seconds from the line's start, and how long it lasts. */
  start: number;
  length: number;
  /** A ratio on the voice's pitch. */
  pitch: number;
  /** The vowel's two formants, in Hz. */
  formant1: number;
  formant2: number;
  /** 0..1: how much of a consonant's burst opens it. */
  noise: number;
  /** 0..1. */
  level: number;
}

/** The five vowels' first two formants, Hz: a spoken average, not anyone's voice. */
const FORMANTS: Readonly<Record<string, readonly [number, number]>> = {
  a: [800, 1200],
  e: [550, 1800],
  i: [300, 2300],
  o: [500, 900],
  u: [320, 800],
};
/** A word with no vowel (`hmm`, `brr`, a digit) is spoken on this one. */
const NEUTRAL = "u";

/** How much of a burst opens a syllable, by the class of its first consonant. */
function burst(onset: string): number {
  if (onset === "") return 0;
  const two = onset.slice(0, 2);
  if (two === "sh" || two === "ch" || two === "th") return 0.85;
  const c = onset[0] as string;
  if ("sfhx".includes(c)) return 0.85; // unvoiced fricatives and sibilants
  if ("vzj".includes(c)) return 0.6; // voiced fricatives
  if ("ptkcq".includes(c)) return 0.5; // unvoiced stops
  if ("bdg".includes(c)) return 0.3; // voiced stops
  return 0.1; // nasals, liquids, glides (m n l r w y) and anything else
}

/** A character's base letter, lower case, with any accent taken off: what the rules read. */
const base = (ch: string): string => (ch.normalize("NFD")[0] ?? "").toLowerCase();
const isLetter = (ch: string): boolean => /\p{L}/u.test(ch);
const isDigit = (ch: string): boolean => /\p{N}/u.test(ch);

/** 32-bit FNV-1a of the text: the seed of a line's small, repeatable wobble. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
/** -1..1, the same for the same seed and index. */
function wobble(seed: number, i: number): number {
  let x = (seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 0x7fffffff - 1;
}

/** A word as the text gives it: where it starts and its characters. */
interface Word {
  at: number;
  chars: string;
  /** The punctuation straight after it, before the next word: `,`, `.`, `?`, `!` (or none). */
  after: "" | "," | "." | "?" | "!";
}

function wordsOf(text: string): Word[] {
  const words: Word[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i] as string;
    if (!isLetter(ch) && !isDigit(ch)) {
      const last = words.at(-1);
      if (last && last.after === "") {
        if (".…".includes(ch)) last.after = ".";
        else if (ch === "?" || ch === "!") last.after = ch;
        else if (",;:—–".includes(ch)) last.after = ",";
      } else if (last && (ch === "?" || ch === "!") && last.after === ".") last.after = ch;
      i++;
      continue;
    }
    const at = i;
    // A word runs over letters, digits and an apostrophe between two letters (`don't`).
    while (
      i < text.length &&
      (isLetter(text[i] as string) ||
        isDigit(text[i] as string) ||
        ((text[i] === "'" || text[i] === "’") && isLetter(text[i + 1] ?? "") && i > at))
    )
      i++;
    words.push({ at, chars: text.slice(at, i), after: "" });
  }
  return words;
}

/** A syllable of a word before it is timed: its first character, letters, onset and vowel. */
interface Part {
  at: number;
  letters: number;
  onset: string;
  vowel: string;
}

/** Whether position `i` of a word (as base letters) is a vowel: `aeiou`, and `y` when no vowel follows it. */
function vowelAt(b: string, i: number): boolean {
  const c = b[i] as string;
  if ("aeiou".includes(c)) return true;
  return c === "y" && i > 0 && !"aeiou".includes(b[i + 1] ?? "");
}

/**
 * A word's syllables: each a vowel run (its nucleus) with the consonants before it. Between two nuclei one consonant
 * opens the next syllable and more than one is split, the first closing the syllable before. A digit is a syllable
 * of its own; a word with no vowel is one syllable on the neutral vowel.
 */
function partsOf(word: Word): Part[] {
  const chars = [...word.chars];
  const b = chars.map(base).join("");
  const offsets: number[] = [];
  let o = 0;
  for (const ch of chars) {
    offsets.push(o);
    o += ch.length;
  }
  const nuclei: { from: number; to: number }[] = [];
  for (let i = 0; i < b.length; i++) {
    if (isDigit(chars[i] as string)) {
      nuclei.push({ from: i, to: i + 1 });
      continue;
    }
    if (!vowelAt(b, i)) continue;
    const from = i;
    while (i + 1 < b.length && vowelAt(b, i + 1) && !isDigit(chars[i + 1] as string)) i++;
    nuclei.push({ from, to: i + 1 });
  }
  // A lone `e` closing a word after a consonant is silent when another vowel speaks (`one`, `there`, `time`).
  const final = nuclei.at(-1);
  if (
    nuclei.length > 1 &&
    final &&
    final.from === b.length - 1 &&
    final.to === b.length &&
    b[final.from] === "e" &&
    !vowelAt(b, final.from - 1)
  )
    nuclei.pop();
  if (nuclei.length === 0) {
    return [{ at: word.at, letters: chars.length, onset: b, vowel: NEUTRAL }];
  }
  const parts: Part[] = [];
  let start = 0;
  for (let n = 0; n < nuclei.length; n++) {
    const { from, to } = nuclei[n] as { from: number; to: number };
    const next = nuclei[n + 1];
    // Where this syllable ends: the word's end, or partway through the consonants before the next nucleus.
    let end = b.length;
    if (next) {
      const between = next.from - to;
      end = between <= 1 ? to : to + 1;
    }
    const v = b[from] as string;
    parts.push({
      at: word.at + (offsets[start] ?? 0),
      letters: end - start,
      onset: b.slice(start, from),
      vowel: isDigit(chars[from] as string) ? NEUTRAL : v === "y" ? "i" : v,
    });
    start = end;
  }
  return parts;
}

/** Syllables a line holds at most; the rest is not spoken. */
const MAX_SYLLABLES = 256;

/**
 * A line as syllables: deterministic for a given text. `rate` is syllables a second (default 9), `pitch` a ratio.
 *
 * Each syllable lasts a beat of `1 / rate` scaled by its letters, and longer before punctuation; a gap follows a
 * word, a longer one a comma and a longer still a sentence. Pitch falls across a sentence to a full stop (from
 * higher to an exclamation mark) and rises over the last syllables to a question mark; a capitalised word steps up
 * on its first syllable and a word in capitals is higher and louder throughout. A small wobble seeded by the text
 * keeps it from droning.
 */
export function syllables(text: string, options: { rate?: number; pitch?: number } = {}): Syllable[] {
  const rate =
    options.rate !== undefined && Number.isFinite(options.rate) && options.rate > 0 ? options.rate : 9;
  const pitch =
    options.pitch !== undefined && Number.isFinite(options.pitch) && options.pitch > 0 ? options.pitch : 1;
  const beat = 1 / rate;
  const seed = hash(text);
  const words = wordsOf(text);

  // Sentences: runs of words up to a full stop, a question mark or an exclamation mark.
  const sentences: Word[][] = [];
  let current: Word[] = [];
  for (const w of words) {
    current.push(w);
    if (w.after === "." || w.after === "?" || w.after === "!") {
      sentences.push(current);
      current = [];
    }
  }
  if (current.length) sentences.push(current);

  const out: Syllable[] = [];
  let t = 0;
  for (const sentence of sentences) {
    const end = sentence.at(-1)?.after ?? "";
    const parts = sentence.map((w) => ({ w, parts: partsOf(w) }));
    const count = parts.reduce((n, p) => n + p.parts.length, 0);
    let k = 0;
    for (const { w, parts: ps } of parts) {
      const letters = [...w.chars].filter(isLetter);
      const shout =
        letters.length > 1 && letters.every((c) => c !== c.toLowerCase() && c === c.toUpperCase());
      const capital = letters.length > 0 && letters[0] !== letters[0]?.toLowerCase();
      for (let p = 0; p < ps.length; p++) {
        const part = ps[p] as Part;
        if (out.length >= MAX_SYLLABLES) return out;
        const last = p === ps.length - 1;
        const x = count > 1 ? k / (count - 1) : 1;
        // The contour across the sentence.
        let contour: number;
        if (end === "?") {
          const rise = Math.max(0, (k - (count - 3)) / 2); // the last two syllables climb
          contour = 1 - 0.04 * x + 0.32 * Math.min(1, rise);
        } else if (end === "!") contour = 1.14 - 0.18 * x;
        else contour = 1.06 - 0.18 * x;
        if (shout) contour *= 1.15;
        else if (capital && p === 0) contour *= 1.06;
        const length =
          beat *
          Math.min(1.4, 0.7 + 0.1 * part.letters) *
          (last && w.after === "," ? 1.5 : 1) *
          (last && (w.after === "." || w.after === "?" || w.after === "!") ? 1.8 : 1);
        const [formant1, formant2] = FORMANTS[part.vowel] ?? (FORMANTS[NEUTRAL] as readonly [number, number]);
        const i = out.length;
        out.push({
          index: part.at,
          start: t,
          length,
          pitch: pitch * contour * (1 + 0.025 * wobble(seed, i)),
          formant1: formant1 * (1 + 0.04 * wobble(seed, i + 1000)),
          formant2: formant2 * (1 + 0.04 * wobble(seed, i + 2000)),
          noise: burst(part.onset),
          level: shout ? 1 : p === 0 ? 0.9 : 0.75,
        });
        t += length + beat * 0.08;
        if (last) {
          if (w.after === ",") t += beat * 1.5;
          else if (w.after === "." || w.after === "?" || w.after === "!") t += beat * 3;
          else t += beat * 0.3;
        }
        k++;
      }
    }
  }
  return out;
}

/** How far ahead of now a line's first syllable is stamped, ms: enough for the record to reach the worklet. */
const LEAD_MS = 30;

/** The babble voices a port has given out (at most `LIMITS.BABBLES`). */
const taken = new WeakMap<CorePort, Set<number>>();

function takeSlot(port: CorePort): number {
  let set = taken.get(port);
  if (!set) {
    set = new Set();
    taken.set(port, set);
  }
  for (let i = 0; i < LIMITS.BABBLES; i++) {
    if (!set.has(i)) {
      set.add(i);
      return i;
    }
  }
  return -1;
}

const dbGain = (db: number | undefined): number =>
  db !== undefined && Number.isFinite(db) ? 10 ** (db / 20) : 1;

/** True when frame `a` is at or after frame `b`, on the core's wrapping 32-bit count. */
const atOrAfter = (a: number, b: number): boolean => ((a - b) | 0) >= 0;

/** How many babble voices each port has made: what names one the game did not name (`#2`). */
const made = new WeakMap<CorePort, number>();

/** Builds a babble voice over a sound. At most 4 exist at once. */
export function createBabble(def: BabbleDef<string>, host: SoundHost): Babble {
  const { port } = host;
  const slot = takeSlot(port);
  const count = (made.get(port) ?? 0) + 1;
  made.set(port, count);
  // Its desk strip: the trim rides on the voice's gain from its next line.
  const link = host.channel?.("voice", def.name ?? `#${count}`) ?? NO_LINK;
  /** The line holding the strip lit, and the timer that lets it go when the line has been said. */
  let holding = false;
  let release: ReturnType<typeof setTimeout> | null = null;
  const letGo = () => {
    if (release !== null) clearTimeout(release);
    release = null;
    if (holding) link.hold(false);
    holding = false;
  };
  if (slot < 0)
    console.warn(`watchpot/sound: every one of the core's ${LIMITS.BABBLES} babble voices is in use`);
  let line = 0;
  /** The line being said: its first frame and the call per syllable, or the timers standing in for the core. */
  let speaking: {
    line: number;
    from: number;
    parts: readonly Syllable[];
    onChar?: (index: number) => void;
    timers: ReturnType<typeof setTimeout>[];
  } | null = null;

  if (slot >= 0) {
    port.listen((event) => {
      if (event.op !== "STEP" || event.source !== STEP_SOURCE.babble || event.track !== slot) return;
      const now = speaking;
      if (!now?.onChar || !atOrAfter(event.frame, now.from)) return;
      const part = now.parts[event.index];
      if (part) now.onChar(part.index);
    });
  }

  /** Ends the line being said: the core drops what is left of it, and the timers are cleared. */
  const hush = () => {
    if (!speaking) return;
    for (const t of speaking.timers) clearTimeout(t);
    if (slot >= 0 && port.up()) port.send(encode("BABBLE_STOP", { babble: slot, line: speaking.line }));
    speaking = null;
    letGo();
  };

  return {
    say(text, options = {}) {
      hush();
      // A line's own level rides on its syllables, so one voice can speak a line softly and the next at full.
      const lineGain = Number.isFinite(options.db) ? dbGain(options.db as number) : 1;
      const parts = syllables(String(text), {
        rate: options.rate ?? def.rate,
        pitch: (options.pitch ?? 1) * (def.pitch ?? 1),
      });
      const lastPart = parts.at(-1);
      const seconds = lastPart ? lastPart.start + lastPart.length : 0;
      line = (line + 1) >>> 0;
      const mine = {
        line,
        from: 0,
        parts,
        onChar: options.onChar,
        timers: [] as ReturnType<typeof setTimeout>[],
      };
      speaking = mine;
      if (parts.length === 0) return { seconds, stop: () => undefined };

      if (slot >= 0 && port.up()) {
        const from = (port.frame() + port.frames(LEAD_MS)) >>> 0;
        mine.from = from;
        // A held sample is normalised to full scale: its `scale` restores the recording's level.
        const held = def.carrier ? host.held(def.carrier) : null;
        const carrier = held?.id ?? 0;
        const pan = options.at ? host.place(options.at).pan : 0;
        port.send(
          concat([
            // Defined again with every line: the carrier may have become ready, the pan follows `at`, and a core
            // that came up again since holds nothing.
            encode("BABBLE_DEFINE", {
              babble: slot,
              sample: carrier,
              bus: host.bus(link.route() ?? def.bus ?? "voice"),
              gain: dbGain(def.level) * (held?.scale ?? 1) * link.gain(),
              pan: Number.isFinite(pan) ? Math.max(-1, Math.min(1, pan)) : 0,
              sendBus1: 0,
              send1: 0,
            }),
            ...parts.map((s, index) =>
              encode("BABBLE_SAY", {
                atFrame: (from + port.frames(s.start * 1000)) >>> 0 || 1,
                babble: slot,
                line,
                index,
                length: Math.max(1, port.frames(s.length * 1000)),
                pitch: s.pitch,
                formant1: s.formant1,
                formant2: s.formant2,
                noise: s.noise,
                level: s.level * lineGain,
              }),
            ),
          ]),
        );
        link.started(link.route() ?? def.bus ?? "voice");
        link.hold(true);
        holding = true;
        release = setTimeout(letGo, LEAD_MS + seconds * 1000);
      } else if (options.onChar) {
        // Nothing to hear: the line is timed here so a page printing along still prints.
        const onChar = options.onChar;
        for (const s of parts)
          mine.timers.push(setTimeout(() => speaking === mine && onChar(s.index), LEAD_MS + s.start * 1000));
      }
      return {
        seconds,
        stop() {
          if (speaking === mine) hush();
        },
      };
    },
  };
}
