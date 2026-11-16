// A pack's source folder: the recordings by role, each with its sidecar, and the names they give their samples.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import type { SampleEdit } from "../desk";
import type { PackSample } from "../types";
import { checkEdit } from "./edit";

export type Kind = PackSample["kind"];

/** A file's `<file>.json` beside it. */
export type Sidecar = {
  /** A loop's tempo in its source. */
  bpm?: number;
  /** The key of the recording (kept for the log; the pack's `key` is the manifest's). */
  key?: string;
  /** The root, as Hz or a note name (`"A3"`): wins over detection. */
  root?: number | string;
  /** Where the recording came from. */
  source?: string;
  /** A loop's length in bars, when the length alone would not say. */
  bars?: number;
  /**
   * A shot the game plays round (a bed, a roll): its ends are left as they are, neither trimmed nor faded, so the
   * end meets the start.
   */
  loop?: boolean;
  /** What was changed of the recording before the pipeline (the mix desk writes it): crop, fades, pitch, reverse. */
  edit?: SampleEdit;
};

export const ROLES: readonly { dir: "shots" | "loops" | "irs"; kind: Kind }[] = [
  { dir: "shots", kind: "shot" },
  { dir: "loops", kind: "loop" },
  { dir: "irs", kind: "ir" },
];
export const roleDir = (kind: Kind): string =>
  (ROLES.find((r) => r.kind === kind) as (typeof ROLES)[number]).dir;
export const AUDIO: ReadonlySet<string> = new Set([
  ".wav",
  ".flac",
  ".mp3",
  ".ogg",
  ".opus",
  ".m4a",
  ".aif",
  ".aiff",
]);

const NAME = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

/**
 * Whether a pack or sample name may become part of a path: letters, digits, `.`, `_` and `-`, not starting with a
 * dot (so never `.`, `..` or a hidden folder), at most 100 characters.
 */
export function isSafeName(name: unknown): name is string {
  return typeof name === "string" && name.length <= 100 && NAME.test(name);
}

/** A recording found under a source folder: its path, its role and the sample name it gives. */
export type SourceFile = { file: string; kind: Kind; name: string; rel: string };

/** Every audio file under `source/{shots,loops,irs}`, sorted, named as `buildPack` names them. */
export function listSources(source: string): SourceFile[] {
  const out: SourceFile[] = [];
  for (const { dir, kind } of ROLES) {
    const root = join(source, dir);
    if (!existsSync(root)) continue;
    const entries = readdirSync(root, { recursive: true, encoding: "utf8" }).sort();
    for (const rel of entries) {
      const file = join(root, rel);
      if (!AUDIO.has(extname(rel).toLowerCase()) || !statSync(file).isFile()) continue;
      const stem = rel.slice(0, rel.length - extname(rel).length);
      out.push({ file, kind, name: stem.split(/[\\/]/).join("-"), rel: join(dir, rel) });
    }
  }
  return out;
}

/** The sidecar beside `file` (`{}` when there is none). Throws, naming the file, when it is not JSON or its edit is bad. */
export async function readSidecar(file: string): Promise<Sidecar> {
  const f = Bun.file(`${file}.json`);
  if (!(await f.exists())) return {};
  let raw: unknown;
  try {
    raw = await f.json();
  } catch {
    throw new Error(`${file}.json is not JSON`);
  }
  if (typeof raw !== "object" || raw === null) throw new Error(`${file}.json is not an object`);
  const sidecar = raw as Sidecar;
  if (sidecar.edit === undefined) return sidecar;
  try {
    const edit = checkEdit(sidecar.edit);
    const { edit: _, ...rest } = sidecar;
    return edit ? { ...rest, edit } : rest;
  } catch (e) {
    throw new Error(`${file}.json: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** The text of a sidecar: the fields that are set, in a fixed order, two-space JSON. */
export function sidecarText(sidecar: Sidecar): string {
  const order: (keyof Sidecar)[] = ["bpm", "bars", "root", "key", "loop", "source", "edit"];
  const out: Record<string, unknown> = {};
  for (const k of order) if (sidecar[k] !== undefined) out[k] = sidecar[k];
  return `${JSON.stringify(out, null, 2)}\n`;
}

/**
 * Keeps a recording as the source of sample `name`: copied to `<source>/<role>/<name><ext>` with its sidecar beside
 * it (none when the sidecar says nothing). Every earlier source that gave the same name, in any role or subfolder, is
 * removed with its sidecar, so a later `buildPack` over the folder finds one file per sample. Answers the kept path.
 */
export async function keepSource(o: {
  /** The pack's source folder (the one holding `shots/`, `loops/` and `irs/`). */
  source: string;
  name: string;
  kind: Kind;
  /** The recording to keep. */
  file: string;
  /** Its extension (`.wav`), when the file's own name does not end in it. */
  ext?: string;
  sidecar: Sidecar;
}): Promise<string> {
  if (!isSafeName(o.name)) throw new Error(`"${o.name}" is not a sample name`);
  const ext = (o.ext ?? extname(o.file)).toLowerCase();
  if (!AUDIO.has(ext))
    throw new Error(`a kept source must be audio (${[...AUDIO].join(", ")}), not "${ext}"`);
  const to = join(o.source, roleDir(o.kind), `${o.name}${ext}`);
  // Copied aside first: the recording may be the very file an earlier source is removed from.
  const tmp = `${to}.keeping`;
  mkdirSync(join(o.source, roleDir(o.kind)), { recursive: true });
  copyFileSync(o.file, tmp);
  for (const s of listSources(o.source))
    if (s.name === o.name) {
      rmSync(s.file, { force: true });
      rmSync(`${s.file}.json`, { force: true });
    }
  rmSync(`${to}.json`, { force: true });
  copyFileSync(tmp, to);
  rmSync(tmp, { force: true });
  const text = sidecarText(o.sidecar);
  if (text !== "{}\n") await Bun.write(`${to}.json`, text);
  return to;
}
