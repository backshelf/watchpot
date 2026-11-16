import { describe, expect, jest, spyOn, test } from "bun:test";
import { createBabble, syllables } from "../../src/sound/babble";
import { capture, encodeWav } from "../../src/sound/capture";
import type { SoundHost } from "../../src/sound/port";
import { STEP_SOURCE } from "../../src/sound/protocol";
import { createTap } from "../../src/sound/tap";
import { fakePort } from "./fake-port";

/** A host over a fake port: buses by a fixed table, and a place that is always to the right. */
function fakeHost(fake = fakePort()) {
  const buses: Record<string, number> = { voice: 5, sfx: 1 };
  const host = {
    port: fake.port,
    bus: (name: string | undefined) => buses[name ?? "sfx"] ?? 1,
    held: (key: string) => (key === "kit/drone" ? { id: 9, frames: 4800, rate: 48000, scale: 1 } : null),
    place: () => ({ pan: 0.5, distance: 0, occlusion: 0 }),
  } as unknown as SoundHost;
  return { fake, host };
}

describe("syllables", () => {
  const LINE = "Hello there, quiet listener. Are you ready for the drop?";

  test("the same text gives the same events", () => {
    expect(syllables(LINE)).toEqual(syllables(LINE));
    expect(syllables(LINE).length).toBeGreaterThan(10);
    expect(syllables(LINE)).not.toEqual(syllables(`${LINE} `.replace("drop", "beat")));
  });

  test("a line ending in ? ends higher than it starts; one ending in . ends lower", () => {
    for (const q of ["Are you ready?", "is the kick too loud?", "Where is the bass?"]) {
      const s = syllables(q);
      expect((s.at(-1) as { pitch: number }).pitch).toBeGreaterThan((s[0] as { pitch: number }).pitch);
    }
    const s = syllables("the pad fades out slowly.");
    expect((s.at(-1) as { pitch: number }).pitch).toBeLessThan((s[0] as { pitch: number }).pitch);
  });

  test("every character index maps into the text, in order, and starts a word's letters", () => {
    for (const text of [LINE, "  x  ", "Rhythm... 808s, don't stop!", "café über naïve", "hmm"]) {
      const s = syllables(text);
      expect(s.length).toBeGreaterThan(0);
      let last = -1;
      for (const one of s) {
        expect(one.index).toBeGreaterThanOrEqual(0);
        expect(one.index).toBeLessThan(text.length);
        expect(one.index).toBeGreaterThan(last);
        expect(text[one.index]).toMatch(/[\p{L}\p{N}]/u);
        last = one.index;
      }
    }
    expect(syllables("")).toEqual([]);
    expect(syllables(" ,.!? ")).toEqual([]);
  });

  test("syllables split on vowels, run forward in time, and pause longer at punctuation", () => {
    expect(syllables("banana").map((s) => s.index)).toEqual([0, 2, 4]);
    expect(syllables("sister").map((s) => s.index)).toEqual([0, 3]);
    const s = syllables("one two, three. four");
    for (let i = 1; i < s.length; i++) {
      const prev = s[i - 1] as { start: number; length: number };
      expect((s[i] as { start: number }).start).toBeGreaterThan(prev.start + prev.length);
    }
    const gap = (i: number) => {
      const a = s[i] as { start: number; length: number };
      return (s[i + 1] as { start: number }).start - (a.start + a.length);
    };
    // one|two (word), two|three (comma), three|four (full stop).
    expect(gap(1)).toBeGreaterThan(gap(0));
    expect(gap(2)).toBeGreaterThan(gap(1));
  });

  test("rate and pitch scale the line; consonants open with noise and vowels without", () => {
    const slow = syllables("ready steady", { rate: 4 });
    const fast = syllables("ready steady", { rate: 12 });
    expect((slow.at(-1) as { start: number }).start).toBeGreaterThan(
      (fast.at(-1) as { start: number }).start * 2,
    );
    const high = syllables("ready", { pitch: 2 });
    expect((high[0] as { pitch: number }).pitch).toBeCloseTo(
      (syllables("ready")[0] as { pitch: number }).pitch * 2,
      5,
    );
    expect((syllables("oh")[0] as { noise: number }).noise).toBe(0);
    expect((syllables("so")[0] as { noise: number }).noise).toBeGreaterThan(
      (syllables("no")[0] as { noise: number }).noise,
    );
    for (const one of syllables(LINE)) {
      expect(one.formant1).toBeGreaterThan(200);
      expect(one.formant2).toBeGreaterThan(one.formant1);
      expect(one.level).toBeGreaterThan(0);
      expect(one.level).toBeLessThanOrEqual(1);
    }
  });
});

describe("createBabble", () => {
  test("say posts the voice and one stamped syllable each, on its bus, panned at `at`", () => {
    const { fake, host } = fakeHost();
    fake.bringUp();
    fake.advance(1);
    const babble = createBabble({ carrier: "kit/drone", level: -6 }, host);
    const line = babble.say("one two three", { at: { x: 0, y: 0 } });
    const [define] = fake.of("BABBLE_DEFINE");
    expect(define).toMatchObject({ sample: 9, bus: 5, pan: 0.5 });
    expect(define?.gain).toBeCloseTo(0.501, 2);
    const says = fake.of("BABBLE_SAY");
    expect(says.map((s) => s.index)).toEqual([0, 1, 2]);
    // A line said 6 dB down has every syllable at half the level the same line has plainly.
    fake.clear();
    babble.say("one two three", { db: -6.0206 });
    const soft = fake.of("BABBLE_SAY");
    expect(soft.map((s) => s.level / (says[soft.indexOf(s)]?.level ?? 1))).toEqual(
      [0.5, 0.5, 0.5].map((v) => expect.closeTo(v, 3)),
    );
    expect(says.every((s) => s.babble === define?.babble && s.line === says[0]?.line)).toBe(true);
    // Stamped ahead of now, in order, spaced by their starts.
    expect(says[0]?.atFrame).toBeGreaterThan(48000);
    expect((says[1]?.atFrame ?? 0) - (says[0]?.atFrame ?? 0)).toBeGreaterThan(0);
    expect(line.seconds).toBeGreaterThan(0.2);
  });

  test("STEP events become onChar calls with each syllable's first character, its own voice and line only", () => {
    const { fake, host } = fakeHost();
    fake.bringUp();
    const babble = createBabble({}, host);
    const other = createBabble({}, host);
    const heard: number[] = [];
    const text = "hello there";
    babble.say(text, { onChar: (i) => heard.push(i) });
    other.say("no");
    const say = fake.of("BABBLE_SAY")[0];
    const voice = say?.babble ?? 0;
    const at = say?.atFrame ?? 0;
    fake.emit({ op: "STEP", frame: at, source: STEP_SOURCE.babble, track: voice, index: 0 });
    fake.emit({ op: "STEP", frame: at, source: STEP_SOURCE.seq, track: voice, index: 1 });
    fake.emit({ op: "STEP", frame: at, source: STEP_SOURCE.babble, track: voice + 1, index: 1 });
    fake.emit({ op: "STEP", frame: at + 9000, source: STEP_SOURCE.babble, track: voice, index: 2 });
    expect(heard).toEqual([0, text.indexOf("the")]);
    // A STEP from before the line started (the line before, still in flight) is not this line's.
    fake.emit({ op: "STEP", frame: at - 5000, source: STEP_SOURCE.babble, track: voice, index: 1 });
    expect(heard).toHaveLength(2);
  });

  test("a new line stops the one before; stop() ends it and silences onChar", () => {
    const { fake, host } = fakeHost();
    fake.bringUp();
    const babble = createBabble({}, host);
    const heard: number[] = [];
    babble.say("first line here");
    const second = babble.say("second", { onChar: (i) => heard.push(i) });
    const stops = fake.of("BABBLE_STOP");
    expect(stops).toHaveLength(1);
    const lines = new Set(fake.of("BABBLE_SAY").map((s) => s.line));
    expect(lines.size).toBe(2);
    expect(stops[0]?.line).toBe(Math.min(...lines));
    second.stop();
    expect(fake.of("BABBLE_STOP").at(-1)?.line).toBe(Math.max(...lines));
    const say = fake.of("BABBLE_SAY").at(-1);
    fake.emit({
      op: "STEP",
      frame: say?.atFrame ?? 0,
      source: STEP_SOURCE.babble,
      track: say?.babble ?? 0,
      index: 0,
    });
    expect(heard).toEqual([]);
  });

  test("a fifth voice warns and speaks nothing; a voice before the core is up still times onChar", () => {
    const { fake, host } = fakeHost();
    const warn = spyOn(console, "warn").mockImplementation(() => undefined);
    for (let i = 0; i < 4; i++) createBabble({}, host);
    expect(warn).not.toHaveBeenCalled();
    const fifth = createBabble({}, host);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    jest.useFakeTimers();
    try {
      const heard: number[] = [];
      const { seconds } = fifth.say("one two", { onChar: (i) => heard.push(i) });
      jest.advanceTimersByTime(seconds * 1000 + 100);
      expect(heard).toEqual([0, 4]);
      expect(fake.sent()).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("the tap", () => {
  const meters = (rms: number, bands: [number, number, number]) => ({
    op: "METERS" as const,
    frame: 0,
    loudness: -14,
    peak: Array(16).fill(0),
    rms: [rms, ...Array(15).fill(0)],
    bands,
    reduction: Array(16).fill(0),
  });

  test("reads the last METERS on a 30 dB scale; zeros before any and once they go stale", () => {
    const fake = fakePort();
    const tap = createTap(fake.port);
    expect(tap.read()).toEqual({ level: 0, bass: 0, mid: 0, high: 0, flux: 0 });
    fake.bringUp();
    fake.emit(meters(0.5, [0.25, 0.1, 0.001]));
    const now = tap.read();
    expect(now.level).toBeGreaterThan(now.bass);
    expect(now.bass).toBeGreaterThan(now.mid);
    expect(now.high).toBe(0); // -60 dB is under the floor
    for (const v of Object.values(now)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    fake.emit(meters(2, [2, 2, 2]));
    expect(tap.read()).toMatchObject({ level: 1, bass: 1, mid: 1, high: 1 });
    fake.advance(1);
    expect(tap.read()).toEqual({ level: 0, bass: 0, mid: 0, high: 0, flux: 0 });
  });

  test("flux jumps on a rise and is gone within 120 ms; a steady level makes none", () => {
    const fake = fakePort();
    const tap = createTap(fake.port);
    fake.bringUp();
    fake.emit(meters(0.02, [0.02, 0.02, 0.02]));
    fake.advance(0.016);
    fake.emit(meters(0.02, [0.02, 0.02, 0.02]));
    expect(tap.read().flux).toBe(0);
    fake.advance(0.016);
    fake.emit(meters(0.5, [0.5, 0.3, 0.1]));
    const hit = tap.read().flux;
    expect(hit).toBeGreaterThan(0.5);
    fake.advance(0.06);
    expect(tap.read().flux).toBeLessThan(hit);
    expect(tap.read().flux).toBeGreaterThan(0);
    fake.emit(meters(0.5, [0.5, 0.3, 0.1]));
    fake.advance(0.07);
    expect(tap.read().flux).toBe(0);
  });
});

/** A context whose script processor is driven by hand: `feed` delivers one block of two channels. */
function fakeCapture(rate = 8) {
  const links = new Set<string>();
  const destination = { name: "destination" };
  let handler: ((event: unknown) => void) | null = null;
  let outputs: Float32Array[] = [];
  const context = {
    state: "running",
    sampleRate: rate,
    currentTime: 0,
    destination,
    createScriptProcessor: (size: number, ins: number, outs: number) => {
      expect([size, ins, outs]).toEqual([4096, 2, 2]);
      return node;
    },
  };
  const node = {
    set onaudioprocess(fn: ((event: unknown) => void) | null) {
      handler = fn;
    },
    get onaudioprocess() {
      return handler;
    },
    connect: (to: unknown) => void links.add(to === destination ? "node>destination" : "node>?"),
    disconnect: (to: unknown) => void links.delete(to === destination ? "node>destination" : "node>?"),
  };
  const output = {
    connect: (to: unknown) => void links.add(to === node ? "output>node" : "output>?"),
    disconnect: (to: unknown) => void links.delete(to === node ? "output>node" : "output>?"),
  };
  return {
    sound: {
      context: () => context as unknown as AudioContext,
      output: () => output as unknown as AudioNode,
    },
    context,
    links,
    handler: () => handler,
    outputs: () => outputs,
    feed(l: number[], r: number[]) {
      outputs = [new Float32Array(l.length).fill(9), new Float32Array(l.length).fill(9)];
      const event = {
        inputBuffer: {
          numberOfChannels: 2,
          getChannelData: (c: number) => new Float32Array(c === 0 ? l : r),
        },
        outputBuffer: { numberOfChannels: 2, getChannelData: (c: number) => outputs[c] as Float32Array },
      };
      handler?.(event);
    },
  };
}

/** A WAV's samples, interleaved, as 16-bit integers. */
async function samplesOf(blob: Blob): Promise<number[]> {
  const view = new DataView(await blob.arrayBuffer());
  return Array.from({ length: (view.byteLength - 44) / 2 }, (_, i) => view.getInt16(44 + i * 2, true));
}
const q = (v: number) => Math.round(v < 0 ? v * 0x8000 : v * 0x7fff);

describe("capture", () => {
  test("the WAV holds exactly the frames fed, in order, both channels; the tap is silent and comes out after", async () => {
    const fake = fakeCapture(8);
    const done = capture(fake.sound, 1); // 8 frames
    expect([...fake.links].sort()).toEqual(["node>destination", "output>node"]);
    fake.feed([0.1, 0.2, 0.3, 0.4, 0.5], [-0.1, -0.2, -0.3, -0.4, -0.5]);
    expect(fake.outputs().every((c) => c.every((v) => v === 0))).toBe(true);
    // The second block runs past the length: only the frames asked for are kept.
    fake.feed([0.6, 0.7, 0.8, 0.9, 1], [-0.6, -0.7, -0.8, -0.9, -1]);
    const blob = await done;
    const view = new DataView(await blob.arrayBuffer());
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(8);
    const want = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8].flatMap((v) => [q(v), q(-v)]);
    expect(await samplesOf(blob)).toEqual(want);
    expect(fake.links.size).toBe(0);
    expect(fake.handler()).toBeNull();
  });

  test("a context that stops, or runs past the ceiling, resolves with what was gathered", async () => {
    const stopped = fakeCapture(8);
    const first = capture(stopped.sound, 1);
    stopped.context.state = "suspended";
    stopped.feed([0.5, 0.5], [0.25, 0.25]);
    expect(await samplesOf(await first)).toEqual([q(0.5), q(0.25), q(0.5), q(0.25)]);
    expect(stopped.links.size).toBe(0);

    const late = fakeCapture(8);
    const second = capture(late.sound, 1);
    late.feed([0.5], [0.5]);
    late.context.currentTime = 3.5; // past 1 s + 2 s
    late.feed([0.25], [0.25]);
    expect(await samplesOf(await second)).toHaveLength(4);
  });

  test("refuses with no core running, without createScriptProcessor, and a length that is not above 0", async () => {
    const bare = fakeCapture();
    (bare.context as { createScriptProcessor?: unknown }).createScriptProcessor = undefined;
    await expect(capture(bare.sound, 1)).rejects.toThrow(/createScriptProcessor/);
    const none = { context: () => null, output: () => null };
    await expect(capture(none, 1)).rejects.toThrow(/running/);
    const suspended = {
      context: () => ({ state: "suspended" }) as AudioContext,
      output: () => ({}) as AudioNode,
    };
    await expect(capture(suspended, 1)).rejects.toThrow(/running/);
    await expect(capture(none, 0)).rejects.toThrow(/seconds/);
  });

  test("encodeWav writes a 16-bit PCM header and clipped, interleaved samples", async () => {
    const blob = encodeWav([new Float32Array([0, 1, -1]), new Float32Array([0.5, 2, -2])], 48000);
    expect(blob.type).toBe("audio/wav");
    const view = new DataView(await blob.arrayBuffer());
    expect(view.byteLength).toBe(44 + 3 * 2 * 2);
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint16(34, true)).toBe(16);
    const samples = Array.from({ length: 6 }, (_, i) => view.getInt16(44 + i * 2, true));
    expect(samples).toEqual([0, 16384, 32767, 32767, -32768, -32768]);
  });
});
