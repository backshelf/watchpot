import { addStat, damp, defineLayers, fmt, type LayerDef, mulStat } from "watchpot/core";

/**
 * The toy's words: three layers over a base resource, and the stats their effects land on. Typed once, every effect
 * callback below reads its query (`LayerQuery<Id, Stat, "points">`) without an annotation.
 */
type Id = "a" | "b" | "c";
type Stat = "speed" | "gain" | "cost" | "passive";
type Layer = LayerDef<Id, Stat, "points">;

/** Row 1: a normal layer. Resetting `points` pays `floor(sqrt(points / 10) × gain)` of `a`. */
const A: Layer = {
  id: "a",
  row: 1,
  kind: "normal",
  from: "points",
  requires: 10,
  gain: "gain",
  passive: "passive",
  // Holding `a` speeds points up, damped: an effect that reads an unbounded resource goes through `damp`.
  holding: { effects: [mulStat("speed", (q) => damp(q.units("a")))] },
  upgrades: [
    { id: "a1", cost: 1, effects: [mulStat("speed", () => 2)] },
    { id: "a2", cost: 5, effects: [mulStat("gain", (q) => damp(q.base))] },
  ],
  buyables: [
    {
      id: "a.x",
      pay: "a",
      first: 10,
      growth: 2,
      curve: 1.2,
      effects: [mulStat("speed", (q) => 1.5 ** q.level("a", "a.x"))],
    },
  ],
  challenges: [
    {
      id: "a.trial",
      goal: 1000,
      // Inside: points rise a tenth as fast, and a's upgrades do nothing.
      penalties: [mulStat("speed", () => 0.1)],
      mutes: ["a.upgrades"],
      effects: [mulStat("gain", () => 2)],
    },
  ],
};

/** Row 2: a static layer. Its units cost `200 × 4 ^ held ÷ cost` points, one reset each. */
const B: Layer = {
  id: "b",
  row: 2,
  kind: "static",
  from: "points",
  requires: 200,
  scale: 4,
  cost: "cost",
  parents: ["a"],
  holding: { effects: [mulStat("speed", (q) => 2 ** q.units("b").toNumber())] },
  milestones: [
    // Never lost: from the second unit, a's upgrades and buyables survive b's resets.
    { id: "b2", at: 2, flags: ["keep:a"] },
    // A tenth of a's reset gain a second, without resetting.
    { id: "b3", at: 3, effects: [addStat("passive", () => 0.1)] },
  ],
};

/** Row 3: a normal layer measured from b's units held. */
const C: Layer = {
  id: "c",
  row: 3,
  kind: "normal",
  from: "b",
  requires: 4,
  exponent: 1,
  parents: ["b"],
  holding: { effects: [mulStat("cost", (q) => damp(q.amount("c")))] },
  milestones: [{ id: "c1", at: 1, flags: ["auto:b", "quiet:b", "bulk:b"] }],
};

/** The feature: saves under `climb`, steps every tick and over an absence. */
export const climb = defineLayers({
  key: "climb",
  base: { id: "points", rate: "speed" },
  layers: [A, B, C],
  // Every stat starts at 1, a layer's passive stat at 0.
});

if (import.meta.main) {
  // The rules run on plain state too: a sim, a test or this script.
  const m = climb.def.model;
  const s = m.fresh();
  for (let t = 0; t < 3600 && !s.layers.c.established; t++) {
    m.advance(s, 1000);
    const q = m.read(s);
    for (const u of A.upgrades ?? []) m.buyUpgrade(s, "a", u.id);
    m.buyLevel(s, "a", "a.x", true);
    if (q.canReset("c")) m.resetInto(s, "c");
    else if (q.canReset("b")) m.resetInto(s, "b");
    else if (q.gain("a").gte(q.amount("a").max(1))) m.resetInto(s, "a");
    m.settle(s);
  }
  const q = m.query(s);
  for (const l of m.list)
    console.log(
      `${l.id}: ${q.status(l.id)}, holds ${fmt(q.amount(l.id)).text}, next at ${fmt(q.next(l.id)).text}`,
    );
  console.log(`points ${fmt(s.base).text} at ${fmt(q.baseRate).text}/s after ${s.playedMs / 1000}s`);
}
