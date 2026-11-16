/** The argument reader and printers a sim script shares. */

import type { Decimal } from "../core";

/** Reads `--k=v` and `--k` (as `"true"`) from `argv` (default the process's); a later repeat wins, the value is all after the first `=`. */
export function simArgs(argv: readonly string[] = process.argv.slice(2)): Map<string, string> {
  const args = new Map<string, string>();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const body = arg.slice(2);
    const eq = body.indexOf("=");
    if (eq < 0) args.set(body, "true");
    else args.set(body.slice(0, eq), body.slice(eq + 1));
  }
  return args;
}

/** Time as `h:mm`, minutes floored, never negative. */
export function fmtClock(ms: number): string {
  const m = Math.floor(Math.max(0, ms) / 60_000);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/** A Decimal in a few characters: whole below a million, then `e` and one decimal of its log10; zero or less is "0". */
export function shortDecimal(d: Decimal): string {
  if (d.lte(0)) return "0";
  if (d.lt(1e6)) return String(Math.floor(d.toNumber()));
  return `e${d.log10().toNumber().toFixed(1)}`;
}
