import { annotator, lexicon, type Segment } from "watchpot/core";

/** The game's terms: each names the door that has to be open before the player may meet it (none: from the start). */
const TERMS = [
  { id: "gold", words: ["gold"], door: null, means: "What everything costs." },
  { id: "market", words: ["market", "the market"], door: "market", means: "Where gold buys stalls." },
  { id: "vault", words: ["vault"], door: "vault", means: "What starting over leaves you." },
] as const;

const LEX = lexicon(TERMS.map((t) => ({ id: t.id, words: t.words })));
const mark = annotator(LEX);

/** The doors' earned record, as `showcase-latch.ts` keeps it. */
type Doors = { earned: Record<string, number> };

/** Whether the player has met a term: its door is open, or it has none. */
const met = (doors: Doors, id: string): boolean => {
  const door = TERMS.find((t) => t.id === id)?.door;
  return door == null || doors.earned[door] !== undefined;
};

/**
 * A line of text cut into plain runs and marked terms. A term behind a closed door is left as plain text, so a tip
 * that mentions the vault reads the same as any other word until the vault is open. The scope is the set of open
 * doors, which is all `met` depends on, so each text is worked out once per set.
 */
export function marked(text: string, doors: Doors): Segment[] {
  const scope = Object.keys(doors.earned).sort().join(",");
  return mark(text, scope, (id) => met(doors, id));
}

if (import.meta.main) {
  const tip = "Spend your gold at the market; what you keep goes to the vault.";
  const marks = (doors: Doors) =>
    marked(tip, doors)
      .filter((s) => s.id)
      .map((s) => s.id);
  console.log(marks({ earned: {} })); // ["gold"]
  console.log(marks({ earned: { market: 1 } })); // ["gold", "market"]
}
