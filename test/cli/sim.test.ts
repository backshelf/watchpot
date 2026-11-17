// `watchpot sim`: the desk server, in-process. Each test writes a small desk into a temp game folder.
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { main } from "../../src/cli/index";
import { startSim } from "../../src/cli/sim";

// The test preload (happy-dom) replaces Response, Request, Headers and fetch, which Bun.serve and a cross-origin
// request refuse. These tests use Bun's own for their run: unregister to reach them, register again (the preload's
// cleanup needs `document`), then lay Bun's over happy-dom's until the file ends.
const NATIVE = ["Response", "Request", "Headers", "fetch"] as const;
const g = globalThis as Record<string, unknown>;
let dom: Record<string, unknown> = {};
beforeAll(async () => {
  dom = Object.fromEntries(NATIVE.map((k) => [k, g[k]]));
  await GlobalRegistrator.unregister();
  const bun = Object.fromEntries(NATIVE.map((k) => [k, g[k]]));
  GlobalRegistrator.register();
  Object.assign(g, bun);
});
afterAll(() => {
  Object.assign(g, dom);
});

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

  test("/ is plain HTML with the currency and both knobs", async () => {
    const server = await start(game({ "sim.desk.ts": DESK }));
    const res = await get(server.url);
    const html = res.body;
    expect(res.type).toContain("text/html");
    expect(html).toContain("<title>watchpot sim</title>");
    expect(html).toContain("<h1>coins</h1>");
    expect(html).toContain("Gain &lt;b&gt;");
    expect(html).toContain("Delay");
    expect(html).not.toContain("class=");
    expect(html).not.toContain("<style");
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
    const html = (await get(server.url)).body;
    expect(html).toContain("<h1>gems</h1>");
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
