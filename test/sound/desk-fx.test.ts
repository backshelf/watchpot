// The desk's effect table against the core's parameter ids: every setting the core takes has a control, in range.
import { describe, expect, test } from "bun:test";
import { DESK_FX } from "../../src/sound/desk-fx";
import { KIND } from "../../src/sound/mixer";
import { FX_PARAMS } from "../../src/sound/protocol";

describe("the desk's effect table", () => {
  test("every kind has exactly the settings FX_PARAMS gives its effect, in the core's order", () => {
    for (const [kind, core] of Object.entries(KIND)) {
      const params = DESK_FX[kind as keyof typeof KIND].map((p) => p.param);
      const ids = FX_PARAMS[core] as Readonly<Record<string, number>>;
      const wire = Object.keys(ids).sort((a, b) => (ids[a] ?? 0) - (ids[b] ?? 0));
      expect(params).toEqual(wire);
    }
  });

  test("each setting starts inside its range; a choice names each of its values", () => {
    for (const params of Object.values(DESK_FX))
      for (const p of params) {
        expect(p.min).toBeLessThan(p.max);
        expect(p.initial).toBeGreaterThanOrEqual(p.min);
        expect(p.initial).toBeLessThanOrEqual(p.max);
        if (p.scale === "log") expect(p.min).toBeGreaterThan(0);
        if (p.scale === "choice") expect(p.choices?.length).toBe(p.max - p.min + 1);
      }
  });
});
