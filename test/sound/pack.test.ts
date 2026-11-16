// The pure parts of the pack pipeline. The pipeline itself runs ffmpeg and lives in the slow tier
// (`pack.slow.test.ts`).
import { describe, expect, test } from "bun:test";
import { correlation, foldMono } from "../../src/sound/pack/measure";
import { detectRoot, rootToHz } from "../../src/sound/pack/pitch";
import { audibleRange, trimShot } from "../../src/sound/pack/trim";

describe("the pure parts", () => {
  test("YIN finds a 440 Hz tone within 1% and leaves noise without a root", () => {
    const rate = 48000;
    const sine = Float32Array.from(
      { length: 24000 },
      (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / rate),
    );
    const found = detectRoot({ channels: [sine], rate });
    expect(found?.hz).toBeGreaterThan(440 * 0.99);
    expect(found?.hz).toBeLessThan(440 * 1.01);
    let s = 1;
    const noise = Float32Array.from({ length: 24000 }, () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647 - 0.5;
    });
    expect(detectRoot({ channels: [noise], rate })).toBeNull();
  });

  test("a root is a note name or Hz", () => {
    expect(rootToHz("A4")).toBeCloseTo(440, 6);
    expect(rootToHz("C#3")).toBeCloseTo(138.59, 1);
    expect(rootToHz(220)).toBe(220);
    expect(rootToHz("nope")).toBeUndefined();
  });

  test("trim leaves under 3 ms of lead, fades the ends and cuts the quiet tail", () => {
    const rate = 48000;
    const x = new Float32Array(rate);
    for (let i = 9600; i < 19200; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * 440 * (i - 9600)) / rate);
    const t = trimShot({ channels: [x], rate });
    expect(t).not.toBeNull();
    const out = t?.pcm.channels[0] ?? new Float32Array();
    expect(Math.abs(out.length - 9600)).toBeLessThan(100);
    expect(t?.leadMs).toBeLessThan(3);
    expect(out[0]).toBe(0);
    expect(Math.abs(out[out.length - 1] as number)).toBeLessThan(0.05);
    expect(audibleRange({ channels: [new Float32Array(100)], rate })).toBeNull();
  });

  test("a stereo pair of the same signal folds to mono, a wide one stays", () => {
    const a = Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i / 7));
    const b = Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i / 11));
    expect(correlation(a, a)).toBeCloseTo(1, 6);
    expect(foldMono({ channels: [a, a.slice()], rate: 48000 }).channels).toHaveLength(1);
    expect(foldMono({ channels: [a, b], rate: 48000 }).channels).toHaveLength(2);
  });
});
