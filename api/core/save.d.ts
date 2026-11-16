import type { Migration } from "./feature";
/** Walks a value tree, replacing Decimal instances with their tag and dropping functions. */
export declare function toPlain(value: unknown): unknown;
/** The inverse walk: tags become Decimals again. */
export declare function fromPlain(value: unknown): unknown;
/** Encodes a value as tagged JSON, so Decimals survive. */
export declare function serialize(value: unknown): string;
/** Decodes tagged JSON back into values, Decimals included. */
export declare function deserialize(json: string): unknown;
/** Why a save could not be read: `bad-json`, `bad-shape`, `newer-version`, `old-version` or `not-loaded`. */
export type SaveErrorCode = "bad-json" | "bad-shape" | "newer-version" | "old-version" | "not-loaded";
/** The versions behind a version error: the save's own, and the one this build reads. */
export interface SaveErrorData {
    version?: number;
    reads?: number;
}
/** The error the save codec throws, with a `code`. */
export declare class SaveError extends Error {
    readonly code: SaveErrorCode;
    readonly data: SaveErrorData;
    constructor(code: SaveErrorCode, data?: SaveErrorData);
}
/**
 * The steps that bring a save forward, keyed by the version each one produces (`3` takes a save at 2 to 3): the
 * game's over the whole saved state, each feature's over its own saved data. A `Game` is one.
 */
export interface MigrationSteps {
    readonly save: {
        readonly version: number;
        readonly migrations?: Readonly<Record<number, Migration>>;
    };
    readonly features: readonly {
        readonly key: string;
        readonly migrations: Readonly<Record<number, Migration>>;
    }[];
}
/**
 * What is wrong with a game's migrations, or an empty list: every key is a version up to the save's, and from the
 * oldest one declared to the save's version every version has a step (the game's or a feature's).
 */
export declare function migrationProblems(steps: MigrationSteps): string[];
/** The oldest save version the steps bring forward: the save's own version when none are declared. */
export declare function oldestReadable(steps: MigrationSteps): number;
/**
 * A saved value read loosely, for a migration step (which is handed `unknown`): its own fields when it is a plain
 * object, else an empty record. Decimals inside are already revived. `const old = savedRecord(saved);
 * return { ...old, count: old.owned ?? 0 }`; the game's step reads a slice the same way, `savedRecord(old.wallet)`.
 */
export declare function savedRecord(saved: unknown): Record<string, unknown>;
/**
 * What the loader keeps of a saved state at `fromVersion`: the state itself at the current version; from an older
 * one, the state brought forward by `steps` one version at a time (at each, the game's step over the whole state,
 * then each feature's over its own data in feature order, skipping a feature the save has no slice for), or nothing
 * (a fresh profile) when a version on the way has no step. A newer one is a typed error. A step that throws is not
 * caught here.
 */
export declare function migrate(state: unknown, fromVersion: number, toVersion: number, steps?: MigrationSteps): unknown;
/** The export format: a version, when it was saved and the state. */
export interface SaveEnvelope {
    version: number;
    savedAt: number;
    state: unknown;
}
/** The export format: the envelope as tagged JSON. */
export declare function encodeProfile(state: unknown, savedAt: number, version: number): string;
/**
 * Parses an export, bringing an older one forward through `steps`. Throws SaveError on anything else: an older
 * export no step reaches (`old-version`), one a step cannot read (`bad-shape`), a newer one, junk.
 */
export declare function decodeProfile(json: string, currentVersion: number, steps?: MigrationSteps): SaveEnvelope;
