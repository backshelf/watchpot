// Page 3's panel: a recording from a pack, and the voice behind it. The recording is a file this page writes in the
// browser, handed to the engine as a pack's sample; the switch frees the pack, and the same press plays the voice.
import { useEffect, useRef, useState } from "react";
import type * as Example from "../../../../../docs/examples/sound-take";
import { PanelChoice, useExample } from "../../kit";
import { Line, type Live, Shown, ShownRow, said } from "./live";
import { shot, wavUrl } from "./wav";

type Take = typeof Example;
type Rig = Example.ShotRig;
type Pick = "take" | "voice";

const TAKES: readonly { value: Pick; label: string }[] = [
  { value: "take", label: "the recording" },
  { value: "voice", label: "the voice only" },
];

export function Take() {
  const { makeSound } = useExample<Take>();
  const sound = useRef<Rig | null>(null);
  const [live, setLive] = useState<Live>("asleep");
  const [pick, setPick] = useState<Pick>("take");
  const [source, setSource] = useState<"sample" | "zzfx" | null>(null);

  /** The first press makes the file, the sound over its pack, and the core; later presses are a play. */
  const boot = async (wanted: Pick): Promise<Rig> => {
    const had = sound.current;
    if (had) return had;
    const next = makeSound(wavUrl(shot()));
    sound.current = next;
    setLive("booting");
    await next.unlock();
    setLive(next.mode() === "core" ? "core" : "fallback");
    if (wanted === "take") await next.loadPack("demo");
    setSource(next.soundInfo("shot").source);
    return next;
  };

  const play = async () => {
    const rig = await boot(pick);
    rig.play("shot", { mine: true });
  };

  /** The pack comes and goes: while it is gone the cue falls back to its voice, and the take is back when it returns. */
  const choose = async (what: Pick) => {
    setPick(what);
    const rig = sound.current;
    if (!rig) return;
    if (what === "take") await rig.loadPack("demo");
    else rig.unloadPack("demo");
    setSource(rig.soundInfo("shot").source);
  };

  useEffect(
    () => () => {
      sound.current?.setMuted(true);
    },
    [],
  );

  const playing = source === "sample" ? "the recording" : source === "zzfx" ? "the voice" : "–";
  return (
    <>
      <div className="actions">
        <button type="button" className="button" onClick={() => void play()}>
          Play the shot
        </button>
      </div>
      <PanelChoice
        title="What is in the pack"
        options={TAKES}
        value={pick}
        onChange={(what) => void choose(what)}
      />
      <ShownRow>
        <Shown label="The engine" value={said(live)} />
        <Shown label="A press plays" value={playing} />
      </ShownRow>
      <Line>
        {live === "fallback"
          ? "The fallback has no takes: this browser could not run the core, so both settings play the voice."
          : source === "sample"
            ? "The pack is loaded: a press plays the recording, decoded from the file this page wrote."
            : "The pack is not loaded: a press plays the cue's zzfx voice instead."}
      </Line>
    </>
  );
}
