// The pack pipeline: a game's folder of downloaded audio into encoded files and a typed manifest. A build-time entry
// (`watchpot/sound/pack`, never in the sound barrel): it runs in Bun, shells out to ffmpeg and reads files.
import { mkdirSync } from "node:fs";
import { basename, join, relative } from "node:path";
import type { PackManifest, PackSample } from "../types";
import { encode, requireFfmpeg } from "./ffmpeg";
import { manifestSource } from "./manifest";
import { decodeSource, prepare, type Targets } from "./pipeline";
import { type Kind, listSources, readSidecar, type Sidecar } from "./source";

export type BuildPackOptions = {
  /** The folder holding `shots/`, `loops/` and `irs/`. */
  source: string;
  /** The folder to write `<name>/` into. */
  out: string;
  name: string;
  /** The tempo every loop is stretched and cut to. Defaults to the loops' own `bpm` when they all agree. */
  tempo?: number;
  key?: string;
  /** Opus in Ogg (default) or FLAC. An IR is always FLAC. */
  codec?: "opus" | "flac";
  /** Loudness targets in LUFS by role. Defaults: shots -18, loops -20, irs untouched. */
  targets?: Targets;
  /** Where the per-file lines go (default `console.log`). */
  log?: (line: string) => void;
};

const CONCURRENCY = 4;

type Job = { name: string; file: string; kind: Kind; sidecar: Sidecar };
type Done = { name: string; sample: PackSample; fileName: string; line: string };

/** Every audio file under the source's role folders, with its sidecar. Throws on two files that would share a name. */
async function findJobs(source: string): Promise<Job[]> {
  const jobs: Job[] = [];
  const seen = new Map<string, string>();
  for (const { file, kind, name } of listSources(source)) {
    const earlier = seen.get(name);
    if (earlier !== undefined)
      throw new Error(
        `sound pack: ${relative(source, file)} and ${earlier} would both write the sample "${name}"`,
      );
    seen.set(name, relative(source, file));
    jobs.push({ name, file, kind, sidecar: await readSidecar(file) });
  }
  if (jobs.length === 0) throw new Error(`sound pack: no audio under ${source}/{shots,loops,irs}`);
  return jobs;
}

async function processFile(
  job: Job,
  o: { out: string; name: string; tempo?: number; codec: "opus" | "flac"; targets?: Targets },
): Promise<Done> {
  const where = basename(job.file);
  const decoded = await decodeSource(job.file, where);
  const p = await prepare(decoded, { name: job.name, kind: job.kind, sidecar: job.sidecar, where }, o);
  await encode(p.pcm, join(o.out, o.name, p.fileName), p.codec, p.kbps);
  return { name: job.name, sample: { url: p.fileName, ...p.entry }, fileName: p.fileName, line: p.line };
}

/**
 * Builds a sound pack: every file under `source/{shots,loops,irs}` edited as its sidecar says, trimmed, matched in
 * loudness, rooted, cut to whole bars (loops), encoded, and written to `<out>/<name>/` with a `pack.ts` manifest.
 * Throws (one message listing every file at fault) when a file is silent, clips, has no tempo, or a loop is not within
 * 5 ms of whole bars. The pack is the folder: a sample with no source here is not in the pack it writes.
 */
export async function buildPack(options: BuildPackOptions): Promise<PackManifest> {
  requireFfmpeg();
  const log = options.log ?? ((line: string) => console.log(line));
  const jobs = await findJobs(options.source);

  let tempo = options.tempo;
  const loops = jobs.filter((j) => j.kind === "loop");
  if (tempo === undefined && loops.length > 0) {
    const bpms = new Set(loops.map((j) => j.sidecar.bpm));
    const missing = loops.filter((j) => j.sidecar.bpm === undefined);
    if (missing.length > 0)
      throw new Error(
        `sound pack: ${missing.map((j) => basename(j.file)).join(", ")} has no sidecar bpm and the pack has no tempo`,
      );
    if (bpms.size > 1)
      throw new Error(
        `sound pack: the loops disagree on tempo (${[...bpms].join(", ")} bpm): pass a pack tempo`,
      );
    tempo = [...bpms][0];
  }

  const dir = join(options.out, options.name);
  mkdirSync(dir, { recursive: true });
  const opts = {
    out: options.out,
    name: options.name,
    tempo,
    codec: options.codec ?? "opus",
    targets: options.targets,
  };

  const results = new Map<string, Done>();
  const errors: string[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++] as Job;
        try {
          results.set(job.name, await processFile(job, opts));
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }
    }),
  );

  for (const job of jobs) {
    const done = results.get(job.name);
    if (done) log(done.line);
  }
  if (errors.length > 0)
    throw new Error(`sound pack "${options.name}" failed:\n  ${errors.sort().join("\n  ")}`);

  const samples: Record<string, PackSample> = {};
  const files: Record<string, string> = {};
  for (const job of jobs) {
    const done = results.get(job.name) as Done;
    samples[job.name] = done.sample;
    files[job.name] = done.fileName;
  }
  const manifest: PackManifest = {
    name: options.name,
    ...(tempo === undefined ? {} : { tempo }),
    ...(options.key === undefined ? {} : { key: options.key }),
    samples,
  };
  await Bun.write(join(dir, "pack.ts"), manifestSource(manifest, files));
  return manifest;
}
