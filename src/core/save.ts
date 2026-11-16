import { Decimal, isDecimal } from "./decimal";
import type { Migration } from "./feature";

/**
 * Save format. Decimals are tagged `{"$d":"<string>"}` on the way out and revived on the way in; functions are
 * dropped. The version lives beside the state; the game owns the number and passes it in. A save from an older
 * version is brought forward by the game's and its features' migrations; one no step reaches starts a fresh profile
 * (the store keeps a copy first), and such an export cannot be imported. A save that cannot be read throws a
 * `SaveError` with a code and the version numbers involved; the screen that shows it words it.
 */
const DECIMAL_TAG = "$d";

/** Walks a value tree, replacing Decimal instances with their tag and dropping functions. */
export function toPlain(value: unknown): unknown {
  if (isDecimal(value)) return { [DECIMAL_TAG]: value.toString() };
  if (Array.isArray(value)) return value.map((v) => (typeof v === "function" ? null : toPlain(v)));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === "function" || v === undefined) continue;
      out[k] = toPlain(v);
    }
    return out;
  }
  if (typeof value === "function") return undefined;
  return value;
}

function isDecimalTag(value: object): value is Record<typeof DECIMAL_TAG, string> {
  const keys = Object.keys(value);
  return (
    keys.length === 1 &&
    keys[0] === DECIMAL_TAG &&
    typeof (value as Record<string, unknown>)[DECIMAL_TAG] === "string"
  );
}

/** The inverse walk: tags become Decimals again. */
export function fromPlain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(fromPlain);
  if (value && typeof value === "object") {
    if (isDecimalTag(value)) return Decimal.fromString(value[DECIMAL_TAG]);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = fromPlain(v);
    return out;
  }
  return value;
}

/** Encodes a value as tagged JSON, so Decimals survive. */
export function serialize(value: unknown): string {
  return JSON.stringify(toPlain(value));
}

/** Decodes tagged JSON back into values, Decimals included. */
export function deserialize(json: string): unknown {
  return fromPlain(JSON.parse(json));
}

/** Why a save could not be read: `bad-json`, `bad-shape`, `newer-version`, `old-version` or `not-loaded`. */
export type SaveErrorCode = "bad-json" | "bad-shape" | "newer-version" | "old-version" | "not-loaded";

/** The versions behind a version error: the save's own, and the one this build reads. */
export interface SaveErrorData {
  version?: number;
  reads?: number;
}

/** The error the save codec throws, with a `code`. */
export class SaveError extends Error {
  constructor(
    readonly code: SaveErrorCode,
    readonly data: SaveErrorData = {},
  ) {
    super(code);
    this.name = "SaveError";
  }
}

/**
 * The steps that bring a save forward, keyed by the version each one produces (`3` takes a save at 2 to 3): the
 * game's over the whole saved state, each feature's over its own saved data. A `Game` is one.
 */
export interface MigrationSteps {
  readonly save: { readonly version: number; readonly migrations?: Readonly<Record<number, Migration>> };
  readonly features: readonly {
    readonly key: string;
    readonly migrations: Readonly<Record<number, Migration>>;
  }[];
}

/** Every version some step produces, ascending, with what is wrong with any key that is not a version. */
function declaredVersions(steps: MigrationSteps): { versions: number[]; bad: string[] } {
  const seen = new Set<number>();
  const bad: string[] = [];
  const add = (owner: string, table: Readonly<Record<number, Migration>> | undefined) => {
    for (const key of Object.keys(table ?? {})) {
      const v = Number(key);
      if (!Number.isInteger(v) || v < 1) bad.push(`${owner} declares a migration to "${key}", not a version`);
      else if (v > steps.save.version)
        bad.push(`${owner} declares a migration to ${v}, past the save's version ${steps.save.version}`);
      else seen.add(v);
    }
  };
  add("the game", steps.save.migrations);
  for (const f of steps.features) add(`feature "${f.key}"`, f.migrations);
  return { versions: [...seen].sort((a, b) => a - b), bad };
}

/**
 * What is wrong with a game's migrations, or an empty list: every key is a version up to the save's, and from the
 * oldest one declared to the save's version every version has a step (the game's or a feature's).
 */
export function migrationProblems(steps: MigrationSteps): string[] {
  const { versions, bad } = declaredVersions(steps);
  const first = versions[0];
  if (first === undefined) return bad;
  for (let v = first; v <= steps.save.version; v++)
    if (!versions.includes(v)) bad.push(`no migration produces version ${v} (steps run from ${first - 1})`);
  return bad;
}

/** The oldest save version the steps bring forward: the save's own version when none are declared. */
export function oldestReadable(steps: MigrationSteps): number {
  const { versions } = declaredVersions(steps);
  let oldest = steps.save.version;
  while (versions.includes(oldest)) oldest--;
  return oldest;
}

/**
 * What the loader keeps of a saved state at `fromVersion`: the state itself at the current version; from an older
 * one, the state brought forward by `steps` one version at a time (at each, the game's step over the whole state,
 * then each feature's over its own data in feature order), or nothing (a fresh profile) when a version on the way
 * has no step. A newer one is a typed error. A step that throws is not caught here.
 */
export function migrate(
  state: unknown,
  fromVersion: number,
  toVersion: number,
  steps?: MigrationSteps,
): unknown {
  if (fromVersion > toVersion)
    throw new SaveError("newer-version", { version: fromVersion, reads: toVersion });
  if (fromVersion === toVersion) return state;
  if (!steps || !Number.isInteger(fromVersion)) return null;
  const at = (v: number) => ({
    whole: steps.save.migrations?.[v],
    own: steps.features.flatMap((f) => (f.migrations[v] ? [{ key: f.key, step: f.migrations[v] }] : [])),
  });
  for (let v = fromVersion + 1; v <= toVersion; v++) {
    const { whole, own } = at(v);
    if (!whole && own.length === 0) return null;
  }
  let next = state;
  for (let v = fromVersion + 1; v <= toVersion; v++) {
    const { whole, own } = at(v);
    if (whole) next = whole(next);
    for (const { key, step } of own) {
      const saved = next && typeof next === "object" ? (next as Record<string, unknown>) : {};
      next = { ...saved, [key]: step(saved[key]) };
    }
  }
  return next;
}

/** The export format: a version, when it was saved and the state. */
export interface SaveEnvelope {
  version: number;
  savedAt: number;
  state: unknown;
}

/** The export format: the envelope as tagged JSON. */
export function encodeProfile(state: unknown, savedAt: number, version: number): string {
  return serialize({ version, savedAt, state });
}

/**
 * Parses an export, bringing an older one forward through `steps`. Throws SaveError on anything else: an older
 * export no step reaches (`old-version`), one a step cannot read (`bad-shape`), a newer one, junk.
 */
export function decodeProfile(json: string, currentVersion: number, steps?: MigrationSteps): SaveEnvelope {
  let raw: unknown;
  try {
    raw = deserialize(json);
  } catch {
    throw new SaveError("bad-json");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new SaveError("bad-shape");
  const env = raw as Record<string, unknown>;
  const version = typeof env.version === "number" ? env.version : 0;
  const state = env.state;
  if (!state || typeof state !== "object") throw new SaveError("bad-shape");
  const savedAt = typeof env.savedAt === "number" ? env.savedAt : 0;
  let migrated: unknown;
  try {
    migrated = migrate(state, version, currentVersion, steps);
  } catch (e) {
    if (e instanceof SaveError) throw e;
    throw new SaveError("bad-shape", { version });
  }
  if (migrated === null) throw new SaveError("old-version", { version });
  return { version: currentVersion, savedAt, state: migrated };
}
