import { beforeAll, describe, expect, test } from "bun:test";
import { check, pages, type Report } from "../../scripts/guide-examples";

/**
 * The docs' quoted code and output are the examples' own: the guide's chapters and the reference pages. Each
 * `example-output` block must be what its example prints, each `example-code` block must be in its example file,
 * each `example-prints` line must be printed, every marker must point at a file, every guide example must be
 * referenced by a chapter and every other example by some page. The convention is in `docs/README.md` ("Keeping the
 * guide's examples true"); `bun scripts/guide-examples.ts --write` rewrites the output blocks after an example's
 * output moves on purpose.
 */
let report: Report;
beforeAll(async () => {
  report = await check();
}, 120_000);

describe("the docs' examples", () => {
  for (const page of pages()) {
    test(page, () => {
      expect((report.byPage.get(page) ?? []).map((f) => f.message)).toEqual([]);
    });
  }

  test("every example is referenced", () => {
    expect(report.loose.map((f) => f.message)).toEqual([]);
  });

  test("the docs are tied to their examples at all", () => {
    const guide = report.markers.filter((m) => m.page.startsWith("guide/"));
    expect(guide.filter((m) => m.kind === "output").length).toBeGreaterThan(3);
    expect(guide.filter((m) => m.kind === "code").length).toBeGreaterThan(30);
    expect(report.markers.filter((m) => !m.page.startsWith("guide/")).length).toBeGreaterThan(20);
  });
});
