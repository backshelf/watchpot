import { describe, expect, test } from "bun:test";
import {
  addStat,
  D,
  type Decimal,
  damp,
  type LayerDef,
  type LayerExtraSource,
  type LayerModelDef,
  type LayerQuery,
  type LayersState,
  layerModel,
  mulStat,
} from "watchpot/core";

type Id = "a" | "b" | "c" | "d";
type Stat = "speed" | "gain" | "cost" | "passive";
type Q = LayerQuery<Id, Stat, "points">;
type Layer = LayerDef<Id, Stat, "points">;
type Def = LayerModelDef<Id, Stat, "points">;
type State = LayersState<Id>;

const BASE = { id: "points", rate: "speed" } as const;

/** A source switched on by adding a tag: how a test gives out a flag or an effect. */
const onTag = (id: string, src: Omit<LayerExtraSource<Id, Stat, "points">, "label" | "active">) => ({
  label: id,
  active: (q: Q) => q.tagged(id),
  ...src,
});

/**
 * The tree most tests climb. Row 1: `a` and `b`, normal, from points (the second of the row pays a toll). Row 2: `c`,
 * static, from points, with a challenge. Row 3: `d`, normal, from `c`'s units.
 */
const A: Layer = {
  id: "a",
  row: 1,
  kind: "normal",
  from: "points",
  requires: 10,
  gain: "gain",
  passive: "passive",
  tolls: [100, 1000],
  upgrades: [{ id: "a1", cost: 1, effects: [mulStat("speed", () => 2)], flags: ["bulk:a"] }],
  buyables: [
    {
      id: "a.x",
      pay: "a",
      first: 1,
      growth: 2,
      effects: [mulStat("speed", (q: Q) => 1 + q.level("a", "a.x"))],
    },
  ],
  milestones: [{ id: "m5", at: 5, effects: [mulStat("gain", () => 3)] }],
};
const B: Layer = { id: "b", row: 1, kind: "normal", from: "points", requires: 10, tolls: [100, 1000] };
const C: Layer = {
  id: "c",
  row: 2,
  kind: "static",
  from: "points",
  requires: 1000,
  scale: 2,
  cost: "cost",
  parents: ["a"],
  challenges: [
    {
      id: "c.trial",
      goal: 500,
      needs: 1,
      penalties: [mulStat("speed", () => 0.5)],
      mutes: ["a.upgrades"],
      effects: [mulStat("gain", () => 2)],
    },
  ],
};
const D_: Layer = { id: "d", row: 3, kind: "normal", from: "c", requires: 1, exponent: 1, parents: ["c"] };

const tree = (over: Partial<Def> = {}) =>
  layerModel<Id, Stat, "points">({ base: BASE, layers: [A, B, C, D_], ...over });

/** Points held, and a's state set, for a test that starts mid-climb. */
function at(s: State, points: number, set: (s: State) => void = () => {}): State {
  s.base = D(points);
  set(s);
  return s;
}

describe("a normal layer", () => {
  test("pays nothing below its requirement, then floor((from / requirement) ^ exponent × gain)", () => {
    const m = tree();
    const s = m.fresh();
    expect(m.read(at(s, 9.99)).gain("a").toNumber()).toBe(0);
    expect(m.read(at(s, 10)).gain("a").toNumber()).toBe(1);
    expect(m.read(at(s, 1000)).gain("a").toNumber()).toBe(10);
  });

  /** Walks `next` 40 times for each exponent and gain multiplier; `land` is where the walk steps to. */
  const walk = (
    exactNext: boolean,
    check: (n: Decimal, at: (x: Decimal) => Decimal, next: Decimal) => void,
  ) => {
    for (const exponent of [0.5, 0.7, 1]) {
      for (const gain of [1, 3, 7.3]) {
        const m = layerModel<Id, Stat, "points">({
          base: BASE,
          layers: [{ ...A, exponent }],
          stats: { gain },
          exactNext,
        });
        const s = at(m.fresh(), 10);
        const gainAt = (x: Decimal) => {
          s.base = x;
          return m.read(s).gain("a");
        };
        for (let i = 0; i < 40; i++) {
          const q = m.read(s);
          const n = q.gain("a");
          const next = q.next("a");
          check(n, gainAt, next);
          s.base = next.mul(1 + 1e-12);
        }
      }
    }
  };

  test("with `exactNext`, its gain reaches n + 1 exactly at `next`, and not a hair below", () => {
    walk(true, (n, gainAt, next) => {
      expect(gainAt(next.mul(1 - 1e-9)).eq(n)).toBe(true);
      expect(gainAt(next).eq(n.add(1))).toBe(true);
    });
  });

  test("by default `next` is the closed form: within a rounding error of where the gain steps", () => {
    walk(false, (n, gainAt, next) => {
      expect(gainAt(next.mul(1 - 1e-9)).eq(n)).toBe(true);
      expect(gainAt(next.mul(1 + 1e-12)).eq(n.add(1))).toBe(true);
    });
  });

  test("gain never falls as `from` rises", () => {
    const m = tree();
    let last = D(0);
    for (let p = 1; p < 1e9; p *= 1.37) {
      const g = m.read(at(m.fresh(), p)).gain("a");
      expect(g.gte(last)).toBe(true);
      last = g;
    }
  });
});

describe("a static layer", () => {
  const sighted = (m: ReturnType<typeof tree>, points: number, held = 0) =>
    at(m.fresh(), points, (s) => {
      s.layers.c.sighted = true;
      s.layers.c.established = held > 0;
      s.layers.c.amount = D(held);
    });

  test("prices grow by its scale and fall by its cost stat; one unit a reset without bulk", () => {
    const m = tree();
    const q = m.read(sighted(m, 1e9));
    expect(q.price("c", 0).toNumber()).toBe(1000);
    expect(q.price("c", 3).toNumber()).toBeCloseTo(8000, 6);
    expect(q.gain("c").toNumber()).toBe(1);
    const cheap = tree({ stats: { cost: 4 } });
    expect(cheap.read(sighted(cheap, 0)).price("c", 3).toNumber()).toBeCloseTo(2000, 6);
  });

  test("bulk takes every unit `from` covers, once established, capped by max", () => {
    const bulk = { sources: [onTag("bulk", { flags: ["bulk:c"] })] };
    const m = tree(bulk);
    const s = sighted(m, 20_000, 1);
    s.tags.push("bulk");
    const q = m.read(s);
    const g = q.gain("c");
    const top = g.add(1).toNumber();
    // The last unit taken is affordable; the one after is not.
    expect(q.price("c", top - 1).lte(s.base)).toBe(true);
    expect(q.price("c", top).gt(s.base)).toBe(true);
    expect(g.toNumber()).toBeGreaterThan(1);
    // Not yet established: one unit, bulk or not.
    const first = sighted(m, 20_000);
    first.tags.push("bulk");
    expect(m.read(first).gain("c").toNumber()).toBe(1);

    const capped = layerModel<Id, Stat, "points">({
      base: BASE,
      layers: [A, B, { ...C, max: 3 }, D_],
      ...bulk,
    });
    const s2 = sighted(capped, 1e12, 1);
    s2.tags.push("bulk");
    expect(capped.read(s2).gain("c").toNumber()).toBe(2);
    s2.layers.c.amount = D(3);
    expect(capped.read(s2).gain("c").toNumber()).toBe(0);
    expect(capped.read(s2).full("c")).toBe(true);
  });

  test("a price list prices unit by unit; past its end nothing is reachable", () => {
    const listed = { ...C, scale: undefined, prices: [100, 300, 900] };
    const m = layerModel<Id, Stat, "points">({
      base: BASE,
      layers: [A, B, listed, D_],
      sources: [onTag("bulk", { flags: ["bulk:c"] })],
    });
    const s = sighted(m, 1000, 1);
    s.tags.push("bulk");
    const q = m.read(s);
    expect(q.price("c", 1).toNumber()).toBe(300);
    expect(q.price("c", 3).toNumber()).toBe(Number.POSITIVE_INFINITY);
    expect(q.gain("c").toNumber()).toBe(2);
    s.layers.c.amount = D(3);
    expect(m.read(s).gain("c").toNumber()).toBe(0);
  });
});

describe("the row's toll", () => {
  test("multiplies the requirement of a layer not yet established by how many of its row are", () => {
    const m = layerModel<Id, Stat, "points">({
      base: BASE,
      layers: [A, B, { ...B, id: "c" }, { ...B, id: "d" }],
    });
    const s = m.fresh();
    expect(m.read(s).requirement("b").toNumber()).toBe(10);
    s.layers.a.established = true;
    expect(m.read(s).requirement("b").toNumber()).toBe(1000);
    s.layers.c.established = true;
    expect(m.read(s).requirement("b").toNumber()).toBe(10_000);
    s.layers.d.established = true;
    // Past the list: its last entry.
    expect(m.read(s).requirement("b").toNumber()).toBe(10_000);
    // Established, the toll is gone.
    s.layers.b.established = true;
    expect(m.read(s).requirement("b").toNumber()).toBe(10);
  });

  test("establishing records how many of the row went before", () => {
    const m = tree();
    const s = at(m.fresh(), 1e9);
    expect(m.resetInto(s, "a")).toBe(true);
    at(s, 1e9);
    expect(m.resetInto(s, "b")).toBe(true);
    expect([s.layers.a.order, s.layers.b.order]).toEqual([0, 1]);
  });
});

/** A climb with something in every row, ready for c's next reset. */
function midClimb(m: ReturnType<typeof tree>): State {
  return at(m.fresh(), 1e6, (s) => {
    for (const id of ["a", "b", "c", "d"] as const) {
      s.layers[id].sighted = true;
      s.layers[id].established = true;
      s.layers[id].resets = 2;
    }
    s.layers.a.amount = D(50);
    s.layers.a.best = D(80);
    s.layers.a.total = D(60);
    s.layers.a.upgrades = ["a1"];
    s.layers.a.buyables = { "a.x": 3 };
    s.layers.a.milestones = ["m5"];
    s.layers.a.power = D(7);
    s.layers.b.amount = D(5);
    s.layers.c.amount = D(1);
    s.layers.c.completions = { "c.trial": 1 };
    s.layers.d.amount = D(4);
  });
}

describe("a reset", () => {
  test("wipes every lower row and keeps what it must", () => {
    const m = tree();
    const s = midClimb(m);
    expect(m.resetInto(s, "c")).toBe(true);
    expect(s.base.toNumber()).toBe(0);
    for (const id of ["a", "b"] as const) {
      const st = s.layers[id];
      expect([st.amount.toNumber(), st.total.toNumber(), st.power.toNumber()]).toEqual([0, 0, 0]);
      expect(st.upgrades).toEqual([]);
      expect(st.buyables).toEqual({});
      expect(st.established).toBe(true);
      expect(st.resets).toBe(2);
    }
    expect(s.layers.a.milestones).toEqual(["m5"]);
    expect(s.layers.a.best.toNumber()).toBe(80);
    // Its own row and above are untouched; it is paid.
    expect(s.layers.c.amount.toNumber()).toBe(2);
    expect(s.layers.c.resets).toBe(3);
    expect(s.layers.c.completions).toEqual({ "c.trial": 1 });
    expect(s.layers.d.amount.toNumber()).toBe(4);
  });

  test("`keep:` saves a layer's upgrades and buyables, never its amount", () => {
    const m = tree({ sources: [onTag("keep", { flags: ["keep:a"] })] });
    const s = midClimb(m);
    s.tags.push("keep");
    m.resetInto(s, "c");
    expect(s.layers.a.upgrades).toEqual(["a1"]);
    expect(s.layers.a.buyables).toEqual({ "a.x": 3 });
    expect(s.layers.a.amount.toNumber()).toBe(0);
    expect(s.layers.b.amount.toNumber()).toBe(0);
  });

  test("`quiet:` makes a layer's reset wipe nothing", () => {
    const m = tree({ sources: [onTag("quiet", { flags: ["quiet:c"] })] });
    const s = midClimb(m);
    s.tags.push("quiet");
    m.resetInto(s, "c");
    expect(s.layers.c.amount.toNumber()).toBe(2);
    expect(s.layers.a.amount.toNumber()).toBe(50);
    expect(s.base.toNumber()).toBe(1e6);
  });

  test("is refused until the layer is sighted, and when it would pay nothing", () => {
    const m = tree();
    const s = at(m.fresh(), 1e6);
    expect(m.resetInto(s, "c")).toBe(false);
    m.settle(s); // still hidden: its parent is not established
    expect(s.layers.c.sighted).toBe(false);
    s.layers.a.established = true;
    m.settle(s);
    expect(s.layers.c.sighted).toBe(true);
    s.base = D(5);
    expect(m.resetInto(s, "a")).toBe(false);
  });
});

describe("milestones", () => {
  test("are reached on their count and never lost to a wipe", () => {
    const m = tree();
    const s = at(m.fresh(), 10);
    s.layers.a.total = D(5);
    const before = m.read(s).stat("gain").toNumber();
    m.settle(s);
    expect(s.layers.a.milestones).toEqual(["m5"]);
    expect(m.read(s).stat("gain").toNumber()).toBe(before * 3);
    m.wipeBelow(s, 9);
    m.settle(s);
    expect(s.layers.a.total.toNumber()).toBe(0);
    expect(s.layers.a.milestones).toEqual(["m5"]);
    expect(m.read(s).stat("gain").toNumber()).toBe(before * 3);
  });

  test("can count resets", () => {
    const m = layerModel<Id, Stat, "points">({
      base: BASE,
      layers: [{ ...B, milestones: [{ id: "r2", at: 2, on: "resets" }] }],
    });
    const s = m.fresh();
    for (let i = 0; i < 2; i++) {
      at(s, 100);
      m.resetInto(s, "b");
      m.settle(s);
      expect(s.layers.b.milestones.length).toBe(i);
    }
  });
});

describe("a challenge", () => {
  const ready = (m: ReturnType<typeof tree>) => {
    const s = midClimb(m);
    s.layers.c.completions = {};
    s.base = D(0);
    return s;
  };

  test("its whole life: enter wipes, penalties bite, the goal completes, the reward stays", () => {
    const m = tree();
    const s = ready(m);
    const outside = m.read(s).stat("speed");
    expect(m.enterChallenge(s, "c", "c.trial")).toBe(true);
    expect(s.challenge?.id).toBe("c.trial");
    expect(s.layers.a.amount.toNumber()).toBe(0);
    expect(s.layers.a.upgrades).toEqual([]);
    // Inside: the penalty halves speed (a's upgrades were wiped on the way in, so compare like for like).
    const s2 = ready(m);
    s2.layers.a.upgrades = [];
    s2.layers.a.buyables = {};
    expect(m.read(s).stat("speed").toNumber()).toBe(m.read(s2).stat("speed").toNumber() * 0.5);
    expect(m.read(s).stat("speed").lt(outside)).toBe(true);
    // Below the goal nothing completes; at it, settle completes and wipes again.
    m.advance(s, 1000);
    expect(s.challenge).not.toBeNull();
    s.base = D(500);
    m.settle(s);
    expect(s.challenge).toBeNull();
    expect(s.layers.c.completions["c.trial"]).toBe(1);
    expect(s.base.toNumber()).toBe(0);
    const reward = m.read(s).stat("gain");
    expect(reward.toNumber()).toBe(m.read(ready(m)).stat("gain").toNumber() * 2);
    // The reward persists through another reset, and the challenge is done (its limit is 1).
    s.base = D(1e6);
    m.resetInto(s, "c");
    expect(m.read(s).stat("gain").eq(reward)).toBe(true);
    expect(m.enterChallenge(s, "c", "c.trial")).toBe(false);
  });

  test("inside, nothing at its row or above resets; below does", () => {
    const m = tree();
    const s = ready(m);
    m.enterChallenge(s, "c", "c.trial");
    s.base = D(400);
    const q = m.read(s);
    expect(q.canReset("c")).toBe(false);
    expect(q.canReset("d")).toBe(false);
    expect(q.canReset("a")).toBe(true);
    expect(m.resetInto(s, "c")).toBe(false);
  });

  test("leaving pays nothing and wipes again", () => {
    const m = tree();
    const s = ready(m);
    m.enterChallenge(s, "c", "c.trial");
    s.base = D(400);
    s.layers.a.amount = D(3);
    expect(m.leaveChallenge(s)).toBe(true);
    expect(s.challenge).toBeNull();
    expect(s.layers.c.completions).toEqual({});
    expect([s.base.toNumber(), s.layers.a.amount.toNumber()]).toEqual([0, 0]);
    expect(m.leaveChallenge(s)).toBe(false);
  });

  test("needs its units, and only one challenge at a time", () => {
    const m = tree();
    const s = ready(m);
    s.layers.c.amount = D(0);
    expect(m.enterChallenge(s, "c", "c.trial")).toBe(false);
  });

  test("a mute group silences effects, never flags", () => {
    const m = tree();
    const s = ready(m);
    s.layers.a.upgrades = ["a1"];
    s.challenge = { layer: "c", id: "c.trial", since: 0 };
    const q = m.read(s);
    // Listed, marked muted, and not counted.
    expect(
      q
        .parts("speed")
        .filter((p) => p.muted === null)
        .map((p) => p.label),
    ).not.toContain("a1");
    expect(q.parts("speed").find((p) => p.label === "a1")?.muted).toBe("a.upgrades");
    expect(q.flag("bulk:a")).toBe(true);
    s.challenge = null;
    expect(
      m
        .read(s)
        .parts("speed")
        .map((p) => p.label),
    ).toContain("a1");
  });
});

describe("the breakdown's labels", () => {
  const inTrial = (m: ReturnType<typeof tree>) => {
    const s = m.fresh();
    s.layers.a.upgrades = ["a1"];
    s.layers.a.milestones = ["m5"];
    s.challenge = { layer: "c", id: "c.trial", since: 0 };
    return m.read(s);
  };

  test("a source is labelled by its name or id, a penalty as being inside its challenge", () => {
    const m = layerModel<Id, Stat, "points">({
      base: BASE,
      layers: [
        A,
        B,
        { ...C, challenges: [{ ...C.challenges?.[0], id: "c.trial", goal: 500, mutes: [] }] },
        D_,
      ],
    });
    expect(
      inTrial(m)
        .parts("speed")
        .map((p) => p.label),
    ).toEqual(["a1", "inside c.trial"]);
    expect(
      inTrial(m)
        .parts("gain")
        .map((p) => p.label),
    ).toEqual(["m5"]);
  });

  test("`label` renames a layer's sources by kind and leaves the rest as they were", () => {
    const seen: string[] = [];
    const m = layerModel<Id, Stat, "points">({
      base: BASE,
      layers: [
        A,
        B,
        { ...C, challenges: [{ ...C.challenges?.[0], id: "c.trial", goal: 500, mutes: [] }] },
        D_,
      ],
      label: (x) => {
        seen.push(`${x.layer}:${x.kind}:${x.id}`);
        if (x.kind === "milestone") return `${x.layer} milestone`;
        if (x.kind === "penalty") return `In ${x.id}`;
        return x.label;
      },
    });
    expect(
      inTrial(m)
        .parts("speed")
        .map((p) => p.label),
    ).toEqual(["a1", "In c.trial"]);
    expect(
      inTrial(m)
        .parts("gain")
        .map((p) => p.label),
    ).toEqual(["a milestone"]);
    expect(seen).toEqual([
      "a:upgrade:a1",
      "a:buyable:a.x",
      "a:milestone:m5",
      "c:challenge:c.trial",
      "c:penalty:c.trial",
    ]);
  });
});

describe("time", () => {
  test("passive income is the share of the raw gain, read before the step's income lands", () => {
    const m = tree({ sources: [onTag("passive", { effects: [addStat("passive", () => 0.25)] })] });
    const s = at(m.fresh(), 1000);
    s.tags.push("passive");
    const raw = m.read(s).rawGain("a");
    m.advance(s, 2000);
    expect(s.layers.a.amount.toNumber()).toBeCloseTo(raw.toNumber() * 0.25 * 2, 9);
    expect(s.layers.a.total.eq(s.layers.a.amount)).toBe(true);
    // Without the share, nothing.
    const off = at(m.fresh(), 1000);
    m.advance(off, 2000);
    expect(off.layers.a.amount.toNumber()).toBe(0);
  });

  test("a power builds at its rate up to its cap", () => {
    const m = layerModel<Id, Stat, "points">({
      base: BASE,
      layers: [
        {
          ...A,
          power: { rate: () => 3, cap: () => 10, effects: [mulStat("speed", (q: Q) => damp(q.power("a")))] },
        },
      ],
    });
    const s = m.fresh();
    m.advance(s, 2000);
    expect(s.layers.a.power.toNumber()).toBe(6);
    m.advance(s, 2000);
    expect(s.layers.a.power.toNumber()).toBe(10);
  });

  test("one long absence lands at or under many short steps, and within 10% of them", () => {
    const def: Partial<Def> = {
      sources: [onTag("passive", { effects: [addStat("passive", () => 0.05)] })],
      away: { capMs: 8 * 3_600_000 },
    };
    const m = layerModel<Id, Stat, "points">({
      base: BASE,
      layers: [{ ...A, holding: { effects: [mulStat("speed", (q: Q) => damp(q.amount("a")))] } }],
      ...def,
    });
    const start = () => {
      const s = at(m.fresh(), 100);
      s.tags.push("passive");
      return s;
    };
    const coarse = start();
    const credited = m.advanceAway(coarse, 3_600_000);
    expect(credited).toBe(3_600_000);
    const fine = start();
    for (let i = 0; i < 3600; i++) m.advance(fine, 1000);
    expect(coarse.playedMs).toBe(fine.playedMs);
    for (const [c, f] of [
      [coarse.baseTotal, fine.baseTotal],
      [coarse.layers.a.amount, fine.layers.a.amount],
    ] as [Decimal, Decimal][]) {
      expect(c.lte(f.mul(1.000001))).toBe(true);
      expect(c.gte(f.mul(0.9))).toBe(true);
    }
  });

  test("an absence past the cap is credited only to the cap", () => {
    const m = tree({ away: { capMs: 60_000 } });
    const s = m.fresh();
    expect(m.advanceAway(s, 3_600_000)).toBe(60_000);
    expect(s.playedMs).toBe(60_000);
  });
});

describe("automation", () => {
  // Two static layers on points, one above the other, both resetting on their own.
  const lo: Layer = { id: "a", row: 1, kind: "static", from: "points", requires: 10, scale: 2 };
  const hi: Layer = { id: "b", row: 2, kind: "static", from: "points", requires: 10, scale: 2 };
  const auto = (...flags: string[]) =>
    layerModel<Id, Stat, "points">({
      base: BASE,
      layers: [lo, hi],
      sources: [{ label: "always", active: () => true, flags }],
    });
  const ready = (m: ReturnType<typeof auto>) => at(m.fresh(), 100, (s) => (s.layers.b.sighted = true));

  test("goes highest row first: its reset wipes the row beneath before that row's turn", () => {
    const m = auto("auto:a", "auto:b");
    const s = ready(m);
    m.settle(s);
    expect(s.layers.b.established).toBe(true);
    expect(s.layers.a.established).toBe(false);
  });

  test("`auto:` without `quiet:` still wipes; with it, the row beneath gets its turn", () => {
    const m = auto("auto:a", "auto:b", "quiet:b");
    const s = ready(m);
    m.settle(s);
    expect(s.layers.b.established).toBe(true);
    expect(s.layers.a.established).toBe(true);
  });

  test("a layer switched to manual is skipped", () => {
    const m = auto("auto:a", "auto:b");
    const s = ready(m);
    m.setManual(s, "b", true);
    m.settle(s);
    expect(s.layers.b.established).toBe(false);
    expect(s.layers.a.established).toBe(true);
  });

  test("`autobuy:` and `autolevel:` buy upgrades and every level they can", () => {
    const m = tree({
      sources: [{ label: "always", active: () => true, flags: ["autobuy:a", "autolevel:a"] }],
    });
    const s = at(m.fresh(), 0, (x) => (x.layers.a.amount = D(100)));
    m.settle(s);
    expect(s.layers.a.upgrades).toEqual(["a1"]);
    // 99 left: levels at 1, 2, 4, 8, 16, 32 cost 63.
    expect(s.layers.a.buyables["a.x"]).toBe(6);
    expect(s.layers.a.amount.toNumber()).toBeCloseTo(36, 9);
  });

  test("`free:` levels spend nothing", () => {
    const m = tree({ sources: [{ label: "always", active: () => true, flags: ["free:a"] }] });
    const s = at(m.fresh(), 0, (x) => (x.layers.a.amount = D(8)));
    expect(m.buyLevel(s, "a", "a.x", true)).toBe(4);
    expect(s.layers.a.amount.toNumber()).toBe(8);
  });
});

describe("the definition check", () => {
  const throws = (layers: Layer[], pattern: RegExp, over: Partial<Def> = {}) =>
    expect(() => layerModel<Id, Stat, "points">({ base: BASE, layers, ...over })).toThrow(pattern);

  test("names each problem", () => {
    throws([A, A], /"a" is declared twice/);
    throws([{ ...A, from: "c" }], /unknown resource "c"/);
    throws([A, { ...C, parents: ["b"] }], /unknown parent "b"/);
    throws(
      [{ ...A, upgrades: [{ id: "a1", cost: 1, flags: ["keep:d"] }] }],
      /flag "keep:d" names an unknown layer/,
    );
    throws([{ ...A, from: "c" }, C], /measured from "c" in the higher row 2/);
    throws([A, { ...C, scale: undefined }], /static with neither a scale nor prices/);
    throws([{ ...A, milestones: [{ id: "m", at: 1, on: "amount" as never }] }], /counts an unknown "amount"/);
    throws([A, { ...C, from: "a.power" }], /layer "a" has no power/);
    throws([A, C, { ...D_, challenges: C.challenges }], /challenge "c.trial" is declared twice/);
    throws([A], /flag "auto:b"/, { sources: [{ label: "x", active: () => true, flags: ["auto:b"] }] });
  });

  test("lets a flag the rules do not read through", () => {
    expect(() =>
      layerModel<Id, Stat, "points">({
        base: BASE,
        layers: [{ ...A, upgrades: [{ id: "a1", cost: 1, flags: ["gold"] }] }],
      }),
    ).not.toThrow();
  });
});

describe("the query", () => {
  test("is cached per finished state, and a new state gets a new one", () => {
    const m = tree();
    const s = m.fresh();
    expect(m.query(s)).toBe(m.query(s));
    expect(m.query({ ...s })).not.toBe(m.query(s));
  });

  test("status: hidden, shown, open, established", () => {
    const m = tree();
    const s = m.fresh();
    expect([m.read(s).status("a"), m.read(s).status("c")]).toEqual(["open", "hidden"]);
    s.layers.a.established = true;
    expect(m.read(s).status("c")).toBe("shown");
    s.base = D(1000);
    m.settle(s);
    expect(m.read(s).status("c")).toBe("open");
    m.resetInto(s, "c");
    expect(m.read(s).status("c")).toBe("established");
  });

  test("a stat that reads itself throws", () => {
    const m = tree({
      sources: [
        { label: "loop", active: () => true, effects: [mulStat("speed", (q: Q) => q.stat("speed"))] },
      ],
    });
    expect(() => m.read(m.fresh()).stat("speed")).toThrow(/depends on itself/);
  });
});

describe("events and tags", () => {
  test("the rules report what they do, and a tag whose `when` holds is added once by settle", () => {
    const told: string[] = [];
    const m = tree({
      tags: [{ id: "rich", when: (q: Q) => q.base.gte(100) }],
      onEvent: (_s, e) =>
        told.push(e.kind === "away" ? `away:${e.creditedMs}` : `${e.kind}:${"layer" in e ? e.layer : e.id}`),
      away: { capMs: 60_000 },
    });
    const s = at(m.fresh(), 1000);
    m.settle(s);
    m.settle(s);
    expect(s.tags).toEqual(["rich"]);
    m.resetInto(s, "a");
    m.advanceAway(s, 3_600_000);
    m.advanceAway(s, 0);
    expect(told).toEqual(["tagged:rich", "established:a", "reset:a", "milestone:a", "away:60000"]);
    expect(m.tag(s, "rich")).toBe(false);
  });
});
