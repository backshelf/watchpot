import { describe, expect, test } from "bun:test";
import { tierIntensity, tierOf, tierRamp, tierStep, tierToken } from "../../../src/kit/fx/rarity";

const FIVE = ["a", "b", "c", "d", "e"];
const THREE = ["low", "mid", "top"];

describe("a rung's height", () => {
  test("runs from 0 at the lowest rung to 1 at the top, evenly; a one-rung ladder is its top", () => {
    expect(FIVE.map((id) => tierIntensity(tierOf(FIVE, id)))).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(THREE.map((id) => tierIntensity(tierOf(THREE, id)))).toEqual([0, 0.5, 1]);
    expect(tierIntensity(tierOf(["only"], "only"))).toBe(1);
    expect(tierIntensity(tierOf([], "common"))).toBe(0);
  });

  test("an id off the ladder is its lowest rung; the hue token is the id's", () => {
    expect(tierOf(FIVE, "z")).toEqual({ index: 0, count: 5, id: "z" });
    expect(tierToken(tierOf(FIVE, "c"))).toBe("--rarity-c");
  });

  test("a step of five: each rung of five its own, three rungs the first, the middle and the last", () => {
    expect(FIVE.map((id) => tierStep(tierOf(FIVE, id), 5))).toEqual([0, 1, 2, 3, 4]);
    expect(THREE.map((id) => tierStep(tierOf(THREE, id), 5))).toEqual([0, 2, 4]);
  });

  test("a ramp lands on each stop for as many rungs as stops, and between them otherwise", () => {
    const stops = [0.3, 0.45, 0.6, 0.8, 1];
    expect(FIVE.map((id) => tierRamp(stops, tierOf(FIVE, id)))).toEqual(stops);
    expect(THREE.map((id) => tierRamp(stops, tierOf(THREE, id)))).toEqual([0.3, 0.6, 1]);
    expect(tierRamp([0.2, 1], tierOf(THREE, "mid"))).toBeCloseTo(0.6);
  });
});
