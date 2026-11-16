# Notations

How a big number reads, as a player's setting. Every notation prints plain digits with separators below its plain
range, floors its mantissa (nothing is rounded up in the player's favour), and prints infinity as `∞`; past the plain
range each has its own form. `NOTATIONS` lists them for a settings screen, and `formatter({ notation })` binds one to
every printer, so a game builds its formatter from the saved choice and passes it down.

```ts
import { type Formatter, formatter, NOTATIONS, type Notation } from "watchpot/core";

export const FORMATTERS = Object.fromEntries(NOTATIONS.map((n) => [n, formatter({ notation: n })])) as Record<
  Notation,
  Formatter
>;
// FORMATTERS[n].num(v) for 1234, 1.5e7, 2.2e12, 1e308:
// suffix       1,234 · 15.00M · 2.20T · 1.00e308
// scientific   1,234 · 1.50e7 · 2.20e12 · 1.00e308
// engineering  1,234 · 15.0e6 · 2.20e12 · 100e306
// letters      1,234 · 15.00b · 2.20d · 100.00cx
// logarithm    1,234 · e7.17 · e12.34 · e308.00
```

Example: [`examples/notations.ts`](examples/notations.ts) (runs with `bun docs/examples/notations.ts`).

- **`suffix`** (the default) and **`scientific`**: K to Dc then `1.00e36`; `1.23e45` from `plainBelow`.
- **`engineering`**: the exponent a multiple of 3 and three figures (`100e3`, `12.3e6`, `1.00e9`).
- **`letters`**: `a` per thousand, then `b`, … `z`, `aa`, `ab` … (`letterSuffix(n)`, bijective base 26), two
  decimals: `999.99b`, then `1.00c`.
- **`logarithm`**: the exponent alone to two decimals: `e12.34`; the `Formatted` mantissa is that exponent and the
  suffix is empty.
- **The plain range:** every notation but `suffix` honours `plainBelow` (default `PLAIN_BELOW`, 100,000). An exponent
  from 1,000 is grouped (`20.0e3,000`, `e1,234.00`). Past an exponent of 1e15 the three newer notations print the
  logarithm itself in scientific (`e1.00e20`). Negative values take a leading `-`; zero is `0`; NaN reads `0`.
