// The device-pref stores of the 3D entry: quality tiers, the frame rate, the view settings, the stage's address
// params.
import { describe, expect, test } from "bun:test";
import { createMemoryBackend } from "../../src/core/storage";
import { createFrameCap, createFrameRate } from "../../src/three/fps";
import { readStageParams } from "../../src/three/params";
import { createQuality, DEFAULT_TIERS, type StagePreset } from "../../src/three/quality";
import { BRIGHTNESS_MAX, BRIGHTNESS_MIN, readView, VIEW_DEFAULT, viewPrefs } from "../../src/three/view";

describe("quality tiers", () => {
  test("the default tiers run lowest first and spend more as they climb", () => {
    const q = createQuality({
      key: "a.quality",
      tiers: DEFAULT_TIERS,
      initial: "high",
      backend: null,
      search: "",
    });
    expect(q.names).toEqual(["low", "medium", "high", "ultra"]);
    expect(q.lowest).toBe("low");
    const gi = ["off", "gtao", "ssgi"];
    const presets = q.names.map((n) => DEFAULT_TIERS[n]);
    for (let i = 1; i < presets.length; i++) {
      const a = presets[i - 1] as StagePreset;
      const b = presets[i] as StagePreset;
      expect(b.dpr).toBeGreaterThanOrEqual(a.dpr);
      expect(b.godraySteps).toBeGreaterThanOrEqual(a.godraySteps);
      expect(gi.indexOf(b.gi)).toBeGreaterThanOrEqual(gi.indexOf(a.gi));
    }
    // SSGI's noise needs TRAA to settle.
    for (const p of presets) if (p.gi === "ssgi") expect(p.aa).toBe("traa");
  });

  test("a choice is saved and read back by the next store; a stored tier this build lacks reads as the initial", () => {
    const backend = createMemoryBackend();
    const q = createQuality({ key: "a.quality", tiers: DEFAULT_TIERS, initial: "high", backend, search: "" });
    let heard = 0;
    q.subscribe(() => heard++);
    q.set("ultra");
    expect(heard).toBe(1);
    expect(q.preset()).toBe(DEFAULT_TIERS.ultra);
    expect(
      createQuality({ key: "a.quality", tiers: DEFAULT_TIERS, initial: "high", backend, search: "" }).get(),
    ).toBe("ultra");
    backend.setItem("a.quality", JSON.stringify({ tier: "cinematic" }));
    expect(
      createQuality({ key: "a.quality", tiers: DEFAULT_TIERS, initial: "high", backend, search: "" }).get(),
    ).toBe("high");
  });

  test("the address overrides the tier for one load without saving it", () => {
    const backend = createMemoryBackend();
    const q = createQuality({
      key: "a.quality",
      tiers: DEFAULT_TIERS,
      initial: "high",
      backend,
      search: "?quality=low",
    });
    expect(q.get()).toBe("low");
    expect(backend.getItem("a.quality")).toBeNull();
    q.set("medium");
    expect(q.get()).toBe("medium");
    expect(JSON.parse(backend.getItem("a.quality") ?? "{}")).toEqual({ tier: "medium" });
    backend.removeItem("a.quality");
    const other = createQuality({
      key: "a.quality",
      tiers: DEFAULT_TIERS,
      initial: "high",
      backend,
      search: "?tier=medium&quality=low",
      param: "tier",
    });
    expect(other.get()).toBe("medium");
    const unknown = createQuality({
      key: "a.q",
      tiers: DEFAULT_TIERS,
      initial: "high",
      backend,
      search: "?quality=max",
    });
    expect(unknown.get()).toBe("high");
    const none = createQuality({
      key: "a.q",
      tiers: DEFAULT_TIERS,
      initial: "high",
      backend,
      search: "?quality=low",
      param: null,
    });
    expect(none.get()).toBe("high");
  });

  test("a bare tier name an older build stored reads as that tier", () => {
    const backend = createMemoryBackend();
    backend.setItem("a.quality", "medium");
    const q = createQuality({ key: "a.quality", tiers: DEFAULT_TIERS, initial: "high", backend, search: "" });
    expect(q.get()).toBe("medium");
    backend.setItem("a.quality", "cinematic");
    expect(
      createQuality({ key: "a.quality", tiers: DEFAULT_TIERS, initial: "high", backend, search: "" }).get(),
    ).toBe("high");
  });

  test("a game's own preset fields ride along", () => {
    const tiers = {
      plain: { ...DEFAULT_TIERS.low, mapSize: 0 },
      rich: { ...DEFAULT_TIERS.high, mapSize: 1024 },
    };
    const q = createQuality({ key: "a.q", tiers, initial: "rich", backend: null, search: "" });
    expect(q.preset().mapSize).toBe(1024);
    q.set("plain");
    expect(q.preset().mapSize).toBe(0);
  });
});

describe("the frame cap", () => {
  const ticks = (hz: number, seconds: number) =>
    Array.from({ length: hz * seconds }, (_, i) => (i * 1000) / hz);

  test("uncapped, every tick is a frame", () => {
    const due = createFrameCap();
    expect(ticks(144, 1).every((t) => due(t, null))).toBe(true);
  });

  test("capped under the refresh rate, the frames average out to the cap", () => {
    for (const [hz, cap] of [
      [144, 60],
      [240, 90],
      [165, 30],
    ] as const) {
      const due = createFrameCap();
      const frames = ticks(hz, 4).filter((t) => due(t, cap)).length / 4;
      expect(frames).toBeGreaterThan(cap * 0.95);
      expect(frames).toBeLessThanOrEqual(cap + 1);
    }
  });

  test("a cap at the refresh rate drops no frame to timer jitter", () => {
    const due = createFrameCap();
    const jittery = ticks(60, 2).map((t, i) => 1000 + t + (i % 2 ? 0.3 : -0.3));
    expect(jittery.filter((t) => due(t, 60)).length).toBe(jittery.length);
  });

  test("after a long stall the grid restarts from now instead of bursting", () => {
    const due = createFrameCap();
    due(0, 60);
    expect(due(5000, 60)).toBe(true);
    expect(due(5001, 60)).toBe(false);
  });

  test("the store clamps the limit to its range and reads the measured rate once a second while shown", () => {
    const rate = createFrameRate({ key: "a.fps", backend: null });
    rate.prefs.set({ limit: 999 });
    expect(rate.prefs.get().limit).toBe(rate.max);
    rate.prefs.set({ limit: 1 });
    expect(rate.prefs.get().limit).toBe(rate.min);
    for (let t = 0; t < 2000; t += 10) rate.count(t);
    expect(rate.measured()).toBe(0);
    rate.prefs.set({ show: true });
    let heard = 0;
    rate.subscribe(() => heard++);
    for (let t = 10_000; t <= 12_000; t += 1000 / 50) rate.count(t);
    expect(heard).toBeGreaterThan(0);
    expect(rate.measured()).toBeGreaterThanOrEqual(48);
    expect(rate.measured()).toBeLessThanOrEqual(52);
  });

  test("a capped store's due follows the cap", () => {
    const rate = createFrameRate({ key: "a.fps", backend: null, initial: { capped: true, limit: 30 } });
    const drawn = ticks(120, 2).filter((t) => rate.due(t)).length / 2;
    expect(drawn).toBeLessThanOrEqual(31);
    expect(drawn).toBeGreaterThan(28);
  });
});

describe("the view settings", () => {
  test("readView keeps what is sound and in range, and clamps or drops the rest", () => {
    expect(readView(null)).toEqual(VIEW_DEFAULT);
    expect(readView({ brightness: 9, sway: -1, grain: "yes", depthOfField: false })).toEqual({
      brightness: BRIGHTNESS_MAX,
      sway: 0,
      grain: true,
      depthOfField: false,
    });
    expect(readView({ brightness: 0 }).brightness).toBe(BRIGHTNESS_MIN);
    expect(readView({ brightness: Number.NaN }).brightness).toBe(1);
  });

  test("a game's own fields sit beside the view's and survive a round trip", () => {
    const backend = createMemoryBackend();
    const view = viewPrefs({ key: "a.view", extra: { hints: true }, initial: { grain: false }, backend });
    expect(view.get()).toMatchObject({ grain: false, hints: true, sway: 1 });
    view.set({ hints: false, brightness: 3 });
    const again = viewPrefs({ key: "a.view", extra: { hints: true }, backend });
    expect(again.get().hints).toBe(false);
    expect(again.get().brightness).toBe(BRIGHTNESS_MAX);
  });
});

describe("the stage's address params", () => {
  test("default to a normal run and read the three switches", () => {
    expect(readStageParams("")).toEqual({ forceWebGL: false, precompile: true, perf: null });
    expect(readStageParams("?webgl&precompile=0&perf=1920x1080")).toEqual({
      forceWebGL: true,
      precompile: false,
      perf: { width: 1920, height: 1080 },
    });
    expect(readStageParams("?size=800x600", { perf: "size" }).perf).toEqual({ width: 800, height: 600 });
  });
});
