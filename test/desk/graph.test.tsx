// The desk's plot under a real game's plan: thousands of gates on one fixed axis. A key is drawn where it can be read
// (one per pixel column, no two overprinting, at most three rows) and every mark is one per pixel column, however many
// gates and seeds put one there. Before the thinning, 2 491 keys landed in the band's three rows and painted a smear.
import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { type GateMark, Graph } from "../../src/desk/page/Graph";
import { yAxis } from "../../src/desk/page/series";

const END_H = 180;
/** A plan far denser than the plot has room to label: the desk must thin it, not stack it. */
const N = 600;
/** The plot's key metric, as `Graph.tsx` draws it: a key's box is its text at this size plus padding. */
const KEY_GLYPH = 8.6;
const KEY_PAD = 4;
/** The rows of keys the band takes: `KEY_ROWS` in `Graph.tsx`. */
const KEY_ROWS = 3;
const AXIS = yAxis([0, 3], true);

/** A plan of `n` gates spread over the axis, each opened by three seeds a little after its minute. */
const plan = (n: number): GateMark[] =>
  Array.from({ length: n }, (_, i) => {
    const plannedH = (i / (n - 1)) * END_H;
    return {
      key: `g${i}`,
      plannedH,
      openings: [plannedH + 0.02, plannedH + 0.03, plannedH + 0.04],
      labelH: plannedH,
      hand: i % 50 === 0,
    };
  });

function draw(gates: GateMark[]) {
  const { container } = render(
    <Graph
      title="Pace"
      caption="coins over played hours"
      note="coins over played hours, with the plan's gates"
      endHours={END_H}
      axis={AXIS}
      log
      lines={[
        {
          id: "coins",
          slot: 0,
          weight: "strong",
          pts: [
            [0, 1],
            [END_H, 2],
          ],
        },
      ]}
      gates={gates}
      stops={[0, END_H]}
      readout={() => [{ label: "coins", slot: 0, text: "1e1" }]}
    />,
  );
  // The axis line is the plot's own box: its two ends are the left margin and the plot's right edge.
  const axis = container.querySelector(".graph__axis");
  const left = Number(axis?.getAttribute("x1"));
  const right = Number(axis?.getAttribute("x2"));
  const xs = (selector: string): number[] =>
    [...container.querySelectorAll(selector)].map((el) =>
      Number(el.getAttribute("x1") ?? el.getAttribute("x")),
    );
  const keys = [...container.querySelectorAll("text.graph__gatename")].map((el) => {
    const x = Number(el.getAttribute("x"));
    const end = el.getAttribute("text-anchor") === "end";
    const text = el.textContent ?? "";
    return {
      text,
      y: Number(el.getAttribute("y")),
      // The plot position the key is anchored at: `Graph.tsx` draws the text four px off it, either way.
      at: end ? x + 4 : x - 4,
      from: end ? x - (text.length * KEY_GLYPH + KEY_PAD) : x,
      to: end ? x : x + (text.length * KEY_GLYPH + KEY_PAD),
    };
  });
  return { left, right, xs, keys };
}

describe("the pace plot's gate band", () => {
  test("thins a real game's plan to keys that can be read, spread across the axis", () => {
    const { left, right, keys } = draw(plan(N));
    const width = right - left;
    // Every key has a pixel column of its own: no two keys overprint.
    const columns = keys.map((k) => Math.round(k.at));
    expect(new Set(columns).size).toBe(columns.length);
    // And each sits inside the plot.
    for (const k of keys) {
      expect(k.at).toBeGreaterThanOrEqual(left - 1);
      expect(k.at).toBeLessThanOrEqual(right + 1);
    }
    // No two keys in a row can overlap: the widest a key's box reaches never meets the next one.
    const rows = new Map<number, typeof keys>();
    for (const k of keys) rows.set(k.y, [...(rows.get(k.y) ?? []), k]);
    expect(rows.size).toBeLessThanOrEqual(KEY_ROWS);
    for (const row of rows.values())
      for (const a of row)
        for (const b of row) if (a !== b) expect(a.to <= b.from + 1 || b.to <= a.from + 1).toBe(true);
    // The band is therefore bounded by the plot's width, not the plan's gate count: a few keys per row.
    const narrowest = 3 * KEY_GLYPH + KEY_PAD;
    expect(keys.length).toBeLessThanOrEqual(KEY_ROWS * Math.floor(width / narrowest));
    // Thinned, not emptied: the plan is still marked across its whole span.
    expect(keys.length).toBeGreaterThan(KEY_ROWS);
    expect(keys.some((k) => k.at > left + width * 0.75)).toBe(true);
  });

  test("draws each mark once per pixel column, however many gates and seeds share it", () => {
    const { left, right, xs } = draw(plan(N));
    const width = right - left;
    const columns = Math.round(width) + 1;
    for (const selector of [".graph__planned", ".graph__opened", ".graph__hand"]) {
      const marks = xs(selector).map(Math.round);
      expect(new Set(marks).size).toBe(marks.length);
      expect(marks.length).toBeLessThanOrEqual(columns);
    }
    // Thinning takes the duplicates in a column, never the plan: every gate's minute is still marked.
    const planned = new Set(xs(".graph__planned").map(Math.round));
    for (const gate of plan(N))
      expect(planned.has(Math.round(left + (gate.plannedH / END_H) * width))).toBe(true);
  });

  test("keeps every key and mark of a small plan as it drew them", () => {
    const gates = plan(6);
    const { keys, xs } = draw(gates);
    expect(keys.map((k) => k.text).sort()).toEqual(gates.map((g) => g.key).sort());
    expect(xs(".graph__planned").length).toBe(gates.length);
    expect(new Set(keys.map((k) => k.at)).size).toBe(gates.length);
  });
});
