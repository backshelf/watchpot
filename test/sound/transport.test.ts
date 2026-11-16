import { describe, expect, test } from "bun:test";
import { createTransport } from "../../src/sound/music/transport";
import { TRANSPORT_RUN } from "../../src/sound/protocol";
import { fakePort } from "./fake-port";

// At 48 kHz and 120 bpm a beat is 24,000 frames and a 4/4 bar 96,000.
function running() {
  const fake = fakePort();
  fake.bringUp();
  const transport = createTransport(fake.port);
  transport.api.start();
  return { fake, transport };
}

describe("transport", () => {
  test("settings and start reach the core as TRANSPORT_SET", () => {
    const { fake, transport } = running();
    transport.api.set({ bpm: 90, beatsPerBar: 3, swing: 2 });
    expect(fake.of("TRANSPORT_SET").at(0)).toMatchObject({ running: TRANSPORT_RUN.start });
    const set = fake.of("TRANSPORT_SET").at(-1);
    expect(set).toMatchObject({ bpm: 90, beatsPerBar: 3, swing: 1, running: TRANSPORT_RUN.keep });
    transport.api.stop();
    expect(fake.of("TRANSPORT_SET").at(-1)?.running).toBe(TRANSPORT_RUN.stop);
    expect(transport.api.running()).toBe(false);
    expect(transport.api.tempo()).toEqual({ bpm: 90, beatsPerBar: 3, swing: 1 });
    transport.api.start();
    expect(transport.api.running()).toBe(true);
  });

  test("position extrapolates along the context's clock and holds while stopped", () => {
    const { fake, transport } = running();
    fake.advance(0.75);
    expect(transport.api.position()).toEqual({ bar: 0, beat: 1, phase: 0.5 });
    fake.advance(2.25);
    expect(transport.api.position()).toMatchObject({ bar: 1, beat: 2, phase: 0 });
    transport.api.stop();
    fake.advance(5);
    expect(transport.api.position()).toMatchObject({ bar: 1, beat: 2 });
    transport.api.start();
    fake.advance(0.5);
    expect(transport.api.position()).toMatchObject({ bar: 1, beat: 3 });
  });

  test("a BEAT event re-anchors the clock, its 32-bit frame read against the context's", () => {
    const { fake, transport } = running();
    // Past the 32 bits of the core's counter.
    fake.advance(100_000);
    const frame = fake.port.frame();
    expect(frame).toBeGreaterThan(2 ** 32);
    fake.emit({ op: "BEAT", frame: (frame - 12_000) >>> 0, bar: 7, beat: 1 });
    expect(transport.api.position()).toEqual({ bar: 7, beat: 1, phase: 0.5 });
    expect(transport.next("bar")).toBe(frame - 12_000 + 3 * 24_000);
  });

  test("next names the frame of the next grid line, and now while stopped", () => {
    const { fake, transport } = running();
    fake.advance(0.6); // frame 28,800: beat 1.2
    expect(transport.next("bar")).toBe(96_000);
    expect(transport.next("4")).toBe(48_000);
    expect(transport.next("8")).toBe(36_000);
    expect(transport.next("16")).toBe(30_000);
    expect(transport.next("32")).toBe(30_000);
    expect(transport.next("off")).toBe(0);
    expect(transport.next(undefined)).toBe(0);
    transport.api.stop();
    expect(transport.next("bar")).toBe(0);
  });

  test("a tempo change keeps the beat's phase", () => {
    const { fake, transport } = running();
    fake.advance(1.25); // beat 2.5 at 120
    transport.api.set({ bpm: 60 });
    expect(transport.api.position()).toEqual({ bar: 0, beat: 2, phase: 0.5 });
    fake.advance(0.5); // half a beat at 60
    expect(transport.api.position()).toEqual({ bar: 0, beat: 3, phase: 0 });
    expect(transport.next("bar")).toBe(fake.port.frame() + 48_000);
  });

  test("onBeat relays every BEAT until stopped", () => {
    const { fake, transport } = running();
    const heard: { bar: number; beat: number }[] = [];
    const off = transport.api.onBeat((b) => heard.push(b));
    fake.emit({ op: "BEAT", frame: 24_000, bar: 0, beat: 1 });
    fake.emit({ op: "STEP", frame: 24_000, source: 0, track: 0, index: 0 });
    off();
    fake.emit({ op: "BEAT", frame: 48_000, bar: 0, beat: 2 });
    expect(heard).toEqual([{ bar: 0, beat: 1 }]);
  });
});
