import { describe, expect, test } from "bun:test";
import { produce } from "immer";
import { type JournalLine, linesSince, pushLine } from "watchpot/core";

const line = (n: number): JournalLine<"note"> => ({ at: n, kind: "note", text: `line ${n}` });

describe("pushLine", () => {
  test("appends, then drops from the front past keep", () => {
    const log: JournalLine[] = [];
    for (let i = 1; i <= 5; i++) pushLine(log, line(i), 3);
    expect(log.map((l) => l.at)).toEqual([3, 4, 5]);
  });

  test("the default keep is 40", () => {
    const log: JournalLine[] = [];
    for (let i = 1; i <= 45; i++) pushLine(log, line(i));
    expect(log).toHaveLength(40);
    expect(log[0]?.at).toBe(6);
  });

  test("a keep of 0 or less keeps nothing", () => {
    for (const keep of [0, -3]) {
      const log = [line(1)];
      pushLine(log, line(2), keep);
      expect(log).toEqual([]);
    }
  });

  test("works on an immer draft", () => {
    const next = produce({ log: [line(1), line(2)] }, (d) => {
      pushLine(d.log, line(3), 2);
    });
    expect(next.log.map((l) => l.at)).toEqual([2, 3]);
  });
});

describe("linesSince", () => {
  const log = [line(1), line(2), line(3)] as [JournalLine, JournalLine, JournalLine];

  test("everything when the cursor is undefined", () => {
    expect(linesSince(log, undefined)).toEqual(log);
  });

  test("what follows the cursor when it is in the log", () => {
    expect(linesSince(log, log[0])).toEqual([log[1], log[2]]);
    expect(linesSince(log, log[2])).toEqual([]);
  });

  test("nothing when the cursor is not in the log, equal content or not", () => {
    expect(linesSince(log, line(99))).toEqual([]);
    expect(linesSince(log, line(2))).toEqual([]);
  });
});
