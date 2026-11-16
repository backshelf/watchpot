// 0.7.0 and 0.8.0 are additive: a call site written against 0.6.1 still compiles. These are the shapes games
// wrote; the typecheck is the test, the assertions only keep the file honest.
import { expect, test } from "bun:test";
import {
  type ClipLayer,
  createSound,
  type Layer,
  type Sound,
  type SoundCue,
  type SoundOptions,
} from "watchpot/sound";

type Key = "tap" | "chime";

test("a cue table typed as 0.6.1's SoundCue is still a cue table", () => {
  const layers: Layer[] = [{ voice: { frequency: 440 } }];
  const clips: ClipLayer<string>[] = [{ file: "chime", level: 0.1, playbackRate: 2 }];
  const table: Record<string, SoundCue<string>> = {
    tap: { voices: layers },
    chime: { voices: layers, clips },
  };
  const options: SoundOptions<Key, string> = {
    cues: table as Record<Key, SoundCue<string>>,
    samples: { chime: "chime.ogg" },
    volume: 0.3,
  };
  const sound: Sound<Key> = createSound<Key, string>(options);
  expect(sound.isMuted()).toBe(false);
  expect(sound.soundInfo("tap").source).toBe("zzfx");
});

test("a table with no clips and a `never` file type is still a cue table", () => {
  const sound = createSound<Key, never>({
    cues: { tap: { voices: [] }, chime: { voices: [] } },
    samples: {},
    volume: 0.3,
  });
  // 0.6.1's play returned nothing; a call that ignores the result still reads.
  sound.play("tap");
  expect(sound.audioUnlocked()).toBe(false);
});

test("the five default buses are always nameable, and a declared bus joins them", () => {
  // A cue table that names one bus does not narrow the sound's buses to it.
  const plain = createSound({ cues: { tap: { voices: [], bus: "ui" } } });
  plain.mixer.bus("music").level(-3);
  plain.mixer.bus("master").level(0);
  // @ts-expect-error a bus nobody declared
  plain.mixer.bus("room");

  const roomy = createSound({
    cues: { tap: { voices: [], bus: "room", sends: { room: 0.3 } }, chime: { voices: [], bus: "sfx" } },
    buses: { room: { fx: [{ kind: "reverb", size: 0.4 }], out: "ambience" }, sfx: { sends: { room: 0.2 } } },
    scenes: { quiet: { buses: { room: { level: -12 }, master: { level: -3 } } } },
    routes: [{ from: "heat", to: { bus: "room", fx: 0, param: "size" }, range: [0.2, 0.9] }],
  });
  roomy.mixer.bus("room").fx(0).set("size", 0.8, 200);
  roomy.mixer.bus("music").send("room", 0.5);
  // @ts-expect-error a bus nobody declared
  roomy.mixer.bus("cellar");
  expect(roomy.mode()).toBe("locked");
});
