import { describe, expect, test } from "bun:test";
import { tierOf } from "../../../src/kit/fx/rarity";
import {
  cardLayer,
  cardPose,
  cardRole,
  chargeMs,
  FAN,
  initialReveal,
  isTurned,
  nextDelay,
  printKeyOf,
  REVEAL_TIMING,
  type RevealEvent,
  type RevealState,
  reduceReveal,
} from "../../../src/kit/reveal/sequence";

/** A five-rung ladder: the sequence sees only each pull's charge, read off its rung. */
const LADDER = ["common", "rare", "epic", "legendary", "mythic"] as const;
type Rarity = (typeof LADDER)[number];
const charge = (rarity: Rarity) => chargeMs(tierOf(LADDER, rarity));
const ms = (rarities: readonly Rarity[]) => rarities.map(charge);

const TEN: Rarity[] = [
  "common",
  "rare",
  "common",
  "epic",
  "common",
  "legendary",
  "rare",
  "common",
  "mythic",
  "common",
];
const QUIET: Rarity[] = ["common", "rare", "epic"];

function run(state: RevealState, ...events: RevealEvent[]): RevealState {
  let s = state;
  for (const e of events) s = reduceReveal(s, e);
  return s;
}
const taps = (n: number): RevealEvent[] => Array.from({ length: n }, () => ({ type: "tap" }) as const);

describe("the reveal sequence", () => {
  test("runs chest, opening, the deal, then one card per tap, then the summary on the last tap", () => {
    let s = initialReveal(ms(QUIET), false);
    expect(s.phase).toBe("chest");
    expect(nextDelay(s)).toBe(REVEAL_TIMING.chestHold);
    s = reduceReveal(s, { type: "timer" });
    expect(s.phase).toBe("opening");
    expect(nextDelay(s)).toBe(REVEAL_TIMING.lidOpen);
    s = reduceReveal(s, { type: "timer" });
    expect(s).toMatchObject({ phase: "cards", revealed: 0, charging: false });
    expect(nextDelay(s)).toBe(REVEAL_TIMING.deal);
    for (let i = 1; i <= 3; i++) {
      s = reduceReveal(s, { type: "tap" });
      expect(s).toMatchObject({ phase: "cards", revealed: i, charging: false });
    }
    s = reduceReveal(s, { type: "tap" });
    expect(s.phase).toBe("summary");
    expect(nextDelay(s)).toBeNull();
    expect(reduceReveal(s, { type: "tap" })).toBe(s);
  });

  test("a turned card holds the centre until the player taps: no timer moves it on", () => {
    const s = run(initialReveal(ms(QUIET), false), ...taps(3));
    expect(s).toMatchObject({ phase: "cards", revealed: 1 });
    expect(cardRole(s, 0)).toBe("stage");
    expect(cardPose(s, 0)).toEqual({ x: 0, y: FAN.stageY, scale: 1, rotate: 0 });
    expect(nextDelay(s)).toBeNull();
    // the same for the last card, before the summary
    const last = run(s, ...taps(2));
    expect(last).toMatchObject({ phase: "cards", revealed: 3 });
    expect(cardRole(last, 2)).toBe("stage");
    expect(nextDelay(last)).toBeNull();
    expect(reduceReveal(last, { type: "tap" }).phase).toBe("summary");
  });

  test("the advance files the centred card to the shelf and turns the next", () => {
    const one = run(initialReveal(ms(QUIET), false), ...taps(3));
    const two = reduceReveal(one, { type: "tap" });
    expect(two).toMatchObject({ revealed: 2 });
    expect(cardRole(two, 0)).toBe("shelf");
    expect(cardPose(two, 0)).toMatchObject({ y: FAN.shelfY, scale: FAN.shelfScale });
    expect(cardRole(two, 1)).toBe("stage");
    expect(isTurned(two, 1)).toBe(true);
    expect(cardRole(two, 2)).toBe("deck");
  });

  test("a legendary or a mythic lifts face down and charges the room before it turns; the rest turn at once", () => {
    expect(charge("legendary")).toBeGreaterThan(0);
    expect(charge("legendary")).toBeLessThan(charge("mythic"));
    for (const r of ["common", "rare", "epic"] as const) expect(charge(r)).toBe(0);
    // A three-rung ladder charges only its top, the longest.
    expect(["low", "mid", "top"].map((id) => chargeMs(tierOf(["low", "mid", "top"], id)))).toEqual([
      0,
      0,
      REVEAL_TIMING.charge.top,
    ]);

    // Five commons and rares turn straight through to the legendary at index 5.
    let s = run(initialReveal(ms(TEN), false), ...taps(7));
    expect(s).toMatchObject({ phase: "cards", revealed: 5, charging: false });
    s = reduceReveal(s, { type: "tap" });
    expect(s).toMatchObject({ revealed: 5, charging: true });
    // The charging card is on the stage, face down; the one before it has filed.
    expect(cardRole(s, 5)).toBe("stage");
    expect(isTurned(s, 5)).toBe(false);
    expect(cardRole(s, 4)).toBe("shelf");
    expect(cardRole(s, 6)).toBe("deck");
    expect(cardPose(s, 5)).toEqual({ x: 0, y: FAN.stageY, scale: 1, rotate: 0 });
    expect(nextDelay(s)).toBe(REVEAL_TIMING.charge.big);
    // The timer (or a tap) turns it.
    s = reduceReveal(s, { type: "timer" });
    expect(s).toMatchObject({ revealed: 6, charging: false });
    expect(isTurned(s, 5)).toBe(true);
    expect(nextDelay(s)).toBeNull();
    // The mythic at index 8 charges longer.
    s = run(s, ...taps(3));
    expect(s).toMatchObject({ revealed: 8, charging: true });
    expect(nextDelay(s)).toBe(REVEAL_TIMING.charge.top);
  });

  test("a tap does what the timer does", () => {
    const byTimer = run(
      initialReveal(ms(QUIET), false),
      { type: "timer" },
      { type: "timer" },
      { type: "timer" },
    );
    const byTap = run(initialReveal(ms(QUIET), false), ...taps(3));
    expect(byTap).toEqual(byTimer);
    expect(byTap).toMatchObject({ phase: "cards", revealed: 1 });
  });

  test("skip turns everything and goes to the summary from any phase, a charge included", () => {
    for (const before of [
      initialReveal(ms(TEN), false),
      run(initialReveal(ms(TEN), false), ...taps(1)),
      run(initialReveal(ms(TEN), false), ...taps(4)),
      run(initialReveal(ms(TEN), false), ...taps(8)),
    ]) {
      const s = reduceReveal(before, { type: "skip" });
      expect(s).toMatchObject({ phase: "summary", revealed: 10, charging: false });
      for (let i = 0; i < 10; i++) {
        expect(isTurned(s, i)).toBe(true);
        expect(cardRole(s, i)).toBe("shelf");
      }
    }
  });

  test("reset starts over for a new result, with its own charges", () => {
    const s = run(
      initialReveal(ms(TEN), false),
      { type: "skip" },
      { type: "reset", charges: ms(["mythic"]), reduced: true },
    );
    expect(s).toEqual({
      phase: "chest",
      total: 1,
      revealed: 0,
      charging: false,
      charges: [REVEAL_TIMING.charge.top],
      reduced: true,
      printed: 0,
    });
  });

  test("a card's print key changes once per turn, when its face shows, never at the tap or through a charge", () => {
    let s = run(initialReveal(ms(TEN), false), { type: "timer" }, { type: "timer" });
    const keys = (st: RevealState) => TEN.map((_, i) => printKeyOf(st, i));
    const changes = new Array<number>(TEN.length).fill(0);
    const step = (event: RevealEvent) => {
      const before = keys(s);
      s = reduceReveal(s, event);
      const after = keys(s);
      after.forEach((k, i) => {
        if (k === before[i]) return;
        changes[i] = (changes[i] ?? 0) + 1;
        // Only the face moves a key, and only the card it names.
        expect(event).toEqual({ type: "face", index: i });
      });
    };
    while (s.phase === "cards") {
      step({ type: "tap" });
      if (s.phase !== "cards") break;
      if (s.charging) {
        // A face event during the charge (the card is still face down) changes nothing.
        step({ type: "face", index: s.revealed });
        step({ type: "timer" });
      }
      // The face shows; a second notice of the same face, or a stale one, changes nothing.
      step({ type: "face", index: s.revealed - 1 });
      step({ type: "face", index: s.revealed - 1 });
      step({ type: "face", index: Math.max(0, s.revealed - 2) });
    }
    expect(changes).toEqual(TEN.map(() => 1));
  });

  test("a skip shows the unturned faces whole: their keys never change", () => {
    let s = run(initialReveal(ms(TEN), false), ...taps(3), { type: "face", index: 0 });
    expect(printKeyOf(s, 0)).toBe(1);
    s = reduceReveal(s, { type: "skip" });
    for (let i = 1; i < TEN.length; i++) expect(printKeyOf(s, i)).toBe(0);
    expect(printKeyOf(reduceReveal(s, { type: "face", index: 9 }), 9)).toBe(0);
  });

  test("reduced motion shortens every pre-card step, the charge too, and still waits for the player", () => {
    let s = initialReveal(ms(["legendary", "common"]), true);
    expect(nextDelay(s)).toBe(REVEAL_TIMING.reducedStep);
    s = reduceReveal(s, { type: "timer" });
    expect(nextDelay(s)).toBe(REVEAL_TIMING.reducedStep);
    s = reduceReveal(s, { type: "timer" });
    expect(nextDelay(s)).toBe(REVEAL_TIMING.reducedStep);
    s = reduceReveal(s, { type: "timer" });
    expect(s.charging).toBe(true);
    expect(nextDelay(s)).toBe(REVEAL_TIMING.reducedStep);
    s = reduceReveal(s, { type: "timer" });
    expect(s).toMatchObject({ revealed: 1, charging: false });
    expect(nextDelay(s)).toBeNull();
  });

  test("the fan spreads the backs and collapses under reduced motion", () => {
    const dealt = run(initialReveal(ms(TEN), false), ...taps(2));
    const poses = Array.from({ length: 10 }, (_, i) => cardPose(dealt, i));
    expect(poses[0]?.rotate).toBeLessThan(0);
    expect(poses[9]?.rotate).toBeGreaterThan(0);
    expect(poses[0]?.rotate).toBeCloseTo(-(poses[9]?.rotate ?? 0));
    expect(poses[0]?.x).toBeLessThan(poses[9]?.x ?? 0);
    for (const p of poses) expect(p.scale).toBe(FAN.deckScale);
    const reduced = run(initialReveal(ms(TEN), true), ...taps(2));
    for (let i = 0; i < 10; i++)
      expect(cardPose(reduced, i)).toEqual({ x: 0, y: FAN.deckY, scale: FAN.deckScale, rotate: 0 });
  });

  test("the deck closes up behind a charging card, and the paint order keeps the stage on top", () => {
    const s = run(initialReveal(ms(TEN), false), ...taps(8)); // the legendary at 5 charging
    expect(s.charging).toBe(true);
    const deck = [6, 7, 8, 9].map((i) => cardPose(s, i));
    // Four backs left, fanned about the centre.
    expect(deck[0]?.rotate).toBeCloseTo(-(deck[3]?.rotate ?? 0));
    // The stage over the shelf, the shelf over the deck, and a later shelf card over an earlier one.
    for (let i = 0; i < 5; i++) expect(cardLayer(s, 5)).toBeGreaterThan(cardLayer(s, i));
    for (let i = 1; i < 5; i++) expect(cardLayer(s, i)).toBeGreaterThan(cardLayer(s, i - 1));
    for (const i of [6, 7, 8, 9]) expect(cardLayer(s, i)).toBeLessThan(cardLayer(s, 0));
  });

  test("the shelf runs along the top and spreads to every card at the summary", () => {
    const s = run(initialReveal(ms(QUIET), false), ...taps(4));
    expect(cardPose(s, 1)).toEqual({ x: 0, y: FAN.stageY, scale: 1, rotate: 0 });
    expect(cardPose(s, 0)).toMatchObject({ x: 0, y: FAN.shelfY, scale: FAN.shelfScale, rotate: 0 });
    const summary = reduceReveal(s, { type: "skip" });
    const xs = [0, 1, 2].map((i) => cardPose(summary, i).x);
    expect(xs).toEqual([-FAN.shelfStep, 0, FAN.shelfStep]);
  });

  test("a gift has no chest: it starts with the backs dealt, and a reset keeps it so", () => {
    expect(initialReveal(ms(["rare", "rare"]), false, true)).toMatchObject({ phase: "cards", revealed: 0 });
    const s = reduceReveal(initialReveal(ms(QUIET), false), {
      type: "reset",
      charges: ms(["rare"]),
      reduced: false,
      gift: true,
    });
    expect(s.phase).toBe("cards");
  });
});
