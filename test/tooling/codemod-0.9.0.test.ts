// The 0.9.0 codemod over 0.6.1's shapes: what it moves to `watchpot/sound`, what it lists for a hand, and what it
// leaves alone.
import { describe, expect, test } from "bun:test";
import { GONE, MOVED, planFile } from "../../codemods/0.9.0-sound";

describe("the 0.9.0 sound codemod", () => {
  test("moves a sound import to watchpot/sound and splits a mixed one", () => {
    const src = `import { Button, createSound, type SoundCue } from "watchpot/kit";
import { toParams } from "watchpot/kit";
export { soundSeconds } from "watchpot/kit";
`;
    const { after, human } = planFile("src/app/sound.ts", src);
    expect(after).toContain(`from "watchpot/sound"`);
    // The kit keeps what is still its own, and no sound name is left on it.
    const kit = after.split("\n").filter((line) => line.includes(`"watchpot/kit"`));
    expect(kit).toHaveLength(1);
    expect(kit[0]).toContain("Button");
    for (const name of ["createSound", "SoundCue", "toParams", "soundSeconds"]) {
      expect(kit[0]).not.toContain(name);
      expect(after).toContain(name);
    }
    expect(human).toHaveLength(0);
  });

  test("lists what is gone by its line, with what to write instead", () => {
    const src = `import { createStems, mixLayers } from "watchpot/kit";
const stems = createStems({ context: sound.context });
const pcm = sound.soundSamples("tap");
`;
    const { human } = planFile("src/app/music.ts", src);
    const lines = human.map((item) => item.line);
    expect(lines).toContain(1);
    expect(lines).toContain(2);
    expect(lines).toContain(3);
    expect(human.every((item) => item.why.length > 0)).toBe(true);
    expect(human.some((item) => item.why.includes("sound.music"))).toBe(true);
  });

  test("leaves a file with no sound in it, a comment and a string alone", () => {
    const src = `import { Button } from "watchpot/kit";
// createStems( used to live here
const note = "soundSamples(key) is gone";
`;
    const { after, edits, human } = planFile("src/app/App.tsx", src);
    expect(after).toBe(src);
    expect(edits).toHaveLength(0);
    expect(human).toHaveLength(0);
  });

  test("its tables do not overlap: a name either moves or is gone", () => {
    for (const name of Object.keys(GONE)) expect(MOVED.has(name)).toBe(false);
    expect(MOVED.has("createSound")).toBe(true);
    expect(Object.keys(GONE)).toContain("createStems");
  });
});
