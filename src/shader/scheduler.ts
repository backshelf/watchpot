// The pool's frame loop, pure over its inputs: one requestAnimationFrame for every tile; a still tile draws when
// asked, a live one every frame while visible, at most `maxLive` at once (the newest win, the rest hold a frame).

/** How many tiles animate at once by default; past it the oldest live tiles hold their last frame. */
export const MAX_LIVE_TILES = 12;

/** One tile registered with the scheduler. */
export interface ShaderSlot {
  /** Draw on the next frame (an input changed). */
  requestDraw(): void;
  /** Live tiles redraw every frame while visible; still ones draw when asked. */
  setLive(live: boolean): void;
  dispose(): void;
}

/** What the scheduler is given: frames, visibility, the tab's hidden flag and reduced motion. Injected for tests. */
export interface ShaderSchedulerDeps {
  raf(cb: (now: number) => void): number;
  caf(id: number): void;
  /** Watches an element's visibility, calling back on each change (at once if visible); returns the unwatch. */
  observe(el: Element, onChange: (visible: boolean) => void): () => void;
  hidden(): boolean;
  /** Calls back when the tab's hidden flag flips; returns the unsubscribe. */
  onHidden(cb: () => void): () => void;
  reduced(): boolean;
}

/** The scheduler's counters: draws and frames run, tiles registered, tiles looping now. */
export interface ShaderSchedulerStats {
  draws: number;
  frames: number;
  slots: number;
  looping: number;
}

interface Entry {
  draw: (now: number) => void;
  live: boolean;
  visible: boolean;
  dirty: boolean;
  liveSince: number;
  wasLooping: boolean;
  unobserve: () => void;
}

/** A pool scheduler: `register` a tile's element and draw function; `refresh` after reduced motion flips. */
export function createShaderScheduler(deps: ShaderSchedulerDeps, { maxLive = MAX_LIVE_TILES } = {}) {
  const entries = new Set<Entry>();
  const looping = new Set<Entry>();
  let rafId = 0;
  let seq = 0;
  let rank = true;
  const stats: ShaderSchedulerStats = { draws: 0, frames: 0, slots: 0, looping: 0 };

  const kick = () => {
    if (rafId !== 0 || deps.hidden()) return;
    rafId = deps.raf(tick);
  };

  function tick(now: number) {
    rafId = 0;
    stats.frames++;
    if (rank) {
      rank = false;
      looping.clear();
      const candidates = [...entries]
        .filter((e) => e.live && e.visible)
        .sort((a, b) => b.liveSince - a.liveSince);
      for (const e of candidates.slice(0, maxLive)) looping.add(e);
    }
    const reduced = deps.reduced();
    let again = false;
    let count = 0;
    for (const e of entries) {
      const loops = looping.has(e) && !reduced;
      // A tile that just stopped looping draws once more, so it holds a true frame.
      if (e.wasLooping && !loops) e.dirty = true;
      e.wasLooping = loops;
      if (loops) count++;
      if (!e.visible) continue;
      if (e.dirty || loops) {
        e.draw(now);
        stats.draws++;
        e.dirty = false;
      }
      if (loops) again = true;
    }
    stats.looping = count;
    if (again) kick();
  }

  const unhide = deps.onHidden(() => {
    if (deps.hidden()) {
      if (rafId !== 0) deps.caf(rafId);
      rafId = 0;
      return;
    }
    for (const e of entries) e.dirty = true;
    kick();
  });

  return {
    register(el: Element, draw: (now: number) => void): ShaderSlot {
      const e: Entry = {
        draw,
        live: false,
        visible: false,
        dirty: true,
        liveSince: 0,
        wasLooping: false,
        unobserve: () => {},
      };
      entries.add(e);
      stats.slots = entries.size;
      rank = true;
      e.unobserve = deps.observe(el, (visible) => {
        if (visible && !e.visible) e.dirty = true;
        e.visible = visible;
        rank = true;
        if (visible) kick();
      });
      return {
        requestDraw() {
          e.dirty = true;
          kick();
        },
        setLive(live) {
          if (live === e.live) return;
          e.live = live;
          if (live) e.liveSince = ++seq;
          e.dirty = true;
          rank = true;
          kick();
        },
        dispose() {
          e.unobserve();
          entries.delete(e);
          looping.delete(e);
          stats.slots = entries.size;
          rank = true;
        },
      };
    },
    /** Every tile draws again on the next frame (reduced motion flipped, the context came back). */
    refresh() {
      for (const e of entries) e.dirty = true;
      rank = true;
      kick();
    },
    stats(): ShaderSchedulerStats {
      return { ...stats };
    },
    /** Stops the loop and the hidden-tab watch. */
    dispose() {
      if (rafId !== 0) deps.caf(rafId);
      rafId = 0;
      unhide();
    },
  };
}

/** The scheduler `createShaderScheduler` makes. */
export type ShaderScheduler = ReturnType<typeof createShaderScheduler>;

/** The browser's frames, visibility and hidden flag, with tiles waking `rootMargin` before they scroll in. */
export function browserSchedulerDeps(reduced: () => boolean, rootMargin = "128px"): ShaderSchedulerDeps {
  const watchers = new Map<Element, (visible: boolean) => void>();
  const io =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(
          (records) => {
            for (const r of records) watchers.get(r.target)?.(r.isIntersecting);
          },
          { rootMargin },
        );
  return {
    raf: (cb) => requestAnimationFrame(cb),
    caf: (id) => cancelAnimationFrame(id),
    observe(el, onChange) {
      if (!io) {
        onChange(true);
        return () => {};
      }
      watchers.set(el, onChange);
      io.observe(el);
      return () => {
        io.unobserve(el);
        watchers.delete(el);
      };
    },
    hidden: () => typeof document !== "undefined" && document.hidden,
    onHidden(cb) {
      if (typeof document === "undefined") return () => {};
      document.addEventListener("visibilitychange", cb);
      return () => document.removeEventListener("visibilitychange", cb);
    },
    reduced,
  };
}
