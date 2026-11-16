import { describe, expect, test } from "bun:test";
import { D, type Decimal, liveIndex, type StatGraph, softcapDecimal } from "watchpot/core";

type Stat = "speed" | "reach" | "grip";
type Flag = "glide";
type Group = "tools" | "charms";

/** A toy state the effects read: how many of each thing is held. */
interface Bag {
  gears: number;
  charms: number;
}

describe("the live stat graph", () => {
  test("adds land on the base before the muls", () => {
    const index = liveIndex<Stat, Flag, Bag>({ base: () => 2 });
    index.add({ effects: [{ stat: "speed", op: "mul", value: () => 3 }] }, meta("first"));
    index.add({ effects: [{ stat: "speed", op: "add", value: (q) => q.gears }] }, meta("second"));
    const g = index.over({ gears: 4, charms: 0 });
    expect(g.stat("speed").toNumber()).toBe((2 + 4) * 3);
  });

  test("a stat nothing feeds is its base, and the base defaults to one", () => {
    expect(liveIndex<Stat, Flag, Bag>().over(bag()).stat("grip").toNumber()).toBe(1);
    const based = liveIndex<Stat, Flag, Bag>({
      base: (s) => (s === "grip" ? 50 : 0),
      caps: { grip: { hardcap: 10 } },
    });
    expect(based.over(bag()).stat("grip").toNumber()).toBe(10);
  });

  test("an inactive source does not count, and a muted group silences its effects and not its flags", () => {
    const index = liveIndex<Stat, Flag, Bag, Group>();
    index.add(
      { effects: [{ stat: "speed", op: "add", value: () => 5 }], flags: ["glide"] },
      { label: "Cog", owner: "workshop", group: "tools", active: (q) => q.gears > 0 },
    );
    index.add(
      { effects: [{ stat: "speed", op: "mul", value: () => 2 }] },
      { label: "Locket", owner: "pouch", group: "charms", active: (q) => q.charms > 0 },
    );

    const none = index.over({ gears: 0, charms: 0 });
    expect(none.stat("speed").toNumber()).toBe(1);
    expect(none.flag("glide")).toBe(false);
    expect(none.parts("speed")).toEqual([]);

    const both = index.over({ gears: 1, charms: 1 });
    expect(both.stat("speed").toNumber()).toBe(12);

    const hushed = index.over({ gears: 1, charms: 1 }, { muted: (group) => group === "tools" });
    expect(hushed.stat("speed").toNumber()).toBe(2);
    expect(hushed.parts("speed").map((p) => p.label)).toEqual(["Locket"]);
    expect(hushed.flag("glide")).toBe(true);
  });

  test("a value function runs once per graph however often the stat is read", () => {
    let calls = 0;
    const index = liveIndex<Stat, Flag, Bag>();
    index.add(
      {
        effects: [
          {
            stat: "speed",
            op: "add",
            value: (q) => {
              calls += 1;
              return q.gears;
            },
          },
        ],
      },
      meta("Cog"),
    );
    const g = index.over({ gears: 3, charms: 0 });
    for (let i = 0; i < 5; i++) g.stat("speed");
    g.parts("speed");
    g.explain("speed");
    expect(calls).toBe(1);
    index.over({ gears: 3, charms: 0 }).stat("speed");
    expect(calls).toBe(2);
  });

  test("an effect may read another stat through the state", () => {
    const { index, reader } = chained();
    index.add({ effects: [{ stat: "reach", op: "add", value: () => 4 }] }, meta("Ladder"));
    index.add({ effects: [{ stat: "speed", op: "mul", value: (q) => q.stat("reach") }] }, meta("Long legs"));
    expect(reader().stat("speed").toNumber()).toBe(5);
  });

  test("a direct and a two-step self-dependency both throw naming the stat", () => {
    const direct = chained();
    direct.index.add(
      { effects: [{ stat: "speed", op: "add", value: (q) => q.stat("speed") }] },
      meta("Loop"),
    );
    expect(() => direct.reader().stat("speed")).toThrow('stat "speed" depends on itself');

    const twoStep = chained();
    twoStep.index.add(
      { effects: [{ stat: "speed", op: "add", value: (q) => q.stat("reach") }] },
      meta("There"),
    );
    twoStep.index.add(
      { effects: [{ stat: "reach", op: "add", value: (q) => q.stat("speed") }] },
      meta("Back"),
    );
    const g = twoStep.reader();
    expect(() => g.stat("reach")).toThrow('stat "reach" depends on itself');
    // A throw leaves nothing half-worked behind: the next read throws the same way.
    expect(() => g.stat("reach")).toThrow('stat "reach" depends on itself');
  });

  test("a softcap and a hardcap hold past 1e308", () => {
    const soft = { start: 1e10, power: 0.5, label: "thin air" };
    const index = liveIndex<Stat, Flag, Bag>({
      caps: { speed: { softcap: soft }, reach: { hardcap: 1e300 } },
    });
    index.add({ effects: [{ stat: "speed", op: "mul", value: () => "1e400" }] }, meta("Huge"));
    index.add({ effects: [{ stat: "reach", op: "mul", value: () => "1e500" }] }, meta("Huger"));
    const g = index.over(bag());

    const speed = g.explain("speed");
    expect(speed.raw.eq("1e400")).toBe(true);
    expect(speed.value.lt(speed.raw)).toBe(true);
    // 1e400^0.5 x 1e10^0.5 = 1e205.
    expect(speed.value.log10().toNumber()).toBeCloseTo(205);
    expect(speed.softcapped).toBe("thin air");
    expect(speed.hardcapped).toBe(false);

    const reach = g.explain("reach");
    expect(reach.value.eq(1e300)).toBe(true);
    expect(reach.hardcapped).toBe(true);
    expect(reach.softcapped).toBeNull();
  });

  test("the softcap matches the bus's below 1e308 and is off for a start of zero or less", () => {
    const cap = { start: 100, power: 0.5, label: "patch" };
    expect(softcapDecimal(D(50), cap).toNumber()).toBe(50);
    expect(softcapDecimal(D(400), cap).toNumber()).toBeCloseTo(200);
    expect(softcapDecimal(D(400), { ...cap, start: 0 }).toNumber()).toBe(400);
    expect(softcapDecimal(D(400), undefined).toNumber()).toBe(400);
  });

  test("a mul worth zero makes the stat zero", () => {
    const index = liveIndex<Stat, Flag, Bag>({ base: () => 7 });
    index.add({ effects: [{ stat: "grip", op: "mul", value: () => 0 }] }, meta("Butter"));
    expect(index.over(bag()).stat("grip").toNumber()).toBe(0);
  });

  test("parts and explain agree with stat, quiet effects included", () => {
    const index = liveIndex<Stat, Flag, Bag>({ base: () => 3, caps: { speed: { hardcap: 1000 } } });
    index.add({ effects: [{ stat: "speed", op: "add", value: () => 2 }] }, meta("Cog"));
    index.add({ effects: [{ stat: "speed", op: "mul", value: () => 4, quiet: true }] }, meta("Hum"));
    index.add({ effects: [{ stat: "speed", op: "add", value: (q) => q.gears }] }, meta("Gears"));
    const g = index.over({ gears: 5, charms: 0 });

    const parts = g.parts("speed");
    expect(parts.map((p) => [p.label, p.op, p.value.toNumber(), p.quiet])).toEqual([
      ["Cog", "add", 2, false],
      ["Hum", "mul", 4, true],
      ["Gears", "add", 5, false],
    ]);

    const b = g.explain("speed");
    const adds = parts.filter((p) => p.op === "add").reduce((s, p) => s.add(p.value), D(0));
    const muls = parts.filter((p) => p.op === "mul").reduce((s, p) => s.mul(p.value), D(1));
    expect(b.add.eq(adds)).toBe(true);
    expect(b.mult.eq(muls)).toBe(true);
    expect(b.raw.eq(b.base.add(b.add).mul(b.mult))).toBe(true);
    expect(b.value.eq(g.stat("speed"))).toBe(true);
    expect(b.value.toNumber()).toBe(40);
    expect(b.parts).toEqual(parts);
  });

  test("a source added after a graph was made counts only in later graphs", () => {
    const index = liveIndex<Stat, Flag, Bag>();
    const before = index.over(bag());
    index.add({ effects: [{ stat: "speed", op: "add", value: () => 1 }], flags: ["glide"] }, meta("Late"));
    expect(before.stat("speed").toNumber()).toBe(1);
    expect(before.flag("glide")).toBe(false);
    const after = index.over(bag());
    expect(after.stat("speed").toNumber()).toBe(2);
    expect(after.flag("glide")).toBe(true);
  });
});

function bag(): Bag {
  return { gears: 0, charms: 0 };
}

function meta(label: string) {
  return { label, owner: "toy", active: () => true };
}

/** A state that holds its own graph, so an effect can read another stat. */
interface Reader {
  stat(id: Stat): Decimal;
}

function chained() {
  const index = liveIndex<Stat, Flag, Reader>();
  const reader = (): StatGraph<Stat, Flag> => {
    const q: Reader = { stat: (id) => graph.stat(id) };
    const graph = index.over(q);
    return graph;
  };
  return { index, reader };
}
