// Fixture for `decimalComparisons`: every line ending in `// flag` must be reported, and no other line.
import { D, type Decimal, type DecimalSource } from "../../../../src/core/decimal.ts";

const a: Decimal = D(3);
const b: Decimal = D(20);
const maybe: Decimal | null = Math.random() > 2 ? null : a;
const source: DecimalSource = Math.random() > 2 ? 1 : b;
const n: number = 3;
const m: number = 20;
const empty: readonly [] = [];

export const flagged = [
  a < b, // flag
  a <= b, // flag
  a > b, // flag
  a >= b, // flag
  // biome-ignore lint/suspicious/noDoubleEquals: the operator under test
  a == b, // flag
  // biome-ignore lint/suspicious/noDoubleEquals: the operator under test
  a != b, // flag
  a === b, // flag
  a !== b, // flag
  // biome-ignore lint/suspicious/noSelfCompare: the comparison under test
  D(1) === D(1), // flag
  maybe === a, // flag
  source < a, // flag
];

export const passed = [
  n < m,
  n === m,
  a.lt(b),
  a.eq(b),
  a.gte(b),
  maybe === null,
  maybe !== undefined,
  maybe == null,
  a.toNumber() > n,
  // TypeScript 7.0.2's API server panics on this operand's type (microsoft/typescript-go#4804): the check survives it.
  ([] satisfies readonly []) === empty,
];
