// Page 5's panel: one score, three tiers. A tier is a section of the score (the stems it brings in) and a scene of
// the mix (the room it opens into): the same loops, told differently as the game climbs.
import { useEffect, useRef, useState } from "react";
import type * as Example from "../../../../../docs/examples/sound-tiers";
import { PanelChoice, useExample } from "../../kit";
import { Line, type Live, Shown, ShownRow, said } from "./live";
import { bass, drums, pad, wavUrl } from "./wav";

type Tiers = typeof Example;
type Rig = Example.TierRig;
type Tier = Example.Tier;

const OPTIONS: readonly { value: Tier; label: string }[] = [
  { value: "quiet", label: "quiet" },
  { value: "busy", label: "busy" },
  { value: "peak", label: "peak" },
];

/** One bar of the pack's tempo: four beats at 100 a minute. */
const BAR = 2.4;

export function Tiers() {
  const { makeSound, SECTIONS, TIERS } = useExample<Tiers>();
  const rig = useRef<Rig | null>(null);
  const [live, setLive] = useState<Live>("asleep");
  const [tier, setTier] = useState<Tier>(TIERS[0]);

  /** The score starts on a press: three loops written in the page, the sound over them, then the first section. */
  const startScore = async (): Promise<Rig> => {
    const had = rig.current;
    if (had) return had;
    const urls = { pad: wavUrl(pad(BAR)), bass: wavUrl(bass(BAR)), drums: wavUrl(drums(BAR)) };
    const next = makeSound(urls, BAR);
    rig.current = next;
    setLive("booting");
    await next.sound.unlock();
    setLive(next.sound.mode() === "core" ? "core" : "fallback");
    next.sound.mixer.scene(tier);
    next.music.section(tier);
    return next;
  };

  /** A tier lands on the next bar line: the stems fade in and the room opens with them. */
  const choose = async (what: Tier) => {
    setTier(what);
    const now = rig.current;
    if (!now) return;
    now.sound.mixer.scene(what, { fadeMs: 600 });
    now.music.section(what);
    now.music.stinger("bell");
  };

  useEffect(
    () => () => {
      rig.current?.sound.setMuted(true);
    },
    [],
  );

  const stems = Object.keys(SECTIONS[tier].stems).join(", ");
  return (
    <>
      <div className="actions">
        <button
          type="button"
          className="button"
          onClick={() => {
            void startScore().then((now) => now.music.stinger("bell"));
          }}
        >
          {live === "asleep" ? "Start the score" : "Back to the top"}
        </button>
      </div>
      <PanelChoice title="The tier" options={OPTIONS} value={tier} onChange={(what) => void choose(what)} />
      <ShownRow>
        <Shown label="The engine" value={said(live)} />
        <Shown label="This tier hears" value={stems} />
      </ShownRow>
      <Line>
        <code>music.section("{tier}")</code> changes what plays on the next bar line;{" "}
        <code>mixer.scene("{tier}")</code> fades the room to the same tier over 600 ms.
      </Line>
    </>
  );
}
