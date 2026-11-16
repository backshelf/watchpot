import { describe, expect, test } from "bun:test";
import {
  at,
  atLeast,
  band,
  byDay,
  byHour,
  failing,
  grid,
  judge,
  markdownTable,
  pairs,
  perRun,
  sampler,
  table,
  tally,
} from "watchpot/sim";

/** A synthetic timeline: a row at the close of each day, gold doubling, a level a day. */
interface Row {
  hours: number;
  run: number;
  gold: number;
  level: number;
}
const close = (day: number, over: Partial<Row> = {}): Row => ({
  hours: (day - 1) * 24 + 15,
  run: 1,
  gold: 10 * 2 ** day,
  level: day,
  ...over,
});
const METRICS = {
  gold: { name: "Gold", read: (r: Row) => r.gold },
  level: { name: "Level", read: (r: Row) => r.level },
};
const BY_DAY = byDay((r: Row) => r.hours);

describe("the contract DSL", () => {
  test("a band is in or out on the latest row by the end of its day, and left out before the run gets there", () => {
    const t = table(BY_DAY, METRICS, [
      band("gold", { at: 1, p10: 15, p90: 25 }),
      band("level", { at: 2, p10: 3, p90: 4 }),
      band("gold", { at: 5, p10: 0, p90: 1 }),
    ]);
    const verdicts = judge([close(1), close(2), close(3)], t);
    expect(verdicts.find((v) => v.name === "Gold, day 1")).toMatchObject({
      value: 20,
      ok: true,
      target: "15–25",
    });
    expect(verdicts.find((v) => v.name === "Level, day 2")).toMatchObject({ value: 2, ok: false });
    // Day 5 is past the run's last row: not judged.
    expect(verdicts.some((v) => v.name === "Gold, day 5")).toBe(false);
  });

  test("a skipped day reads the day before's row; a ceiling table holds the top alone", () => {
    const t = table(
      BY_DAY,
      METRICS,
      grid(
        [1, 3],
        [
          [
            "level",
            [
              [5, 6],
              [5, 6],
            ],
          ],
        ],
      ),
    );
    const rows = [close(1), close(2, { level: 5 }), close(4, { level: 9 })];
    expect(judge(rows, t).find((v) => v.name === "Level, day 3")).toMatchObject({ value: 5, ok: true });
    // Day 1's level is under the floor: out as a band, in as a ceiling.
    expect(judge(rows, t).find((v) => v.name === "Level, day 1")?.ok).toBe(false);
    expect(judge(rows, t, { ceiling: true }).find((v) => v.name === "Level, day 1")).toMatchObject({
      ok: true,
      target: "at most 6",
    });
  });

  test("an hour axis reads the last row at or before its hour, once the run reached it", () => {
    const hourly = table(
      byHour((r: Row) => r.hours),
      METRICS,
      [band("gold", { at: 20, p10: 0, p90: 100 })],
    );
    expect(judge([close(1)], hourly)).toEqual([]);
    expect(judge([close(1), close(2)], hourly)[0]).toMatchObject({ name: "Gold, hour 20", value: 20 });
  });

  test("the combinators: a day-N reading, day-over-day pairs and a check per run", () => {
    const rows = [close(1), close(2), close(3), close(1, { run: 2, hours: 80 })];
    expect(at(rows, BY_DAY, 2)?.level).toBe(2);
    const growth = pairs(rows.slice(0, 3), (row, before) =>
      before ? [atLeast(`Growth, day ${row.level}`, row.gold / before.gold, 2)] : [],
    );
    expect(growth.map((v) => v.name)).toEqual(["Growth, day 2", "Growth, day 3"]);
    expect(growth.every((v) => v.ok)).toBe(true);
    const runs = perRun(
      rows,
      (r) => r.run,
      (rs, run) => [atLeast(`Run ${run} rows`, rs.length, 2)],
    );
    expect(runs.map((v) => [v.name, v.ok])).toEqual([
      ["Run 1 rows", true],
      ["Run 2 rows", false],
    ]);
  });

  test("across seeds a check fails only when most runs miss it", () => {
    const v = (ok: boolean) => ({ name: "Gold, day 1", value: 1, target: "1–2", ok });
    expect(failing(tally([[v(false)], [v(false)], [v(true)]]))).toHaveLength(1);
    expect(failing(tally([[v(false)], [v(true)]]))).toEqual([]);
  });
});

describe("the timeline", () => {
  test("a row as each mark passes, marks passed together are one row, and a close replaces a row at its moment", () => {
    let now = 0;
    const s = sampler({ marks: [10, 20, 30], start: 0, take: () => ({ at: now }), at: (r) => r.at });
    now = 5;
    s.look(now);
    now = 12;
    s.look(now);
    now = 35;
    s.look(now);
    expect(s.rows.map((r) => r.at)).toEqual([12, 35]);
    s.close({ at: 35 });
    expect(s.rows).toHaveLength(2);
    s.restart(40);
    now = 50;
    s.look(now);
    expect(s.rows.map((r) => r.at)).toEqual([12, 35, 50]);
  });

  test("a markdown table: its head, its rule and a line a row", () => {
    expect(markdownTable(["A", "B"], [["1", "2"]])).toBe("| A | B |\n| --- | --- |\n| 1 | 2 |");
  });
});
