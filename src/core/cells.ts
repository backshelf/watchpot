import type { FeatureSpec } from "./feature";

/**
 * Derived values, kept the way a spreadsheet keeps its cells. A feature's `derived` block names values worked out
 * from the state; each is a cell. A cell remembers which slices and which other cells it read when it was last
 * worked out, and is worked out again only when one of those may have changed since, and only when something reads
 * it. One cell reading another gives the order; a cell that ends up reading itself is an error that names the loop.
 *
 * What "may have changed" means: every recipe and every step is handed the game through `view`, which notes the
 * slices it takes hold of. When the step ends, those slices count as written. So a cell is current as of the start
 * of the step or recipe that reads it: a step sees what every earlier step did, and not its own writes.
 */
export interface Cells {
  /** False when no feature declares a derived value: the game's state is then handed out as it is. */
  readonly any: boolean;
  /** The derived names of a feature, for the save (they never save) and the definition checks. */
  names(key: string): readonly string[];
  /**
   * The game as a step or a recipe sees it, over `root` (an immer draft or a plain state): a derived value read
   * through it is current, and the slices taken through it count as written once `close` is called.
   */
  view<T extends object>(root: T): T;
  /** The state under a view (or the value itself when it is not one): for the engine's own writes. */
  raw<T extends object>(view: T): T;
  /** Ends a step or a recipe: every slice taken through the view since the last close counts as written. */
  close(): void;
  /**
   * Whether taking a slice through the view counts as writing it (default: it does). A holder whose state is read
   * through the view between recipes turns it off there, so a read is only a read.
   */
  record(on: boolean): void;
  /** Every slice counts as written: after a reset, a load or an import, which write under the view. */
  touchAll(): void;
  /** Works out every cell that is not current and writes it into its slice of `root`. */
  settle(root: object): void;
}

type Slices = Record<string, Record<string, unknown>>;

interface Cell {
  readonly key: string;
  readonly name: string;
  readonly compute: (state: never) => unknown;
  /** Slice versions seen at the last compute, by slice key; null before the first. */
  seen: Map<string, number> | null;
  /** Cells read at the last compute, with the stamp each had. */
  cells: Map<Cell, number>;
  /** Moves when the value does: a cell reading this one is stale only then. */
  stamp: number;
  computing: boolean;
}

const hasEq = (v: unknown): v is { eq(other: unknown): boolean } =>
  typeof v === "object" && v !== null && typeof (v as { eq?: unknown }).eq === "function";

/** Whether a recomputed value is the one already held: identical, or two Decimals that are equal. */
const same = (a: unknown, b: unknown): boolean => Object.is(a, b) || (hasEq(a) && hasEq(b) && a.eq(b));

const NONE: Cells = {
  any: false,
  names: () => [],
  view: (root) => root,
  raw: (view) => view,
  close: () => {},
  record: () => {},
  touchAll: () => {},
  settle: () => {},
};

/** The cells of a game's features: one set per store (or per sim run), since it remembers what it has seen. */
export function createCells(features: readonly FeatureSpec[]): Cells {
  const byKey = new Map<string, Map<string, Cell>>();
  const all: Cell[] = [];
  for (const f of features) {
    const names = Object.keys(f.derived);
    if (names.length === 0) continue;
    const mine = new Map<string, Cell>();
    for (const name of names) {
      const cell: Cell = {
        key: f.key,
        name,
        // Declared over the feature's own slice and reach, which the game's state has.
        compute: f.derived[name] as (state: never) => unknown,
        seen: null,
        cells: new Map(),
        stamp: 0,
        computing: false,
      };
      mine.set(name, cell);
      all.push(cell);
    }
    byKey.set(f.key, mine);
  }
  if (all.length === 0) return NONE;

  const versions = new Map<string, number>();
  const versionOf = (key: string): number => versions.get(key) ?? 0;
  /** Slices taken through the view since the last close. */
  const touched = new Set<string>();
  /** The cell being worked out, innermost last: what a read inside a compute is recorded against. */
  const stack: Cell[] = [];

  const current = (cell: Cell, root: Slices): boolean => {
    if (!cell.seen) return false;
    for (const [key, version] of cell.seen) if (versionOf(key) !== version) return false;
    for (const [dep, stamp] of cell.cells) {
      ensure(dep, root);
      if (dep.stamp !== stamp) return false;
    }
    return true;
  };

  /** Brings a cell up to date in its slice of `root`, and returns its value. */
  const ensure = (cell: Cell, root: Slices): unknown => {
    const slice = root[cell.key];
    if (!slice) throw new Error(`derived "${cell.key}.${cell.name}": no feature "${cell.key}" in the state`);
    if (cell.computing) {
      const from = stack.indexOf(cell);
      const loop = [...stack.slice(from), cell].map((c) => `${c.key}.${c.name}`).join(" → ");
      throw new Error(`derived values read each other in a loop: ${loop}`);
    }
    if (current(cell, root)) return slice[cell.name];
    const seen = new Map<string, number>();
    const cells = new Map<Cell, number>();
    const reads = new Proxy(root, {
      get(target, key) {
        if (typeof key !== "string") return Reflect.get(target, key);
        const read = target[key];
        if (read === undefined || typeof read !== "object" || read === null) return read;
        const theirs = byKey.get(key);
        if (!theirs) {
          seen.set(key, versionOf(key));
          return read;
        }
        // A slice with cells counts as read only when a field of it is: reading its cell waits on the cell alone.
        return new Proxy(read, {
          get(sliceTarget, prop) {
            const dep = typeof prop === "string" ? theirs.get(prop) : undefined;
            if (!dep) {
              seen.set(key, versionOf(key));
              return Reflect.get(sliceTarget, prop);
            }
            const value = ensure(dep, root);
            cells.set(dep, dep.stamp);
            return value;
          },
        });
      },
    });
    cell.computing = true;
    stack.push(cell);
    let value: unknown;
    try {
      value = cell.compute(reads as never);
    } finally {
      stack.pop();
      cell.computing = false;
    }
    cell.seen = seen;
    cell.cells = cells;
    if (!(cell.name in slice) || !same(slice[cell.name], value)) {
      slice[cell.name] = value;
      cell.stamp += 1;
    }
    return value;
  };

  const views = new WeakMap<object, object>();
  let recording = true;
  const roots = new WeakMap<object, object>();

  return {
    any: true,
    names: (key) => [...(byKey.get(key)?.keys() ?? [])],
    view<T extends object>(root: T): T {
      const made = views.get(root);
      if (made) return made as T;
      const slices = root as Slices;
      /** One view per slice that has cells, made on first use. */
      const sliceViews = new Map<string, object>();
      const view = new Proxy(root, {
        get(target, key) {
          if (typeof key !== "string") return Reflect.get(target, key);
          const read = (target as Slices)[key];
          if (read === undefined || typeof read !== "object" || read === null) return read;
          if (recording) touched.add(key);
          const mine = byKey.get(key);
          if (!mine) return read;
          let sliceView = sliceViews.get(key);
          if (!sliceView) {
            sliceView = new Proxy(read, {
              get(_t, prop) {
                // Read through the root each time: a reset may have replaced what the slice holds.
                const live = slices[key] ?? read;
                const cell = typeof prop === "string" ? mine.get(prop) : undefined;
                return cell ? ensure(cell, slices) : Reflect.get(live, prop);
              },
              set(_t, prop, value) {
                if (typeof prop === "string" && mine.has(prop))
                  throw new Error(
                    `"${key}.${prop}" is a derived value: it is worked out from the state, never written`,
                  );
                return Reflect.set(slices[key] ?? read, prop, value);
              },
            });
            sliceViews.set(key, sliceView);
          }
          return sliceView;
        },
      });
      views.set(root, view);
      roots.set(view, root);
      return view;
    },
    raw: <T extends object>(view: T): T => (roots.get(view) as T | undefined) ?? view,
    record(on) {
      recording = on;
    },
    close() {
      for (const key of touched) versions.set(key, versionOf(key) + 1);
      touched.clear();
    },
    touchAll() {
      touched.clear();
      for (const f of features) versions.set(f.key, versionOf(f.key) + 1);
    },
    settle(root) {
      for (const cell of all) ensure(cell, root as Slices);
    },
  };
}
