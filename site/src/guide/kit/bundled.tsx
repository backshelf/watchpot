// A page whose panel runs its example as bundled with the page, not from the example's source. The kit's own hosts
// evaluate the example's modules from their source, so the page's controls and code box can rewrite them; that has
// two limits today: a module that imports anything but `watchpot/core` (a React page) cannot run, and nor can one with
// an `if (import.meta.main)` block (a `new Function` body cannot parse `import.meta`). A page over such an example
// imports it for real, makes a `BundledHost` over its `game`, and wraps its panel in `<Bundled>`: every panel piece
// (`Readout`, `Act`, `ClockSwitch`, `Away`, `StartOver`, `useView`, `useExample`) then reads that host instead. Such a
// page has no `params` and no code box: the code it runs is the bundle's, fixed at build time.
import { type ReactNode, useEffect, useMemo, useState } from "react";
import * as core from "watchpot/core";
import { GuideContext, useGuide } from "./context";
import type { GameHost, Keep, Snapshot } from "./host";

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

type AnyStore = ReturnType<typeof core.createIdleStore>;

export interface BundledOptions {
  /** The page's slug: the save and the clock's skew are kept under it, apart from every other page's. */
  page: string;
  /** The example's `game`, as imported. */
  game: unknown;
  /** The example's exports, as imported: what `useExample` hands the panel. */
  exports: Record<string, unknown>;
  keep?: Keep;
  /** Whether the clock ticks when the page opens (default true). */
  clock?: boolean;
  intervalMs?: number;
}

/**
 * The kit's `LocalHost`, over a game that came with the page's script: a store saved under the page's own name, the
 * engine's clock, time away by moving the page's clock forward, and starting over.
 */
export class BundledHost implements GameHost {
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
  private readonly local: boolean;

  constructor(private readonly options: BundledOptions) {
    this.clockOn = options.clock ?? true;
    // The first frame: a store over memory at time 0, never ticked, the same at build time and in the browser.
    const first = core.createIdleStore(options.game as never, {
      now: () => 0,
      storage: core.createGameStorage(core.createMemoryBackend()),
    });
    this.initial = {
      state: first.getState() as Record<string, unknown>,
      clock: false,
      passes: 0,
      saved: null,
      away: null,
      code: { kind: "original" },
    };
    this.snap = this.initial;
    const keep = options.keep ?? "local";
    const local = keep === "local" ? prefixedLocal(`${PREFIX}${options.page}.`) : null;
    this.local = local !== null;
    this.backend = local ?? core.createMemoryBackend();
    if (this.local) {
      try {
        this.skew = Number(localStorage.getItem(this.skewKey)) || 0;
      } catch {
        this.skew = 0;
      }
    }
  }

  private get skewKey() {
    return `${PREFIX}${this.options.page}:skew`;
  }

  private now = () => Date.now() + this.skew;

  exports = () => this.options.exports;
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
    const key = (this.options.game as { save?: { key?: string } }).save?.key;
    return key ? this.backend.getItem(key) : null;
  }

  private build() {
    this.teardown();
    if (this.options.keep === "fresh") this.backend = core.createMemoryBackend();
    this.storage = core.createGameStorage(this.backend, { durable: this.local });
    const store = core.createIdleStore(this.options.game as never, { now: this.now, storage: this.storage });
    this.store = store;
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
    if (this.clockOn) this.clock = core.startGameClock(store, { intervalMs: this.options.intervalMs });
    else store.getState().catchUp();
  }

  private teardown() {
    this.clock?.stop();
    this.clock = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
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
      if (this.local) localStorage.setItem(this.skewKey, String(this.skew));
    } catch {
      // The page still moves on for this visit.
    }
    if (this.clockOn) this.clock = core.startGameClock(this.store, { intervalMs: this.options.intervalMs });
    else this.store.getState().catchUp();
    this.publish({ away: { ms, before, after: this.store.getState() as Record<string, unknown> } });
  }

  reset() {
    if (this.store) void core.clearSave(this.store);
    this.storage = null;
    this.skew = 0;
    try {
      if (this.local) localStorage.removeItem(this.skewKey);
    } catch {
      // Nothing kept to remove.
    }
    this.publish({ passes: 0, away: null });
    if (this.started) this.build();
  }
}

/**
 * The panel of a page whose example runs bundled: `make` builds the host once (at build time and once in the
 * browser), and everything inside reads it. `source` names the example in the panel's foot.
 */
export function Bundled({
  make,
  source,
  children,
}: {
  make: () => BundledHost;
  source: { file: string; href: string };
  children: ReactNode;
}) {
  const guide = useGuide();
  const [host] = useState(make);
  useEffect(() => {
    host.start();
    return () => host.stop();
  }, [host]);
  const value = useMemo(() => ({ ...guide, host, data: { ...guide.data, source } }), [guide, host, source]);
  return <GuideContext value={value}>{children}</GuideContext>;
}
