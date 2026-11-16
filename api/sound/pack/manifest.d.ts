import type { PackManifest } from "../types";
/** A pack as it stands in its folder: the manifest, and each sample's file name beside `pack.ts`. */
export type PackOnDisk = {
    manifest: PackManifest;
    files: Record<string, string>;
};
/** Runs after `pack.ts` is written, with its path: a game that formats its generated files formats it here. */
export type FormatHook = (file: string) => void | Promise<void>;
/**
 * Reads a pack back from the `pack.ts` in `dir` (`null` when there is none). The module is imported, not parsed: under
 * Bun each audio import resolves to the file's path, so every value and file name is what the module says, however a
 * formatter has laid the text out. Each read imports afresh (a query defeats the module cache).
 */
export declare function readManifest(dir: string): Promise<PackOnDisk | null>;
/** Writes `pack.ts` into `dir` as `buildPack` would, then runs `format` over it. */
export declare function writeManifest(dir: string, manifest: PackManifest, files: Readonly<Record<string, string>>, format?: FormatHook): Promise<string>;
/**
 * The text of `pack.ts`: a static import of each encoded file's URL (so a bundler fingerprints it) and the typed
 * manifest. `files` maps a sample's name to its file name beside `pack.ts`.
 */
export declare function manifestSource(manifest: PackManifest, files: Readonly<Record<string, string>>): string;
