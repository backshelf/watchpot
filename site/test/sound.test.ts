// The sound sheet's audition row stays true to the engine: the names `score.ts` copies are still the engine's
// `PRESET_VOICE_NAMES`, in order, so the page's list cannot drift from `src/sound/presets.ts`.
import { describe, expect, test } from "bun:test";
import { PRESET_VOICE_NAMES } from "../../src/sound/presets";
import { PRESET_NAMES } from "../src/sections/sound/score";

describe("the sound sheet's preset names", () => {
  test("PRESET_NAMES is the engine's PRESET_VOICE_NAMES, in the same order", () => {
    expect([...PRESET_NAMES]).toEqual([...PRESET_VOICE_NAMES]);
  });
});
