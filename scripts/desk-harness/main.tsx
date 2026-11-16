// The harness page: the desk's view over the fake desk (or, with `?real=1`, over the reference game's own sound), or
// a button that opens the real window over it.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SoundDeskView, type SoundDeskViewProps } from "../../src/devtools/desk/SoundDeskView";
import { type DeskSwitch, openSoundDesk } from "../../src/devtools/SoundDesk";
import type { MixFile } from "../../src/sound/desk";
import { fakeDesk, fakeSampleHost, runScript } from "../../test/devtools/fixtures/desk";

const query = new URLSearchParams(location.search);
const fail = query.get("fail");

const onSave = async (file: MixFile) => {
  await new Promise((done) => setTimeout(done, 300));
  if (fail === "save") throw new Error("the dev server did not answer");
  console.info("saved", file);
};

/** The fake desk, played by its script, with a fake sample host and two switches. */
function fake(): SoundDeskViewProps {
  const desk = fakeDesk({ heard: 16 });
  const host =
    query.get("host") === "0"
      ? undefined
      : fakeSampleHost({
          delay: 500,
          ...(fail === "commit" ? { fail: { commit: "the pack folder is read-only" } } : {}),
        });
  runScript(desk);
  const scene: DeskSwitch = {
    id: "scene",
    label: "Scene",
    options: () => [
      { value: "tier1", label: "Tier 1" },
      { value: "tier2", label: "Tier 2" },
    ],
    value: () => desk.scenes().current ?? "",
    set: (name) => desk.setScenes(name, desk.scenes().pushed),
  };
  const dialog: DeskSwitch = {
    id: "dialog",
    label: "Dialog",
    options: () => [
      { value: "off", label: "Closed" },
      { value: "on", label: "Open" },
    ],
    value: () => (desk.scenes().pushed.includes("dialog") ? "on" : "off"),
    set: (v) => desk.setScenes(desk.scenes().current, v === "on" ? ["dialog"] : []),
  };
  // One recording already staged, so the staged state is there to look at.
  if (host)
    void host
      .process({ pack: "kit", sample: "chime-b", kind: "shot" })
      .then((r) => desk.stage("kit/chime-b", r.audio, r.entry, r.token));
  return { desk, onSave, samples: host, switches: [scene, dialog] };
}

/**
 * The reference game's sound, for the real desk behind the window: its hum plays once a click has unlocked the
 * sound, a key plays a cue (p, r, k, o), and the switch moves its mood.
 */
async function real(): Promise<SoundDeskViewProps> {
  const game = await import("../../examples/orbital-orchard/src/app/sound");
  let mood: string = "dusk";
  game.setMood("dusk", 0);
  game.sound.armUnlock();
  const keys: Record<string, () => void> = {
    p: () => game.playPlant(),
    r: () => game.playRaise(),
    k: () => game.playKit(),
    o: () => game.playOrbit(),
  };
  addEventListener("keydown", (e: KeyboardEvent) => {
    if (!(e.target instanceof HTMLInputElement)) keys[e.key]?.();
  });
  const switches: DeskSwitch[] = [
    {
      id: "mood",
      label: "Mood",
      options: () => [
        { value: "dusk", label: "Dusk" },
        { value: "bloom", label: "Bloom" },
      ],
      value: () => mood,
      set: (to) => {
        mood = to;
        game.setMood(to as "dusk" | "bloom");
      },
    },
  ];
  return { desk: game.sound.desk, onSave, switches };
}

const options = { ...(await (query.get("real") === "1" ? real() : fake())), storageKey: "harness.soundDesk" };
const root = createRoot(document.getElementById("root") as HTMLElement);
if (query.get("popup") === "1")
  root.render(
    <button type="button" style={{ margin: 24 }} onClick={() => openSoundDesk(options)}>
      Open the mix desk
    </button>,
  );
else
  root.render(
    <StrictMode>
      <SoundDeskView {...options} ownsDocument />
    </StrictMode>,
  );
