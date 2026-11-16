import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * The engine takes its clock and its entropy from the caller: `createIdleStore`'s `now` option is the only wall
 * read a game sees. A `Date.now()` or a no-argument `new Date()` under `src/` is a reader left on the wall clock,
 * and fails here unless the file is on `ALLOWED`. `performance.now()` is a duration, not a clock, and is not checked.
 */
const ROOT = join(import.meta.dir, "..", "..");
const WALL_READ = /Date\.now\(\)|new Date\(\s*\)/;

/** The files allowed to read the wall clock. Each entry must still read it. */
const ALLOWED = new Set<string>([]);

const sources = readdirSync(join(ROOT, "src"), { recursive: true, encoding: "utf8" })
  .filter((f) => /\.tsx?$/.test(f))
  .map((f) => relative(ROOT, join(ROOT, "src", f)).replaceAll("\\", "/"));

const readers = sources.filter((f) => WALL_READ.test(readFileSync(join(ROOT, f), "utf8")));

describe("the wall clock", () => {
  test("the scan reads the sources", () => {
    expect(sources.length).toBeGreaterThan(50);
  });

  test("is read nowhere outside the allowlist", () => {
    expect(readers.filter((f) => !ALLOWED.has(f))).toEqual([]);
  });

  test("every allowlisted file still reads it", () => {
    expect([...ALLOWED].filter((f) => !readers.includes(f))).toEqual([]);
  });
});
