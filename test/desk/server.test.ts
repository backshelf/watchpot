// `watchpot sim`: the desk server, in-process. Each test writes a small desk into a temp game folder.
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../../src/cli/index";
import { startSim } from "../../src/desk/server";
import { useBunFetch } from "../happydom";

// The test preload (happy-dom) replaces the fetch globals, which `Bun.serve` refuses: Bun's own for this file.
let restore = (): void => {};
beforeAll(() => {
  restore = useBunFetch();
});
afterAll(() => restore());

async function get(url: string): Promise<{ status: number; type: string; body: string }> {
  const res = await fetch(url);
  return { status: res.status, type: res.headers.get("content-type") ?? "", body: await res.text() };
}

const made: string[] = [];
let stop: (() => void) | undefined;

const DESK = `
const values = { gain: 2, delay: 150 };
export default {
  vocab: { currencies: ["coins", "gems"] },
  currency: "coins",
  windowHours: 2,
  end: { hours: 10 },
  seeds: { tuning: 1, full: 8 },
  knobs: {
    spec: {
      gain: { value: 2, label: "Gain <b>", group: "Economy", unit: "x" },
      delay: { value: 150, label: "Delay", group: "Timing", unit: "ms" },
    },
    defaults: () => ({ ...values }),
  },
  run() { return {}; },
};
`;

function game(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "watchpot-sim-"));
  made.push(dir);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

async function start(dir: string, desk?: string): Promise<{ url: string }> {
  const s = await startSim({ cwd: dir, port: 0, desk });
  stop = s.stop;
  return s;
}

afterEach(() => {
  stop?.();
  stop = undefined;
});

afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

describe("startSim", () => {
  const post = (url: string, body: unknown) =>
    fetch(new URL("/api/tuning", url).href, { method: "POST", body: JSON.stringify(body) });
  const getDesk = async (url: string) =>
    (await (await fetch(new URL("/api/desk", url).href)).json()) as {
      knobs: { key: string; value: number; code: number }[];
      pins: Record<string, unknown>;
      tuningFile: string;
    };

  test("/api/desk has code, pins and tuningFile", async () => {
    const dir = game({ "sim.desk.ts": DESK });
    const server = await start(dir);
    const body = await getDesk(server.url);
    expect(body.knobs.map((k) => [k.key, k.value, k.code])).toEqual([
      ["gain", 2, 2],
      ["delay", 150, 150],
    ]);
    expect(body.pins).toEqual({});
    expect(body.tuningFile).toBe(join(dir, "sim.tuning.json"));
  });

  test("POST /api/tuning writes only changed knobs and the pins, sorted; the next GET shows the pins", async () => {
    const dir = game({ "sim.desk.ts": DESK });
    const server = await start(dir);
    const res = await post(server.url, {
      knobs: { gain: 2, delay: 200 },
      pins: { zeta: { atMs: 5 }, alpha: { price: "1e3" } },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const text = readFileSync(join(dir, "sim.tuning.json"), "utf8");
    expect(text).toBe(
      `${JSON.stringify({ knobs: { delay: 200 }, pins: { alpha: { price: "1e3" }, zeta: { atMs: 5 } } }, null, 2)}
`,
    );
    expect(Object.keys(JSON.parse(text).pins)).toEqual(["alpha", "zeta"]);
    expect((await getDesk(server.url)).pins).toEqual({ alpha: { price: "1e3" }, zeta: { atMs: 5 } });
  });

  test("after a Save the next GET starts from the saved knob values, and a reset knob from the code", async () => {
    const dir = game({ "sim.desk.ts": DESK });
    const server = await start(dir);
    await post(server.url, { knobs: { gain: 3, delay: 150 }, pins: {} });
    expect((await getDesk(server.url)).knobs.map((k) => [k.key, k.value])).toEqual([
      ["gain", 3],
      ["delay", 150],
    ]);
    await post(server.url, { knobs: { gain: 2, delay: 150 }, pins: {} });
    expect((await getDesk(server.url)).knobs.map((k) => [k.key, k.value])).toEqual([
      ["gain", 2],
      ["delay", 150],
    ]);
  });

  test("a bad tuning body is 400 and writes nothing", async () => {
    const dir = game({ "sim.desk.ts": DESK });
    const server = await start(dir);
    const bads = [
      { knobs: { nope: 1 }, pins: {} },
      { knobs: { gain: Number.NaN }, pins: {} },
      { knobs: { gain: "3" }, pins: {} },
      { knobs: {}, pins: { a: { price: "abc" } } },
      { knobs: {}, pins: { a: { price: "-5" } } },
      { knobs: {}, pins: { a: { atMs: -1 } } },
    ];
    for (const b of bads) {
      const res = await post(server.url, b);
      expect(res.status).toBe(400);
      expect(typeof ((await res.json()) as { error: string }).error).toBe("string");
    }
    expect(existsSync(join(dir, "sim.tuning.json"))).toBe(false);
  });

  test("a saved sim.tuning.json shows its pins; a malformed one makes startSim throw", async () => {
    const pins = { a: { price: "10" } };
    const dir = game({ "sim.desk.ts": DESK, "sim.tuning.json": JSON.stringify({ knobs: {}, pins }) });
    expect((await getDesk((await start(dir)).url)).pins).toEqual(pins);
    const bad = game({ "sim.desk.ts": DESK, "sim.tuning.json": "{ nope" });
    await expect(startSim({ cwd: bad, port: 0 })).rejects.toThrow(/sim.tuning.json is not a tuning file: /);
  });

  test("/api/desk returns the knobs in spec order with values", async () => {
    const server = await start(game({ "sim.desk.ts": DESK }));
    const body = JSON.parse((await get(new URL("/api/desk", server.url).href)).body) as {
      currency: string;
      knobs: { key: string; value: number }[];
    };
    expect(body.currency).toBe("coins");
    expect(body.knobs.map((k) => [k.key, k.value])).toEqual([
      ["gain", 2],
      ["delay", 150],
    ]);
  });

  test("GET / is the page: HTML titled watchpot sim, with a script that is served", async () => {
    const server = await start(game({ "sim.desk.ts": DESK }));
    const res = await get(server.url);
    expect(res.status).toBe(200);
    expect(res.type).toContain("text/html");
    expect(res.body).toContain("<title>watchpot sim</title>");
    const src = /<script[^>]*?\ssrc="([^"]+)"/.exec(res.body)?.[1];
    expect(src).toBeTruthy();
    const script = await get(new URL(src ?? "", server.url).href);
    expect(script.status).toBe(200);
    expect(script.type).toContain("javascript");
  });

  test("anything else is 404", async () => {
    const server = await start(game({ "sim.desk.ts": DESK }));
    expect((await get(new URL("/nope", server.url).href)).status).toBe(404);
  });

  test("--desk loads that file instead", async () => {
    const dir = game({
      "sim.desk.ts": DESK,
      "other.ts": DESK.replace('currency: "coins"', 'currency: "gems"'),
    });
    const server = await start(dir, "other.ts");
    const body = JSON.parse((await get(new URL("/api/desk", server.url).href)).body) as { currency: string };
    expect(body.currency).toBe("gems");
  });

  test("a missing desk file throws the message", async () => {
    const dir = game({});
    await expect(startSim({ cwd: dir, port: 0 })).rejects.toThrow(
      `no desk file at ${join(dir, "sim.desk.ts")}: a game names its desk in sim.desk.ts (see docs)`,
    );
  });

  test("a desk without run throws the message", async () => {
    const dir = game({ "sim.desk.ts": DESK.replace("run() { return {}; },", "") });
    await expect(startSim({ cwd: dir, port: 0 })).rejects.toThrow(
      `${join(dir, "sim.desk.ts")} does not default-export defineDesk({...})`,
    );
  });
});

describe("watchpot sim command", () => {
  const capture = () => {
    const out: string[] = [];
    const err: string[] = [];
    return { out, err, io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) } };
  };

  test("a bad port is a usage error", async () => {
    const c = capture();
    const code = await main(["sim", "--port", "abc"], game({}), { ...c.io, env: {} });
    expect(code).toBe(1);
    expect(c.err.join("\n")).toContain("usage: watchpot sim");
  });

  test("an unknown flag is a usage error", async () => {
    const c = capture();
    const code = await main(["sim", "--bogus"], game({}), { ...c.io, env: {} });
    expect(code).toBe(1);
    expect(c.err.join("\n")).toContain('unknown option "--bogus"');
  });

  test("help lists the sim line", async () => {
    const c = capture();
    expect(await main(["help"], game({}), { ...c.io, env: {} })).toBe(0);
    expect(c.out.join("\n")).toContain("watchpot sim [--port <n>] [--no-open] [--desk <file>]");
  });
});
