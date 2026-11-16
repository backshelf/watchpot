// The mix desk's sample host: a request handler a game's Bun dev server mounts, which runs the pack pipeline for the
// desk in the browser and writes into the game's packs. `fetchSampleHost` (`watchpot/react`) is the other end.
//
// The wire, under the mount (every answer that fails is `{ error }` as JSON with a 4xx or 5xx status):
//   POST process   multipart: `request` (the SampleRequest as JSON, without its file), `file` (the recording, optional)
//                  -> multipart: `meta` ({ token, entry } as JSON), `audio` (the encoded file)
//   GET  describe?pack=&sample=
//                  -> multipart: `meta` (the SampleSource as JSON), `audio` (the source, or the pack's file)
//   POST commit    JSON { tokens } -> JSON { ok: true }
//   POST retune    JSON { pack, tempo?, key? }
//                  -> multipart: `meta` ([{ sample, token, entry }] as JSON), `audio.<i>` (each loop's file, in order)
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, join } from "node:path";
import type { SampleEntry, SampleSource } from "../desk";
import { checkEdit } from "./edit";
import { FfmpegError } from "./ffmpeg";
import { type FormatHook, readManifest } from "./manifest";
import type { Targets } from "./pipeline";
import {
  codecOf,
  commitSamples,
  findOrigin,
  type ProcessedSample,
  type ProcessSampleOptions,
  planRetune,
  processSample,
  type SampleOrigin,
} from "./sample";
import { AUDIO, isSafeName, type Kind, keepSource, type Sidecar } from "./source";

/** What the host knows of a pack it may write. */
export type SamplePackConfig = {
  /** The tempo and key a pack starts with while its manifest says none. */
  tempo?: number;
  key?: string;
  /** What the pack was built with (`buildPack`'s options): a sample made here matches its neighbours. */
  codec?: "opus" | "flac";
  targets?: Targets;
};

export type SampleHostOptions = {
  /** The folder holding each pack's `<pack>/pack.ts` (`buildPack`'s `out`). */
  out: string;
  /**
   * The folder each pack's sources are kept under (`<source>/<pack>/shots|loops|irs/`), made when missing. Staging
   * lives in `<source>/.staged/`.
   */
  source: string;
  /** The packs the desk may write, by name: any other is refused. */
  packs: Readonly<Record<string, SamplePackConfig>>;
  /** Runs over each `pack.ts` the host writes (a game that formats its generated files). */
  format?: FormatHook;
  /** Runs one recording through the pipeline (default `processSample`): a test stubs it. */
  process?: (o: ProcessSampleOptions) => Promise<ProcessedSample>;
};

export type SampleHandler = {
  /** Answers a request under the mount (`"/__samples/*": (req) => host.fetch(req)`). */
  fetch(req: Request): Promise<Response>;
};

/** Staging older than this is cleared when a host is made. */
const STALE_MS = 24 * 60 * 60 * 1000;
const TOKEN = /^[0-9a-f]{32}$/;
const KINDS: readonly Kind[] = ["shot", "loop", "ir"];

class HostError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** What a staged sample holds beside its files (`staged.json`). */
type Staged = {
  pack: string;
  sample: string;
  kind: Kind;
  /** The recording beside it: `upload<ext>`. */
  ext: string;
  /** The encoded file beside it, under its name in the pack. */
  fileName: string;
  entry: SampleEntry;
  /** The sidecar the recording is kept with. */
  sidecar: Sidecar;
  /** The tempo a loop was cut to. */
  tempo?: number;
  /** A retune's manifest change, carried by each of its loops. */
  retune?: { tempo: number; key?: string };
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const fail = (status: number, message: string): never => {
  throw new HostError(status, message);
};

const num = (v: unknown, what: string): number | undefined => {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) fail(400, `${what} must be a number over 0`);
  return v as number;
};

/** A blob's bytes. Read through `arrayBuffer`, which every Blob has, whatever made it. */
const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer());

/**
 * The mix desk's sample host over `watchpot/sound/pack`: `process`, `describe`, `commit` and `retune` as HTTP, for a
 * Bun dev server to mount. Nothing is written into a pack until `commit`; until then each processed sample waits in
 * `<source>/.staged/<token>/` (cleared after a day, when a host is made).
 */
export function sampleHost(options: SampleHostOptions): SampleHandler {
  const { out, source, packs, format } = options;
  const run = options.process ?? processSample;
  const stagedRoot = join(source, ".staged");
  sweep(stagedRoot);

  const pack = (name: unknown): string => {
    if (!isSafeName(name)) fail(400, `"${String(name)}" is not a pack name (letters, digits, ".", "_", "-")`);
    if (!Object.hasOwn(packs, name as string))
      fail(
        404,
        `the pack "${String(name)}" is not one the host may write (sampleHost's packs: ${Object.keys(packs).join(", ") || "none"})`,
      );
    return name as string;
  };
  const sampleName = (name: unknown): string => {
    if (!isSafeName(name))
      fail(400, `"${String(name)}" is not a sample name (letters, digits, ".", "_", "-")`);
    return name as string;
  };
  const config = (p: string) => packs[p] as SamplePackConfig;

  /**
   * Runs a recording and stages it under a new token: the recording, the encoded file and `staged.json`. The
   * recording is kept at commit with `sidecar`, which is what it was run with (a loop's `bpm` filled in, so a later
   * rebuild at another tempo stretches it from the right one).
   */
  async function stage(o: {
    pack: string;
    sample: string;
    kind: Kind;
    recording: { bytes: Uint8Array } | { file: string };
    ext: string;
    sidecar: Sidecar;
    tempo?: number;
    codec: "opus" | "flac";
    retune?: Staged["retune"];
  }): Promise<{ token: string; done: ProcessedSample }> {
    const token = crypto.randomUUID().replaceAll("-", "");
    const dir = join(stagedRoot, token);
    mkdirSync(dir, { recursive: true });
    try {
      const upload = join(dir, `upload${o.ext}`);
      if ("bytes" in o.recording) await Bun.write(upload, o.recording.bytes);
      else copyFileSync(o.recording.file, upload);
      const sidecar: Sidecar =
        o.kind === "loop" && o.sidecar.bpm === undefined && o.tempo !== undefined
          ? { ...o.sidecar, bpm: o.tempo }
          : o.sidecar;
      const { bpm, bars, root, loop, source: from, edit } = sidecar;
      const done = await run({
        file: upload,
        name: o.sample,
        kind: o.kind,
        edit,
        bpm,
        bars,
        root,
        loop,
        source: from,
        tempo: o.tempo,
        codec: o.codec,
        targets: config(o.pack).targets,
      });
      await Bun.write(join(dir, done.fileName), done.bytes);
      const staged: Staged = {
        pack: o.pack,
        sample: o.sample,
        kind: o.kind,
        ext: o.ext,
        fileName: done.fileName,
        entry: done.entry,
        sidecar,
        ...(done.tempo === undefined ? {} : { tempo: done.tempo }),
        ...(o.retune ? { retune: o.retune } : {}),
      };
      await Bun.write(join(dir, "staged.json"), JSON.stringify(staged));
      return { token, done };
    } catch (e) {
      rmSync(dir, { recursive: true, force: true });
      // The pipeline names the staged copy: name the sample the person dropped it on instead.
      if (e instanceof Error && e.message.startsWith(`upload${o.ext}:`))
        e.message = `${o.pack}/${o.sample}${e.message.slice(`upload${o.ext}`.length)}`;
      throw e;
    }
  }

  async function processRoute(req: Request): Promise<Response> {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return fail(400, "process takes multipart form data: `request` (JSON) and `file`");
    }
    const raw = form.get("request");
    if (typeof raw !== "string") fail(400, "process needs a `request` field (the SampleRequest as JSON)");
    let r: Record<string, unknown>;
    try {
      r = JSON.parse(raw as string);
    } catch {
      return fail(400, "the `request` field is not JSON");
    }
    const p = pack(r.pack);
    const sample = sampleName(r.sample);
    const kind = r.kind as Kind;
    if (!KINDS.includes(kind)) fail(400, `kind must be one of ${KINDS.join(", ")}`);
    let edit: ReturnType<typeof checkEdit>;
    try {
      edit = checkEdit(r.edit);
    } catch (e) {
      return fail(400, (e as Error).message);
    }
    const asked: Sidecar = {
      ...(num(r.bpm, "bpm") === undefined ? {} : { bpm: r.bpm as number }),
      ...(num(r.bars, "bars") === undefined ? {} : { bars: r.bars as number }),
      ...(r.root === undefined || r.root === null ? {} : { root: r.root as string | number }),
      ...(typeof r.loop === "boolean" ? { loop: r.loop } : {}),
    };
    const file = form.get("file");
    const now = await readManifest(join(out, p));
    const tempo = now?.manifest.tempo ?? config(p).tempo;
    const codec = config(p).codec ?? codecOf(now?.files[sample] ?? firstNonIr(now?.files ?? {}));

    let recording: { bytes: Uint8Array } | { file: string };
    let ext: string;
    let sidecar: Sidecar;
    if (file !== null && typeof file !== "string") {
      const fileName = typeof r.fileName === "string" ? r.fileName : "";
      ext = extname(fileName).toLowerCase();
      if (!AUDIO.has(ext))
        fail(
          400,
          `the recording needs a file name ending in ${[...AUDIO].join(", ")} (got "${fileName || "none"}")`,
        );
      recording = { bytes: await bytesOf(file) };
      sidecar = { ...asked, ...(fileName ? { source: fileName } : {}), ...(edit ? { edit } : {}) };
    } else {
      const origin = await findOrigin({ out, source, pack: p, name: sample });
      if (!origin)
        return fail(404, `${p}/${sample} has no kept source and is not in the pack: drop a recording on it`);
      recording = { file: origin.file };
      ext = origin.ext;
      // The recording's own sidecar, with what the request says over it and the request's edit in place of its.
      const { edit: _, ...kept } = origin.sidecar;
      sidecar = { ...kept, ...asked, ...(edit ? { edit } : {}) };
    }
    const { token, done } = await stage({ pack: p, sample, kind, recording, ext, sidecar, tempo, codec });
    return parts({ token, entry: done.entry }, [["audio", done.bytes, done.fileName]]);
  }

  async function describeRoute(url: URL): Promise<Response> {
    const p = pack(url.searchParams.get("pack"));
    const sample = sampleName(url.searchParams.get("sample"));
    const origin = await findOrigin({ out, source, pack: p, name: sample });
    if (!origin) return fail(404, `${p}/${sample} has no kept source and is not in the pack`);
    const meta: SampleSource = describeOrigin(origin);
    return parts(meta, [
      ["audio", new Uint8Array(await Bun.file(origin.file).arrayBuffer()), `source${origin.ext}`],
    ]);
  }

  async function commitRoute(req: Request): Promise<Response> {
    const body = (await req.json().catch(() => fail(400, "commit takes JSON: { tokens }"))) as {
      tokens?: unknown;
    };
    const tokens = body?.tokens;
    if (!Array.isArray(tokens) || tokens.some((t) => typeof t !== "string" || !TOKEN.test(t)))
      fail(400, "commit takes { tokens: string[] }, each a token `process` answered");
    const staged: { token: string; s: Staged }[] = [];
    for (const token of new Set(tokens as string[])) {
      const f = Bun.file(join(stagedRoot, token, "staged.json"));
      if (!(await f.exists()))
        fail(
          404,
          `nothing is staged as ${token} (committed already, or cleared): process the recording again`,
        );
      staged.push({ token, s: (await f.json()) as Staged });
    }
    const byPack = new Map<string, { token: string; s: Staged }[]>();
    for (const t of staged) {
      pack(t.s.pack);
      byPack.set(t.s.pack, [...(byPack.get(t.s.pack) ?? []), t]);
    }
    for (const [p, items] of byPack) {
      const now = await readManifest(join(out, p));
      const retune = items.find((t) => t.s.retune)?.s.retune;
      const tempo =
        retune?.tempo ??
        now?.manifest.tempo ??
        items.find((t) => t.s.tempo !== undefined)?.s.tempo ??
        (now ? undefined : config(p).tempo);
      for (const { s } of items)
        if (
          s.kind === "loop" &&
          s.tempo !== undefined &&
          tempo !== undefined &&
          Math.abs(s.tempo - tempo) > 0.01
        )
          fail(
            409,
            `${p}/${s.sample} was cut at ${s.tempo} bpm and the pack is at ${tempo} now: process it again`,
          );
      await commitSamples({
        out,
        pack: p,
        samples: items.map(({ token, s }) => ({
          name: s.sample,
          fileName: s.fileName,
          entry: s.entry,
          bytes: readBytes(join(stagedRoot, token, s.fileName)),
        })),
        ...(tempo === undefined || tempo === now?.manifest.tempo ? {} : { tempo }),
        ...(retune?.key === undefined ? (now ? {} : keyOf(config(p))) : { key: retune.key }),
        format,
      });
      for (const { token, s } of items)
        await keepSource({
          source: join(source, p),
          name: s.sample,
          kind: s.kind,
          file: join(stagedRoot, token, `upload${s.ext}`),
          sidecar: s.sidecar,
        });
    }
    for (const { token } of staged) rmSync(join(stagedRoot, token), { recursive: true, force: true });
    return json({ ok: true });
  }

  async function retuneRoute(req: Request): Promise<Response> {
    const body = (await req
      .json()
      .catch(() => fail(400, "retune takes JSON: { pack, tempo?, key? }"))) as Record<string, unknown>;
    const p = pack(body?.pack);
    const to = num(body.tempo, "tempo");
    if (body.key !== undefined && typeof body.key !== "string") fail(400, "key must be a string");
    const key = body.key as string | undefined;
    const now = await readManifest(join(out, p));
    if (!now) return fail(404, `the pack "${p}" has no pack.ts in ${out} yet`);
    const tempo = to ?? now.manifest.tempo;
    const loops = Object.values(now.manifest.samples).some((s) => s.kind === "loop");
    if (tempo === undefined || !loops || Math.abs(tempo - (now.manifest.tempo ?? Number.NaN)) <= 0.01) {
      // No loop to make again: the manifest's tempo and key are all that change, so they are written now.
      await commitSamples({
        out,
        pack: p,
        samples: [],
        ...(to === undefined ? {} : { tempo: to }),
        key,
        format,
      });
      return parts([], []);
    }
    const plan = await planRetune({
      out,
      source,
      pack: p,
      tempo,
      codec: config(p).codec,
      targets: config(p).targets,
    });
    const answer: { sample: string; token: string; entry: SampleEntry }[] = [];
    const audio: [string, Uint8Array, string][] = [];
    try {
      for (const { name, origin, options } of plan) {
        const { token, done } = await stage({
          pack: p,
          sample: name,
          kind: "loop",
          recording: { file: origin.file },
          ext: origin.ext,
          // The recording's own tempo goes with it, so a rebuild at the new tempo stretches it from there.
          sidecar: { ...origin.sidecar, ...(options.bpm === undefined ? {} : { bpm: options.bpm }) },
          tempo,
          codec: options.codec ?? "opus",
          retune: { tempo, ...(key === undefined ? {} : { key }) },
        });
        answer.push({ sample: name, token, entry: done.entry });
        audio.push([`audio.${audio.length}`, done.bytes, done.fileName]);
      }
    } catch (e) {
      for (const { token } of answer) rmSync(join(stagedRoot, token), { recursive: true, force: true });
      throw e;
    }
    return parts(answer, audio);
  }

  return {
    async fetch(req) {
      try {
        const url = new URL(req.url);
        const route = url.pathname.replace(/\/+$/, "").split("/").pop();
        const method = req.method.toUpperCase();
        if (route === "process" && method === "POST") return await processRoute(req);
        if (route === "describe" && method === "GET") return await describeRoute(url);
        if (route === "commit" && method === "POST") return await commitRoute(req);
        if (route === "retune" && method === "POST") return await retuneRoute(req);
        return json(
          { error: `the sample host has no ${method} ${route ?? ""} (process, describe, commit, retune)` },
          404,
        );
      } catch (e) {
        if (e instanceof HostError) return json({ error: e.message }, e.status);
        if (e instanceof FfmpegError && /not found/.test(e.message)) return json({ error: e.message }, 503);
        return json({ error: e instanceof Error ? e.message : String(e) }, 422);
      }
    },
  };
}

/** What a recording says of itself, as the desk reads it. */
function describeOrigin(origin: SampleOrigin): SampleSource {
  const { edit, bpm, bars, root, loop, source } = origin.sidecar;
  return {
    ...(edit === undefined ? {} : { edit }),
    ...(bpm === undefined ? {} : { bpm }),
    ...(bars === undefined ? {} : { bars }),
    ...(root === undefined ? {} : { root }),
    ...(loop === undefined ? {} : { loop }),
    ...(source === undefined ? {} : { source }),
  };
}

const keyOf = (c: SamplePackConfig) => (c.key === undefined ? {} : { key: c.key });

/** The first file of a pack that is not an IR's FLAC, for the codec a new sample is written in. */
function firstNonIr(files: Record<string, string>): string | undefined {
  return Object.values(files).find((f) => !f.toLowerCase().endsWith(".flac")) ?? Object.values(files)[0];
}

function readBytes(file: string): Uint8Array {
  if (!existsSync(file)) fail(410, `a staged file is missing (${file}): process the recording again`);
  return new Uint8Array(readFileSync(file));
}

/** A multipart answer: `meta` as JSON and each audio part as a file. */
function parts(meta: unknown, audio: readonly [string, Uint8Array, string][]): Response {
  const form = new FormData();
  form.set("meta", JSON.stringify(meta));
  for (const [field, bytes, name] of audio) form.set(field, new Blob([bytes as BlobPart]), name);
  return new Response(form);
}

/**
 * Clears staging a day older than the sweep. The time now is read from the file system (a marker touched in the
 * staging folder), not the wall clock: the engine reads no clock of its own.
 */
function sweep(root: string): void {
  if (!existsSync(root)) return;
  const marker = join(root, ".swept");
  writeFileSync(marker, "");
  const cutoff = statSync(marker).mtimeMs - STALE_MS;
  for (const name of readdirSync(root)) {
    if (!TOKEN.test(name)) continue;
    const dir = join(root, name);
    try {
      if (statSync(dir).mtimeMs < cutoff) rmSync(dir, { recursive: true, force: true });
    } catch {
      // Gone already.
    }
  }
}
