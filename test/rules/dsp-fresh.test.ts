// The DSP core's build is committed (`src/sound/core.gen.ts`), so it can go stale: a change to the crate, the
// protocol or the worklet processor without `bun run dsp` ships yesterday's core. This recomputes what the build
// would write, from source text alone, and fails when the committed build was made from something else.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { coreHash, opsRs, processorSource } from "../../scripts/dsp";
import { CORE_BASE64, CORE_HASH, PROCESSOR_SOURCE } from "../../src/sound/core.gen";

const ROOT = join(import.meta.dir, "..", "..");

describe("the committed DSP core", () => {
  test("was built from the sources as they stand: run `bun run dsp`", () => {
    expect(CORE_HASH).toBe(coreHash());
  });

  test("dsp/src/ops.rs is what the protocol generates: run `bun run dsp`", () => {
    expect(readFileSync(join(ROOT, "dsp/src/ops.rs"), "utf8").replace(/\r\n/g, "\n")).toBe(opsRs());
  });

  test("carries the worklet processor as it stands: run `bun run dsp`", () => {
    expect(PROCESSOR_SOURCE).toBe(processorSource());
  });

  test("is a WebAssembly module", () => {
    const bytes = Buffer.from(CORE_BASE64, "base64");
    expect([...bytes.subarray(0, 4)]).toEqual([0x00, 0x61, 0x73, 0x6d]);
  });
});
