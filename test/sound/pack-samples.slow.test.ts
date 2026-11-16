// One sample at a time through ffmpeg: slow tier. A sample made alone is the one a full build makes, an edit does what
// it says, and a pack takes a sample (or a new tempo) with its neighbours untouched.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPack } from "../../src/sound/pack/build";
import { decode, hasFfmpeg } from "../../src/sound/pack/ffmpeg";
import { readManifest } from "../../src/sound/pack/manifest";
import { commitSample, commitSamples, processSample, retunePack } from "../../src/sound/pack/sample";
import type { PackManifest } from "../../src/sound/types";
import { toneWav } from "./fixtures/tones";

const ffmpeg = hasFfmpeg();
if (!ffmpeg)
  console.warn(
    "test/sound/pack-samples.slow.test.ts: ffmpeg is not on PATH, so the pipeline tests are skipped",
  );
const withFfmpeg = ffmpeg ? test : test.skip;

const root = mkdtempSync(join(tmpdir(), "watchpot-sample-"));
const put = (dir: string, file: string, bytes: Uint8Array | string) => {
  mkdirSync(join(root, dir), { recursive: true });
  return Bun.write(join(root, dir, file), bytes);
};
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** A mono 16-bit WAV of 440 Hz: loud for its first half, a tenth as loud for its second. */
function loudThenQuiet(seconds: number): Uint8Array {
  const tone = toneWav({ hz: 440, seconds, amp: 0.5 });
  const v = new DataView(tone.buffer);
  const n = (tone.length - 44) / 2;
  for (let i = Math.floor(n / 2); i < n; i++)
    v.setInt16(44 + i * 2, Math.round(v.getInt16(44 + i * 2, true) / 10), true);
  return tone;
}

const peakOf = (x: Float32Array, from: number, to: number) =>
  x.subarray(from, to).reduce((m, v) => Math.max(m, Math.abs(v)), 0);

describe("one sample at a time", () => {
  let built: PackManifest;
  const out = join(root, "out");

  beforeAll(async () => {
    if (!ffmpeg) return;
    await put("src/shots", "a440.wav", toneWav({ hz: 440, seconds: 0.4, lead: 0.05 }));
    await put("src/shots", "low.wav", toneWav({ hz: 220, seconds: 0.3 }));
    await put("src/loops", "bed.wav", toneWav({ hz: 220, seconds: 4 }));
    built = await buildPack({
      source: join(root, "src"),
      out,
      name: "kit",
      tempo: 120,
      codec: "flac",
      log: () => {},
    });
  });

  withFfmpeg("a shot processed alone is byte for byte the file buildPack wrote, with its entry", async () => {
    const alone = await processSample({
      file: join(root, "src/shots/a440.wav"),
      name: "a440",
      kind: "shot",
      codec: "flac",
    });
    expect(alone.fileName).toBe("a440.flac");
    expect(Buffer.from(alone.bytes).equals(readFileSync(join(out, "kit", "a440.flac")))).toBe(true);
    const { url: _, ...entry } = built.samples.a440 as PackManifest["samples"][string];
    expect(alone.entry).toEqual(entry);
  });

  withFfmpeg(
    "an edit crops in source seconds and reverses: the quiet half leads, the loud half ends",
    async () => {
      await put("edit", "lq.wav", loudThenQuiet(1));
      const done = await processSample({
        file: join(root, "edit/lq.wav"),
        name: "lq",
        kind: "shot",
        codec: "flac",
        edit: { start: 0.25, end: 0.75, reverse: true },
      });
      expect(done.entry.seconds).toBeGreaterThan(0.45);
      expect(done.entry.seconds).toBeLessThan(0.51);
      await Bun.write(join(root, "edit/lq.flac"), done.bytes);
      const x = (await decode(join(root, "edit/lq.flac"))).channels[0] as Float32Array;
      const quarter = Math.floor(x.length / 4);
      expect(peakOf(x, x.length - quarter, x.length)).toBeGreaterThan(5 * peakOf(x, 0, quarter));
    },
  );

  withFfmpeg("semitones move the root and keep the length", async () => {
    const done = await processSample({
      file: join(root, "src/shots/low.wav"),
      name: "up",
      kind: "shot",
      codec: "flac",
      edit: { semitones: 12 },
    });
    expect(done.entry.rootHz ?? 0).toBeGreaterThan(440 * 0.98);
    expect(done.entry.rootHz ?? 0).toBeLessThan(440 * 1.02);
    expect(Math.abs(done.entry.seconds - 0.3)).toBeLessThan(0.01);
  });

  withFfmpeg("a loop comes out a whole number of bars at the pack's tempo", async () => {
    await put("loop", "slow.wav", toneWav({ hz: 110, seconds: 4.8 }));
    const done = await processSample({
      file: join(root, "loop/slow.wav"),
      name: "slow",
      kind: "loop",
      bpm: 100,
      tempo: 120,
    });
    expect(done.entry.bars).toBe(2);
    expect(done.entry.seconds).toBe(4);
    expect(done.tempo).toBe(120);
  });

  withFfmpeg("process then commit: the pack has the new entry and its neighbours as built", async () => {
    const done = await processSample({
      file: join(root, "src/shots/low.wav"),
      name: "fresh",
      kind: "shot",
      codec: "flac",
      edit: { fadeOut: 0.05 },
    });
    const before = await readManifest(join(out, "kit"));
    const lowBytes = readFileSync(join(out, "kit", "low.flac"));
    await commitSample({ out, pack: "kit", name: "fresh", sample: done });
    const back = await readManifest(join(out, "kit"));
    expect(back?.manifest.samples.fresh?.kind).toBe("shot");
    expect(back?.manifest.samples.low).toEqual(
      before?.manifest.samples.low as PackManifest["samples"][string],
    );
    expect(back?.manifest.samples.bed).toEqual(
      before?.manifest.samples.bed as PackManifest["samples"][string],
    );
    expect(readFileSync(join(out, "kit", "low.flac")).equals(lowBytes)).toBe(true);
  });

  withFfmpeg("retune: a loop's length moves by the tempo ratio, from the pack's own file", async () => {
    const loops = await retunePack({ out, pack: "kit", tempo: 96 });
    expect(loops.map((l) => l.name)).toEqual(["bed"]);
    expect(loops[0]?.entry.bars).toBe(2);
    expect(loops[0]?.entry.seconds).toBe(4 * (120 / 96));
    await commitSamples({ out, pack: "kit", tempo: 96, samples: loops });
    expect((await readManifest(join(out, "kit")))?.manifest.tempo).toBe(96);
  });
});
