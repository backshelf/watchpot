// The pack pipeline end to end, through ffmpeg: slow tier, since every build spawns it several times.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPack } from "../../src/sound/pack/build";
import { decode, hasFfmpeg } from "../../src/sound/pack/ffmpeg";
import type { PackManifest } from "../../src/sound/types";
import { toneWav } from "./fixtures/tones";

const ffmpeg = hasFfmpeg();
if (!ffmpeg)
  console.warn("test/sound/pack.slow.test.ts: ffmpeg is not on PATH, so the pipeline tests are skipped");
const withFfmpeg = ffmpeg ? test : test.skip;

const quiet = () => {};
const root = mkdtempSync(join(tmpdir(), "watchpot-pack-"));
const put = (dir: string, file: string, bytes: Uint8Array | string) => {
  mkdirSync(join(root, dir), { recursive: true });
  return Bun.write(join(root, dir, file), bytes);
};

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("buildPack", () => {
  let manifest: PackManifest;
  let packText = "";

  beforeAll(async () => {
    if (!ffmpeg) return;
    await put("main/shots", "a440.wav", toneWav({ hz: 440, seconds: 0.4 }));
    await put("main/shots", "late.wav", toneWav({ hz: 330, seconds: 0.4, lead: 0.2 }));
    await put("main/shots", "loud.wav", toneWav({ hz: 300, seconds: 0.6, amp: 0.5 }));
    await put("main/shots", "quiet.wav", toneWav({ hz: 300, seconds: 0.6, amp: 0.125 }));
    await put("main/shots", "round.wav", toneWav({ hz: 4000, seconds: 0.6, lead: 0.1 }));
    await put("main/shots", "round.wav.json", JSON.stringify({ loop: true }));
    await put("main/loops", "bed.wav", toneWav({ hz: 220, seconds: 4 }));
    await put("main/loops", "bed.wav.json", JSON.stringify({ bpm: 120, source: "generated" }));
    await put("main/loops", "slow.wav", toneWav({ hz: 110, seconds: 4.8 }));
    await put("main/loops", "slow.wav.json", JSON.stringify({ bpm: 100 }));
    // 4 bars at 112.5 bpm: a ratio (16/15) at which rubberband ends about 70 ms early.
    await put("main/loops", "tail.wav", toneWav({ hz: 165, seconds: 8.53333 }));
    await put("main/loops", "tail.wav.json", JSON.stringify({ bpm: 112.5 }));
    manifest = await buildPack({
      source: join(root, "main"),
      out: join(root, "out"),
      name: "main",
      tempo: 120,
      key: "A",
      codec: "flac",
      log: quiet,
    });
    packText = readFileSync(join(root, "out", "main", "pack.ts"), "utf8");
  });

  withFfmpeg("a 440 Hz tone gets a root within 1%", () => {
    const hz = manifest.samples.a440?.rootHz ?? 0;
    expect(hz).toBeGreaterThan(440 * 0.99);
    expect(hz).toBeLessThan(440 * 1.01);
  });

  withFfmpeg("200 ms of leading silence is gone: the sound starts within 3 ms", async () => {
    const pcm = await decode(join(root, "out", "main", "late.flac"));
    const first = (pcm.channels[0] as Float32Array).findIndex((v) => Math.abs(v) > 0.05);
    expect(first / 48000).toBeLessThan(0.003);
    expect(manifest.samples.late?.seconds).toBeLessThan(0.41);
  });

  withFfmpeg("a shot marked loop keeps its ends: nothing trimmed, nothing faded", async () => {
    const pcm = (await decode(join(root, "out", "main", "round.flac"))).channels[0] as Float32Array;
    // Its 100 ms of lead is still there, where a plain shot's is cut.
    expect(manifest.samples.round?.seconds).toBeCloseTo(0.7, 2);
    const peakOf = (from: number, to: number) =>
      pcm.slice(from, to).reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    const whole = peakOf(0, pcm.length);
    // The last half millisecond is at full level: a 2 ms fade would leave it under a quarter.
    expect(peakOf(pcm.length - 24, pcm.length)).toBeGreaterThan(0.5 * whole);
  });

  withFfmpeg("two tones 12 dB apart come out within 1 LU, peaks under -1 dBFS, mono kept mono", () => {
    const a = manifest.samples.loud;
    const b = manifest.samples.quiet;
    expect(Math.abs((a?.lufs ?? 0) - (b?.lufs ?? 99))).toBeLessThan(1);
    expect(Math.abs((a?.lufs ?? 0) + 18)).toBeLessThan(1);
    for (const s of [a, b]) {
      expect(s?.peak ?? 1).toBeLessThan(10 ** (-1 / 20) + 1e-3);
      expect(s?.channels).toBe(1);
    }
  });

  withFfmpeg("a loop at its tempo is an exact bar multiple and the module imports each file", async () => {
    const bed = manifest.samples.bed;
    expect(bed?.kind).toBe("loop");
    expect(bed?.bars).toBe(2);
    expect(bed?.seconds).toBe(4);
    const pcm = await decode(join(root, "out", "main", "bed.flac"));
    expect((pcm.channels[0] as Float32Array).length).toBe(4 * 48000);
    expect(manifest.tempo).toBe(120);
    // A 100 bpm loop is stretched (rubberband) to the pack tempo and cut to whole bars.
    expect(manifest.samples.slow?.bars).toBe(2);
    expect(manifest.samples.slow?.seconds).toBe(4);
    // A stretch by 16/15 keeps its tail: the loop is its four bars, and still sounding in its last 50 ms.
    expect(manifest.samples.tail?.bars).toBe(4);
    expect(manifest.samples.tail?.seconds).toBe(8);
    const tail = (await decode(join(root, "out", "main", "tail.flac"))).channels[0] as Float32Array;
    const end = tail.slice(tail.length - 2400).reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(end).toBeGreaterThan(0.01);
    expect(packText).toContain('import s0 from "./a440.flac";');
    expect(packText).toContain("export const pack: PackManifest");
    expect(packText).toContain('"bed": {');
  });

  withFfmpeg("a loop 4.03 s long at 120 bpm (2.015 bars) fails, naming the file", async () => {
    await put("bad/loops", "drift.wav", toneWav({ hz: 220, seconds: 4.03 }));
    await expect(
      buildPack({ source: join(root, "bad"), out: join(root, "out"), name: "bad", tempo: 120, log: quiet }),
    ).rejects.toThrow(/drift\.wav.*bars/);
  });

  withFfmpeg("a loop with no sidecar and no pack tempo is an error naming the file", async () => {
    await put("notempo/loops", "lonely.wav", toneWav({ hz: 220, seconds: 2 }));
    await expect(
      buildPack({ source: join(root, "notempo"), out: join(root, "out"), name: "nt", log: quiet }),
    ).rejects.toThrow(/lonely\.wav/);
  });

  withFfmpeg("two files that would share a sample name are an error, not an overwrite", async () => {
    await put("dupe/shots", "hit.wav", toneWav({ hz: 440, seconds: 0.2 }));
    await put("dupe/loops", "hit.wav", toneWav({ hz: 440, seconds: 2 }));
    await expect(
      buildPack({ source: join(root, "dupe"), out: join(root, "out"), name: "dupe", tempo: 120, log: quiet }),
    ).rejects.toThrow(/"hit"/);
  });
});
