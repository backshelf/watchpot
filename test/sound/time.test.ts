// Time on the committed WebAssembly build: the sequencer's STEP events and the transport's BEATs land where the
// native tests prove they do, at the rates a browser runs.
import { describe, expect, test } from "bun:test";
import {
  type CommandFields,
  GRID,
  type SoundEvent,
  STEP_SOURCE,
  TRANSPORT_RUN,
} from "../../src/sound/protocol";
import { loadCore, sinePcm } from "./harness";

const steps = (
  velocity: readonly number[],
): Pick<CommandFields<"SEQ_STEPS">, "count" | "velocity" | "rate"> => ({
  count: velocity.length,
  velocity: [...velocity, ...new Array(64 - velocity.length).fill(0)],
  rate: new Array(64).fill(0),
});

type Of<O extends SoundEvent["op"]> = Extract<SoundEvent, { op: O }>;
const only = <O extends SoundEvent["op"]>(events: SoundEvent[], op: O) =>
  events.filter((e): e is Of<O> => e.op === op);

function sequenced(sampleRate: number, seconds: number) {
  const core = loadCore({ sampleRate, voices: 16 });
  core.loadSample(1, sinePcm(880, 0.02, sampleRate));
  core.command("TRANSPORT_SET", { bpm: 120, beatsPerBar: 4, swing: -1, running: TRANSPORT_RUN.start });
  core.command("SEQ_DEFINE", {
    track: 2,
    sample: 1,
    bus: 0,
    gain: 0.5,
    pan: 0,
    sendBus1: 0,
    send1: 0,
    sendBus2: 0,
    send2: 0,
    grid: GRID.n16,
  });
  core.command("SEQ_STEPS", { track: 2, now: 1, ...steps([1, 0, 0.5, 0, 1, 0, 0.5, 0.25]) });
  core.render(Math.round(seconds * sampleRate));
  return core.events();
}

describe("time in Bun", () => {
  test("STEP events carry increasing indices, a 16th apart at 48 kHz", () => {
    const events = only(sequenced(48000, 2), "STEP");
    expect(events).toHaveLength(16);
    events.forEach((e, i) => {
      expect(e.source).toBe(STEP_SOURCE.seq);
      expect(e.track).toBe(2);
      expect(e.index).toBe(i % 8);
      expect(e.frame).toBe(6000 * i);
    });
  });

  test("at 44.1 kHz a 16th alternates 5,512 and 5,513 frames and a bar is exact", () => {
    const events = only(sequenced(44100, 2), "STEP");
    expect(events).toHaveLength(16);
    const gaps = events.slice(1).map((e, i) => e.frame - (events[i]?.frame ?? 0));
    for (const gap of gaps) expect([5512, 5513]).toContain(gap);
    expect((events[8]?.frame ?? 0) - (events[0]?.frame ?? 0)).toBe(44100);
  });

  test("BEATs come every half second at 120 bpm and count the bar", () => {
    const beats = only(sequenced(96000, 2.1), "BEAT");
    expect(beats.map((b) => [b.frame, b.bar, b.beat])).toEqual([
      [0, 0, 0],
      [48000, 0, 1],
      [96000, 0, 2],
      [144000, 0, 3],
      [192000, 1, 0],
    ]);
  });
});
