import { describe, expect, test } from "bun:test";
import {
  BANDS,
  backFrom,
  bandOf,
  type Flat,
  flatten,
  framePose,
  Glide,
  glideSeconds,
  lensFor,
  lookFrom,
  samePose,
} from "../../src/three/poses";

const A: Flat = [0, 1, 2, 0, 1, 0, 40];
const B: Flat = [3, 1.5, -1, 2, 0.8, -3, 50];

const hfov = (vfov: number, aspect: number) =>
  (2 * Math.atan(Math.tan((vfov * Math.PI) / 360) * aspect) * 180) / Math.PI;

describe("bands and lenses", () => {
  test("bands run narrow to ultrawide as the window widens", () => {
    const seen = [1.0, 1.33, 1.6, 1.78, 2.1, 2.4, 3.5].map((a) => BANDS.indexOf(bandOf(a)));
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1] as number);
    expect(bandOf(4 / 3)).toBe("narrow");
    expect(bandOf(16 / 9)).toBe("wide");
    expect(bandOf(21 / 9)).toBe("ultrawide");
  });

  test("the edges are the caller's to move", () => {
    expect(bandOf(1.6, { wide: 1.7, ultrawide: 2.5 })).toBe("narrow");
  });

  test("at the composed aspect the lens is the framing's own", () => {
    expect(lensFor(40, 16 / 9)).toBeCloseTo(40, 9);
  });

  test("a narrower window keeps the horizontal angle and opens the vertical one", () => {
    const composed = hfov(40, 16 / 9);
    for (const aspect of [1.0, 4 / 3, 1.6]) {
      const v = lensFor(40, aspect);
      expect(v).toBeGreaterThan(40);
      expect(hfov(v, aspect)).toBeCloseTo(composed, 6);
    }
  });

  test("a wider window keeps the vertical angle until the horizontal cap, then loses height", () => {
    expect(lensFor(40, 2.2)).toBeCloseTo(40, 9);
    const wide = lensFor(60, 4);
    expect(wide).toBeLessThan(60);
    expect(hfov(wide, 4)).toBeCloseTo(96, 6);
    expect(hfov(lensFor(60, 4, { maxHorizontal: 120 }), 4)).toBeCloseTo(120, 6);
  });
});

describe("framing", () => {
  const framing = {
    target: [0, 1, 0] as const,
    yaw: 20,
    pitch: 25,
    distance: 0.5,
    fov: 40,
    box: [2, 1] as const,
  };

  test("the camera looks at the target from its yaw and pitch", () => {
    const back = backFrom(20, 25);
    expect(Math.hypot(...back)).toBeCloseTo(1, 9);
    expect(back[1]).toBeGreaterThan(0);
    const at = lookFrom([0, 1, 0], 0, 0, 2);
    expect(at).toEqual([0, 1, 2]);
  });

  test("a box larger than the preferred distance shows pulls the camera back until it fits", () => {
    for (const aspect of [4 / 3, 16 / 9, 21 / 9]) {
      const pose = framePose(framing, aspect);
      const d = Math.hypot(
        pose.position[0] - pose.target[0],
        pose.position[1] - pose.target[1],
        pose.position[2] - pose.target[2],
      );
      const halfV = Math.tan((pose.fov * Math.PI) / 360);
      expect(d * halfV * 2).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(d * halfV * aspect * 2).toBeGreaterThanOrEqual(2 - 1e-9);
      expect(d).toBeGreaterThan(framing.distance);
    }
  });

  test("bounds stop the camera at the wall and widen the lens so the box still fits", () => {
    const free = framePose(framing, 16 / 9);
    const bounds = { min: [-0.6, 0, -0.6] as const, max: [0.6, 3, 0.6] as const };
    const walled = framePose(framing, 16 / 9, { bounds });
    for (let i = 0; i < 3; i++) {
      expect(walled.position[i]).toBeGreaterThanOrEqual((bounds.min[i] as number) - 1e-9);
      expect(walled.position[i]).toBeLessThanOrEqual((bounds.max[i] as number) + 1e-9);
    }
    expect(walled.fov).toBeGreaterThan(free.fov);
  });

  test("focus is the target unless the framing names one", () => {
    expect(framePose(framing, 16 / 9).focus).toEqual(framing.target);
    expect(framePose({ ...framing, focus: [1, 1, 1] }, 16 / 9).focus).toEqual([1, 1, 1]);
  });
});

describe("the glide", () => {
  test("seconds grow with the distance and stay within their bounds", () => {
    const near = glideSeconds(A, [0.1, 1, 2, 0, 1, 0, 40]);
    const far = glideSeconds(A, B);
    const across = glideSeconds(A, [30, 1, 2, 0, 1, 0, 40]);
    expect(near).toBeLessThanOrEqual(far);
    expect(far).toBeLessThanOrEqual(across);
    for (const s of [near, far, across]) {
      expect(s).toBeGreaterThanOrEqual(0.4);
      expect(s).toBeLessThanOrEqual(0.85);
    }
    expect(glideSeconds(A, [30, 1, 2, 0, 1, 0, 40], { max: 2 })).toBeGreaterThan(0.85);
  });

  test("leaves from where it was, arrives where it goes, at rest", () => {
    const g = new Glide(A, B, 10);
    expect(samePose(g.sample(10), A)).toBe(true);
    expect(samePose(g.sample(10 + g.seconds), B)).toBe(true);
    expect(samePose(g.sample(99), B)).toBe(true);
    expect(g.done(10 + g.seconds)).toBe(true);
    expect(g.done(10 + g.seconds / 2)).toBe(false);
    for (const v of g.velocity(10 + g.seconds)) expect(v).toBeCloseTo(0, 6);
    expect(g.progress(9)).toBe(0);
  });

  test("from rest it never overshoots: each number moves monotonically", () => {
    const g = new Glide(A, B, 0);
    for (let i = 0; i < 7; i++) {
      let last = A[i] as number;
      const up = (B[i] as number) >= last;
      for (let t = 0; t <= g.seconds; t += g.seconds / 50) {
        const v = g.sample(t)[i] as number;
        if (up) expect(v).toBeGreaterThanOrEqual(last - 1e-9);
        else expect(v).toBeLessThanOrEqual(last + 1e-9);
        last = v;
      }
    }
  });

  test("a retarget mid-glide keeps the place and the speed, with no jump", () => {
    const g = new Glide(A, B, 0);
    const mid = g.seconds * 0.4;
    const C: Flat = [4, 2, -2, 3, 1, -4, 55];
    const r = g.retarget(mid, C);
    const before = g.sample(mid);
    const after = r.sample(mid);
    for (let i = 0; i < 7; i++) expect(after[i]).toBeCloseTo(before[i] as number, 9);
    const v0 = g.velocity(mid);
    const v1 = r.velocity(mid);
    // The carried speed is kept wherever it heads the new way, and capped: never more than it was.
    for (let i = 0; i < 7; i++)
      expect(Math.abs(v1[i] as number)).toBeLessThanOrEqual(Math.abs(v0[i] as number) + 1e-9);
    expect(samePose(r.sample(mid + r.seconds), C)).toBe(true);
  });

  test("a carried speed against the new way is dropped rather than flung", () => {
    const g = new Glide(A, B, 0);
    const back = g.retarget(g.seconds / 2, A);
    const v = back.velocity(g.seconds / 2);
    for (let i = 0; i < 7; i++) {
      const toward = Math.sign((A[i] as number) - (back.from[i] as number));
      if (v[i] !== 0) expect(Math.sign(v[i] as number)).toBe(toward);
    }
  });

  test("samePose tolerates a millimetre and a hundredth of a degree, no more", () => {
    expect(samePose(A, [0.0005, 1, 2, 0, 1, 0, 40.005])).toBe(true);
    expect(samePose(A, [0.002, 1, 2, 0, 1, 0, 40])).toBe(false);
    expect(samePose(A, [0, 1, 2, 0, 1, 0, 40.02])).toBe(false);
    expect(flatten({ position: [1, 2, 3], target: [4, 5, 6], fov: 7 })).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
