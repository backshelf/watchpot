import { describe, expect, test } from "bun:test";
import { act, render } from "@testing-library/react";
import { StrictMode } from "react";
import {
  type Cue,
  type CueBatch,
  createDirector,
  type Director,
  type DirectorOptions,
  useStage,
} from "../../../src/kit/fx/director";

/** A clock and a scheduler the test moves by hand. */
function manualTime() {
  let t = 0;
  let pending: { at: number; fn: () => void; live: boolean }[] = [];
  return {
    now: () => t,
    schedule(fn: () => void, ms: number) {
      const job = { at: t + ms, fn, live: true };
      pending.push(job);
      return () => {
        job.live = false;
      };
    },
    advance(ms: number) {
      const end = t + ms;
      for (;;) {
        const due = pending.filter((j) => j.live && j.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        t = due.at;
        due.live = false;
        due.fn();
      }
      t = end;
      pending = pending.filter((j) => j.live);
    },
    pendingCount: () => pending.filter((j) => j.live).length,
  };
}

type Data = string;

function setup(options: DirectorOptions = {}) {
  const time = manualTime();
  const director = createDirector<Data>({
    now: time.now,
    schedule: time.schedule,
    reduced: () => false,
    coalesceMs: 100,
    gapMs: 500,
    ...options,
  });
  const batches: CueBatch<Data>[] = [];
  director.onBatch((b) => batches.push(b));
  return { time, director, batches };
}

const cue = (
  tier: Cue<Data>["tier"],
  kind: string,
  data = kind,
  extra: Partial<Cue<Data>> = {},
): Cue<Data> => ({
  tier,
  kind,
  data,
  mine: true,
  ...extra,
});

describe("smalls", () => {
  test("of one kind within the window go out as one batch, other kinds apart", () => {
    const { time, director, batches } = setup();
    director.push(cue("small", "stamp", "a"));
    time.advance(50);
    director.push(cue("small", "stamp", "b"));
    director.push(cue("small", "level", "c"));
    expect(batches).toHaveLength(0);
    time.advance(50);
    expect(batches.map((b) => [b.kind, b.cues.map((c) => c.data)])).toEqual([["stamp", ["a", "b"]]]);
    time.advance(50);
    expect(batches.map((b) => b.kind)).toEqual(["stamp", "level"]);
  });

  test("a micro goes out at once, alone", () => {
    const { director, batches } = setup();
    director.push(cue("micro", "tick"));
    director.push(cue("micro", "tick"));
    expect(batches.map((b) => b.cues.length)).toEqual([1, 1]);
  });
});

describe("the stage", () => {
  test("takes mediums one at a time, a gap apart", () => {
    const { time, director } = setup();
    director.push(cue("medium", "page", "one"));
    director.push(cue("medium", "page", "two"));
    expect(director.stage()?.data).toBe("one");
    expect(director.waiting()).toBe(1);
    director.done(director.stage()?.id);
    expect(director.stage()).toBeNull();
    time.advance(499);
    expect(director.stage()).toBeNull();
    time.advance(1);
    expect(director.stage()?.data).toBe("two");
  });

  test("a medium past the queue's limit goes out as a small", () => {
    const { time, director, batches } = setup({ maxQueue: 1 });
    director.push(cue("medium", "page", "on"));
    director.push(cue("medium", "page", "waits"));
    director.push(cue("medium", "page", "over"));
    expect(director.waiting()).toBe(1);
    time.advance(100);
    expect(batches.map((b) => b.cues.map((c) => c.data))).toEqual([["over"]]);
    expect(director.log().some((l) => l.fate === "demoted")).toBe(true);
  });

  test("a big cuts a medium short (handing it to the smalls), jumps the mediums, and bigs keep their order", () => {
    const { time, director, batches } = setup();
    director.push(cue("medium", "page", "m1"));
    const cutId = director.stage()?.id;
    director.push(cue("medium", "page", "m2"));
    director.push(cue("big", "seal", "b1"));
    director.push(cue("big", "seal", "b2"));
    expect(director.stage()?.data).toBe("b1");
    // The cut medium's renderer ending late ends nothing.
    director.done(cutId);
    expect(director.stage()?.data).toBe("b1");
    // The cut medium waits out the big show as a held small.
    time.advance(100);
    expect(batches).toHaveLength(0);
    director.done(director.stage()?.id);
    expect(batches.map((b) => b.cues.map((c) => c.data))).toEqual([["m1"]]);
    time.advance(500);
    expect(director.stage()?.data).toBe("b2");
    director.done();
    time.advance(500);
    expect(director.stage()?.data).toBe("m2");
  });

  test("smalls held behind a big show go out after it, only the newest few", () => {
    const { time, director, batches } = setup({ releaseMost: 2 });
    director.push(cue("big", "seal"));
    for (const k of ["a", "b", "c"]) {
      director.push(cue("small", k));
      time.advance(100);
    }
    expect(batches).toHaveLength(0);
    director.done();
    expect(batches.map((b) => b.kind)).toEqual(["b", "c"]);
  });
});

describe("the machine", () => {
  const machineCue = (tier: Cue<Data>["tier"], kind: string, first = false) =>
    cue(tier, kind, kind, { mine: false, first });

  test("its smalls show only when they hold a first, one per gap, the rest waiting their turn", () => {
    const { time, director, batches } = setup({ machine: { gapMs: 1000, waitingMost: 2 } });
    director.push(machineCue("small", "best"));
    time.advance(100);
    expect(batches).toHaveLength(0);
    expect(director.log().at(-1)?.fate).toBe("dropped");

    director.push(machineCue("small", "stamp", true));
    time.advance(100);
    expect(batches.map((b) => b.kind)).toEqual(["stamp"]);

    for (const k of ["x", "y", "z"]) {
      director.push(machineCue("small", k, true));
      time.advance(100);
    }
    // Two may wait: x gave way to y and z.
    expect(batches).toHaveLength(1);
    time.advance(1000);
    expect(batches.map((b) => b.kind)).toEqual(["stamp", "y"]);
    time.advance(1000);
    expect(batches.map((b) => b.kind)).toEqual(["stamp", "y", "z"]);
  });

  test("kindGapMs drops a machine's batch of a kind shown too recently", () => {
    const { time, director, batches } = setup({ machine: { gapMs: 0, kindGapMs: 1000 } });
    director.push(machineCue("small", "stage", true));
    time.advance(100);
    director.push(machineCue("small", "stage", true));
    time.advance(100);
    expect(batches).toHaveLength(1);
    time.advance(1000);
    director.push(machineCue("small", "stage", true));
    time.advance(100);
    expect(batches).toHaveLength(2);
  });

  test("the player's own smalls are never rationed", () => {
    const { time, director, batches } = setup({ machine: { gapMs: 1000 } });
    for (const k of ["a", "b", "c"]) director.push(cue("small", k));
    time.advance(100);
    expect(batches).toHaveLength(3);
  });

  test("a machine's cue keeps its tier by default", () => {
    const { director } = setup({ machine: {} });
    director.push(machineCue("big", "seal"));
    expect(director.stage()?.tier).toBe("big");
  });

  test("with downscale, a machine's cue that is not a first drops a tier; a first keeps it", () => {
    const { director } = setup({ machine: { firstsOnly: false, downscale: true } });
    director.push(machineCue("big", "seal"));
    expect(director.stage()?.tier).toBe("medium");
    expect(director.stage()?.pushed).toBe("big");
    director.clear();
    director.push(machineCue("big", "seal", true));
    expect(director.stage()?.tier).toBe("big");
  });

  test("an unset `mine` asks the director's `mine()` at the push", () => {
    let hand = false;
    const { director } = setup({ mine: () => hand, machine: { downscale: true } });
    director.push({ tier: "medium", kind: "page", data: "x" });
    expect(director.stage()).toBeNull();
    hand = true;
    director.push({ tier: "medium", kind: "page", data: "y" });
    expect(director.stage()?.data).toBe("y");
    expect(director.stage()?.mine).toBe(true);
  });
});

describe("the rest", () => {
  test("reduced motion is read as a cue goes out", () => {
    let reduced = true;
    const { time, director, batches } = setup({ reduced: () => reduced });
    director.push(cue("medium", "page"));
    expect(director.stage()?.reduced).toBe(true);
    reduced = false;
    director.push(cue("small", "a"));
    time.advance(100);
    expect(batches[0]?.reduced).toBe(false);
  });

  test("replay pushes a named sample as the player's", () => {
    const { director } = setup({ machine: {} });
    director.sample("banner", () => ({ tier: "medium", kind: "page", data: "sample" }));
    expect(director.samples()).toEqual(["banner"]);
    expect(director.replay("banner")).toBe(true);
    expect(director.stage()?.data).toBe("sample");
    expect(director.replay("nothing")).toBe(false);
  });

  test("clear drops what waits and what is buffered; dispose cancels every timer", () => {
    const { time, director, batches } = setup();
    director.push(cue("medium", "page"));
    director.push(cue("medium", "page"));
    director.push(cue("small", "a"));
    director.clear();
    expect(director.stage()).toBeNull();
    expect(director.waiting()).toBe(0);
    time.advance(1000);
    expect(batches).toHaveLength(0);

    director.push(cue("small", "b"));
    director.dispose();
    expect(time.pendingCount()).toBe(0);
  });

  test("the log keeps only the newest lines", () => {
    const { director } = setup({ logMost: 3 });
    for (let i = 0; i < 10; i++) director.push(cue("micro", `k${i}`));
    expect(director.log().map((l) => l.kind)).toEqual(["k7", "k8", "k9"]);
  });
});

let staged: string | null = null;
function Stage({ director }: { director: Director<Data> }) {
  staged = useStage(director)?.data ?? null;
  return null;
}

describe("useStage", () => {
  test("follows the stage under StrictMode", () => {
    const { director } = setup();
    render(
      <StrictMode>
        <Stage director={director} />
      </StrictMode>,
    );
    expect(staged).toBeNull();
    act(() => director.push(cue("medium", "page", "on")));
    expect(staged).toBe("on");
    act(() => director.done());
    expect(staged).toBeNull();
  });
});
