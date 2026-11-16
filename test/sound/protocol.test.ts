import { describe, expect, test } from "bun:test";
import {
  COMMANDS,
  type CommandName,
  concat,
  decodeCommands,
  decodeEvents,
  EVENTS,
  type EventName,
  encode,
  encodeEvent,
  type FieldType,
  fieldOffset,
  type OpDef,
  recordBytes,
} from "../../src/sound/protocol";

/** A value for every field of an op, distinct per field, exactly representable as a 32-bit float. */
function sample(def: OpDef): Record<string, number | number[]> {
  const out: Record<string, number | number[]> = {};
  let n = 1;
  const one = (type: FieldType) => (typeof type === "string" ? type : type[0]) === "f32";
  for (const [name, type] of Object.entries(def.fields)) {
    const next = () => (one(type) ? n++ * 0.25 : n++ * 3);
    out[name] = typeof type === "string" ? next() : Array.from({ length: type[1] }, next);
  }
  return out;
}

describe("the protocol", () => {
  test.each(Object.keys(COMMANDS) as CommandName[])("command %s round-trips", (op) => {
    const fields = sample(COMMANDS[op]);
    const bytes = encode(op, fields as never);
    expect(decodeCommands(bytes)).toEqual([{ op, ...fields }] as never);
  });

  test.each(Object.keys(EVENTS) as EventName[])("event %s round-trips", (op) => {
    const fields = sample(EVENTS[op]);
    const bytes = encodeEvent(op, fields as never);
    expect(decodeEvents(bytes)).toEqual([{ op, ...fields }] as never);
  });

  test("a record's length field is its length in bytes, and its op is its id", () => {
    for (const table of [COMMANDS, EVENTS] as Record<string, OpDef>[]) {
      for (const def of Object.values(table)) {
        const bytes =
          table === COMMANDS
            ? encode(
                Object.keys(COMMANDS).find((k) => COMMANDS[k as CommandName] === def) as CommandName,
                {} as never,
              )
            : encodeEvent(
                Object.keys(EVENTS).find((k) => EVENTS[k as EventName] === def) as EventName,
                {} as never,
              );
        const view = new DataView(bytes.buffer);
        expect(view.getUint16(0, true)).toBe(def.id);
        expect(view.getUint16(2, true)).toBe(bytes.length);
        expect(bytes.length).toBe(recordBytes(def));
        expect(bytes.length % 4).toBe(0);
      }
    }
  });

  test("ids are unique within commands and within events", () => {
    for (const table of [COMMANDS, EVENTS]) {
      const ids = Object.values(table).map((def) => def.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  test("every command's first field is atFrame and every event's is frame", () => {
    for (const def of Object.values(COMMANDS)) expect(Object.keys(def.fields)[0]).toBe("atFrame");
    for (const def of Object.values(EVENTS)) expect(Object.keys(def.fields)[0]).toBe("frame");
  });

  test("atFrame left out is 0: now", () => {
    expect(decodeCommands(encode("SAMPLE_FREE", { sample: 4 }))).toEqual([
      { op: "SAMPLE_FREE", atFrame: 0, sample: 4 },
    ]);
  });

  test("records joined decode in order, and a cut-off tail is left out", () => {
    const bytes = concat([
      encode("VOICE_STOP", { voice: 1, release: 0 }),
      encode("SAMPLE_FREE", { sample: 2 }),
      encode("VOICE_STOP", { voice: 3, release: 9 }),
    ]);
    expect(decodeCommands(bytes).map((c) => c.op)).toEqual(["VOICE_STOP", "SAMPLE_FREE", "VOICE_STOP"]);
    expect(decodeCommands(bytes.subarray(0, bytes.length - 2)).map((c) => c.op)).toEqual([
      "VOICE_STOP",
      "SAMPLE_FREE",
    ]);
  });

  test("a record of an unknown op is skipped by its own length", () => {
    const unknown = new Uint8Array(8);
    new DataView(unknown.buffer).setUint16(0, 999, true);
    new DataView(unknown.buffer).setUint16(2, 8, true);
    const bytes = concat([unknown, encodeEvent("VOICE_ENDED", { frame: 5, voice: 6 })]);
    expect(decodeEvents(bytes)).toEqual([{ op: "VOICE_ENDED", frame: 5, voice: 6 }]);
  });

  test("fieldOffset finds a field inside its record", () => {
    const at = fieldOffset(COMMANDS.SAMPLE_LOAD, "ptr");
    const bytes = encode("SAMPLE_LOAD", { sample: 1, ptr: 0xabcd, frames: 2, channels: 1, rate: 48000 });
    expect(new DataView(bytes.buffer).getUint32(at, true)).toBe(0xabcd);
    expect(() => fieldOffset(COMMANDS.SAMPLE_LOAD, "nope")).toThrow();
  });
});
