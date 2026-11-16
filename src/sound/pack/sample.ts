// One sample at a time: a recording processed alone (nothing in the pack moves), and processed samples written into a
// pack whose manifest is read back from its own `pack.ts`.
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import type { SampleEdit, SampleEntry } from "../desk";
import type { PackManifest, PackSample } from "../types";
import { checkEdit } from "./edit";
import { encode, requireFfmpeg } from "./ffmpeg";
import { type FormatHook, readManifest, writeManifest } from "./manifest";
import { decodeSource, prepare, type Targets } from "./pipeline";
import { isSafeName, type Kind, listSources, readSidecar, type Sidecar } from "./source";

export type ProcessSampleOptions = {
  /** The recording's path. */
  file: string;
  /** The sample's name in its pack. */
  name: string;
  kind: Kind;
  /** What was changed of the recording, applied before the pipeline's trim and loudness match. */
  edit?: SampleEdit;
  /** What a sidecar says: a loop's tempo in its source and its length in bars, the root, a shot played round, where it came from. */
  bpm?: number;
  bars?: number;
  root?: number | string;
  loop?: boolean;
  source?: string;
  /** The pack's tempo (a loop is stretched and cut to it); with none, a loop keeps its own `bpm`. */
  tempo?: number;
  /** Opus in Ogg (default) or FLAC. An IR is always FLAC. */
  codec?: "opus" | "flac";
  targets?: Targets;
};

/** A recording made into a sample, not yet in any pack. */
export type ProcessedSample = {
  /** The encoded file. */
  bytes: Uint8Array;
  /** Its name beside `pack.ts` (`<name>.opus`, `<name>.flac`). */
  fileName: string;
  entry: SampleEntry;
  /** The tempo a loop was cut to. */
  tempo?: number;
  /** `buildPack`'s log line for it. */
  line: string;
};

/**
 * One recording through exactly the per-file pipeline `buildPack` runs (with `edit` applied first), encoded to bytes.
 * Nothing in any pack changes. Throws a message naming the file on everything `buildPack` refuses.
 */
export async function processSample(o: ProcessSampleOptions): Promise<ProcessedSample> {
  requireFfmpeg();
  if (!isSafeName(o.name))
    throw new Error(`"${o.name}" is not a sample name (letters, digits, ".", "_", "-")`);
  const edit = checkEdit(o.edit);
  const where = basename(o.file);
  const decoded = await decodeSource(o.file, where);
  const tempo = o.kind === "loop" ? (o.tempo ?? o.bpm) : undefined;
  const p = await prepare(
    decoded,
    {
      name: o.name,
      kind: o.kind,
      where,
      sidecar: { bpm: o.bpm, bars: o.bars, root: o.root, loop: o.loop, source: o.source, edit },
    },
    { tempo, codec: o.codec ?? "opus", targets: o.targets },
  );
  const tmp = mkdtempSync(join(tmpdir(), "watchpot-sample-"));
  try {
    const file = join(tmp, p.fileName);
    await encode(p.pcm, file, p.codec, p.kbps);
    const bytes = new Uint8Array(await Bun.file(file).arrayBuffer());
    return {
      bytes,
      fileName: p.fileName,
      entry: p.entry,
      ...(tempo === undefined ? {} : { tempo }),
      line: p.line,
    };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** One processed sample to write into a pack. */
export type SampleWrite = { name: string; bytes: Uint8Array; fileName: string; entry: SampleEntry };

export type CommitSamplesOptions = {
  /** The folder holding `<pack>/`. */
  out: string;
  pack: string;
  samples: readonly SampleWrite[];
  /** Written into the manifest (a retune); a pack with no `pack.ts` yet starts with them. */
  tempo?: number;
  key?: string;
  format?: FormatHook;
};

/**
 * Writes processed samples into a pack: each encoded file beside `pack.ts`, and `pack.ts` rewritten from the manifest
 * it holds (read back from the module itself, so no source folder is needed) with those entries added or replaced and
 * every other entry as it was. A replaced sample's old file goes when its name changed (a new codec). Answers the
 * manifest written.
 */
export async function commitSamples(o: CommitSamplesOptions): Promise<PackManifest> {
  if (!isSafeName(o.pack)) throw new Error(`"${o.pack}" is not a pack name (letters, digits, ".", "_", "-")`);
  const dir = join(o.out, o.pack);
  const now = (await readManifest(dir)) ?? { manifest: { name: o.pack, samples: {} }, files: {} };
  const samples: Record<string, PackSample> = { ...now.manifest.samples };
  const files: Record<string, string> = { ...now.files };
  const drop = new Set<string>();
  mkdirSync(dir, { recursive: true });
  for (const s of o.samples) {
    if (!isSafeName(s.name))
      throw new Error(`"${s.name}" is not a sample name (letters, digits, ".", "_", "-")`);
    if (!isSafeName(s.fileName)) throw new Error(`"${s.fileName}" is not a file name`);
    const old = files[s.name];
    if (old !== undefined && old !== s.fileName) drop.add(old);
    await Bun.write(join(dir, s.fileName), s.bytes);
    samples[s.name] = { url: s.fileName, ...s.entry };
    files[s.name] = s.fileName;
  }
  for (const f of drop) if (!Object.values(files).includes(f)) rmSync(join(dir, f), { force: true });
  const tempo = o.tempo ?? now.manifest.tempo;
  const key = o.key ?? now.manifest.key;
  const manifest: PackManifest = {
    name: now.manifest.name,
    ...(tempo === undefined ? {} : { tempo }),
    ...(key === undefined ? {} : { key }),
    samples,
  };
  await writeManifest(dir, manifest, files, o.format);
  return manifest;
}

/** `commitSamples` for one sample. */
export function commitSample(
  o: Omit<CommitSamplesOptions, "samples"> & { name: string; sample: Omit<SampleWrite, "name"> },
): Promise<PackManifest> {
  const { name, sample, ...rest } = o;
  return commitSamples({ ...rest, samples: [{ name, ...sample }] });
}

/** Where a sample's recording is: its kept source, or the pack's own encoded file standing in for one. */
export type SampleOrigin = {
  file: string;
  /** Its audio extension (`.wav`). */
  ext: string;
  kind: Kind;
  /** The kept source's sidecar; for the pack's file, what its entry says (a loop's `bpm` is the pack's tempo). */
  sidecar: Sidecar;
  /** True for a kept source, false for the pack's file. */
  kept: boolean;
};

/**
 * The recording sample `name` of `pack` is made from: the source kept under `<source>/<pack>/` (with its sidecar)
 * when there is one, else the pack's encoded file in `<out>/<pack>/`. `null` when it has neither.
 */
export async function findOrigin(o: {
  out: string;
  source?: string;
  pack: string;
  name: string;
}): Promise<SampleOrigin | null> {
  if (!isSafeName(o.pack) || !isSafeName(o.name)) return null;
  if (o.source !== undefined) {
    const kept = listSources(join(o.source, o.pack)).find((s) => s.name === o.name);
    if (kept)
      return {
        file: kept.file,
        ext: extname(kept.file).toLowerCase(),
        kind: kept.kind,
        sidecar: await readSidecar(kept.file),
        kept: true,
      };
  }
  const now = await readManifest(join(o.out, o.pack));
  const entry = now?.manifest.samples[o.name];
  const fileName = now?.files[o.name];
  if (!now || !entry || !fileName) return null;
  const file = join(o.out, o.pack, fileName);
  if (!existsSync(file)) return null;
  const sidecar: Sidecar = {
    ...(entry.kind === "loop" && now.manifest.tempo !== undefined ? { bpm: now.manifest.tempo } : {}),
    ...(entry.bars === undefined ? {} : { bars: entry.bars }),
    ...(entry.source === undefined ? {} : { source: entry.source }),
  };
  return { file, ext: extname(fileName).toLowerCase(), kind: entry.kind, sidecar, kept: false };
}

/** A loop made again at a new tempo, with the recording it was made from. */
export type RetunedLoop = ProcessedSample & { name: string; origin: SampleOrigin };

export type RetunePackOptions = {
  out: string;
  /** The folder each pack's sources are kept under (`<source>/<pack>/`). */
  source?: string;
  pack: string;
  tempo: number;
  codec?: "opus" | "flac";
  targets?: Targets;
};

/** What `retunePack` runs for each loop of a pack, in name order: its recording and the options it is made with. */
export async function planRetune(
  o: RetunePackOptions,
): Promise<{ name: string; origin: SampleOrigin; options: ProcessSampleOptions }[]> {
  if (!(o.tempo > 0 && Number.isFinite(o.tempo))) throw new Error("a tempo must be a number of bpm over 0");
  const now = await readManifest(join(o.out, o.pack));
  if (!now) throw new Error(`the pack "${o.pack}" has no pack.ts in ${o.out}`);
  const loops = Object.keys(now.manifest.samples)
    .sort()
    .filter((n) => now.manifest.samples[n]?.kind === "loop");
  const plan: { name: string; origin: SampleOrigin; options: ProcessSampleOptions }[] = [];
  for (const name of loops) {
    const origin = await findOrigin({ out: o.out, source: o.source, pack: o.pack, name });
    if (!origin) throw new Error(`${o.pack}/${name}: neither a kept source nor the pack's file is there`);
    const { edit, bpm, bars, root, loop, source } = origin.sidecar;
    plan.push({
      name,
      origin,
      options: {
        file: origin.file,
        name,
        kind: "loop",
        edit,
        // A loop the pack cut at its tempo is that many bars at the new one.
        bpm: bpm ?? now.manifest.tempo,
        bars,
        root,
        loop,
        source,
        tempo: o.tempo,
        codec: o.codec ?? codecOf(now.files[name]),
        targets: o.targets,
      },
    });
  }
  return plan;
}

/**
 * Every loop of a pack made again at `tempo`: each from its kept source and that sidecar's `bpm` when there is one,
 * else from the pack's own file at the manifest's tempo. Nothing is written: commit the loops with
 * `commitSamples({ ..., tempo, key })` and the manifest's tempo moves with them.
 */
export async function retunePack(o: RetunePackOptions): Promise<RetunedLoop[]> {
  const out: RetunedLoop[] = [];
  for (const { name, origin, options } of await planRetune(o))
    out.push({ ...(await processSample(options)), name, origin });
  return out;
}

/** The codec a pack's file was written in. */
export const codecOf = (fileName: string | undefined): "opus" | "flac" =>
  fileName?.toLowerCase().endsWith(".flac") ? "flac" : "opus";
