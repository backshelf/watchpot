/** The journal: a capped log of typed lines and a cursor over it. */

/** One line of a log: when, what kind, what it says. */
export interface JournalLine<K extends string = string> {
  at: number;
  kind: K;
  text: string;
}

/** Pushes a line, then drops from the front past `keep` (default 40; 0 or less keeps nothing). Works on a draft. */
export function pushLine<L>(log: L[], line: L, keep = 40): void {
  log.push(line);
  const extra = log.length - Math.max(0, keep);
  if (extra > 0) log.splice(0, extra);
}

/**
 * The lines after `last`: all of them when `last` is undefined, what follows it when it is in the log (found by
 * identity), nothing when it is not (a swapped profile is not news).
 */
export function linesSince<L>(log: readonly L[], last: L | undefined): L[] {
  if (last === undefined) return [...log];
  const at = log.indexOf(last);
  return at < 0 ? [] : log.slice(at + 1);
}
