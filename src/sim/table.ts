/**
 * The fit table: the fitted price of every gate, live. The game reads a gate's price through it; the fit writes each
 * price into it as it sets it, so a gate priced a minute ago is payable now; the finished table is saved as plain data
 * (`data()`, or `fitTableSource` for a module) and committed, and loaded back as the game starts.
 */

import { D, type Decimal } from "../core";

/** A price nothing can pay: what an unfitted gate costs until a fit has priced it. */
export const BLOCKED = "1e999999999";
const BLOCKED_D = D(BLOCKED);

/** A fit table's plain data: each priced gate's figure as written. */
export type FitTableData<K extends string = string> = Partial<Record<K, string>>;

/** A live table of fitted prices (`fitTable`). */
export interface FitTable<K extends string = string> {
  /** The gate's price, or `BLOCKED` (as a Decimal) for a gate the table does not hold: nothing unfitted is payable. */
  get(key: K): Decimal;
  /** The gate's figure as written, or undefined for an unfitted gate. */
  figure(key: K): string | undefined;
  /** Whether the gate has a price. */
  has(key: K): boolean;
  /** Prices a gate (a figure Decimal reads: `"150"`, `"2.5e7"`), or shuts it again with null. */
  set(key: K, figure: string | null): void;
  /** Counts every change: whatever is worked out from the table knows when to work it out again. */
  version(): number;
  /** Every priced gate's figure, as plain data: what a fit saves and a snapshot carries. */
  data(): FitTableData<K>;
  /** Replaces everything the table holds with `data`. */
  load(data: FitTableData<K>): void;
}

/** What a figure is written in: digits, points, exponents and signs (`150`, `2.5e7`, `1e1e10`). */
const NUMERAL = /^[+-]?(\d|\.\d|e)[\d.e+-]*$/i;

/** Whether a price is the one an unfitted gate reads as (so a screen can leave the gate off the shelf). */
export const isBlocked = (price: Decimal): boolean => price.gte(BLOCKED_D);

/**
 * A live fit table, holding `initial` (the committed table, usually the `FIT` module `fitTableSource` wrote). The game
 * keeps one (a module-level constant, read wherever a gate's price is read); the fit script sets prices into it while
 * it runs.
 */
export function fitTable<K extends string = string>(initial: FitTableData<K> = {}): FitTable<K> {
  const written = new Map<K, string>();
  const live = new Map<K, Decimal>();
  let version = 0;
  const set = (key: K, figure: string | null): void => {
    version++;
    if (figure === null) {
      written.delete(key);
      live.delete(key);
      return;
    }
    const value = D(figure);
    if (!NUMERAL.test(figure) || !value.isFinite())
      throw new Error(`fitTable: "${figure}" is not a price (gate "${key}")`);
    written.set(key, figure);
    live.set(key, value);
  };
  const load = (data: FitTableData<K>): void => {
    written.clear();
    live.clear();
    for (const [k, v] of Object.entries(data) as [K, string | undefined][]) if (v !== undefined) set(k, v);
    version++;
  };
  load(initial);
  return {
    get: (key) => live.get(key) ?? BLOCKED_D,
    figure: (key) => written.get(key),
    has: (key) => written.has(key),
    set,
    version: () => version,
    data: () => Object.fromEntries(written) as FitTableData<K>,
    load,
  };
}

/** Options for `fitTableSource`. */
export interface FitTableSourceOptions {
  /** A line comment at the top (each line of it). */
  header: string;
  /** The module the key type is imported from. */
  planImport: string;
  /** The key type's name there. */
  keyType: string;
  /** A draft (not proved): the first line says so. */
  draft?: boolean;
  /** The order gates are written in (the plan's); keys it leaves out follow in the table's order. */
  order?: readonly string[];
}

/** The line a draft table starts with. */
export const DRAFT_LINE = "// DRAFT: not proved. Fit again with the proof before a checkpoint.";

/**
 * The text of a table module: a draft line when it is one, `header` as a line comment, a type import of `keyType`
 * from `planImport`, and `export const FIT: Partial<Record<keyType, string>>` with a line per priced gate. The game
 * loads it with `fitTable(FIT)`; a gate it leaves out reads as `BLOCKED`.
 */
export function fitTableSource(table: FitTable | FitTableData, options: FitTableSourceOptions): string {
  const data: FitTableData =
    typeof table.data === "function" ? (table as FitTable).data() : (table as FitTableData);
  const name = (k: string) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));
  const keys = Object.keys(data);
  const order = options.order ?? [];
  const ordered = [...order.filter((k) => data[k] !== undefined), ...keys.filter((k) => !order.includes(k))];
  return [
    ...(options.draft ? [DRAFT_LINE] : []),
    ...options.header.split("\n").map((line) => `// ${line}`.trimEnd()),
    `import type { ${options.keyType} } from ${JSON.stringify(options.planImport)};`,
    "",
    `export const FIT: Partial<Record<${options.keyType}, string>> = {`,
    ...ordered.map((k) => `  ${name(k)}: ${JSON.stringify(data[k])},`),
    "};",
    "",
  ].join("\n");
}
