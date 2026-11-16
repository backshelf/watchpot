/**
 * Every setting of every effect kind as the mix desk draws it: its range, where the effect starts when the mix says
 * nothing, its unit and how a control travels. Written from each effect's header in `dsp/src/fx/*.rs` and
 * `dsp/src/freeze.rs`; `test/sound/desk-fx.test.ts` holds it to `FX_PARAMS`.
 */
import type { DeskParam } from "./desk";
import type { FxDef } from "./types";

const OFF_ON = ["off", "on"] as const;

const hz = (param: string, min: number, max: number, initial: number): DeskParam => ({
  param,
  min,
  max,
  initial,
  unit: "Hz",
  scale: "log",
});
const db = (param: string, min: number, max: number, initial: number): DeskParam => ({
  param,
  min,
  max,
  initial,
  unit: "dB",
  scale: "lin",
});
const sec = (
  param: string,
  min: number,
  max: number,
  initial: number,
  scale: "lin" | "log" = "log",
): DeskParam => ({
  param,
  min,
  max,
  initial,
  unit: "s",
  scale,
});
const unit = (param: string, initial: number, min = 0, max = 1): DeskParam => ({
  param,
  min,
  max,
  initial,
  unit: "",
  scale: "lin",
});
const choice = (param: string, choices: readonly string[], initial = 0): DeskParam => ({
  param,
  min: 0,
  max: choices.length - 1,
  initial,
  unit: "",
  scale: "choice",
  choices,
});

/** The freeze's stutter takes a division of the bar (8, 16, 32; any whole number to 64): the value is the division. */
const DIVISIONS = ["off", ...Array.from({ length: 32 }, (_, i) => String(i + 1))];

/** Each `FxDef` kind's settings, in the order the core numbers them. */
export const DESK_FX: Readonly<Record<FxDef["kind"], readonly DeskParam[]>> = {
  filter: [
    hz("cutoff", 20, 20000, 20000),
    { param: "q", min: 0.1, max: 40, initial: Math.SQRT1_2, unit: "", scale: "log" },
    choice("mode", ["low", "high", "band", "notch"]),
    choice("slope", ["12 dB", "24 dB"]),
  ],
  eq: [
    hz("lowFreq", 20, 20000, 100),
    db("lowGain", -24, 24, 0),
    hz("mid1Freq", 20, 20000, 500),
    db("mid1Gain", -24, 24, 0),
    { param: "mid1Q", min: 0.1, max: 18, initial: 1, unit: "", scale: "log" },
    hz("mid2Freq", 20, 20000, 2500),
    db("mid2Gain", -24, 24, 0),
    { param: "mid2Q", min: 0.1, max: 18, initial: 1, unit: "", scale: "log" },
    hz("highFreq", 20, 20000, 8000),
    db("highGain", -24, 24, 0),
  ],
  compressor: [
    db("threshold", -80, 0, -24),
    { param: "ratio", min: 1, max: 50, initial: 4, unit: "ratio", scale: "log" },
    sec("attack", 0.0001, 1, 0.01),
    sec("release", 0.001, 5, 0.15),
    db("knee", 0, 24, 6),
    db("makeup", -24, 24, 0),
    db("range", 0, 80, 24),
    unit("mix", 1),
  ],
  saturator: [db("drive", 0, 36, 6), db("tilt", -12, 12, 0), unit("mix", 1)],
  delay: [
    sec("time", 0.001, 4, 0.25),
    { param: "beats", min: 0, max: 16, initial: 0, unit: "beats", scale: "lin" },
    { param: "tempo", min: 0, max: 400, initial: 0, unit: "bpm", scale: "lin" },
    unit("feedback", 0.35, 0, 0.95),
    hz("filter", 200, 20000, 6000),
    choice("pingpong", OFF_ON),
    choice("glide", OFF_ON),
    unit("mix", 0.25),
  ],
  tape: [
    unit("wow", 0.15),
    hz("wowRate", 0.3, 2, 0.8),
    unit("flutter", 0.1),
    hz("flutterRate", 6, 12, 9),
    unit("speed", 1, 0, 2),
    unit("hiss", 0.05),
  ],
  crush: [
    hz("rate", 50, 48000, 11025),
    { param: "bits", min: 1, max: 24, initial: 8, unit: "bits", scale: "lin" },
    unit("mix", 1),
  ],
  reverb: [
    unit("size", 0.5),
    sec("decay", 0.1, 30, 2),
    unit("damping", 0.5),
    sec("predelay", 0, 0.5, 0.02, "lin"),
    unit("width", 1),
    unit("mod", 0.3),
    unit("early", 0.5),
    unit("mix", 1),
  ],
  convolver: [unit("mix", 1), db("gain", -60, 24, 0)],
  freeze: [unit("amount", 0), choice("stutter", DIVISIONS)],
  stereo: [unit("width", 1, 0, 2), unit("pan", 0, -1, 1)],
};

/** A setting's entry, or undefined for one the kind does not have. */
export const deskParam = (kind: FxDef["kind"], param: string): DeskParam | undefined =>
  DESK_FX[kind].find((p) => p.param === param);
