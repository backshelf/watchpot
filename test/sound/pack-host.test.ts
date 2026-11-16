// The sample host over HTTP with the pipeline stubbed (no ffmpeg), driven through `fetchSampleHost`, the client a
// browser uses: its routes, what it refuses and how, staging, commit and the kept sources.
import { afterAll, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchSampleHost } from "../../src/devtools/sampleHost";
import { FfmpegError } from "../../src/sound/pack/ffmpeg";
import { sampleHost } from "../../src/sound/pack/host";
import { manifestSource, readManifest } from "../../src/sound/pack/manifest";
import type { ProcessedSample, ProcessSampleOptions } from "../../src/sound/pack/sample";
import { readSidecar } from "../../src/sound/pack/source";

const root = mkdtempSync(join(tmpdir(), "watchpot-host-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;

/** The stub pipeline: the encoded file is the recording's bytes, and the entry says what it was run with. */
const calls: ProcessSampleOptions[] = [];
async function stub(o: ProcessSampleOptions): Promise<ProcessedSample> {
  calls.push(o);
  if (o.kind === "loop" && o.tempo === undefined && o.bpm === undefined)
    throw new Error(`${o.name}.wav: a loop needs a tempo: give its bpm, or the pack a tempo`);
  const tempo = o.kind === "loop" ? (o.tempo ?? o.bpm) : undefined;
  return {
    bytes: new Uint8Array(readFileSync(o.file)),
    fileName: `${o.name}.${o.codec ?? "opus"}`,
    entry: {
      seconds: o.kind === "loop" ? (60 / (tempo as number)) * 4 * (o.bars ?? 1) : 0.5,
      channels: 1,
      lufs: -18,
      peak: 0.5,
      kind: o.kind,
      ...(o.kind === "loop" ? { bars: o.bars ?? 1 } : {}),
      ...(o.source === undefined ? {} : { source: o.source }),
    },
    ...(tempo === undefined ? {} : { tempo }),
    line: o.name,
  };
}

/** A game with one built pack (`kit`: a shot and a loop at 120 bpm, no source folder) and a host over it. */
function game(process: typeof stub = stub) {
  const dir = join(root, `g${n++}`);
  const out = join(dir, "packs");
  const source = join(dir, "audio");
  mkdirSync(join(out, "kit"), { recursive: true });
  writeFileSync(join(out, "kit", "hit.opus"), "HIT");
  writeFileSync(join(out, "kit", "bed.opus"), "BED");
  writeFileSync(
    join(out, "kit", "pack.ts"),
    manifestSource(
      {
        name: "kit",
        tempo: 120,
        samples: {
          hit: { url: "hit.opus", seconds: 0.3, channels: 1, lufs: -18, peak: 0.6, kind: "shot" },
          bed: { url: "bed.opus", seconds: 4, channels: 1, lufs: -20, peak: 0.6, kind: "loop", bars: 2 },
        },
      },
      { hit: "hit.opus", bed: "bed.opus" },
    ),
  );
  const host = sampleHost({
    out,
    source,
    packs: { kit: {}, fresh: { tempo: 90, key: "C" }, bare: {} },
    process,
  });
  const call = (path: string, init?: RequestInit) => host.fetch(new Request(`http://dev.test${path}`, init));
  const client = fetchSampleHost("/__samples/", { fetch: (url, init) => call(url, init) });
  return { out, source, host, call, client };
}

const wav = (text: string) => new Blob([new TextEncoder().encode(text)]);
const text = (b: ArrayBuffer) => new TextDecoder().decode(b);

describe("the sample host", () => {
  test("refuses, as JSON a person can act on, what would become a bad path or is not its to write", async () => {
    const { call, client } = game();
    const r404 = await call("/__samples/nope", { method: "POST" });
    expect(r404.status).toBe(404);
    expect(((await r404.json()) as { error: string }).error).toMatch(/process, describe, commit, retune/);
    await expect(
      client.process({ pack: "../kit", sample: "x", kind: "shot", file: wav("x") }),
    ).rejects.toThrow(/not a pack name/);
    await expect(
      client.process({ pack: "other", sample: "x", kind: "shot", file: wav("x") }),
    ).rejects.toThrow(/not one the host may write.*kit, fresh/);
    await expect(
      client.process({ pack: "kit", sample: "..", kind: "shot", file: wav("x"), fileName: "x.wav" }),
    ).rejects.toThrow(/not a sample name/);
    await expect(
      client.process({ pack: "kit", sample: "x", kind: "shot", file: wav("x"), fileName: "notes.txt" }),
    ).rejects.toThrow(/file name ending in \.wav/);
    await expect(client.describe("kit", "missing")).rejects.toThrow(/no kept source/);
    await expect(client.commit(["0".repeat(32)])).rejects.toThrow(/nothing is staged/);
    await expect(client.commit(["../../x"])).rejects.toThrow(/tokens/);
  });

  test("answers the pipeline's own failure, and ffmpeg missing, with what to do", async () => {
    const { client } = game();
    await expect(
      client.process({ pack: "bare", sample: "drum", kind: "loop", file: wav("x"), fileName: "drum.wav" }),
    ).rejects.toThrow(/a loop needs a tempo/);
    const none = game(async () => {
      throw new FfmpegError("watchpot/sound/pack needs ffmpeg on PATH, and it was not found");
    });
    const res = await none.call("/__samples/process", {
      method: "POST",
      body: (() => {
        const f = new FormData();
        f.set("request", JSON.stringify({ pack: "kit", sample: "a", kind: "shot", fileName: "a.wav" }));
        f.set("file", wav("x"), "a.wav");
        return f;
      })(),
    });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toMatch(/needs ffmpeg/);
  });

  test("process stages and writes nothing; commit writes the pack, keeps the source and clears the staging", async () => {
    const { out, source, client } = game();
    const before = readFileSync(join(out, "kit", "pack.ts"), "utf8");
    const made = await client.process({
      pack: "kit",
      sample: "hit",
      kind: "shot",
      file: wav("NEW HIT"),
      fileName: "Hit Take 2.WAV",
      edit: { start: 0.1, reverse: true },
    });
    expect(text(made.audio)).toBe("NEW HIT");
    expect(made.entry.source).toBe("Hit Take 2.WAV");
    expect(made.token).toMatch(/^[0-9a-f]{32}$/);
    expect(readFileSync(join(out, "kit", "pack.ts"), "utf8")).toBe(before);
    expect(existsSync(join(source, "kit"))).toBe(false);

    await client.commit([made.token]);
    const back = await readManifest(join(out, "kit"));
    expect(back?.manifest.samples.hit?.source).toBe("Hit Take 2.WAV");
    expect(back?.manifest.samples.bed).toEqual({
      url: "bed.opus",
      seconds: 4,
      channels: 1,
      lufs: -20,
      peak: 0.6,
      kind: "loop",
      bars: 2,
    });
    expect(readFileSync(join(out, "kit", "hit.opus"), "utf8")).toBe("NEW HIT");
    const kept = join(source, "kit", "shots", "hit.wav");
    expect(readFileSync(kept, "utf8")).toBe("NEW HIT");
    expect(await readSidecar(kept)).toEqual({
      source: "Hit Take 2.WAV",
      edit: { start: 0.1, reverse: true },
    });
    expect(readdirSync(join(source, ".staged")).filter((f) => f !== ".swept")).toEqual([]);
    await expect(client.commit([made.token])).rejects.toThrow(/nothing is staged/);
  });

  test("with no file: the kept source is run again with a new edit, else the pack's own file stands in", async () => {
    const { out, source, client } = game();
    // No source yet: the pack's file is the recording, at the pack's tempo for a loop.
    const described = await client.describe("kit", "bed");
    expect(text(described.audio)).toBe("BED");
    expect(described.bpm).toBe(120);
    expect(described.bars).toBe(2);
    calls.length = 0;
    const again = await client.process({ pack: "kit", sample: "bed", kind: "loop", edit: { fadeIn: 0.01 } });
    expect(calls[0]?.bpm).toBe(120);
    expect(calls[0]?.edit).toEqual({ fadeIn: 0.01 });
    await client.commit([again.token]);
    // It became the kept source, with what it was run with.
    const kept = join(source, "kit", "loops", "bed.opus");
    expect(readFileSync(kept, "utf8")).toBe("BED");
    expect(await readSidecar(kept)).toEqual({ bpm: 120, bars: 2, edit: { fadeIn: 0.01 } });
    const now = await client.describe("kit", "bed");
    expect(now.edit).toEqual({ fadeIn: 0.01 });
    expect((await readManifest(join(out, "kit")))?.manifest.samples.bed?.bars).toBe(2);
  });

  test("retune stages every loop at the new tempo from its recording's own; commit moves the manifest", async () => {
    const { out, source, client } = game();
    const before = readFileSync(join(out, "kit", "pack.ts"), "utf8");
    calls.length = 0;
    const loops = (await client.retune?.("kit", { tempo: 96, key: "Dm" })) ?? [];
    expect(loops.map((l) => l.sample)).toEqual(["bed"]);
    expect(calls.map((c) => [c.name, c.bpm, c.tempo])).toEqual([["bed", 120, 96]]);
    expect(readFileSync(join(out, "kit", "pack.ts"), "utf8")).toBe(before);
    await client.commit(loops.map((l) => l.token));
    const back = await readManifest(join(out, "kit"));
    expect(back?.manifest.tempo).toBe(96);
    expect(back?.manifest.key).toBe("Dm");
    expect(back?.manifest.samples.hit?.seconds).toBe(0.3);
    expect((await readSidecar(join(source, "kit", "loops", "bed.opus"))).bpm).toBe(120);
    // A loop processed before the retune was cut at the old tempo: committing it now is refused.
    const old = await client.process({ pack: "kit", sample: "bed", kind: "loop" });
    await client.retune?.("kit", { tempo: 100 }).then((l) => client.commit(l.map((x) => x.token)));
    await expect(client.commit([old.token])).rejects.toThrow(/process it again/);
  });

  test("a pack made by its first commit takes its tempo and key from the host's packs", async () => {
    const { out, client } = game();
    const made = await client.process({
      pack: "fresh",
      sample: "one",
      kind: "shot",
      file: wav("1"),
      fileName: "one.flac",
    });
    await client.commit([made.token]);
    const back = await readManifest(join(out, "fresh"));
    expect(back?.manifest).toMatchObject({ name: "fresh", tempo: 90, key: "C" });
    expect(Object.keys(back?.manifest.samples ?? {})).toEqual(["one"]);
  });
});
