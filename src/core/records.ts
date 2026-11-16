import { D, type Decimal, type DecimalSource, isDecimal } from "./decimal";
import { type Feature, type FeatureApi, feature } from "./feature";
import { pushLine } from "./journal";

/**
 * Records: the statistics screen. Named running values, each folded by its kind (a `sum` adds, a `max` keeps the
 * highest, a `min` the lowest, a `last` the latest) and kept at the scopes it names: this run, and the profile's whole
 * life. A run reset pushes the ending run's values onto a short list of past runs, with the run's length in game time,
 * folds them into the best of every run, and starts the run scope over; the life scope never clears.
 */

/** How a record folds a new value in. */
export type RecordKind = "sum" | "max" | "min" | "last";
/** Where a record is kept: this run, or the whole life of the profile. */
export type RecordScope = "run" | "life";

/** One tracked record. */
export interface RecordTrack {
  readonly kind: RecordKind;
  readonly scope: readonly RecordScope[];
  /** Kept as a Decimal (an amount that can outgrow a double); a number otherwise. */
  readonly decimal?: boolean;
  /** Which way a run's value is better, for `best`. Default: lower for `min`, higher for the rest. */
  readonly best?: "high" | "low";
}

/** A record's value: a Decimal for a `decimal` track, else a number. */
export type TrackedValue<T extends RecordTrack> = T extends { readonly decimal: true } ? Decimal : number;
/** Any record's value. */
export type RecordValue = number | Decimal;

/** One finished run: when it ended, how long it lasted in game time, and its run-scope values. */
export interface RunSummary {
  endedAt: number;
  lengthMs: number;
  values: Record<string, RecordValue>;
}

/** The values at each scope: this run, the whole life, and the best of any finished run. */
export interface RecordScopes {
  run: Record<string, RecordValue>;
  life: Record<string, RecordValue>;
  /** The best run-scope value of any finished run. */
  best: Record<string, RecordValue>;
}

/** The records feature's saved state. A record absent from a scope has no value yet (a `max` never noted). */
export interface RecordsState {
  values: RecordScopes;
  /** Finished runs, oldest first, `keepRuns` at most. */
  runs: RunSummary[];
  /** Game time the current run started. */
  runStart: number;
  /** The shortest finished run, or null before the first. */
  bestRunMs: number | null;
}

type Name<T> = keyof T & string;

/** The records feature's actions. */
export interface RecordsActions<T extends Record<string, RecordTrack>> {
  /** Adds to a `sum` (on any other kind, the same as `note`). */
  add<N extends Name<T>>(name: N, n: DecimalSource): void;
  /** Folds a value in by the record's kind, at every scope it keeps. */
  note<N extends Name<T>>(name: N, value: DecimalSource): void;
  run<N extends Name<T>>(name: N): TrackedValue<T[N]> | undefined;
  life<N extends Name<T>>(name: N): TrackedValue<T[N]> | undefined;
  best<N extends Name<T>>(name: N): TrackedValue<T[N]> | undefined;
}

/** Any game state holding the feature's slice under its key. */
export type RecordsGame<K extends string> = { readonly [P in K]: RecordsState };

/** The read-only questions over state, for recipes, steps, callbacks and screens. */
export interface RecordsSelect<K extends string, T extends Record<string, RecordTrack>> {
  /** A record's value at a scope (`run`, `life` or the `best` of any finished run), or undefined before it has one. */
  value<N extends Name<T>>(
    state: RecordsGame<K>,
    scope: RecordScope | "best",
    name: N,
  ): TrackedValue<T[N]> | undefined;
}

/** The fixed configuration of a records feature. */
export interface RecordsDefs<T extends Record<string, RecordTrack>> {
  /** Each record's name and how it folds and where it is kept. */
  readonly track: T;
}

/** The helpers that take a draft first and change it, named like the actions they mirror. */
export interface RecordsDraftHelpers<T extends Record<string, RecordTrack>> {
  /** `add` inside a recipe or step. */
  add<N extends Name<T>>(draft: object, name: N, n: DecimalSource): void;
  /** `note` inside a recipe or step. */
  note<N extends Name<T>>(draft: object, name: N, value: DecimalSource): void;
}

/** The three namespaces of a records feature. */
export interface RecordsHelpers<K extends string, T extends Record<string, RecordTrack>> {
  readonly select: RecordsSelect<K, T>;
  readonly def: RecordsDefs<T>;
  readonly draft: RecordsDraftHelpers<T>;
}

/** A `records` feature: the feature plus `select`, `def` and `draft`. */
export type RecordsFeature<K extends string, T extends Record<string, RecordTrack>> = Feature<
  K,
  RecordsState,
  RecordsActions<T>
> &
  RecordsHelpers<K, T>;

/** Folds `value` into `was` by `kind`. */
function fold(
  kind: RecordKind,
  decimal: boolean,
  was: RecordValue | undefined,
  value: DecimalSource,
): RecordValue {
  if (decimal) {
    const v = D(value);
    if (was === undefined) return v;
    const w = D(was);
    if (kind === "sum") return w.add(v);
    if (kind === "max") return v.gt(w) ? v : w;
    if (kind === "min") return v.lt(w) ? v : w;
    return v;
  }
  const v = isDecimal(value) ? value.toNumber() : Number(value);
  if (was === undefined) return v;
  const w = isDecimal(was) ? was.toNumber() : was;
  if (kind === "sum") return w + v;
  if (kind === "max") return Math.max(w, v);
  if (kind === "min") return Math.min(w, v);
  return v;
}

/** Whether `a` beats `b` in the direction `high` or `low`. */
function beats(a: RecordValue, b: RecordValue, way: "high" | "low"): boolean {
  const cmp = D(a).cmp(D(b));
  return way === "high" ? cmp > 0 : cmp < 0;
}

/**
 * Statistics as a feature. `track` maps each record's name to `{ kind, scope, decimal?, best? }`; it saves
 * `RecordsState` under `key`. The draft helpers `draft.add(draft, name, n)` and `draft.note(draft, name, value)` fold a
 * value in from a recipe or a step, the actions of the same names from outside; `select.value(state, scope, name)`
 * reads one and `def.track` holds the tracks. A run reset (the feature's own `reset`) pushes
 * the run scope onto `runs` (`keepRuns`, default 10) with the run's length, folds it into `best` and `bestRunMs`, and
 * clears it; the life scope stays. No steps: the game notes what it counts where it happens.
 */
export function records<const K extends string, const T extends Record<string, RecordTrack>>(def: {
  readonly key: K;
  readonly track: T;
  readonly keepRuns?: number;
}): RecordsFeature<K, T> {
  const names = Object.keys(def.track);
  const keep = def.keepRuns ?? 10;
  type Own = Record<K, RecordsState>;
  const own = (draft: unknown): RecordsState => (draft as Own)[def.key];
  const zero = (t: RecordTrack): RecordValue => (t.decimal ? D(0) : 0);
  /** A fresh scope: every `sum` that keeps it at zero, the rest absent. */
  const scope = (which: RecordScope): Record<string, RecordValue> =>
    Object.fromEntries(
      names.flatMap((n) => {
        const t = def.track[n];
        return t && t.kind === "sum" && t.scope.includes(which) ? [[n, zero(t)]] : [];
      }),
    );

  const note = (draft: object, name: string, value: DecimalSource): void => {
    const t = def.track[name];
    if (!t) return;
    const s = own(draft);
    for (const which of t.scope)
      s.values[which][name] = fold(t.kind, t.decimal === true, s.values[which][name], value);
  };
  const value = (slice: RecordsState, at: RecordScope | "best", name: string) =>
    slice.values[at][name] as TrackedValue<T[Name<T>]> | undefined;

  const made = feature({
    key: def.key,
    initial: (ctx): RecordsState => ({
      values: { run: scope("run"), life: scope("life"), best: {} },
      runs: [],
      runStart: ctx.now,
      bestRunMs: null,
    }),
    reset: (before, fresh, ctx) => {
      const lengthMs = Math.max(0, ctx.now - before.runStart);
      const best = { ...before.values.best };
      for (const n of names) {
        const t = def.track[n];
        const v = before.values.run[n];
        if (!t || v === undefined) continue;
        const way = t.best ?? (t.kind === "min" ? "low" : "high");
        const had = best[n];
        if (had === undefined || beats(v, had, way)) best[n] = v;
      }
      const runs = [...before.runs];
      pushLine(runs, { endedAt: ctx.now, lengthMs, values: { ...before.values.run } }, keep);
      return {
        ...fresh,
        values: { run: fresh.values.run, life: before.values.life, best },
        runs,
        runStart: ctx.now,
        bestRunMs: before.bestRunMs === null ? lengthMs : Math.min(before.bestRunMs, lengthMs),
      };
    },
    actions: (api: FeatureApi<Own>): RecordsActions<T> => ({
      add: (name, n) => api.set((d) => note(d, name, n)),
      note: (name, v) => api.set((d) => note(d, name, v)),
      run: (name) => value(own(api.get()), "run", name),
      life: (name) => value(own(api.get()), "life", name),
      best: (name) => value(own(api.get()), "best", name),
    }),
  });
  const helpers: RecordsHelpers<K, T> = {
    select: { value: (state, at, name) => value(state[def.key], at, name) },
    def: { track: def.track },
    draft: { add: note, note },
  };
  return Object.assign(made, helpers);
}
