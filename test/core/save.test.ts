import { describe, expect, test } from "bun:test";
import {
  D,
  type Decimal,
  decodeProfile,
  deserialize,
  encodeProfile,
  fromPlain,
  isDecimal,
  migrate,
  SaveError,
  serialize,
  toPlain,
} from "watchpot/core";

/** The test game's own version; the codec takes it as an argument. */
const SAVE_VERSION = 10;

/** The SaveError code `fn` throws, or null when it does not throw one. */
function codeOf(fn: () => unknown): string | null {
  try {
    fn();
  } catch (e) {
    if (e instanceof SaveError) return e.code;
    throw e;
  }
  return null;
}

describe("save serialisation", () => {
  test("tags Decimals and drops functions", () => {
    expect(toPlain({ gold: D(1500), nested: { fn: () => 1 }, list: [D(0.5), 2] })).toEqual({
      gold: { $d: "1500" },
      nested: {},
      list: [{ $d: "0.5" }, 2],
    });
  });

  test("round-trips Decimals of every size through JSON", () => {
    const values = [0, -3, 0.5, 1e33, "1e400", "1e5000"];
    const back = deserialize(serialize({ values: values.map((v) => D(v)) })) as { values: unknown[] };
    back.values.forEach((v, i) => {
      expect(isDecimal(v)).toBe(true);
      expect((v as Decimal).eq(D(values[i] ?? 0))).toBe(true);
    });
  });

  test("only an exact tag is revived", () => {
    const back = fromPlain({ a: { $d: "5" }, b: { $d: "5", extra: 1 }, c: { $d: 5 } }) as Record<
      string,
      unknown
    >;
    expect(isDecimal(back.a)).toBe(true);
    expect(isDecimal(back.b)).toBe(false);
    expect(isDecimal(back.c)).toBe(false);
  });
});

describe("save versions and export", () => {
  test("the current version passes through; an older one is a fresh profile; a newer one is a typed error", () => {
    const state = { wallet: { gold: D(5) } };
    expect(migrate(state, SAVE_VERSION, SAVE_VERSION)).toBe(state);
    expect(migrate(state, SAVE_VERSION - 1, SAVE_VERSION)).toBeNull();
    expect(codeOf(() => migrate({}, SAVE_VERSION + 1, SAVE_VERSION))).toBe("newer-version");
  });

  test("an export round-trips; an older one or junk is refused with a reason", () => {
    const env = decodeProfile(encodeProfile({ wallet: { gold: D(42) } }, 1234, SAVE_VERSION), SAVE_VERSION);
    expect(env.version).toBe(SAVE_VERSION);
    expect(env.savedAt).toBe(1234);
    expect((env.state as { wallet: { gold: Decimal } }).wallet.gold.eq(42)).toBe(true);
    expect(codeOf(() => decodeProfile(encodeProfile({}, 1234, SAVE_VERSION - 1), SAVE_VERSION))).toBe(
      "old-version",
    );
    expect(codeOf(() => decodeProfile("{", SAVE_VERSION))).toBe("bad-json");
    expect(codeOf(() => decodeProfile("[]", SAVE_VERSION))).not.toBeNull();
    expect(codeOf(() => decodeProfile('{"version":1}', SAVE_VERSION))).not.toBeNull();
  });
});
