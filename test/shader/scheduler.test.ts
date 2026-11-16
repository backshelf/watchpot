import { describe, expect, test } from "bun:test";
import { createShaderScheduler, type ShaderSchedulerDeps } from "watchpot/shader";

/** Injected frames, visibility, hidden flag and reduced motion, all driven by the test. */
function harness({ reduced = false } = {}) {
  let queue: ((now: number) => void)[] = [];
  const watchers = new Map<Element, (visible: boolean) => void>();
  const hiddenListeners = new Set<() => void>();
  const state = { hidden: false, reduced, now: 0 };
  const deps: ShaderSchedulerDeps = {
    raf: (cb) => queue.push(cb),
    caf: () => {
      queue = [];
    },
    observe: (el, onChange) => {
      watchers.set(el, onChange);
      return () => watchers.delete(el);
    },
    hidden: () => state.hidden,
    onHidden: (cb) => {
      hiddenListeners.add(cb);
      return () => hiddenListeners.delete(cb);
    },
    reduced: () => state.reduced,
  };
  const scheduler = createShaderScheduler(deps, { maxLive: 2 });
  const draws = new Map<string, number>();
  const tile = (name: string, { live = false, visible = true } = {}) => {
    const el = document.createElement("canvas");
    const slot = scheduler.register(el, () => draws.set(name, (draws.get(name) ?? 0) + 1));
    watchers.get(el)?.(visible);
    if (live) slot.setLive(true);
    return { el, slot, see: (v: boolean) => watchers.get(el)?.(v) };
  };
  return {
    state,
    scheduler,
    tile,
    drawn: (name: string) => draws.get(name) ?? 0,
    frame() {
      state.now += 16;
      const run = queue;
      queue = [];
      for (const cb of run) cb(state.now);
    },
    frames(n: number) {
      for (let i = 0; i < n; i++) this.frame();
    },
    pending: () => queue.length,
    hide(hidden: boolean) {
      state.hidden = hidden;
      for (const l of hiddenListeners) l();
    },
  };
}

describe("the shader scheduler", () => {
  test("a still tile draws once; a live one every frame", () => {
    const h = harness();
    h.tile("still");
    h.tile("live", { live: true });
    h.frames(5);
    expect(h.drawn("still")).toBe(1);
    expect(h.drawn("live")).toBe(5);
  });

  test("past the live cap the newest win and the oldest hold one true frame", () => {
    const h = harness();
    h.tile("a", { live: true });
    h.frames(2);
    h.tile("b", { live: true });
    h.tile("c", { live: true });
    const before = h.drawn("a");
    h.frames(4);
    expect(h.drawn("b")).toBe(4);
    expect(h.drawn("c")).toBe(4);
    // `a` fell off the live set: one last draw so it holds a true frame, then nothing.
    expect(h.drawn("a")).toBe(before + 1);
    expect(h.scheduler.stats().looping).toBe(2);
  });

  test("an off-screen tile sleeps and draws again as it comes back", () => {
    const h = harness();
    const t = h.tile("live", { live: true });
    h.frames(2);
    t.see(false);
    h.frames(5);
    expect(h.drawn("live")).toBe(2);
    expect(h.pending()).toBe(0);
    t.see(true);
    h.frames(3);
    expect(h.drawn("live")).toBe(5);
  });

  test("a hidden tab stops the loop; showing it redraws", () => {
    const h = harness();
    h.tile("still");
    h.tile("live", { live: true });
    h.frames(2);
    h.hide(true);
    expect(h.pending()).toBe(0);
    h.frames(5);
    expect(h.drawn("live")).toBe(2);
    h.hide(false);
    h.frame();
    expect(h.drawn("live")).toBe(3);
    expect(h.drawn("still")).toBe(2);
  });

  test("under reduced motion a live tile draws one frame and holds; a request still draws", () => {
    const h = harness({ reduced: true });
    const t = h.tile("live", { live: true });
    h.frames(10);
    expect(h.drawn("live")).toBe(1);
    expect(h.pending()).toBe(0);
    t.slot.requestDraw();
    h.frames(3);
    expect(h.drawn("live")).toBe(2);
  });

  test("a disposed tile never draws again", () => {
    const h = harness();
    const t = h.tile("live", { live: true });
    h.frame();
    t.slot.dispose();
    h.frames(3);
    expect(h.drawn("live")).toBe(1);
    expect(h.scheduler.stats().slots).toBe(0);
  });
});
