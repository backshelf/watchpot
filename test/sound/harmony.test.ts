import { describe, expect, spyOn, test } from "bun:test";
import { createHarmony, parseKey, SCALES } from "../../src/sound/music/harmony";
import { createTransport } from "../../src/sound/music/transport";
import type { Scale } from "../../src/sound/types";
import { fakePort } from "./fake-port";

const cents = (ratio: number) => 1200 * Math.log2(ratio);
const C4 = 440 * 2 ** (-9 / 12);

function clock() {
  const fake = fakePort();
  fake.bringUp();
  const transport = createTransport(fake.port);
  const harmony = createHarmony(transport, fake.port);
  return { fake, transport, harmony };
}

describe("harmony", () => {
  test("in C major, degree 4 of a C root is a fifth up", () => {
    const { harmony } = clock();
    // An equal-tempered fifth, as the stems it plays against are tuned: 700 cents, 1.955 under a just 3/2.
    const ratio = harmony.api.rateFor(C4, 4);
    expect(Math.abs(cents(ratio) - 700)).toBeLessThan(0.01);
    expect(Math.abs(cents(ratio) - cents(3 / 2))).toBeLessThan(2);
  });

  test("in A minor, a 440 Hz root at degree 2 lands on C", () => {
    const { harmony } = clock();
    harmony.api.set({ key: "Am" });
    expect(harmony.api.current()).toMatchObject({ key: "Am", scale: "minor" });
    const hz = 440 * harmony.api.rateFor(440, 2);
    // A C: a whole number of semitones from A440, 3 above it modulo the octave.
    const semis = 12 * Math.log2(hz / 440);
    expect(Math.abs(semis - Math.round(semis))).toBeLessThan(0.01);
    expect(((Math.round(semis) % 12) + 12) % 12).toBe(3);
  });

  test("octave choice never moves a take more than seven semitones for the degrees of one octave", () => {
    const { harmony } = clock();
    for (const key of ["C", "F#", "Bb", "Em", "G"]) {
      for (const scale of Object.keys(SCALES) as Scale[]) {
        harmony.api.set({ key, scale });
        for (let semis = 0; semis < 12; semis++) {
          const root = 440 * 2 ** (semis / 12);
          for (let degree = 0; degree < SCALES[scale].length; degree++) {
            expect(Math.abs(cents(harmony.api.rateFor(root, degree)))).toBeLessThanOrEqual(700 + 1e-6);
          }
        }
      }
    }
  });

  test("a ladder climbs from the take's nearest tonic: every step is higher than the last, in every key", () => {
    const { harmony } = clock();
    for (const key of ["C", "F#", "Bb", "Em", "G"]) {
      for (const scale of Object.keys(SCALES) as Scale[]) {
        harmony.api.set({ key, scale });
        for (let semis = 0; semis < 12; semis++) {
          const root = 440 * 2 ** (semis / 12);
          let last = Number.NEGATIVE_INFINITY;
          for (let step = 0; step <= 9; step++) {
            const at = cents(harmony.pitch(root, step, false, true));
            expect(at).toBeGreaterThan(last);
            last = at;
          }
          // Step 0 is the tonic nearest the recording, and each step is its scale height above that.
          const base = cents(harmony.pitch(root, 0, false, true));
          expect(Math.abs(base)).toBeLessThanOrEqual(700 + 1e-6);
          const up = cents(harmony.pitch(root, SCALES[scale].length, false, true)) - base;
          expect(Math.abs(up - 1200)).toBeLessThan(0.01);
        }
      }
    }
  });

  test("degrees past the scale climb octaves, and below it fall", () => {
    const { harmony } = clock();
    harmony.api.set({ key: "D", scale: "pentatonic" });
    const root = 440 * 2 ** (-7 / 12); // D
    expect(harmony.api.rateFor(root, 5)).toBeCloseTo(2 * harmony.api.rateFor(root, 0), 6);
    expect(harmony.api.rateFor(root, 7)).toBeCloseTo(2 * harmony.api.rateFor(root, 2), 6);
    expect(harmony.api.rateFor(root, -5)).toBeCloseTo(harmony.api.rateFor(root, 0) / 2, 6);
  });

  test("a sound with no root moves relative to itself: degree 0 is 1", () => {
    const { harmony } = clock();
    harmony.api.set({ key: "E", scale: "minor" });
    expect(harmony.pitch(undefined, 0)).toBe(1);
    expect(harmony.pitch(undefined, 2)).toBeCloseTo(2 ** (3 / 12), 9);
    expect(harmony.pitch(undefined, 7)).toBeCloseTo(2, 9);
    expect(harmony.pitch(undefined, undefined)).toBe(1);
  });

  test("with a chord set, a play with no degree snaps to the nearest chord tone", () => {
    const { harmony } = clock();
    harmony.api.set({ key: "C", chord: [0, 2, 4] }); // C E G
    const toneOf = (root: number) => {
      const semis = Math.round(12 * Math.log2((root * harmony.pitch(root, undefined)) / C4));
      return ((semis % 12) + 12) % 12;
    };
    expect(toneOf(C4 * 2 ** (1 / 12))).toBe(0); // C# to C
    expect(toneOf(C4 * 2 ** (3 / 12))).toBe(4); // D# to E
    expect(toneOf(C4 * 2 ** (6 / 12))).toBe(7); // F# to G
    expect(toneOf(C4 * 2 ** (10 / 12))).toBe(0); // A# to C
    // A root already on a chord tone stays.
    expect(harmony.pitch(C4 * 2 ** (4 / 12), undefined)).toBeCloseTo(1, 9);
    // No chord: the nearest tone of the scale.
    harmony.api.set({ key: "C" });
    expect(toneOf(C4 * 2 ** (6.2 / 12))).toBe(7);
  });

  test("set with a grid line lands on it, and a pending set is read on request", () => {
    const { fake, transport, harmony } = clock();
    transport.api.start();
    fake.advance(0.5); // beat 1 of the bar
    const changes: number[] = [];
    harmony.onChange(() => changes.push(1));
    harmony.api.set({ key: "D", scale: "dorian" }, "bar");
    expect(changes).toHaveLength(1);
    expect(harmony.api.current().key).toBe("C");
    expect(harmony.pitch(undefined, 2)).toBeCloseTo(2 ** (4 / 12), 9);
    expect(harmony.pitch(undefined, 2, true)).toBeCloseTo(2 ** (3 / 12), 9);
    fake.advance(1.5); // the bar line
    expect(harmony.api.current()).toEqual({ key: "D", scale: "dorian", chord: [] });
  });

  test("keys parse with sharps, flats and minor; a name that is not a key is ignored with one warning", () => {
    expect(parseKey("F#m")).toEqual({ tonic: 6, minor: true });
    expect(parseKey("Bb")).toEqual({ tonic: 10, minor: false });
    expect(parseKey("H")).toBeNull();
    const { harmony } = clock();
    const warn = spyOn(console, "warn").mockImplementation(() => undefined);
    harmony.api.set({ key: "H" });
    harmony.api.set({ key: "H" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(harmony.api.current().key).toBe("C");
    warn.mockRestore();
  });
});
