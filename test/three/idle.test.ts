import { describe, expect, test } from "bun:test";
import { Cancelled, type IdleDeadline, runIdle } from "../../src/three/idle";

/** A schedule the test runs by hand, and a clock that moves on each time it is read, so a slice always ends. */
function harness(stepMs = 1) {
  const queue: ((d: IdleDeadline) => void)[] = [];
  let now = 0;
  return {
    schedule: (slice: (d: IdleDeadline) => void) => void queue.push(slice),
    now: () => {
      now += 0.5;
      return now;
    },
    tick: (ms = stepMs) => {
      now += ms;
    },
    /** Runs the next queued slice with `remaining` ms of idle time. */
    slice(remaining = 50) {
      const next = queue.shift();
      next?.({ didTimeout: false, timeRemaining: () => remaining });
      return next !== undefined;
    },
    get pending() {
      return queue.length;
    },
  };
}

describe("runIdle", () => {
  test("runs a few steps per slice, within the budget, until done", async () => {
    const h = harness();
    let ran = 0;
    function* steps() {
      for (let i = 0; i < 20; i++) {
        ran++;
        h.tick(1);
        yield;
      }
      return "built";
    }
    const task = runIdle(steps(), { schedule: h.schedule, now: h.now, sliceMs: 4 });
    expect(ran).toBe(0);
    h.slice();
    expect(ran).toBeGreaterThan(0);
    expect(ran).toBeLessThan(20);
    let slices = 1;
    while (h.slice()) slices++;
    expect(task.done).toBe(true);
    expect(slices).toBeGreaterThan(3);
    expect(await task.promise).toBe("built");
  });

  test("a yielded promise pauses the slices until it settles", async () => {
    const h = harness();
    const gate = Promise.withResolvers<void>();
    let after = false;
    function* steps() {
      yield gate.promise;
      after = true;
      return 1;
    }
    const task = runIdle(steps(), { schedule: h.schedule, now: h.now });
    h.slice();
    expect(h.pending).toBe(0);
    expect(after).toBe(false);
    gate.resolve();
    await gate.promise;
    await Promise.resolve();
    expect(h.pending).toBe(1);
    h.slice();
    expect(after).toBe(true);
    expect(await task.promise).toBe(1);
  });

  test("finish runs the rest at once", () => {
    const h = harness();
    function* steps() {
      for (let i = 0; i < 100; i++) yield;
      return "now";
    }
    const task = runIdle(steps(), { schedule: h.schedule, now: h.now });
    expect(task.finish()).toBe("now");
    expect(task.done).toBe(true);
  });

  test("cancel stops the steps and rejects with Cancelled; finish then throws", async () => {
    const h = harness();
    let cleaned = false;
    function* steps() {
      try {
        for (;;) yield;
      } finally {
        cleaned = true;
      }
    }
    const task = runIdle(steps(), { schedule: h.schedule, now: h.now });
    h.slice();
    task.cancel();
    expect(cleaned).toBe(true);
    await expect(task.promise).rejects.toBeInstanceOf(Cancelled);
    expect(() => task.finish()).toThrow(Cancelled);
  });

  test("a step that throws rejects the task and stops the slices", async () => {
    const h = harness();
    function* steps(): Generator<unknown, number> {
      yield;
      throw new Error("bad step");
    }
    const task = runIdle(steps(), { schedule: h.schedule, now: h.now });
    h.slice();
    await expect(task.promise).rejects.toThrow("bad step");
    expect(h.pending).toBe(0);
  });
});
