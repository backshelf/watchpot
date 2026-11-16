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
  /** How often the page's clock ticks, ms. */
  interval: number;
  /** Passes (ticks and catch-ups) since the page opened, counted by the clock's `lastSeen` moving. */
  passes: number;
  /** The saved text as it stands in the backend, or null before the first write. */
  saved: string | null;
  /** Times the store has written its save since the page opened. */
  writes: number;
  /** Times the game has been made since the page opened: a control moved, a reload, a start over. */
  build: number;
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
   * The example's exports (its helpers: `burnerPrice`, `perSecond`), for a panel to read with; `file` names another
   * example module the game loaded. On the worker host, the page's own version's: the reader's edits run in the
   * worker only.
   */
  exports(file?: string): Record<string, unknown>;
  /** What the example handed `mountGame`, under its store's provider: a React node, or null. */
  mounted(): unknown;
  snapshot(): Snapshot;
  subscribe(listener: () => void): () => void;
  /** Calls an action by its path on the state (`pot.tap`) and returns what it returned (undefined on a worker). */
  call(path: string, ...args: unknown[]): unknown;
  setClock(on: boolean): void;
  /** How often the page's clock ticks, ms. A host that cannot change it leaves it. */
  setInterval?(ms: number): void;
  /** Moves the page's clock forward as if the reader had been away, then runs the catch-up for it. */
  away(ms: number): void;
  /** As a reload does: the store writes its save and stops, and a new store loads the save. */
  reload?(): void;
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
  /** Whether the clock starts ticking when the page opens; "example" when the example runs its own. */
  clock: boolean | "example";
  /** The clock's interval, ms (the engine's default is 100). */
  intervalMs?: number;
  /** The packages the example imports besides `watchpot/core`. */
  externals?: Externals;
  /** False for an example that makes no game. */
  store?: boolean;
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

/** What a run of the example made: its main module's exports, every module's by path, and what it mounted. */
export interface Made {
  exports: Record<string, unknown>;
  loaded: Record<string, Record<string, unknown>>;
  mount: unknown;
}

/**
 * An example's game as it starts: a fresh store over memory at time 0, never ticked (deterministic, so the build and
 * the browser draw the same first frame), and the example's exports, for a panel that reads its helpers.
 */
export function fresh(
  modules: ModuleSet,
  params: Record<string, ParamValue>,
  options: { externals?: Externals; store?: boolean } = {},
): { snapshot: Snapshot } & Made {
  const made: unknown[] = [];
  let mount: unknown = null;
  const externals = harness(
    made,
    () => 0,
    () => core.createGameStorage(core.createMemoryBackend()),
    options.externals,
    { mount: (node) => (mount = node) },
  );
  const loaded: Record<string, Record<string, unknown>> = {};
  const exports = runModules(modules, externals, params, loaded);
  if (options.store === false) return { snapshot: blank({}), exports, loaded, mount };
  const store = storeOf(made, exports, () => 0, core.createGameStorage(core.createMemoryBackend()));
  return { snapshot: blank(store.getState() as Record<string, unknown>), exports, loaded, mount };
}

const blank = (state: Record<string, unknown>): Snapshot => ({
  state,
  clock: false,
  interval: core.TICK_INTERVAL_MS,
  passes: 0,
  saved: null,
  writes: 0,
  build: 0,
  away: null,
  code: { kind: "original" },
});

type AnyStore = ReturnType<typeof core.createIdleStore>;

/** What the harness tells the page about an example's React side. */
export interface HarnessHooks {
  /** The example called `mountGame`: here is what it would draw, under its store's provider. */
  mount?: (node: unknown) => void;
  /** The example's own clock (`useGameClock`) started (true) or stopped (false). */
  clock?: (on: boolean) => void;
}

type ReactModule = typeof import("react");
type WatchpotReact = typeof import("watchpot/react");

/**
 * The engine as an example sees it: the real `watchpot/core`, except that `createIdleStore` takes its clock and its
 * storage from the page (the page stands in for the browser's own clock and storage, so it can send the reader
 * away for an hour and keep each page's save apart). Every store the example makes is recorded in `made`. When the
 * example imports `watchpot/react` (passed in `extra`, with `react`), `mountGame` draws into the page's panel rather
 * than `#root`, and `useGameClock` says when it starts and stops.
 */
export function harness(
  made: unknown[],
  now: () => number,
  storage: () => core.GameStorage,
  extra: Externals = {},
  hooks: HarnessHooks = {},
): Externals {
  const createIdleStore = ((game: never, options: Record<string, unknown> = {}) => {
    const store = core.createIdleStore(game, { ...options, now, storage: storage() } as never);
    noteKey(store, game);
    made.push(store);
    return store;
  }) as unknown as typeof core.createIdleStore;
  const externals: Externals = { ...extra, "watchpot/core": { ...core, createIdleStore } };
  const react = extra.react as ReactModule | undefined;
  const wp = extra["watchpot/react"] as WatchpotReact | undefined;
  if (react && wp) {
    const mountGame: WatchpotReact["mountGame"] = (store, node) =>
      hooks.mount?.(
        react.createElement(
          react.StrictMode,
          null,
          react.createElement(wp.IdleStoreProvider, { store, children: node }),
        ),
      );
    // One hook per run of the example, on purpose: it closes over this run's page. A run's components are new too
    // (a new App), so React never sees the hook change under a mounted component.
    // biome-ignore lint/correctness/noComponentHookFactories: made per run of the example, with its components
    const useGameClock: WatchpotReact["useGameClock"] = (store) => {
      const out = wp.useGameClock(store);
      react.useEffect(() => {
        hooks.clock?.(true);
        return () => hooks.clock?.(false);
      }, [store]);
      return out;
    };
    externals["watchpot/react"] = { ...wp, mountGame, useGameClock };
  }
  return externals;
}

/** Each store the page made, to the key its game saves under. */
const saveKeys = new WeakMap<object, string>();

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
  const store = core.createIdleStore(game as never, { now, storage });
  noteKey(store, game);
  return store;
}

function noteKey(store: object, game: unknown) {
  const key = (game as { save?: { key?: string } } | null)?.save?.key;
  if (key) saveKeys.set(store, key);
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
  /** The example runs its own clock (`useGameClock`): the page starts none. */
  private readonly own: boolean;
  private interval: number;
  private skew = 0;
  private lastSeen = -1;
  private unsubscribe: (() => void) | null = null;
  private started = false;
  private params: Record<string, ParamValue>;
  private readonly local: boolean;
  private made: Made;

  constructor(
    private readonly options: HostOptions,
    params: Record<string, ParamValue>,
  ) {
    this.params = params;
    this.own = options.clock === "example";
    this.clockOn = options.clock === true;
    this.interval = options.intervalMs ?? core.TICK_INTERVAL_MS;
    const first = fresh(options.modules, params, options);
    this.initial = { ...first.snapshot, interval: this.interval };
    this.made = first;
    this.snap = this.initial;
    const local = options.keep === "local" ? prefixedLocal(`${PREFIX}${options.page}.`) : null;
    this.local = local !== null;
    this.backend = this.counted(local ?? core.createMemoryBackend());
    if (this.local) {
      try {
        this.skew = Number(localStorage.getItem(`${PREFIX}${options.page}:skew`)) || 0;
      } catch {
        this.skew = 0;
      }
    }
  }

  private now = () => Date.now() + this.skew;

  exports = (file?: string) => (file ? (this.made.loaded[file] ?? {}) : this.made.exports);

  mounted = () => this.made.mount;

  snapshot = () => this.snap;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(patch: Partial<Snapshot>) {
    this.snap = { ...this.snap, ...patch };
    for (const listener of this.listeners) listener();
  }

  /** The backend, telling the panel each time the store writes. A memory backend stays one (it is not durable). */
  private counted(backend: core.StorageBackend): core.StorageBackend {
    const counted = Object.create(backend) as core.StorageBackend;
    counted.setItem = (name, value) => {
      backend.setItem(name, value);
      if (name === this.saveKey) this.publish({ saved: value, writes: this.snap.writes + 1 });
    };
    return counted;
  }

  private savedText(): string | null {
    return this.saveKey ? this.backend.getItem(this.saveKey) : null;
  }

  private saveKey = "";

  /** Builds the store from the example with the current params, carrying the save over (unless keep is "fresh"). */
  private build() {
    this.teardown();
    if (this.options.keep === "fresh") this.backend = this.counted(core.createMemoryBackend());
    const made: unknown[] = [];
    const storageFor = () => {
      this.storage = core.createGameStorage(this.backend, { durable: this.local });
      return this.storage;
    };
    let mount: unknown = null;
    const loaded: Record<string, Record<string, unknown>> = {};
    const externals = harness(made, this.now, storageFor, this.options.externals, {
      mount: (node) => (mount = node),
      clock: (on) => {
        this.clockOn = on;
        this.publish({ clock: on });
      },
    });
    const exports = runModules(this.options.modules, externals, this.params, loaded);
    this.made = { exports, loaded, mount };
    const build = this.snap.build + 1;
    if (this.options.store === false) {
      this.publish({ build });
      return;
    }
    const store = storeOf(made, exports, this.now, this.storage ?? storageFor());
    this.store = store;
    this.saveKey = saveKeys.get(store) ?? "";
    this.lastSeen = -1;
    this.unsubscribe = store.subscribe((state) => {
      const seen = (state as { clock?: { lastSeen?: number } }).clock?.lastSeen ?? -1;
      const moved = seen !== this.lastSeen;
      this.lastSeen = seen;
      this.publish({ state: state as Record<string, unknown>, passes: this.snap.passes + (moved ? 1 : 0) });
    });
    this.publish({ state: store.getState() as Record<string, unknown>, saved: this.savedText(), build });
    // The example's own clock pays for the time away when its page mounts, as a game's does.
    if (this.own) return;
    // With the clock off, one catch-up, as a game's opening does: a new game's first pays nothing and marks its start
    // (so the save is written); a kept one's pays for the time since the page last ran it.
    if (this.clockOn) this.startClock();
    else store.getState().catchUp();
  }

  private startClock() {
    if (this.store) this.clock = core.startGameClock(this.store, { intervalMs: this.interval });
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
    if (this.own) return;
    this.clockOn = on;
    if (!this.store) return;
    if (on && !this.clock) this.startClock();
    if (!on && this.clock) {
      this.clock.stop();
      this.clock = null;
      this.storage?.flush();
    }
    this.publish({ clock: on });
  }

  setInterval(ms: number) {
    this.interval = ms;
    this.publish({ interval: ms });
    if (!this.clock || !this.store) return;
    // A clock keeps its interval: a new one, from now (its first catch-up has no gap to pay).
    this.clock.stop();
    this.startClock();
  }

  away(ms: number) {
    if (!this.store) return;
    const before = this.store.getState() as Record<string, unknown>;
    this.storage?.flush();
    this.skew += ms;
    try {
      if (this.local) localStorage.setItem(`${PREFIX}${this.options.page}:skew`, String(this.skew));
    } catch {
      // The page still moves on for this visit.
    }
    if (this.own && this.clockOn) {
      // The example's clock notices the gap at its next step and runs the catch-up, as it does for a sleeping laptop.
      this.publish({ away: { ms, before, after: before } });
      return;
    }
    // The engine's clock pays the gap on start: one catch-up, then live ticks. Without the clock, the catch-up alone.
    this.clock?.stop();
    this.clock = null;
    if (this.clockOn) this.startClock();
    else this.store.getState().catchUp();
    this.publish({ away: { ms, before, after: this.store.getState() as Record<string, unknown> } });
  }

  reload() {
    if (this.started) this.build();
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
    this.publish({ passes: 0, away: null, writes: 0 });
    if (this.started) this.build();
  }
}

/** The host for a page drawn at build time: the fresh state and nothing running. */
export class StaticHost implements GameHost {
  readonly initial: Snapshot;
  private readonly made: Made;
  constructor(first: { snapshot: Snapshot } & Made) {
    this.initial = first.snapshot;
    this.made = first;
  }
  exports = (file?: string) => (file ? (this.made.loaded[file] ?? {}) : this.made.exports);
  mounted = () => this.made.mount;
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
