// The pure parts that touch three's maths: label projection, mesh clipping, the reference cache, the turntable, the
// perf harness, the depth-of-field range and the dither threshold.
import { describe, expect, test } from "bun:test";
import { BoxGeometry, MeshBasicNodeMaterial, Object3D, PerspectiveCamera, Vector3 } from "three/webgpu";
import { createRefCache, variantKey } from "../../src/three/cache";
import { clipMesh, meshArea } from "../../src/three/clip";
import { closeIn, Turntable } from "../../src/three/inspect";
import { createLabelBoard, labelPlacement } from "../../src/three/labels";
import { fitPerf, PerfRun, parsePerfSize, percentile } from "../../src/three/perf";
import { focalRangeAt } from "../../src/three/post";
import { bayer4At } from "../../src/three/tsl";

describe("labels", () => {
  test("the view's centre lands mid-screen in whole pixels; up on screen is up", () => {
    expect(labelPlacement({ x: 0, y: 0, z: 0.5 }, 801, 600)).toEqual({ x: 401, y: 300 });
    const high = labelPlacement({ x: 0, y: 0.5, z: 0.5 }, 800, 600);
    expect(high?.y).toBeLessThan(300);
  });

  test("behind the camera or well outside the view, nothing shows", () => {
    expect(labelPlacement({ x: 0, y: 0, z: 1.2 }, 800, 600)).toBeNull();
    expect(labelPlacement({ x: 1.5, y: 0, z: 0.5 }, 800, 600)).toBeNull();
    expect(labelPlacement({ x: 1.1, y: 0, z: 0.5 }, 800, 600)).not.toBeNull();
  });

  test("a board places, hides and forgets its pins", () => {
    const camera = new PerspectiveCamera(50, 4 / 3, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const board = createLabelBoard();
    const ahead = document.createElement("div");
    const behind = document.createElement("div");
    const muted = document.createElement("div");
    board.pin(ahead, [0, 0, 0]);
    board.pin(behind, [0, 0, 10]);
    const unpin = board.pin(muted, [0, 0, 0], () => false);
    board.project(camera, 800, 600);
    expect(ahead.style.visibility).toBe("visible");
    expect(ahead.style.transform).toContain("translate(400px, 300px)");
    expect(behind.style.visibility).toBe("hidden");
    expect(muted.style.visibility).toBe("hidden");
    expect(board.size).toBe(3);
    unpin();
    expect(board.size).toBe(2);
  });
});

describe("clipMesh", () => {
  const cube = () => new BoxGeometry(1, 1, 1);

  test("a unit cube cut by the plane y = 0 keeps the top and half of every side", () => {
    const cut = clipMesh(cube(), [(p) => p.y]);
    expect(meshArea(cube())).toBeCloseTo(6, 6);
    expect(meshArea(cut)).toBeCloseTo(3, 4);
    const pos = cut.getAttribute("position");
    for (let i = 0; i < pos.count; i++) expect(pos.getY(i)).toBeGreaterThanOrEqual(-1e-5);
  });

  test("every attribute is carried and normals stay unit length", () => {
    const cut = clipMesh(cube(), [(p) => p.x + p.y]);
    expect(Object.keys(cut.attributes).sort()).toEqual(Object.keys(cube().attributes).sort());
    const n = cut.getAttribute("normal");
    for (let i = 0; i < n.count; i++) expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 5);
  });

  test("a curved level is followed, not its chord", () => {
    const ball = (p: Vector3) => 0.6 - p.length();
    const cut = clipMesh(cube(), [ball]);
    const pos = cut.getAttribute("position");
    const v = new Vector3();
    for (let i = 0; i < pos.count; i++)
      expect(v.fromBufferAttribute(pos, i).length()).toBeLessThanOrEqual(0.6 + 1e-4);
  });

  test("two fields keep only what both keep; a field keeping nothing leaves nothing", () => {
    const both = clipMesh(cube(), [(p) => p.y, (p) => p.x]);
    expect(meshArea(both)).toBeLessThan(meshArea(clipMesh(cube(), [(p) => p.y])));
    expect(meshArea(clipMesh(cube(), [() => -1]))).toBe(0);
    expect(meshArea(clipMesh(cube(), [() => 1]))).toBeCloseTo(6, 6);
  });
});

describe("the reference cache", () => {
  const made: string[] = [];
  const gone: string[] = [];
  const cache = () => {
    made.length = 0;
    gone.length = 0;
    return createRefCache<{ key: string }>({
      build: (key) => {
        made.push(key);
        return { key };
      },
      dispose: (v) => gone.push(v.key),
    });
  };

  test("holders share one value, built once and disposed when the last lets go", () => {
    const c = cache();
    const a = c.acquire("box");
    const b = c.acquire("box");
    expect(a.value).toBe(b.value);
    expect(a.built).toBe(true);
    expect(b.built).toBe(false);
    expect(c.refs("box")).toBe(2);
    a.release();
    a.release();
    expect(gone).toEqual([]);
    b.release();
    expect(gone).toEqual(["box"]);
    expect(c.size).toBe(0);
  });

  test("a prebuilt value waits for its holder, who takes the hold over", () => {
    const c = cache();
    const v = c.prebuild("first");
    expect(c.refs("first")).toBe(0);
    const held = c.acquire("first");
    expect(held.value).toBe(v);
    expect(made).toEqual(["first"]);
    held.release();
    expect(gone).toEqual(["first"]);
  });

  test("a prebuilt value nobody took is dropped; a dropped value someone holds stays", () => {
    const c = cache();
    c.prebuild("a");
    c.drop("a");
    expect(gone).toEqual(["a"]);
    const held = c.acquire("b");
    c.prebuild("b");
    c.drop("b");
    expect(c.peek("b")).toBe(held.value);
    held.release();
    expect(gone).toEqual(["a", "b"]);
  });

  test("variantKey tells apart materials that build different shaders, not values", () => {
    const a = new MeshBasicNodeMaterial({ color: "#ff0000" });
    const b = new MeshBasicNodeMaterial({ color: "#00ff00" });
    const c = new MeshBasicNodeMaterial({ color: "#ff0000", transparent: true });
    expect(variantKey(a)).toBe(variantKey(b));
    expect(variantKey(a)).not.toBe(variantKey(c));
  });
});

describe("the turntable", () => {
  const setup = () => {
    const root = new Object3D();
    const holder = new Object3D();
    const thing = new Object3D();
    root.add(holder, thing);
    thing.position.set(1, 0, 0);
    root.updateMatrixWorld(true);
    return { holder, thing, table: new Turntable(holder) };
  };

  test("a lift carries the thing to the point, then holds it; amount rises with it", () => {
    const { holder, thing, table } = setup();
    expect(table.lift(thing, new Vector3(0, 0.1, 0), new Vector3(0, 1, 0), 0)).toBe(true);
    expect(thing.parent).toBe(holder);
    expect(table.lift(thing, new Vector3(), new Vector3(), 0)).toBe(false);
    for (let t = 0; t <= 1; t += 1 / 60) table.update(t);
    expect(table.phase).toBe("held");
    expect(holder.position.distanceTo(new Vector3(0, 1, 0))).toBeLessThan(1e-6);
    expect(table.amount).toBeGreaterThan(0.9);
  });

  test("a flick keeps it turning after the release; a pause before letting go does not", () => {
    const { thing, table } = setup();
    table.lift(thing, new Vector3(), new Vector3(0, 1, 0), 0);
    for (let t = 0; t <= 1; t += 1 / 60) table.update(t);
    table.grab(0, 0, 1);
    table.drag(10, 0, 1.016);
    table.drag(20, 0, 1.032);
    table.release(1.04);
    expect(table.spinRate).toBeGreaterThan(1);
    const q = table.object?.parent?.quaternion.clone();
    table.update(1.1);
    expect(table.object?.parent?.quaternion.equals(q as never)).toBe(false);

    table.grab(0, 0, 2);
    table.drag(30, 0, 2.016);
    table.release(2.5);
    expect(table.spinRate).toBe(0);
  });

  test("a put-down sets it on the spot, resting on its centre, and says so", () => {
    const { holder, thing, table } = setup();
    table.lift(thing, new Vector3(0, 0.1, 0), new Vector3(0, 1, 0), 0);
    for (let t = 0; t <= 1; t += 1 / 60) table.update(t);
    let down = 0;
    table.putDown(new Vector3(2, 0, 0), 1, () => down++);
    for (let t = 1; t <= 2; t += 1 / 60) table.update(t);
    expect(table.phase).toBe("down");
    expect(down).toBe(1);
    expect(holder.position.x).toBeCloseTo(2, 6);
    expect(holder.position.y).toBeCloseTo(0.1, 6);
    for (let t = 2; t <= 5; t += 1 / 60) table.update(t);
    expect(table.amount).toBe(0);
  });

  test("a shot brings the camera in with the lift and steers focus", () => {
    const { thing, table } = setup();
    const camera = new PerspectiveCamera();
    camera.position.set(0, 2, 3);
    const at = new Vector3(0, 1, 0);
    const to = closeIn(camera, at, 0.25);
    expect(to.distanceTo(at)).toBeCloseTo(0.25, 9);
    table.lift(thing, new Vector3(), at, 0, { camera, to, aimFrom: new Vector3(), aimTo: at });
    for (let t = 0; t <= 1; t += 1 / 60) table.update(t);
    expect(camera.position.distanceTo(to)).toBeLessThan(1e-6);
    expect(table.focused).toBe(true);
  });
});

describe("the perf harness", () => {
  test("reads WxH from its parameter and nothing malformed", () => {
    expect(parsePerfSize("?perf=3440x1440")).toEqual({ width: 3440, height: 1440 });
    expect(parsePerfSize("?perf=big")).toBeNull();
    expect(parsePerfSize("?perf=12x12")).toBeNull();
    expect(parsePerfSize("")).toBeNull();
  });

  test("the fitted box keeps the aspect inside the window and its DPR makes the exact size", () => {
    for (const [w, h] of [
      [1920, 1080],
      [800, 1200],
    ] as const) {
      const fit = fitPerf({ width: 3440, height: 1440 }, w, h);
      expect(fit.width).toBeLessThanOrEqual(w);
      expect(fit.height).toBeLessThanOrEqual(h);
      expect(fit.width * fit.dpr).toBeCloseTo(3440, 6);
    }
  });

  test("percentiles are ordered and NaN on nothing", () => {
    const s = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(s, 0.5)).toBeLessThanOrEqual(percentile(s, 0.95));
    expect(percentile([], 0.5)).toBeNaN();
  });

  test("a run measures after its warm-up and reports once", () => {
    const reports: string[] = [];
    const run = new PerfRun(
      { width: 800, height: 600 },
      { warmup: 1, measure: 2, label: "tier=a", report: (_, l) => reports.push(l) },
    );
    for (let t = 0; t <= 5000; t += 16) run.frame(t, 2);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toContain("800x600");
    expect(reports[0]).toContain("tier=a");
    expect(run.done).toBe(true);
  });
});

describe("the depth-of-field range", () => {
  test("never tighter than the reference's and growing with distance past it", () => {
    expect(focalRangeAt(0.2)).toBe(focalRangeAt(1.3));
    expect(focalRangeAt(2.6)).toBeCloseTo(focalRangeAt(1.3) * 4, 9);
    let last = 0;
    for (let d = 0.1; d < 10; d += 0.1) {
      expect(focalRangeAt(d)).toBeGreaterThanOrEqual(last);
      last = focalRangeAt(d);
    }
    expect(focalRangeAt(5, 1, 5)).toBe(1);
  });
});

describe("the Bayer threshold", () => {
  test("a 4×4 tile holds sixteen evenly spaced levels inside 0..1 and repeats", () => {
    const levels = new Set<number>();
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) levels.add(bayer4At(x, y));
    expect(levels.size).toBe(16);
    const sorted = [...levels].sort((a, b) => a - b);
    expect(sorted[0]).toBeGreaterThan(0);
    expect(sorted[15]).toBeLessThan(1);
    for (let i = 1; i < 16; i++)
      expect((sorted[i] as number) - (sorted[i - 1] as number)).toBeCloseTo(1 / 16, 9);
    expect(bayer4At(5, 6)).toBe(bayer4At(1, 2));
    expect(bayer4At(-3, -2)).toBe(bayer4At(1, 2));
  });

  test("neighbours are far apart in level, so dots spread", () => {
    expect(Math.abs(bayer4At(0, 0) - bayer4At(1, 0))).toBeGreaterThanOrEqual(0.25);
    expect(Math.abs(bayer4At(0, 0) - bayer4At(0, 1))).toBeGreaterThanOrEqual(0.25);
  });
});
