import { current, type Draft, isDraft } from "immer";
import { type PersistStorage, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { createStore } from "zustand/vanilla";
import { createCells } from "./cells";
import { readClock, writeClock } from "./clock-feature";
import { D, type Decimal, isDecimal } from "./decimal";
import {
  type FeatureApi,
  type FeatureSpec,
  type IdleStoreApi,
  type InitialContext,
  type ResetRunContext,
  resetRuleOf,
  type StateOf,
} from "./feature";
import type { Game } from "./game";
import { registerStore, type SaveNotes } from "./persist";
import { type RngState, randomSeed, seedRng } from "./rng";
import { decodeProfile, encodeProfile, migrate, SaveError } from "./save";
import {
  asPersisted,
  createGameStorage,
  createMemoryBackend,
  type GameStorage,
  isPlainObject,
  KEPT_SUFFIX,
  localStorageBackend,
  type PersistedState,
} from "./storage";
import { runPass } from "./tick";

/**
 * The store over a game: every feature's state and actions under its key, the game's own actions, and the root
 * actions below, persisted to the storage with the saved shape the features declare. One wall read, the `now`
 * option, which the caller supplies (the engine never reads the wall itself); `gameNow()` adds the clock's offset.
 */
export interface RootActions {
  /** The game clock: the wall plus the clock's offset. The one clock the game reads. */
  gameNow(): number;
  /** One live tick of `dtMs` ending at `now` (game time). */
  tick(dtMs: number, now?: number): void;
  /** The catch-up pass over the gap since `lastSeen`, ending at `now` (game time). Called on load and on return. */
  catchUp(now?: number): void;
  /** Back to a fresh profile, offset zero, at wall time `now`. */
  resetProfile(now?: number): void;
  /**
   * The prestige reset: every feature follows its `reset` rule; the clock's anchors land on `now` (game time).
   * `rng` defaults to `rng("run:<createdAt>")`, the label read off the save (the start of the run that ends), so a
   * seeded profile draws the same whether or not it was reloaded since its last reset. `depth` (default 1) is how
   * deep the reset reaches: a feature whose rule says `{ depth: 2 }` is untouched by anything shallower.
   */
  resetRun(ctx?: ResetRunContext): void;
  /** The profile as a tagged-JSON string. */
  exportProfile(now?: number): string;
  /**
   * Replaces the profile from an export at wall time `now`; `lastSeen` lands at `now` plus the imported offset,
   * so the next catch-up credits no offset. Throws `SaveError` on a bad file.
   */
  importProfile(json: string, now?: number): void;
}

/**
 * The store `createIdleStore` returns: the game's state plus the root actions, under persist and immer, and
 * `hydrated`, which settles once the save is loaded, whatever the load found. On a `StorageBackend` it already has
 * when `createIdleStore` returns; on an async one, play waits for it: until then the store holds a new profile and
 * writes nothing.
 */
export type IdleStore<S extends object> = IdleStoreApi<S & RootActions> & {
  readonly hydrated: Promise<void>;
  /**
   * How many times the profile has been replaced under this store: an import or a profile reset. It moves before
   * the change is published, so a subscriber that compares it with the count it last saw knows the change in front
   * of it is not play (`watchChanges` does).
   */
  profileSwaps(): number;
};

/** Options for `createIdleStore`: the storage, the save key, the required `now`, the seed and entropy. */
export interface IdleStoreOptions {
  /** The persist storage; defaults to localStorage, or memory (not durable) where there is none. */
  storage?: GameStorage;
  /** The save key; defaults to the game's `save.key`. */
  name?: string;
  /** The wall clock, the store's one wall read. Required: the engine never reads the wall itself. */
  now: () => number;
  /**
   * Seeds a new profile's draws, and each run reset's from this seed and a label; without it they draw from
   * entropy. A profile reset or an import always draws fresh entropy; a hydrated save keeps its own state.
   */
  seed?: string | number;
  /** The entropy behind unseeded draws. Default `Math.random`. */
  entropy?: () => number;
}

type Slices = Record<string, Record<string, unknown>>;

/**
 * Each feature's persisted data, by the state object it came from. Immer keeps an unchanged feature's object, so
 * one that did not change hands back the same frozen data, which the storage's write cache keys its JSON by.
 */
const persistedBySlice = new WeakMap<object, Readonly<Record<string, unknown>>>();

/** The saved fields of every feature. The data objects are frozen and shared: read them, never write them. */
export function partializeState(features: readonly FeatureSpec[], state: object): PersistedState {
  const out: PersistedState = {};
  for (const f of features) {
    const slice = (state as Slices)[f.key] ?? {};
    let data = persistedBySlice.get(slice);
    if (!data) {
      const fresh: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(slice)) {
        if (typeof v === "function" || f.transient.includes(k) || k in f.derived) continue;
        fresh[k] = v;
      }
      data = Object.freeze(fresh);
      persistedBySlice.set(slice, data);
    }
    out[f.key] = data;
  }
  return out;
}

/**
 * Saved fields over a feature's current data, keeping the actions. A saved `undefined` is a missing field (the
 * default stays). Under a Decimal default a saved Decimal, number or string is read as one, and anything else, or
 * what reads as NaN, leaves the default; a plain-object default under a plain-object save is filled one level down,
 * so a key added since the save loads as its default. The feature's `merge` then runs over the result.
 */
export function mergeFeature<T extends object>(f: FeatureSpec, fresh: T, saved: unknown): T {
  if (!isPlainObject(saved)) return fresh;
  const next: Record<string, unknown> = { ...(fresh as Record<string, unknown>) };
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined || typeof v === "function" || !(k in next) || typeof next[k] === "function") continue;
    const def = next[k];
    if (isDecimal(def)) next[k] = savedDecimal(v) ?? def;
    else if (isPlainObject(def) && isPlainObject(v)) next[k] = { ...def, ...v };
    else next[k] = v;
  }
  // `merge` was declared over the feature's own `S`, which `fresh` is.
  return f.merge ? ({ ...next, ...f.merge(next as never, fresh as never) } as T) : (next as T);
}

/** A saved value as a Decimal, or null when it is not one, a number or a string, or reads as NaN. */
function savedDecimal(v: unknown): Decimal | null {
  if (!isDecimal(v) && typeof v !== "number" && typeof v !== "string") return null;
  const d = D(v);
  return d.isNan() ? null : d;
}

/** localStorage, or a memory backend that says it is not durable, so the window can say nothing is being saved. */
function defaultStorage(): GameStorage {
  const local = localStorageBackend();
  return local ? createGameStorage(local) : createGameStorage(createMemoryBackend(), { durable: false });
}

type Slice = Record<string, unknown>;

/** A plain snapshot of a draft (or the value itself when it is not one). */
const plain = (value: Slice): Slice => (isDraft(value) ? current(value as Draft<Slice>) : value);

/**
 * Builds the zustand store a game runs from its definition: every feature's state and actions, the tick and the save.
 * Where there is a page it flushes the save itself when the page hides, clock or no clock (`registerStore`).
 */
export function createIdleStore<F extends readonly FeatureSpec[], R extends object>(
  game: Game<F, R>,
  options: IdleStoreOptions,
): IdleStore<StateOf<F> & R> {
  type State = StateOf<F> & R & RootActions;
  const { features, clock } = game;
  const storage = options.storage ?? defaultStorage();
  const wall = options.now;
  const random = options.entropy ?? Math.random;
  const entropy = (): RngState => randomSeed(wall(), random);
  const rng = (label: string): RngState =>
    options.seed === undefined ? entropy() : seedRng(`${options.seed}:${label}`);
  /** A new profile's first draws: the seed's own stream when seeded (the same every call), else entropy. */
  const firstDraws = (): RngState => (options.seed === undefined ? entropy() : seedRng(options.seed));
  const firstRng = firstDraws();
  const name = options.name ?? game.save.key;
  const version = game.save.version;
  /** A run reset's default rng: labelled by the start of the run that ends, which the save holds. */
  const runRng = (s: object): RngState => rng(`run:${readClock(s, clock).createdAt}`);
  /** False until the save is loaded: a write before then would land a new profile over it. */
  let loaded = false;
  /** Imports and profile resets so far: `profileSwaps`. */
  let swaps = 0;
  /** A copy of a save this build will not use, still being written (async backends). */
  let keeping: void | Promise<void>;
  /** Why a save was set aside or saving is blocked: `saveSetAside` and `saveBlockedBy` read it. */
  const notes: SaveNotes = { setAside: null, blockedBy: null };
  /** True while a recipe runs: a `set` inside one would be lost under the outer recipe's result. */
  let drafting = false;
  /** True while a recipe's result is being published: any other change went round the recipes. */
  let publishing = false;
  /** Works the derived values out again over the state as it stands. */
  let resettle = () => {};
  let settle = () => {};
  const hydrated = new Promise<void>((resolve) => {
    settle = resolve;
  });
  const gated: PersistStorage<PersistedState> = {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => {
      if (loaded) return storage.setItem(key, value);
    },
    removeItem: (key) => storage.removeItem(key),
  };

  /** The derived values: worked out on a new state, a load, a reset, and after every recipe and step. */
  const cells = createCells(features);
  /** Every derived value worked out onto a plain state the store is about to hold. */
  const fill = <T extends object>(s: T): T => {
    cells.touchAll();
    cells.settle(s);
    return s;
  };

  /** Draft helper: every feature back to `initial`, then the clock's anchors on `now` with its offset zeroed. */
  const resetAll = (view: object, ctx: InitialContext): void => {
    const s = cells.raw(view);
    for (const f of features) Object.assign((s as Slices)[f.key] ?? {}, f.initial(ctx));
    writeClock(s, clock, { createdAt: ctx.now, lastSeen: ctx.now, offsetMs: 0 });
    cells.touchAll();
  };

  /** Draft helper: the prestige reset. Each feature by its rule; the clock's anchors on `now`, its offset kept. */
  const resetRun = (view: object, now: number, next: RngState, depth = 1): void => {
    const s = cells.raw(view);
    const { offsetMs } = readClock(s, clock);
    const ctx: InitialContext = { now, wallNow: now - offsetMs, rng: next, reason: "run", depth };
    for (const f of features) {
      const { depth: from, rule } = resetRuleOf(f.reset);
      if (depth < from) continue;
      const slot = (s as Slices)[f.key] ?? {};
      const fresh = f.initial(ctx);
      if (rule === "run") {
        Object.assign(slot, fresh);
        continue;
      }
      const before = plain(slot);
      if (typeof rule === "function") {
        // Declared over the feature's own `S`, which `before` and `fresh` are.
        Object.assign(slot, rule(before as never, fresh as never, ctx));
        continue;
      }
      Object.assign(slot, fresh);
      for (const k of rule.keep) slot[k] = before[k];
    }
    writeClock(s, clock, { createdAt: now, lastSeen: now, offsetMs });
    cells.touchAll();
  };

  /** A step's `resetRun`: the run reset inside the pass's recipe, at the pass's `now` unless told otherwise. */
  const stepReset =
    (at: number) =>
    (draft: object, ctx: ResetRunContext = {}): void =>
      resetRun(draft, ctx.now ?? at, ctx.rng ?? runRng(draft), ctx.depth);

  const store = createStore<State>()(
    persist(
      immer((set, get, api) => {
        /**
         * Runs a recipe over the draft and hands back what it returns (immer itself would take a returned value for
         * the next state). A recipe run inside another throws: the outer one's result would land over its change.
         */
        const draft = <T>(recipe: (s: Draft<State>) => T): T => {
          if (drafting)
            throw new Error(
              "watchpot: an action was called inside a recipe (a `set` or a step), where its change would be lost under the outer one's. Call the draft helper on the draft in hand instead (`wallet.draft.credit(draft, …)`), or call the action once the recipe has returned.",
            );
          let out: T | undefined;
          const run = (s: Draft<State>): void => {
            drafting = true;
            try {
              out = recipe(cells.view(s));
              cells.close();
              cells.settle(s);
            } finally {
              drafting = false;
            }
          };
          publishing = true;
          try {
            // immer's `set` is typed over `Exclude<State, Function>`, which is `State` here (a generic the checker
            // cannot reduce).
            (set as (fn: (s: Draft<State>) => void) => void)(run);
          } finally {
            publishing = false;
          }
          return out as T;
        };
        resettle = () => draft(() => {});
        const featureApi: FeatureApi<State> = {
          set: draft,
          get,
          now: () => get().gameNow(),
          rng,
          resetRun: (draft, ctx = {}) =>
            resetRun(draft, ctx.now ?? get().gameNow(), ctx.rng ?? runRng(draft), ctx.depth),
          // zustand types the persist mutator as `unknown` inside the initializer, whatever the persisted shape.
          store: api as IdleStoreApi<State>,
        };
        const born = wall();
        const initial: InitialContext = { now: born, wallNow: born, rng: firstRng, reason: "new" };
        const slices: Slices = {};
        // Each feature's api is the same object: `set`, `get` and the clock are the game's, not the feature's.
        for (const f of features)
          slices[f.key] = { ...f.initial(initial), ...f.actions(featureApi as never) };
        const root: RootActions = {
          gameNow: () => wall() + readClock(get(), clock).offsetMs,
          tick: (dtMs, at = get().gameNow()) =>
            draft((s) => {
              runPass(game, s, { pass: "tick", now: at, dtMs, resetRun: stepReset(at) }, cells.close);
            }),
          catchUp: (at = get().gameNow()) =>
            draft((s) => {
              const last = readClock(s, clock).lastSeen;
              runPass(
                game,
                s,
                { pass: "catchUp", now: at, dtMs: last > 0 ? at - last : 0, resetRun: stepReset(at) },
                cells.close,
              );
            }),
          resetProfile: (at = wall()) =>
            draft((s) => {
              swaps += 1;
              resetAll(s, { now: at, wallNow: at, rng: entropy(), reason: "reset" });
            }),
          resetRun: (ctx = {}) =>
            draft((s) => {
              resetRun(s, ctx.now ?? get().gameNow(), ctx.rng ?? runRng(s), ctx.depth);
            }),
          exportProfile: (at = get().gameNow()) => {
            if (!loaded) throw new SaveError("not-loaded");
            return encodeProfile(partializeState(features, get()), at, version);
          },
          importProfile: (json, at = wall()) => {
            if (!loaded) throw new SaveError("not-loaded");
            const saved = asPersisted(decodeProfile(json, version, game).state);
            if (!saved) throw new SaveError("bad-shape");
            // The first draws a new profile gets, so a slice the save lacks starts on the same stream whether the
            // profile was imported or carried on from construction: a seeded replay from a save does not part ways.
            // The offset the import brings, read before any `initial` runs, so each is handed game time.
            const holder = features.find((f) => f.key === clock.feature);
            const probe: InitialContext = { now: at, wallNow: at, rng: firstDraws(), reason: "import" };
            const offsetMs = holder
              ? readClock(
                  { [holder.key]: mergeFeature(holder, holder.initial(probe), saved[holder.key]) },
                  clock,
                ).offsetMs
              : 0;
            const ctx: InitialContext = { ...probe, now: at + offsetMs };
            draft((view) => {
              const s = cells.raw(view);
              swaps += 1;
              resetAll(s, ctx);
              for (const f of features)
                Object.assign((s as Slices)[f.key] ?? {}, mergeFeature(f, f.initial(ctx), saved[f.key]));
              writeClock(s, clock, { lastSeen: at + readClock(s, clock).offsetMs });
              cells.touchAll();
            });
          },
        };
        // The state is built by key from the features' declarations; its type is read off the same tuple.
        return fill({ ...slices, ...game.actions(featureApi as never), ...root } as State);
      }),
      {
        name,
        version,
        storage: gated,
        partialize: (state) => partializeState(features, state),
        merge: (persisted, current) => {
          loaded = true;
          const saved = asPersisted(persisted);
          if (!saved) return current;
          const next = { ...current } as Slices;
          for (const f of features) next[f.key] = mergeFeature(f, next[f.key] ?? {}, saved[f.key]);
          return fill(next) as State;
        },
        // An older save comes forward through the game's and the features' steps, and zustand writes it at this
        // version. One no step reaches, or one a step throws on (or brings forward to something not a state), is
        // copied to the kept key, noted and warned of, then migrates to nothing: the merge keeps the defaults, and
        // zustand writes the fresh profile. A newer one throws (below).
        migrate: (persisted, from) => {
          let next: PersistedState | null = null;
          let why: SaveNotes["setAside"] = "old-version";
          try {
            const moved = migrate(persisted, from, version, game);
            next = asPersisted(moved);
            if (moved !== null) why = "migration-failed";
          } catch (e) {
            if (e instanceof SaveError && e.code === "newer-version") throw e;
            why = "migration-failed";
            console.error("watchpot: a save migration failed", e);
          }
          if (next) return next;
          notes.setAside = why;
          console.warn(
            `watchpot: the save at version ${from} could not be brought to version ${version} (${why}); it is kept under "${name}${KEPT_SUFFIX}" and the profile starts fresh`,
          );
          keeping = storage.keep(name);
          return {};
        },
        // A save that could not be loaded (a newer build's, or a read or merge that threw) is kept, and this session
        // writes nothing over it. It stays safe in the blocked main key, so an earlier kept copy (an unreadable save's
        // only one) is never replaced. Either way the load is over: `hydrated` settles once any copy has landed.
        onRehydrateStorage: () => (_state, error) => {
          loaded = true;
          if (error) {
            const newer = error instanceof SaveError && error.code === "newer-version";
            if (!newer)
              console.error(
                "watchpot: the save could not be loaded; this session will not write over it",
                error,
              );
            if (!storage.blocked) notes.blockedBy = newer ? "newer" : "unreadable";
            try {
              keeping = storage.keep(name, { replace: false });
            } catch {
              keeping = undefined;
            }
            storage.block();
          }
          if (keeping) keeping.then(settle, settle);
          else settle();
        },
      },
    ),
  );
  // A write that went round the recipes (`store.setState`) leaves the derived values behind: work them out again.
  if (cells.any)
    store.subscribe(() => {
      if (publishing) return;
      cells.touchAll();
      resettle();
    });
  registerStore(store, { game, storage, name, notes });
  return Object.assign(store, { hydrated, profileSwaps: () => swaps });
}
