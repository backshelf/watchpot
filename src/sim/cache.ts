/**
 * A snapshot cache that knows which knobs each snapshot depends on, so a fit can resume from the latest snapshot that
 * is still exactly valid after a change, and play on as the fresh run would have.
 *
 * Three things can change between runs, and each invalidates what it must and no more. The game's code (anything not
 * a tunable) is in the cache's key (`sourceKey`), so a change to it leaves nothing to resume. The plan is checked by
 * `fitHolds`: a gate moved before a snapshot invalidates it. A tunable is read through `tunables`, which notes the
 * play time of each key's first read; changing that key invalidates only the snapshots taken after it.
 *
 * Files only: `simCache` keeps one JSON file per snapshot under `<dir>/<key>/`, and every function that touches disk
 * is async (Bun's file APIs, so the sim stays browser-safe).
 */

import { type FitGate, fitHolds, type GatePin } from "./fit";
import { decodeSnapshot, encodeSnapshot, type SimSnapshot } from "./snapshot";

/** A tunable's value: the knobs a game lets a run turn. */
export type TunableValue = number | string | boolean;

/** Tunables as a fit reads them: a read-only view that notes when each key was first read. */
export interface Tunables<T extends Record<string, TunableValue>> {
  /** Read-only: each key's first read records the play clock's time; a write throws. */
  readonly values: Readonly<T>;
  /** The play clock (a fit passes its `playedMs`). Reads before it is set record 0. */
  setClock(clock: () => number): void;
  /** Each key read so far, with the play time of its first read (a copy). */
  firstRead(): Record<string, number>;
  /** The values as they are (a copy). */
  current(): T;
}

/**
 * Tunables over `values`. `clock` (or `setClock` later) gives the play time a first read is noted at; `from.firstRead`
 * starts the map where a resumed run left it, so the run does not under-record.
 */
export function tunables<T extends Record<string, TunableValue>>(
  values: T,
  clock?: () => number,
  from?: { firstRead?: Record<string, number> },
): Tunables<T> {
  let now = clock;
  const first = new Map<string, number>(Object.entries(from?.firstRead ?? {}));
  const copy = { ...values };
  const refuse = (): never => {
    throw new Error("tunables are read-only: a run reads them, the caller changes them between runs");
  };
  const view = new Proxy(copy, {
    get(target, key, receiver) {
      if (typeof key === "string" && Object.hasOwn(target, key) && !first.has(key))
        first.set(key, now?.() ?? 0);
      return Reflect.get(target, key, receiver);
    },
    set: refuse,
    defineProperty: refuse,
    deleteProperty: refuse,
  });
  return {
    values: view,
    setClock(c) {
      now = c;
    },
    firstRead: () => Object.fromEntries(first),
    current: () => ({ ...copy }),
  };
}

/** Hex SHA-256 over text. */
function sha(parts: readonly (string | Uint8Array)[]): string {
  const h = new Bun.CryptoHasher("sha256");
  for (const p of parts) h.update(p);
  return h.digest("hex");
}

/**
 * The key of a game's code: a hex SHA-256 over every file the glob `patterns` match (under `cwd`, sorted by path; each
 * path and its contents hashed), and `extra` (a version, a flag). Any change to a matched file gives another key.
 */
export async function sourceKey(
  patterns: string[],
  options: { cwd?: string; extra?: string } = {},
): Promise<string> {
  const cwd = options.cwd ?? process.cwd();
  const paths = new Set<string>();
  for (const pattern of patterns)
    for await (const p of new Bun.Glob(pattern).scan({ cwd, onlyFiles: true }))
      paths.add(p.replaceAll("\\", "/"));
  const parts: (string | Uint8Array)[] = [];
  for (const p of [...paths].sort()) {
    const body = new Uint8Array(await Bun.file(`${cwd}/${p}`).arrayBuffer());
    parts.push(sha([p]), sha([body]));
  }
  parts.push(`extra:${options.extra ?? ""}`);
  return sha(parts);
}

/** What a cache file holds. */
interface CacheEntry {
  snapshot: string;
  tunables: Record<string, TunableValue>;
  firstRead: Record<string, number>;
}

/** A snapshot to resume from, with the first-read map to start the run's `tunables` from. */
export interface Resumed<X = unknown> {
  snapshot: SimSnapshot<X>;
  firstRead: Record<string, number>;
}

/** A cache of one game's snapshots under one source key. */
export interface SimCache<X = unknown> {
  /**
   * Writes `snapshot` with the tunables' values and the first reads made by its moment, so it can be saved as it is
   * taken or after the run.
   */
  save(snapshot: SimSnapshot<X>, t: Tunables<Record<string, TunableValue>>): Promise<void>;
  /**
   * The latest cached snapshot still exactly valid: the plan holds before it, minutes and `pinned` prices alike
   * (`fitHolds`), and every tunable whose value differs from the one it was taken with (or was not there) was not yet
   * read when it was taken. With the
   * first-read map to start the resumed run's tunables from. Undefined when none is.
   */
  resume<K extends string = string>(
    gates: readonly FitGate<K>[],
    t: Tunables<Record<string, TunableValue>>,
    pinned?: Readonly<Partial<Record<K, GatePin>>>,
  ): Promise<Resumed<X> | undefined>;
  /** Deletes the snapshots after `atMs` (a run that resumes there replaces them). */
  dropAfter(atMs: number): Promise<void>;
  /** Deletes every snapshot under this key. */
  clear(): Promise<void>;
}

/** The cache for `key` (a `sourceKey`) under `dir` (default `.watchpot/sim-cache`): `<dir>/<key>/snap-<atMs>.json`. */
export function simCache<X = unknown>(options: { key: string; dir?: string }): SimCache<X> {
  const root = `${options.dir ?? ".watchpot/sim-cache"}/${options.key}`;
  const files = async (): Promise<string[]> => {
    const out: string[] = [];
    try {
      for await (const f of new Bun.Glob("snap-*.json").scan({ cwd: root, onlyFiles: true })) out.push(f);
    } catch {
      // no directory yet: nothing cached
    }
    return out;
  };
  const read = async (f: string): Promise<CacheEntry> => JSON.parse(await Bun.file(`${root}/${f}`).text());
  const atOf = (f: string): number => Number(f.slice(5, -5));
  return {
    async save(snapshot, t) {
      // Only the reads made by the snapshot's moment: saved after the run, later reads would otherwise make it look
      // dependent on knobs it never saw.
      const firstRead = Object.fromEntries(
        Object.entries(t.firstRead()).filter(([, at]) => at <= snapshot.atMs),
      );
      const entry: CacheEntry = { snapshot: encodeSnapshot(snapshot), tunables: t.current(), firstRead };
      await Bun.write(`${root}/snap-${snapshot.atMs}.json`, JSON.stringify(entry));
    },
    async resume(gates, t, pinned) {
      const now = t.current() as Record<string, TunableValue>;
      const names = (await files()).sort((a, b) => atOf(b) - atOf(a));
      for (const f of names) {
        const entry = await read(f);
        const snapshot = decodeSnapshot<X>(entry.snapshot);
        if (fitHolds(snapshot as SimSnapshot, gates, pinned).length > 0) continue;
        const stale = Object.keys(now).some(
          (k) =>
            (!Object.hasOwn(entry.tunables, k) || entry.tunables[k] !== now[k]) &&
            Object.hasOwn(entry.firstRead, k),
        );
        if (stale) continue;
        return { snapshot, firstRead: entry.firstRead };
      }
      return undefined;
    },
    async dropAfter(atMs) {
      for (const f of await files()) if (atOf(f) > atMs) await Bun.file(`${root}/${f}`).delete();
    },
    async clear() {
      await Bun.$`rm -rf ${root}`.quiet();
    },
  };
}
