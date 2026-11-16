// One sample at a time, without ffmpeg: names that become paths, the edit's own parts, kept sources and their
// sidecars, and a pack's manifest read back from its `pack.ts` and rewritten.
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkEdit, shapeEdit } from "../../src/sound/pack/edit";
import { manifestSource, readManifest } from "../../src/sound/pack/manifest";
import { commitSample, commitSamples } from "../../src/sound/pack/sample";
import { isSafeName, keepSource, listSources, readSidecar, type Sidecar } from "../../src/sound/pack/source";
import type { PackManifest } from "../../src/sound/types";

const root = mkdtempSync(join(tmpdir(), "watchpot-samples-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;
const fresh = () => {
  const dir = join(root, `t${n++}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

const entry = (seconds: number, kind: "shot" | "loop" = "shot") => ({
  seconds,
  channels: 1 as const,
  lufs: -18.04,
  peak: 0.81234,
  kind,
  ...(kind === "loop" ? { bars: 2 } : { rootHz: 440.12 }),
});

/** A pack on disk as `buildPack` leaves it: a file per sample and the generated `pack.ts`. */
function packOf(dir: string, manifest: PackManifest): void {
  const files: Record<string, string> = {};
  mkdirSync(join(dir, manifest.name), { recursive: true });
  for (const name of Object.keys(manifest.samples)) {
    files[name] = `${name}.opus`;
    writeFileSync(join(dir, manifest.name, files[name]), name);
  }
  writeFileSync(join(dir, manifest.name, "pack.ts"), manifestSource(manifest, files));
}

const three = (): PackManifest => ({
  name: "kit",
  tempo: 120,
  key: "Am",
  samples: {
    bed: { url: "bed.opus", ...entry(4, "loop"), source: 'a "quoted" place' },
    hat: { url: "hat.opus", ...entry(0.2) },
    kick: { url: "kick.opus", ...entry(0.4) },
  },
});

describe("names that become paths", () => {
  test("letters, digits, dot, underscore and dash; never a dot first, a separator or a drive", () => {
    for (const ok of ["kick", "hat-open", "a.b_c", "K9", "-x"]) expect(isSafeName(ok)).toBe(true);
    for (const bad of [
      "",
      ".",
      "..",
      ".staged",
      "a/b",
      "a\\b",
      "../x",
      "c:",
      "a b",
      "x".repeat(101),
      3,
      null,
    ])
      expect(isSafeName(bad)).toBe(false);
  });
});

describe("the edit", () => {
  test("is checked: a bad field is named, an empty edit is none", () => {
    expect(checkEdit({})).toBeUndefined();
    expect(checkEdit({ semitones: 0, reverse: false })).toBeUndefined();
    expect(() => checkEdit({ start: 1, end: 0.5 })).toThrow(/ends/);
    expect(() => checkEdit({ fadeIn: -1 })).toThrow(/fadeIn/);
    expect(() => checkEdit({ semitones: 30 })).toThrow(/semitones/);
    expect(() => checkEdit({ reverse: "yes" })).toThrow(/reverse/);
    expect(checkEdit({ start: 0.1, semitones: -3 })).toEqual({ start: 0.1, semitones: -3 });
  });

  test("crops in source seconds, reverses what is left, then fades the ends of what plays", () => {
    const ramp = Float32Array.from({ length: 10 }, (_, i) => i);
    const out = shapeEdit(
      { channels: [ramp], rate: 10 },
      { start: 0.2, end: 0.6, reverse: true, fadeIn: 0.2 },
    );
    expect([...(out.channels[0] as Float32Array)]).toEqual([0, 2, 3, 2]);
    expect([...ramp]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe("kept sources", () => {
  test("a sidecar round-trips with its edit, and a kept source replaces the one that gave the same name", async () => {
    const source = fresh();
    mkdirSync(join(source, "shots", "sub"), { recursive: true });
    writeFileSync(join(source, "shots", "sub", "x.wav"), "old");
    writeFileSync(join(source, "shots", "sub", "x.wav.json"), "{}");
    const recording = join(source, "new.flac");
    writeFileSync(recording, "new");
    const sidecar: Sidecar = {
      bpm: 96,
      bars: 4,
      root: "A3",
      loop: true,
      source: "new.flac",
      edit: { start: 0.1 },
    };
    const kept = await keepSource({ source, name: "sub-x", kind: "loop", file: recording, sidecar });
    expect(kept).toBe(join(source, "loops", "sub-x.flac"));
    expect(existsSync(join(source, "shots", "sub", "x.wav"))).toBe(false);
    expect(existsSync(join(source, "shots", "sub", "x.wav.json"))).toBe(false);
    expect(listSources(source).map((s) => [s.name, s.kind])).toEqual([["sub-x", "loop"]]);
    expect(await readSidecar(kept)).toEqual(sidecar);
    // A source that says nothing has no sidecar at all.
    await keepSource({ source, name: "plain", kind: "shot", file: recording, sidecar: {} });
    expect(existsSync(join(source, "shots", "plain.flac.json"))).toBe(false);
  });

  test("a sidecar with a bad edit is an error naming its file", async () => {
    const dir = fresh();
    writeFileSync(join(dir, "a.wav.json"), JSON.stringify({ edit: { start: 2, end: 1 } }));
    await expect(readSidecar(join(dir, "a.wav"))).rejects.toThrow(/a\.wav\.json/);
  });
});

describe("the manifest read back from pack.ts", () => {
  test("is the manifest that was written, with each sample's file name", async () => {
    const out = fresh();
    packOf(out, three());
    const back = await readManifest(join(out, "kit"));
    expect(back?.manifest).toEqual(three());
    expect(back?.files).toEqual({ bed: "bed.opus", hat: "hat.opus", kick: "kick.opus" });
    expect(await readManifest(join(out, "none"))).toBeNull();
  });

  test("a replaced entry changes its own line and nothing else", async () => {
    const out = fresh();
    packOf(out, three());
    const before = readFileSync(join(out, "kit", "pack.ts"), "utf8").split("\n");
    await commitSample({
      out,
      pack: "kit",
      name: "hat",
      sample: { bytes: new Uint8Array([1, 2, 3]), fileName: "hat.opus", entry: entry(0.33) },
    });
    const after = readFileSync(join(out, "kit", "pack.ts"), "utf8").split("\n");
    const changed = after.flatMap((line, i) => (line === before[i] ? [] : [line]));
    expect(after).toHaveLength(before.length);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toContain('"hat": {');
    expect(changed[0]).toContain("seconds: 0.33");
    expect([...readFileSync(join(out, "kit", "hat.opus"))]).toEqual([1, 2, 3]);
  });

  test("an added entry is written as buildPack would write the whole pack; a new codec drops the old file", async () => {
    const out = fresh();
    packOf(out, three());
    const written = await commitSamples({
      out,
      pack: "kit",
      samples: [
        { name: "clap", bytes: new Uint8Array([9]), fileName: "clap.opus", entry: entry(0.1) },
        { name: "kick", bytes: new Uint8Array([8]), fileName: "kick.flac", entry: entry(0.5) },
      ],
    });
    const back = await readManifest(join(out, "kit"));
    expect(back?.manifest).toEqual(written);
    expect(back?.manifest.samples.bed).toEqual(three().samples.bed);
    expect(back?.manifest.samples.hat).toEqual(three().samples.hat);
    expect(back?.manifest.tempo).toBe(120);
    expect(back?.manifest.key).toBe("Am");
    expect(readFileSync(join(out, "kit", "pack.ts"), "utf8")).toBe(
      manifestSource(written, back?.files ?? {}),
    );
    expect(existsSync(join(out, "kit", "kick.opus"))).toBe(false);
    expect(existsSync(join(out, "kit", "kick.flac"))).toBe(true);
  });

  test("a pack with no pack.ts yet is made; the format hook runs over what was written", async () => {
    const out = fresh();
    const formatted: string[] = [];
    await commitSamples({
      out,
      pack: "new",
      tempo: 90,
      samples: [{ name: "one", bytes: new Uint8Array([1]), fileName: "one.opus", entry: entry(1) }],
      format: (file) => {
        formatted.push(file);
      },
    });
    expect(formatted).toEqual([join(out, "new", "pack.ts")]);
    expect((await readManifest(join(out, "new")))?.manifest.tempo).toBe(90);
  });
});
