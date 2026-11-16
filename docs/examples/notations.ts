import { type Formatter, formatter, NOTATIONS, type Notation } from "watchpot/core";

/** The settings screen's choices: one formatter per notation, built once. */
export const FORMATTERS: Record<Notation, Formatter> = Object.fromEntries(
  NOTATIONS.map((n) => [n, formatter({ notation: n })]),
) as Record<Notation, Formatter>;

/** The preview row the screen shows under each choice. */
export function preview(n: Notation): string {
  return [1234, 1.5e7, 2.2e12, 1e308].map((v) => FORMATTERS[n].num(v)).join(" · ");
}

if (import.meta.main) for (const n of NOTATIONS) console.log(`${n}: ${preview(n)}`);
// suffix: 1,234 · 15.00M · 2.20T · 1.00e308
// scientific: 1,234 · 1.50e7 · 2.20e12 · 1.00e308
// engineering: 1,234 · 15.0e6 · 2.20e12 · 100e306
// letters: 1,234 · 15.00b · 2.20d · 100.00cx
// logarithm: 1,234 · e7.17 · e12.34 · e308.00
