import { beforeAll, describe, expect, test } from "bun:test";
import { chapters, check, type Report } from "../../scripts/guide-examples";

/**
 * The guide's quoted code and output are the examples' own. Each `example-output` block must be what its example
 * prints, each `example-code` block must be in its example file, each `example-prints` line must be printed, every
 * marker must point at a file, and every guide example must be referenced by a chapter. The convention is in
 * `docs/README.md` ("Keeping the guide's examples true"); `bun scripts/guide-examples.ts --write` rewrites the
 * output blocks after an example's output moves on purpose.
 */
let report: Report;
beforeAll(async () => {
  report = await check();
}, 120_000);

describe("the guide's examples", () => {
  for (const chapter of chapters()) {
    test(chapter, () => {
      expect((report.byChapter.get(chapter) ?? []).map((f) => f.message)).toEqual([]);
    });
  }

  test("every guide example is referenced by a chapter", () => {
    expect(report.loose.map((f) => f.message)).toEqual([]);
  });

  test("the guide is tied to its examples at all", () => {
    expect(report.markers.filter((m) => m.kind === "output").length).toBeGreaterThan(3);
    expect(report.markers.filter((m) => m.kind === "code").length).toBeGreaterThan(30);
  });
});
