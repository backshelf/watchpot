// The pure steppers: the camera path, the eye's adaptation, the edge glance, the spring with stops, a job's move
// plan, and the easing helpers.
import { describe, expect, test } from "bun:test";
import { clamp01, easeInOut, easeOut, follow, smooth } from "../../src/three/ease";
import { makeEyes, stepEyes } from "../../src/three/eyes";
import { glanceAim, glanceState, stepGlance } from "../../src/three/glance";
import { type PathKey, poseIn, samplePath, toWorld } from "../../src/three/path";
import type { Flat } from "../../src/three/poses";
import { settled, spring, stepSpring, toMax, toMin } from "../../src/three/spring";
import { moveAt, planOf, spanOf } from "../../src/three/timeline";

const pose = (x: number): Flat => [x, 1, 0, x, 1, -1, 40];

describe("samplePath", () => {
  const keys: PathKey[] = [
    { at: 0, pose: pose(0) },
    { at: 1, pose: pose(2) },
    { at: 2, pose: pose(3), rest: true },
    { at: 4, pose: pose(1) },
  ];

  test("passes through every key at its time and holds the ends outside them", () => {
    for (const k of keys) expect(samplePath(keys, k.at)[0]).toBeCloseTo(k.pose[0], 9);
    expect(samplePath(keys, -5)).toEqual(pose(0));
    expect(samplePath(keys, 9)).toEqual(pose(1));
  });

  test("flows through an inner key and stops at a rest key and at the ends", () => {
    const speed = (t: number) => (samplePath(keys, t + 1e-4)[0] - samplePath(keys, t - 1e-4)[0]) / 2e-4;
    expect(Math.abs(speed(1))).toBeGreaterThan(0.1);
    expect(Math.abs(speed(2))).toBeLessThan(1e-3);
    expect(Math.abs(samplePath(keys, 1e-4)[0] - samplePath(keys, 0)[0]) / 1e-4).toBeLessThan(1e-2);
  });

  test("an empty path leaves the output alone", () => {
    const out: Flat = [9, 9, 9, 9, 9, 9, 9];
    expect(samplePath([], 1, out)).toEqual([9, 9, 9, 9, 9, 9, 9]);
  });

  test("a placed frame turns and moves points into the world", () => {
    const place = { position: [1, 0, 1] as const, rotationY: Math.PI / 2 };
    const p = toWorld(place, [1, 2, 0]);
    expect(p[0]).toBeCloseTo(1, 9);
    expect(p[1]).toBe(2);
    expect(p[2]).toBeCloseTo(0, 9);
    expect(poseIn(place, [0, 0, 0], [1, 0, 0], 30)).toHaveLength(7);
  });
});

describe("the eye's adaptation", () => {
  const run = (away: boolean, seconds: number, e = makeEyes()) => {
    const out: number[] = [];
    for (let t = 0; t < seconds; t += 1 / 60) out.push(stepEyes(e, away, 1 / 60));
    return { out, e };
  };

  test("setting off for the dim place the picture dips under where it settles, then recovers to 0", () => {
    const { out, e } = run(true, 12);
    expect(Math.min(...out)).toBeLessThan(-0.2);
    expect(Math.min(...out)).toBeGreaterThanOrEqual(-0.87);
    expect(out[out.length - 1]).toBe(0);
    expect(e.scene).toBe(1);
    expect(e.eye).toBe(1);
  });

  test("coming back it overshoots bright and eases down", () => {
    const { e } = run(true, 12);
    const back = run(false, 12, e).out;
    expect(Math.max(...back)).toBeGreaterThan(0.2);
    expect(back[back.length - 1]).toBe(0);
  });

  test("a deeper option dips deeper, and a long step is clamped", () => {
    const shallow = makeEyes();
    const deep = makeEyes();
    expect(stepEyes(deep, true, 0.1, { depth: 2 })).toBeLessThan(stepEyes(shallow, true, 0.1));
    const a = makeEyes();
    const b = makeEyes();
    expect(stepEyes(a, true, 5)).toBe(stepEyes(b, true, 0.1));
  });
});

describe("the edge glance", () => {
  const hold = (g: ReturnType<typeof glanceState>, x: number, seconds: number, free = true) => {
    for (let t = 0; t < seconds; t += 1 / 60) stepGlance(g, x, 1 / 60, free, false);
    return g;
  };

  test("a pass across the edge does not turn the head; a rest there does", () => {
    const g = hold(glanceState(), 0.95, 0.2);
    expect(g.side).toBe(0);
    hold(g, 0.95, 0.3);
    expect(g.side).toBe(1);
    hold(g, 0.95, 4);
    expect(g.amount).toBeGreaterThan(0.95);
  });

  test("the turn holds while the pointer travels in, and lets go well past the middle", () => {
    const g = hold(glanceState(), -0.95, 1);
    expect(g.side).toBe(-1);
    hold(g, 0.2, 0.5);
    expect(g.side).toBe(-1);
    hold(g, 0.5, 4);
    expect(g.side).toBe(0);
    expect(g.amount).toBeLessThan(0.2);
  });

  test("a lean ahead of the edge stays small", () => {
    const g = hold(glanceState(), 0.85, 5);
    expect(g.side).toBe(0);
    expect(g.amount).toBeGreaterThan(0);
    expect(g.amount).toBeLessThanOrEqual(0.16 + 1e-9);
  });

  test("a held button freezes it and a lost freedom lets it go", () => {
    const g = hold(glanceState(), 0.95, 1);
    const amount = g.amount;
    stepGlance(g, -1, 1, true, true);
    expect(g.amount).toBe(amount);
    hold(g, 0.95, 3, false);
    expect(g.side).toBe(0);
    expect(g.amount).toBeLessThan(0.01);
  });

  test("the aim turns from the base to the side about the eye", () => {
    const eye = [0, 1, 0] as const;
    const base = [0, 1, -2] as const;
    const side = [2, 1, 0] as const;
    const at0 = glanceAim(eye, base, side, 0);
    const at1 = glanceAim(eye, base, side, 1);
    for (let i = 0; i < 3; i++) {
      expect(at0[i]).toBeCloseTo(base[i] as number, 9);
      expect(at1[i]).toBeCloseTo(side[i] as number, 9);
    }
    const half = glanceAim(eye, base, side, 0.5);
    expect(Math.hypot(half[0] - eye[0], half[2] - eye[2])).toBeCloseTo(2, 9);
  });
});

describe("the spring with stops", () => {
  const stops = { max: 0.3 };

  test("pulled out it knocks against the far stop, stays inside the stops, and settles there", () => {
    const s = spring(stops);
    s.target = toMax(stops);
    let knocked = false;
    for (let i = 0; i < 240; i++) {
      const k = stepSpring(s, stops, 1 / 60);
      if (k?.stop === "max") knocked = true;
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(0.3);
    }
    expect(knocked).toBe(true);
    expect(s.x).toBeCloseTo(0.3, 3);
    expect(settled(s)).toBe(true);
  });

  test("pushed home it knocks against the near stop", () => {
    const s = spring(stops);
    s.x = 0.3;
    s.target = toMin(stops);
    let knock = null as ReturnType<typeof stepSpring>;
    for (let i = 0; i < 120 && !knock; i++) knock = stepSpring(s, stops, 1 / 60);
    expect(knock?.stop).toBe("min");
    expect(knock?.speed).toBeGreaterThan(0);
  });

  test("a full load answers slower than an empty one", () => {
    const light = spring(stops, 0);
    const heavy = spring(stops, 1);
    light.target = toMax(stops);
    heavy.target = toMax(stops);
    for (let i = 0; i < 6; i++) {
      stepSpring(light, stops, 1 / 60);
      stepSpring(heavy, stops, 1 / 60);
    }
    expect(heavy.x).toBeLessThan(light.x);
  });

  test("one long frame lands where many short ones do", () => {
    const a = spring(stops);
    const b = spring(stops);
    a.target = 0.15;
    b.target = 0.15;
    stepSpring(a, stops, 0.1);
    for (let i = 0; i < 6; i++) stepSpring(b, stops, 1 / 60);
    expect(a.x).toBeCloseTo(b.x, 2);
  });
});

describe("the move plan", () => {
  const moves = [
    { kind: "reach", seconds: 1 },
    { kind: "wait", seconds: 2, dwell: true },
    { kind: "drop", seconds: 1 },
  ] as const;

  const contiguous = (plan: ReturnType<typeof planOf>) => {
    expect(plan[0]?.from).toBe(0);
    expect(plan[plan.length - 1]?.to).toBe(1);
    for (let i = 1; i < plan.length; i++) expect(plan[i]?.from).toBe(plan[i - 1]?.to as number);
  };

  test("a plan runs 0 to 1 without gaps, at every job length", () => {
    for (const seconds of [0.5, 4, 40]) contiguous(planOf(moves, seconds));
  });

  test("a long job stretches the motions only so far and gives the rest to the dwell", () => {
    const plan = planOf(moves, 40);
    const reach = spanOf(plan, "reach");
    expect((reach.to - reach.from) * 40).toBeLessThanOrEqual(1.6 + 1e-9);
    const wait = spanOf(plan, "wait");
    expect(wait.to - wait.from).toBeGreaterThan(0.9);
  });

  test("a short job plays every move at its natural share", () => {
    const plan = planOf(moves, 1);
    const reach = spanOf(plan, "reach");
    expect(reach.to - reach.from).toBeCloseTo(0.25, 9);
  });

  test("moveAt finds the move and how far through it", () => {
    const plan = planOf(moves, 4);
    expect(moveAt(plan, 0).kind).toBe("reach");
    expect(moveAt(plan, 0.125)).toMatchObject({ kind: "reach", t: 0.5 });
    expect(moveAt(plan, 0.6).kind).toBe("wait");
    expect(moveAt(plan, 2)).toMatchObject({ kind: "drop", t: 1 });
    expect(spanOf(plan, "missing" as "reach")).toEqual({ from: 1, to: 1 });
  });
});

describe("easing", () => {
  test("every curve runs 0 to 1 and holds outside", () => {
    for (const f of [easeOut, easeInOut, smooth]) {
      expect(f(0)).toBe(0);
      expect(f(1)).toBe(1);
      expect(f(-1)).toBe(0);
      expect(f(2)).toBe(1);
      expect(f(0.25)).toBeLessThan(f(0.75));
    }
    expect(clamp01(5)).toBe(1);
  });

  test("follow is its own factor at 60 fps and reads alike at any rate", () => {
    expect(follow(0.2, 1 / 60)).toBeCloseTo(0.2, 9);
    const one = follow(0.2, 1 / 30);
    const two = 1 - (1 - follow(0.2, 1 / 60)) ** 2;
    expect(one).toBeCloseTo(two, 9);
    expect(follow(0.2, 5)).toBe(follow(0.2, 0.1));
  });
});
