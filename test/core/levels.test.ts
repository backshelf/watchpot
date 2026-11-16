import { describe, expect, test } from "bun:test";
import {
  D,
  defineGame,
  type Effect,
  feature,
  levelAt,
  levelProgress,
  levels,
  totalXpAt,
  type XpCurve,
  xpForLevel,
} from "watchpot/core";
import { freshStore } from "watchpot/test";
import { totals } from "./fold";

const CURVES: Record<string, XpCurve> = {
  geometric: { kind: "geometric", base: 100, growth: 1.25 },
  flat: { kind: "geometric", base: 50, growth: 1 },
  polynomial: { kind: "polynomial", base: 10, power: 2.5 },
  table: { kind: "table", totals: [10, 30, 70, 150, 400] },
  function: (level) => 7 * level * level + 3 * level,
};

describe("xp curves", () => {
  test("the XP for a level is the step between totals", () => {
    for (const curve of Object.values(CURVES))
      for (const L of [0, 1, 2, 3])
        expect(xpForLevel(curve, L).toNumber()).toBeCloseTo(
          totalXpAt(curve, L + 1)
            .sub(totalXpAt(curve, L))
            .toNumber(),
        );
    expect(xpForLevel(CURVES.geometric as XpCurve, 2).toNumber()).toBeCloseTo(156.25);
    expect(totalXpAt(CURVES.polynomial as XpCurve, 4).toNumber()).toBeCloseTo(320);
  });

  test("levelAt inverts totalXpAt exactly, at and either side of every boundary", () => {
    for (const [name, curve] of Object.entries(CURVES))
      for (let L = 0; L <= 40; L++) {
        const at = totalXpAt(curve, L);
        if (!at.lt(D(Number.POSITIVE_INFINITY))) break;
        for (const xp of [at, at.add(0.5), at.sub(0.5).max(0)]) {
          const level = levelAt(curve, xp);
          expect(totalXpAt(curve, level).lte(xp), `${name} ${xp}`).toBe(true);
          expect(totalXpAt(curve, level + 1).gt(xp), `${name} ${xp}`).toBe(true);
        }
        expect(levelAt(curve, at), name).toBe(L);
      }
  });

  test("the inverse holds at sizes a double cannot count to", () => {
    const steep: XpCurve = { kind: "geometric", base: 10, growth: 1e6 };
    for (const xp of ["1e100", "1e1000", "3.3e4000"]) {
      const level = levelAt(steep, xp);
      expect(totalXpAt(steep, level).lte(xp)).toBe(true);
      expect(totalXpAt(steep, level + 1).gt(xp)).toBe(true);
    }
    expect(levelAt(CURVES.polynomial as XpCurve, "1e30")).toBeGreaterThan(1e11);
  });

  test("a table stops at its last entry", () => {
    const table = CURVES.table as XpCurve;
    expect(levelAt(table, 1e9)).toBe(5);
    expect(levelProgress(table, 1e9)).toMatchObject({ level: 5, share: 1 });
    expect(levelAt(table, 0)).toBe(0);
    expect(levelAt(table, 9)).toBe(0);
  });

  test("levelProgress reads into and need", () => {
    const p = levelProgress(CURVES.geometric as XpCurve, 150); // level 1 at 100, the next at 225
    expect(p.level).toBe(1);
    expect(p.into.toNumber()).toBeCloseTo(50);
    expect(p.need.toNumber()).toBeCloseTo(125);
    expect(p.share).toBeCloseTo(0.4);
  });
});

const log = feature({ key: "log", initial: () => ({ ups: [] as string[] }) });
type State = { log: { ups: string[] } };
const skills = levels({
  key: "skills",
  tracks: [
    { id: "mining", curve: { kind: "geometric", base: 10, growth: 2 } },
    { id: "fishing", curve: { kind: "polynomial", base: 5, power: 2 }, maxLevel: 3 },
  ],
  onLevel: (d: State, track, from, to) => {
    d.log.ups.push(`${track}:${from}->${to}`);
  },
  effects: (track, level): Effect[] => [{ stat: track.id === "mining" ? "speed" : "luck", add: level }],
});
const game = defineGame({ id: "skills", save: { key: "skills.save", version: 1 }, features: [log, skills] });

describe("levels", () => {
  test("a gain reports the levels gained and tells the game once", () => {
    const { store } = freshStore(game);
    expect(store.getState().skills.gain("mining", 5)).toBe(0);
    expect(store.getState().skills.gain("mining", 65)).toBe(3); // 70: 10 + 20 + 40
    expect(store.getState().log.ups).toEqual(["mining:0->3"]);
    expect(skills.select.level(store.getState(), "mining")).toBe(3);
    expect(store.getState().skills.gain("mining", -50)).toBe(0);
    expect(store.getState().skills.gain("nothing", 50)).toBe(0);
  });

  test("a track stops at its max level and keeps no XP past it", () => {
    const { store } = freshStore(game);
    expect(store.getState().skills.gain("fishing", 1e6)).toBe(3);
    expect(store.getState().skills.xp.fishing?.toNumber()).toBe(45);
    expect(skills.select.progress(store.getState(), "fishing")).toMatchObject({ level: 3, share: 1 });
    expect(store.getState().skills.gain("fishing", 10)).toBe(0);
  });

  test("the draft helper gains inside a recipe; levels feed the stats feature", () => {
    const { store } = freshStore(game);
    let gained = 0;
    store.setState((d) => {
      gained = skills.draft.gain(d, "mining", 30) + skills.draft.gain(d, "fishing", 20);
    });
    expect(gained).toBe(4);
    const fed = skills.select.contributions(store.getState());
    expect(totals(fed, "speed").add).toBe(2);
    expect(totals(fed, "luck").add).toBe(2);
    expect(skills.select.contributions(store.getState())[0]?.source).toBe("skills:mining");
  });

  test("a save keeps the XP; a run reset clears it", () => {
    const { store } = freshStore(game);
    store.getState().skills.gain("mining", 1234.5);
    const saved = store.getState().exportProfile();
    store.getState().resetRun();
    expect(store.getState().skills.xp.mining?.toNumber()).toBe(0);
    store.getState().importProfile(saved);
    expect(store.getState().skills.xp.mining?.toNumber()).toBe(1234.5);
  });

  test("def holds the tracks and a lookup", () => {
    expect(skills.def.tracks.map((t) => t.id)).toEqual(["mining", "fishing"]);
    expect(skills.def.track("fishing")?.maxLevel).toBe(3);
    expect(skills.def.track("nothing")).toBeUndefined();
  });

  test("`reach` types onLevel: a reached feature reads, an unreached one does not", () => {
    const reached = levels({
      key: "craft",
      reach: () => [log],
      tracks: [{ id: "smith", curve: { kind: "polynomial", base: 1, power: 1 } }],
      onLevel: (d, track) => {
        d.log.ups.push(`${track}:${d.craft.xp.smith?.toString()}`);
      },
    });
    levels({
      key: "bad",
      reach: [log],
      tracks: [],
      // @ts-expect-error nothing reached a "moon"
      onLevel: (d) => d.moon.phase,
    });
    expect(reached.def.tracks.length).toBe(1);
  });
});
