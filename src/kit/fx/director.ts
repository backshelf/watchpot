import { useEffect, useRef, useSyncExternalStore } from "react";
import { prefersReducedMotion } from "./motion";

/**
 * The celebration director: the size of the show matches the size of the win, and wins never pile up. Headless: it
 * decides what plays when and hands typed cues to the game's renderers; it knows tiers and kinds, never what a kind
 * means or how it looks.
 *
 * - `micro` goes straight out as a batch of one: a tick, never held or rationed.
 * - `small` never takes the stage. Smalls of one kind landing within `coalesceMs` of the first go out as one batch
 *   (ten at once are one bigger sticker, not ten). While a big show holds the stage they wait, up to `holdMost`, and
 *   when it ends they go out after it, oldest first, one `gapMs` apart.
 * - `medium` takes the stage one at a time, `gapMs` apart; past `maxQueue` waiting, a medium goes out as a small.
 * - `big` takes the stage at once: a medium on it is cut short (and handed to the smalls), mediums wait behind it.
 *   It stays up for at least its `readMs` (`readingMs` works one out from a line's words); `done` before then is
 *   ignored, and subscribers hear the stage when the hold expires. The director never ends it itself.
 * - The machine's wins are rationed: a machine's batch of smalls goes out only when it holds a first, at most one
 *   every `machine.gapMs`, a few waiting their turn (the newest kept), and with `machine.downscale` a cue that is
 *   neither the player's (`mine`) nor a `first` drops a tier. The player's own wins are never rationed.
 */

/** How big a win is, smallest first. */
export type CueTier = "micro" | "small" | "medium" | "big";

/** A win to show: its tier, its kind (smalls coalesce by kind) and the game's data for its renderer. */
export interface Cue<D> {
  tier: CueTier;
  kind: string;
  data: D;
  /** It came from the player's own gesture. Unset, the director's `mine()` is asked at the push. */
  mine?: boolean;
  /** It is a thing happening for the first time: the machine's firsts still show. */
  first?: boolean;
  /**
   * A big show's minimum on the stage, ms (see `readingMs`). Unset or 0, it can be ended at once. Read for `big`: a
   * lesser cue is a batch or a page that already holds no longer than its own renderer needs.
   */
  readMs?: number;
}

/** A cue on the stage: an id to end it by, the tier it was pushed at, and whether motion is reduced. */
export interface StagedCue<D> extends Cue<D> {
  id: number;
  /** The tier it was pushed at, before any downscale. */
  pushed: CueTier;
  /** Reduced motion was asked for when it took the stage: the renderer shows its still. */
  reduced: boolean;
  /** The read hold it took the stage with: at least this long (`big` only; 0 otherwise). */
  readMs: number;
  /** The director's `now` at which the hold has passed: a renderer shows its "press to continue" then. */
  readyAt: number;
}

/** Smalls of one kind (or one micro) going out together, oldest first. */
export interface CueBatch<D> {
  kind: string;
  cues: readonly Cue<D>[];
  /** Any of them was the player's. */
  mine: boolean;
  /** Any of them was a first. */
  first: boolean;
  reduced: boolean;
}

/** How a line's reading time is worked out: see `readingMs`. */
export interface ReadingOptions {
  /** Time a word gets, ms. Default 220. */
  perWordMs?: number;
  /** The floor, however short the line. Default 1200. */
  minMs?: number;
  /** The cap, however long the line. Default 6000. */
  maxMs?: number;
}

/**
 * How long a line takes to read, ms, for a big cue's `readMs`. The engine never reads the words: the game counts
 * them and passes the figure.
 */
export function readingMs(words: number, options: ReadingOptions = {}): number {
  const perWord = options.perWordMs ?? 220;
  const min = options.minMs ?? 1200;
  const max = options.maxMs ?? 6000;
  return Math.max(
    min,
    Math.min(max, Math.round((Number.isFinite(words) ? Math.max(0, words) : 0) * perWord)),
  );
}

/** What the director did with a cue or a batch: what the dev log records. */
export type CueFate = "staged" | "queued" | "shown" | "held" | "waiting" | "dropped" | "demoted" | "cut";

/** One line of the director's log. */
export interface CueLogEntry {
  kind: string;
  tier: CueTier;
  /** How many cues it was (a batch). */
  n: number;
  mine: boolean;
  first: boolean;
  fate: CueFate;
}

/** How the machine's wins are rationed. */
export interface MachineRation {
  /** A machine's batch of smalls at most once per this, ms. Default 6000. */
  gapMs?: number;
  /** How many machine batches wait their turn; the oldest gives way. Default 3. */
  waitingMost?: number;
  /** A machine's small that is not a first is dropped. Default true. */
  firstsOnly?: boolean;
  /** A machine's batch of a kind shown less than this ago is dropped, ms. Default 0 (off). */
  kindGapMs?: number;
  /**
   * A machine's cue that is not a first drops a tier (big to medium, medium to small). Default false: a delayed or
   * automated big show pushed without `first` keeps its tier; opt in to shrink the machine's shows.
   */
  downscale?: boolean;
}

/** Options of `createDirector`. */
export interface DirectorOptions {
  /** How long smalls of one kind gather into a batch, ms. Default 350. */
  coalesceMs?: number;
  /** The rest between two shows on the stage, ms. Default 900. */
  gapMs?: number;
  /** How many mediums may wait for the stage; one more goes out as a small. Default 3. */
  maxQueue?: number;
  /** How many batches wait out a big show. Default 12: a scene's worth of lines. */
  holdMost?: number;
  /**
   * How many of those go out after it, the oldest first, one `gapMs` apart. Default: all of them.
   */
  releaseMost?: number;
  /** The machine's rationing, or false for none. */
  machine?: MachineRation | false;
  /** Whether a cue pushed without `mine` is the player's (a gesture tracker's `recent`). Default: never. */
  mine?: () => boolean;
  /** Whether motion is reduced, read as a cue goes out. Default `prefersReducedMotion`. */
  reduced?: () => boolean;
  /** A duration clock. Default `performance.now`. */
  now?: () => number;
  /** Runs `fn` after `ms`; returns its cancel. Default `setTimeout`. */
  schedule?: (fn: () => void, ms: number) => () => void;
  /** How many log lines are kept. Default 200. */
  logMost?: number;
}

/** What `createDirector` returns. */
export interface Director<D> {
  push(cue: Cue<D>): void;
  /** The show on the stage, or null. The same object until it changes (a `useSyncExternalStore` snapshot). */
  stage(): StagedCue<D> | null;
  /** How many shows wait for the stage. */
  waiting(): number;
  /** The show on the stage has ended. With an id, only that show: a show already cut short ends nothing. */
  done(id?: number): void;
  /** Hears the stage change. Returns the unsubscribe. */
  subscribe(fn: () => void): () => void;
  /** Hears each batch of smalls and each micro. Returns the unsubscribe. */
  onBatch(fn: (batch: CueBatch<D>) => void): () => void;
  /** Drops every show waiting, held and on the stage. */
  clear(): void;
  /** `clear()`, cancels every timer and forgets every listener. */
  dispose(): void;
  /** Development: names a cue that `replay(name)` pushes (as the player's), to look at a show without playing to it. */
  sample(name: string, make: () => Cue<D>): void;
  /** Pushes the named sample; false when there is none. */
  replay(name: string): boolean;
  /** The sample names. */
  samples(): string[];
  /** What happened to the last cues and batches, oldest first. */
  log(): readonly CueLogEntry[];
}

const DOWN: Record<CueTier, CueTier> = { big: "medium", medium: "small", small: "small", micro: "micro" };

/** A director with its own queue, timers and log. */
export function createDirector<D>(options: DirectorOptions = {}): Director<D> {
  const coalesceMs = options.coalesceMs ?? 350;
  const gapMs = options.gapMs ?? 900;
  const maxQueue = options.maxQueue ?? 3;
  const holdMost = options.holdMost ?? 12;
  const releaseMost = options.releaseMost ?? Number.POSITIVE_INFINITY;
  const logMost = options.logMost ?? 200;
  const machine =
    options.machine === false
      ? null
      : {
          gapMs: options.machine?.gapMs ?? 6000,
          waitingMost: options.machine?.waitingMost ?? 3,
          firstsOnly: options.machine?.firstsOnly ?? true,
          kindGapMs: options.machine?.kindGapMs ?? 0,
          downscale: options.machine?.downscale ?? false,
        };
  const isMine = options.mine ?? (() => false);
  const isReduced = options.reduced ?? prefersReducedMotion;
  const now = options.now ?? (() => performance.now());
  const timers = new Set<() => void>();
  const later = (fn: () => void, ms: number) => {
    const schedule =
      options.schedule ??
      ((f: () => void, wait: number) => {
        const id = setTimeout(f, wait);
        return () => clearTimeout(id);
      });
    let cancel: () => void = () => {};
    const run = () => {
      timers.delete(cancel);
      fn();
    };
    cancel = schedule(run, ms);
    timers.add(cancel);
  };

  const queue: StagedCue<D>[] = [];
  const buffers = new Map<string, Cue<D>[]>();
  const held: CueBatch<D>[] = [];
  const machineWaiting: CueBatch<D>[] = [];
  const lastOfKind = new Map<string, number>();
  const listeners = new Set<() => void>();
  const batchers = new Set<(batch: CueBatch<D>) => void>();
  const made = new Map<string, () => Cue<D>>();
  const lines: CueLogEntry[] = [];
  let current: StagedCue<D> | null = null;
  let resting = false;
  let draining = false;
  let lastMachine = Number.NEGATIVE_INFINITY;
  let nextId = 1;
  let epoch = 0;

  const note = (kind: string, tier: CueTier, n: number, mine: boolean, first: boolean, fate: CueFate) => {
    lines.push({ kind, tier, n, mine, first, fate });
    if (lines.length > logMost) lines.splice(0, lines.length - logMost);
  };
  const noteBatch = (b: CueBatch<D>, fate: CueFate) =>
    note(b.kind, b.cues[0]?.tier ?? "small", b.cues.length, b.mine, b.first, fate);
  const emit = () => {
    for (const fn of [...listeners]) fn();
  };
  const takeover = () => current?.tier === "big";
  const batchOf = (kind: string, cues: Cue<D>[]): CueBatch<D> => ({
    kind,
    cues,
    mine: cues.some((c) => c.mine),
    first: cues.some((c) => c.first),
    reduced: isReduced(),
  });
  const deliver = (b: CueBatch<D>) => {
    lastOfKind.set(b.kind, now());
    noteBatch(b, "shown");
    for (const fn of [...batchers]) fn({ ...b, reduced: isReduced() });
  };

  const drain = () => {
    if (draining || !machine) return;
    draining = true;
    const wait = Math.max(0, machine.gapMs - (now() - lastMachine));
    const mine = epoch;
    later(() => {
      draining = false;
      if (mine !== epoch) return;
      const b = machineWaiting.shift();
      if (!b) return;
      lastMachine = now();
      offer(b, true);
      if (machineWaiting.length > 0) drain();
    }, wait);
  };

  /** A batch of smalls at the door: held behind a big show, rationed when it is the machine's, else out. */
  function offer(b: CueBatch<D>, rationed = false): void {
    if (takeover()) {
      if (held.length < holdMost) {
        held.push(b);
        noteBatch(b, "held");
      } else noteBatch(b, "dropped");
      return;
    }
    if (!rationed && machine && !b.mine) {
      const spaced = now() - (lastOfKind.get(b.kind) ?? Number.NEGATIVE_INFINITY) >= machine.kindGapMs;
      if ((machine.firstsOnly && !b.first) || !spaced) {
        noteBatch(b, "dropped");
        return;
      }
      if (now() - lastMachine < machine.gapMs || machineWaiting.length > 0) {
        // One of its kind already waiting takes it in: one batch for both.
        const same = machineWaiting.find((w) => w.kind === b.kind);
        if (same) machineWaiting[machineWaiting.indexOf(same)] = batchOf(b.kind, [...same.cues, ...b.cues]);
        else machineWaiting.push(b);
        while (machineWaiting.length > machine.waitingMost) {
          const gone = machineWaiting.shift();
          if (gone) noteBatch(gone, "dropped");
        }
        noteBatch(b, "waiting");
        drain();
        return;
      }
      lastMachine = now();
    }
    deliver(b);
  }

  const small = (cue: Cue<D>) => {
    const buffer = buffers.get(cue.kind);
    if (buffer) {
      buffer.push(cue);
      return;
    }
    buffers.set(cue.kind, [cue]);
    const mine = epoch;
    later(() => {
      if (mine !== epoch) return;
      const cues = buffers.get(cue.kind) ?? [];
      buffers.delete(cue.kind);
      if (cues.length > 0) offer(batchOf(cue.kind, cues));
    }, coalesceMs);
  };

  /** Lets out what waited behind a big show, oldest first, one `gapMs` apart; a new big show pauses it. */
  const releaseHeld = () => {
    if (takeover()) return;
    const b = held.shift();
    if (!b) return;
    offer(b, true);
    if (held.length === 0) return;
    const mine = epoch;
    later(() => {
      if (mine !== epoch) return;
      releaseHeld();
    }, gapMs);
  };

  /**
   * Puts `show` on the stage (or clears it), starts its read hold, and lets out what waited behind a big show that
   * just left.
   */
  const setStage = (show: StagedCue<D> | null) => {
    const wasBig = takeover();
    const hold = show ? show.readMs : 0;
    current = show ? { ...show, reduced: isReduced(), readyAt: now() + hold } : null;
    if (current && hold > 0) {
      // The hold expiring is a change of the stage (a fresh object), so a `useStage` renderer re-renders and can
      // show its "press to continue". The show itself stays: only the renderer's `done` ends it.
      const mine = epoch;
      const id = current.id;
      later(() => {
        if (mine !== epoch || !current || current.id !== id) return;
        current = { ...current };
        emit();
      }, hold);
    }
    if (wasBig && !takeover()) {
      for (const b of held.splice(releaseMost)) noteBatch(b, "dropped");
      releaseHeld();
    }
  };
  const next = () => {
    if (current || resting) return;
    const show = queue.shift();
    if (!show) return;
    setStage(show);
    note(show.kind, show.tier, 1, Boolean(show.mine), Boolean(show.first), "staged");
    emit();
  };

  const director: Director<D> = {
    push(input) {
      const cue: Cue<D> = { ...input, mine: input.mine ?? isMine() };
      const machineOwn = !cue.mine && !cue.first;
      const tier = machine?.downscale && machineOwn ? DOWN[cue.tier] : cue.tier;
      const staged = (t: CueTier): StagedCue<D> => ({
        ...cue,
        tier: t,
        pushed: cue.tier,
        id: nextId++,
        reduced: false,
        readMs: t === "big" ? Math.max(0, cue.readMs ?? 0) : 0,
        readyAt: 0,
      });
      switch (tier) {
        case "micro":
          deliver(batchOf(cue.kind, [cue]));
          return;
        case "small":
          small({ ...cue, tier: "small" });
          return;
        case "medium": {
          if (queue.filter((c) => c.tier === "medium").length >= maxQueue) {
            note(cue.kind, "medium", 1, Boolean(cue.mine), Boolean(cue.first), "demoted");
            small({ ...cue, tier: "small" });
            return;
          }
          queue.push(staged("medium"));
          note(cue.kind, "medium", 1, Boolean(cue.mine), Boolean(cue.first), "queued");
          next();
          return;
        }
        case "big": {
          if (current?.tier === "medium") {
            const cut = current;
            note(cut.kind, "medium", 1, Boolean(cut.mine), Boolean(cut.first), "cut");
            current = null;
            small({ ...cut, tier: "small" });
          }
          // Bigs keep their order among themselves, ahead of every medium.
          const firstMedium = queue.findIndex((c) => c.tier !== "big");
          queue.splice(firstMedium < 0 ? queue.length : firstMedium, 0, staged("big"));
          resting = false;
          if (current === null) next();
          emit();
          return;
        }
      }
    },
    stage: () => current,
    waiting: () => queue.length,
    done(id) {
      if (!current || (id !== undefined && id !== current.id)) return;
      // A big show still being read stays: an early press does nothing, and its own renderer will press again.
      if (now() < current.readyAt) return;
      setStage(null);
      resting = true;
      emit();
      const mine = epoch;
      later(() => {
        if (mine !== epoch) return;
        resting = false;
        next();
      }, gapMs);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    onBatch(fn) {
      batchers.add(fn);
      return () => batchers.delete(fn);
    },
    clear() {
      epoch++;
      queue.length = 0;
      buffers.clear();
      held.length = 0;
      machineWaiting.length = 0;
      current = null;
      resting = false;
      draining = false;
      emit();
    },
    dispose() {
      director.clear();
      for (const cancel of [...timers]) cancel();
      timers.clear();
      listeners.clear();
      batchers.clear();
    },
    sample(name, make) {
      made.set(name, make);
    },
    replay(name) {
      const make = made.get(name);
      if (!make) return false;
      director.push({ ...make(), mine: true });
      return true;
    },
    samples: () => [...made.keys()],
    log: () => lines,
  };
  return director;
}

/** The show on the director's stage, as React state. */
export function useStage<D>(director: Director<D>): StagedCue<D> | null {
  return useSyncExternalStore(director.subscribe, director.stage, director.stage);
}

/** Hears the director's batches while mounted; `onBatch` is read through a ref, so a new one each render is free. */
export function useCueBatches<D>(director: Director<D>, onBatch: (batch: CueBatch<D>) => void): void {
  const latest = useRef(onBatch);
  latest.current = onBatch;
  useEffect(() => director.onBatch((b) => latest.current(b)), [director]);
}
