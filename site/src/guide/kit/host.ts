// The game a guide page runs, behind one interface the panel reads: a `LocalHost` runs the example on the page
// itself (a page with controls: the example is the build's own, so nothing the reader does can break it), and a
// `WorkerHost` runs it in a worker (a page with a code box: the reader's code may throw or never finish, so it runs
// where it can be stopped, and the last version that worked keeps running until a new one proves itself).
import * as core from "watchpot/core";
import { type Externals, type ModuleSet, type ParamValue, runModules } from "./run";

/** What the panel reads: the game's state and the host's own facts, replaced as a whole on every change. */
export interface Snapshot {
  /** The store's state (on the worker host, a copy with its Decimals revived; its actions are absent). */
  state: Record<string, unknown>;
  /** Whether the engine's clock is ticking the store. */
  clock: boolean;
  /** Passes (ticks and catch-ups) since the page opened, counted by the clock's `lastSeen` moving. */
  passes: number;
  /** The saved text as it stands in the backend, or null before the first write. */
  saved: string | null;
  /** The last absence the page simulated, with the state just before it and just after its catch-up. */
  away: { ms: number; before: Record<string, unknown>; after: Record<string, unknown> } | null;
  /** The code box's state: running the reader's version, checking a new one, or refusing it. */
  code: CodeStatus;
}

export type CodeStatus =
  | { kind: "original" }
  | { kind: "checking" }
  | { kind: "running" }
  | { kind: "refused"; problem: Problem }
  | { kind: "threw"; problem: Problem };

/** A mistake in the reader's code, said plainly: what went wrong and, when known, the line in the box. */
export interface Problem {
  title: string;
  detail: string;
  line?: number;
  column?: number;
  /** The JavaScript message, for the reader who wants it. */
  raw?: string;
}

export interface GameHost {
  readonly initial: Snapshot;
  /**
   * The example's exports (its helpers: `burnerPrice`, `perSecond`), for a panel to read with. On the worker host,
   * the page's own version's: the reader's edits run in the worker only.
   */
  exports(): Record<string, unknown>;
  snapshot(): Snapshot;
  subscribe(listener: () => void): () => void;
  /** Calls an action by its path on the state (`pot.tap`) and returns what it returned (undefined on a worker). */
  call(path: string, ...args: unknown[]): unknown;
  setClock(on: boolean): void;
  /** Moves the page's clock forward as if the reader had been away, then runs the catch-up for it. */
  away(ms: number): void;
  /** Forgets the save and starts the game fresh. */
  reset(): void;
  start(): void;
  stop(): void;
}

// ---------------------------------------------------------------------------------------------------------------
// Shared

/** How a page keeps its game between visits: in this browser, in memory for the visit, or fresh on every rebuild. */
export type Keep = "local" | "memory" | "fresh";

export interface HostOptions {
  /** The page's slug: its save lives under its own name, so two pages never share one. */
  page: string;
  modules: ModuleSet;
  keep: Keep;
  /** Whether the clock starts ticking when the page opens. */
  clock: boolean;
  /** The clock's interval, ms (the engine's default is 100). */
  intervalMs?: number;
}

const PREFIX = "watchpot.guide.";

function prefixedLocal(prefix: string): core.StorageBackend | null {
  const ls = core.localStorageBackend();
  if (!ls) return null;
  return {
    getItem: (name) => ls.getItem(prefix + name),
    setItem: (name, value) => ls.setItem(prefix + name, value),
    removeItem: (name) => ls.removeItem(prefix + name),
  };
}

function lookup(state: Record<string, unknown>, path: string): unknown {
  let at: unknown = state;
  for (const part of path.split(".")) at = (at as Record<string, unknown> | undefined)?.[part];
  return at;
}

/** A state as JSON text with its Decimals tagged, and back: what crosses from the worker. */
export function freeze(state: unknown): string {
  // A Decimal's own `toJSON` runs before the replacer sees it, so the replacer reads the holder's original value.
  return JSON.stringify(state, function (this: Record<string, unknown>, key, value) {
    const raw = this[key];
    return core.isDecimal(raw) ? { $d: raw.toString() } : value;
  });
}

export function thaw(text: string): Record<string, unknown> {
  return JSON.parse(text, (_key, value) =>
    value && typeof value === "object" && typeof value.$d === "string" && Object.keys(value).length === 1
      ? core.D(value.$d)
      : value,
  ) as Record<string, unknown>;
}

/**
 * An example's game as it starts: a fresh store over memory at time 0, never ticked (deterministic, so the build and
 * the browser draw the same first frame), and the example's exports, for a panel that reads its helpers.
 */
export function fresh(
  modules: ModuleSet,
  params: Record<string, ParamValue>,
): { snapshot: Snapshot; exports: Record<string, unknown> } {
  const made: unknown[] = [];
  const externals = harness(
    made,
    () => 0,
    () => core.createGameStorage(core.createMemoryBackend()),
  );
  const exports = runModules(modules, externals, params);
  const store = storeOf(made, exports, () => 0, core.createGameStorage(core.createMemoryBackend()));
  return { snapshot: blank(store.getState() as Record<string, unknown>), exports };
}

const blank = (state: Record<string, unknown>): Snapshot => ({
  state,
  clock: false,
  passes: 0,
  saved: null,
  away: null,
  code: { kind: "original" },
});

type AnyStore = ReturnType<typeof core.createIdleStore>;

/**
 * The engine as an example sees it: the real `watchpot/core`, except that `createIdleStore` takes its clock and its
 * storage from the page (the page stands in for the browser's own clock and storage, so it can send the reader
 * away for an hour and keep each page's save apart). Every store the example makes is recorded in `made`.
 */
export function harness(
  made: unknown[],
  now: () => number,
  storage: () => core.GameStorage,
  extra: Externals = {},
): Externals {
  const createIdleStore = ((game: never, options: Record<string, unknown> = {}) => {
    const store = core.createIdleStore(game, { ...options, now, storage: storage() } as never);
    made.push(store);
    return store;
  }) as unknown as typeof core.createIdleStore;
  return { "watchpot/core": { ...core, createIdleStore }, ...extra };
}

/** The store an example made, or one made from its `game` when it made none. */
function storeOf(
  made: unknown[],
  exports: Record<string, unknown>,
  now: () => number,
  storage: core.GameStorage,
): AnyStore {
  const first = made[0] as AnyStore | undefined;
  if (first) return first;
  const game = exports.game;
  if (!game) throw new Error("the example neither makes a store nor exports a `game`");
  return core.createIdleStore(game as never, { now, storage });
}

// ---------------------------------------------------------------------------------------------------------------
// On the page

export class LocalHost implements GameHost {
  readonly initial: Snapshot;
  private snap: Snapshot;
  private readonly listeners = new Set<() => void>();
  private store: AnyStore | null = null;
  private storage: core.GameStorage | null = null;
  private backend: core.StorageBackend;
  private clock: core.Clock | null = null;
  private clockOn: boolean;
  private skew = 0;
  private lastSeen = -1;
  private unsubscribe: (() => void) | null = null;
  private started = false;
  private params: Record<string, ParamValue>;
  private readonly local: boolean;

  constructor(
    private readonly options: HostOptions,
    params: Record<string, ParamValue>,
  ) {
    this.params = params;
    this.clockOn = options.clock;
    const first = fresh(options.modules, params);
    this.initial = first.snapshot;
    this.made = first.exports;
    this.snap = this.initial;
    const local = options.keep === "local" ? prefixedLocal(`${PREFIX}${options.page}.`) : null;
    this.local = local !== null;
    this.backend = local ?? core.createMemoryBackend();
    if (this.local) {
      try {
        this.skew = Number(localStorage.getItem(`${PREFIX}${options.page}:skew`)) || 0;
      } catch {
        this.skew = 0;
      }
    }
  }

  private now = () => Date.now() + this.skew;
  private made: Record<string, unknown>;

  exports = () => this.made;

  snapshot = () => this.snap;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(patch: Partial<Snapshot>) {
    this.snap = { ...this.snap, ...patch };
    for (const listener of this.listeners) listener();
  }

  private savedText(): string | null {
    return this.saveKey ? this.backend.getItem(this.saveKey) : null;
  }

  private saveKey = "";

  /** Builds the store from the example with the current params, carrying the save over (unless keep is "fresh"). */
  private build() {
    this.teardown();
    if (this.options.keep === "fresh") this.backend = core.createMemoryBackend();
    const made: unknown[] = [];
    const storageFor = () => {
      this.storage = core.createGameStorage(this.backend, { durable: this.local });
      return this.storage;
    };
    const exports = runModules(this.options.modules, harness(made, this.now, storageFor), this.params);
    const store = storeOf(made, exports, this.now, this.storage ?? storageFor());
    this.store = store;
    this.made = exports;
    const game = (exports.game ?? null) as { save?: { key?: string } } | null;
    this.saveKey = game?.save?.key ?? "";
    this.lastSeen = -1;
    this.unsubscribe = store.subscribe((state) => {
      const seen = (state as { clock?: { lastSeen?: number } }).clock?.lastSeen ?? -1;
      const moved = seen !== this.lastSeen;
      this.lastSeen = seen;
      this.publish({
        state: state as Record<string, unknown>,
        passes: this.snap.passes + (moved ? 1 : 0),
        saved: this.savedText(),
      });
    });
    this.publish({ state: store.getState() as Record<string, unknown>, saved: this.savedText() });
    // With the clock off, one catch-up, as a game's opening does: a new game's first pays nothing and marks its start
    // (so the save is written); a kept one's pays for the time since the page last ran it.
    if (this.clockOn) this.clock = core.startGameClock(store, { intervalMs: this.options.intervalMs });
    else store.getState().catchUp();
  }

  private teardown() {
    this.clock?.stop();
    this.clock = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    // The old store writes what it has, then nothing more: the next one loads it.
    this.storage?.flush();
    this.storage?.block();
    this.storage = null;
    this.store = null;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.build();
    this.publish({ clock: this.clockOn });
  }

  stop() {
    this.started = false;
    this.teardown();
  }

  /** New values for the page's controls: the example runs again with them, the save carried over. */
  setParams(params: Record<string, ParamValue>) {
    this.params = params;
    if (this.started) this.build();
  }

  call(path: string, ...args: unknown[]): unknown {
    if (!this.store) return undefined;
    const fn = lookup(this.store.getState() as Record<string, unknown>, path);
    if (typeof fn !== "function") throw new Error(`no action at ${path}`);
    return fn(...args);
  }

  setClock(on: boolean) {
    this.clockOn = on;
    if (!this.store) return;
    if (on && !this.clock)
      this.clock = core.startGameClock(this.store, { intervalMs: this.options.intervalMs });
    if (!on && this.clock) {
      this.clock.stop();
      this.clock = null;
      this.storage?.flush();
    }
    this.publish({ clock: on });
  }

  away(ms: number) {
    if (!this.store) return;
    const before = this.store.getState() as Record<string, unknown>;
    this.storage?.flush();
    this.clock?.stop();
    this.skew += ms;
    try {
      if (this.local) localStorage.setItem(`${PREFIX}${this.options.page}:skew`, String(this.skew));
    } catch {
      // The page still moves on for this visit.
    }
    // The engine's clock pays the gap on start: one catch-up, then live ticks. Without the clock, the catch-up alone.
    if (this.clockOn) this.clock = core.startGameClock(this.store, { intervalMs: this.options.intervalMs });
    else this.store.getState().catchUp();
    this.publish({ away: { ms, before, after: this.store.getState() as Record<string, unknown> } });
  }

  reset() {
    if (this.store) void core.clearSave(this.store);
    this.storage = null;
    this.skew = 0;
    try {
      if (this.local) localStorage.removeItem(`${PREFIX}${this.options.page}:skew`);
    } catch {
      // Nothing kept to remove.
    }
    this.publish({ passes: 0, away: null });
    if (this.started) this.build();
  }
}

/** The host for a page drawn at build time: the fresh state and nothing running. */
export class StaticHost implements GameHost {
  readonly initial: Snapshot;
  private readonly made: Record<string, unknown>;
  constructor(first: { snapshot: Snapshot; exports: Record<string, unknown> }) {
    this.initial = first.snapshot;
    this.made = first.exports;
  }
  exports = () => this.made;
  snapshot = () => this.initial;
  subscribe = () => () => {};
  call() {
    return undefined;
  }
  setClock() {}
  away() {}
  reset() {}
  start() {}
  stop() {}
}
