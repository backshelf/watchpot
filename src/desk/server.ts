// `watchpot sim`: serves the sim desk for a game on localhost and opens it in the browser. Bun only: the desk file is
// the game's TypeScript, imported as it is. `startSim` is the server; `sim` is the command around it.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { CliIo } from "../cli/index";
import type { ToClient, ToServer, WorkerInit } from "./protocol";

const DEFAULT_PORT = 4777;
const DESK_FILE = "sim.desk.ts";

interface DeskShape {
  run: unknown;
  knobs: { spec: Record<string, Record<string, unknown>>; defaults(): Record<string, number> };
  vocab: { currencies: unknown };
  currency: string;
  windowHours: number;
  end: unknown;
  seeds: unknown;
}

const WORKER_URL = new URL("./worker.ts", import.meta.url);

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Structural check: a game's desk is whatever `defineDesk` returned, so no `instanceof`. */
function isDesk(v: unknown): v is DeskShape {
  if (!isObject(v)) return false;
  const knobs = v.knobs;
  const vocab = v.vocab;
  return (
    typeof v.run === "function" &&
    isObject(knobs) &&
    isObject(knobs.spec) &&
    typeof knobs.defaults === "function" &&
    isObject(vocab) &&
    Array.isArray(vocab.currencies) &&
    typeof v.currency === "string" &&
    typeof v.windowHours === "number" &&
    v.end !== undefined &&
    v.seeds !== undefined
  );
}

const esc = (s: unknown): string =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** The desk as the page and `/api/desk` both show it: knobs in spec order, each with its current value. */
function deskData(desk: DeskShape) {
  const defaults = desk.knobs.defaults();
  const knobs = Object.entries(desk.knobs.spec).map(([key, spec]) => ({
    key,
    ...spec,
    value: defaults[key],
  }));
  return {
    currency: desk.currency,
    currencies: desk.vocab.currencies,
    windowHours: desk.windowHours,
    end: desk.end,
    seeds: desk.seeds,
    knobs,
  };
}

function page(data: ReturnType<typeof deskData>): string {
  const groups = new Map<string, typeof data.knobs>();
  for (const k of data.knobs) {
    const group = String((k as { group?: unknown }).group ?? "");
    groups.set(group, [...(groups.get(group) ?? []), k]);
  }
  const sections = [...groups]
    .map(
      ([group, knobs]) =>
        `<section><h2>${esc(group)}</h2><ul>${knobs
          .map((k) => `<li>${esc((k as { label?: unknown }).label ?? k.key)}: ${esc(k.value)}</li>`)
          .join("")}</ul></section>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>watchpot sim</title></head><body><h1>${esc(
    data.currency,
  )}</h1>${sections}</body></html>`;
}

/** Loads the game's desk and serves it on 127.0.0.1. Throws a message when the desk is missing or not a desk. */
export async function startSim(options: {
  cwd: string;
  desk?: string;
  port?: number;
}): Promise<{ url: string; stop(): void }> {
  const path = resolve(options.cwd, options.desk ?? DESK_FILE);
  if (!existsSync(path))
    throw new Error(`no desk file at ${path}: a game names its desk in ${DESK_FILE} (see docs)`);
  const mod = await import(pathToFileURL(path).href);
  if (!isDesk(mod.default)) throw new Error(`${path} does not default-export defineDesk({...})`);
  const desk = mod.default as DeskShape;
  const data = deskData(desk);
  const full = (desk.seeds as { full: number }).full;
  const sockets = new Set<{ send(text: string): unknown }>();
  const send = (m: ToClient): void => {
    const text = JSON.stringify(m);
    for (const ws of sockets) ws.send(text);
  };
  /** The one running job: its id and the workers still playing. */
  let job: { id: number; workers: Set<Worker> } | undefined;
  const cancel = (): void => {
    if (!job) return;
    const old = job;
    job = undefined;
    for (const w of old.workers) w.terminate();
    send({ type: "cancelled", id: old.id });
  };
  const checked = (raw: unknown): ToServer | { id: number; error: string } => {
    if (!isObject(raw) || raw.type !== "run" || typeof raw.id !== "number" || !Number.isFinite(raw.id))
      return { id: -1, error: 'expected {"type":"run","id":<number>,...}' };
    const id = raw.id;
    const bad = (error: string) => ({ id, error });
    if (!isObject(raw.knobs)) return bad("knobs must be an object of numbers");
    for (const [k, v] of Object.entries(raw.knobs)) {
      if (!Object.hasOwn(desk.knobs.spec, k)) return bad(`unknown knob "${k}"`);
      if (typeof v !== "number" || !Number.isFinite(v)) return bad(`knob "${k}" must be a finite number`);
    }
    if (!isObject(raw.pins)) return bad("pins must be an object");
    for (const [k, p] of Object.entries(raw.pins)) {
      if (!isObject(p)) return bad(`pin "${k}" must be an object`);
      if (p.price !== undefined && typeof p.price !== "string")
        return bad(`pin "${k}": price must be a string`);
      if (p.atMs !== undefined && (typeof p.atMs !== "number" || !Number.isFinite(p.atMs)))
        return bad(`pin "${k}": atMs must be a finite number`);
    }
    if (typeof raw.seeds !== "number" || !Number.isInteger(raw.seeds) || raw.seeds < 1 || raw.seeds > full)
      return bad(`seeds must be a whole number from 1 to ${full}`);
    return raw as unknown as ToServer;
  };
  const start = (msg: ToServer): void => {
    const mine = { id: msg.id, workers: new Set<Worker>() };
    job = mine;
    const finish = (w: Worker): void => {
      w.terminate();
      mine.workers.delete(w);
      if (mine.workers.size === 0 && job === mine) job = undefined;
    };
    for (let seed = 1; seed <= msg.seeds; seed++) {
      const w = new Worker(WORKER_URL);
      mine.workers.add(w);
      w.onmessage = (e: MessageEvent<ToClient>) => {
        if (job !== mine || !mine.workers.has(w)) return;
        send(e.data);
        if (e.data.type === "done" || e.data.type === "error") finish(w);
      };
      w.onerror = (e: ErrorEvent) => {
        if (job !== mine || !mine.workers.has(w)) return;
        send({ type: "error", id: msg.id, seed, message: e.message });
        finish(w);
      };
      const init: WorkerInit = {
        id: msg.id,
        deskPath: path,
        cwd: options.cwd,
        seed,
        knobs: msg.knobs,
        pins: msg.pins,
      };
      w.postMessage(init);
    }
  };
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: options.port ?? DEFAULT_PORT,
    websocket: {
      open: (ws) => void sockets.add(ws),
      close: (ws) => void sockets.delete(ws),
      message(ws, text) {
        let raw: unknown;
        try {
          raw = JSON.parse(typeof text === "string" ? text : new TextDecoder().decode(text));
        } catch {
          ws.send(JSON.stringify({ type: "error", id: -1, message: "not JSON" } satisfies ToClient));
          return;
        }
        const msg = checked(raw);
        if ("error" in msg) {
          ws.send(JSON.stringify({ type: "error", id: msg.id, message: msg.error } satisfies ToClient));
          return;
        }
        cancel();
        try {
          start(msg);
        } catch (err) {
          job = undefined;
          send({ type: "error", id: msg.id, message: err instanceof Error ? err.message : String(err) });
        }
      },
    },
    fetch(req, srv) {
      const { pathname } = new URL(req.url);
      if (pathname === "/ws") {
        if (srv.upgrade(req)) return undefined;
        return new Response("expected a WebSocket upgrade", { status: 426 });
      }
      if (req.method === "GET" && pathname === "/api/desk") return Response.json(data);
      if (req.method === "GET" && pathname === "/")
        return new Response(page(data), { headers: { "content-type": "text/html; charset=utf-8" } });
      return new Response("not found", { status: 404 });
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}/`,
    stop: () => {
      for (const w of job?.workers ?? []) w.terminate();
      job = undefined;
      void server.stop(true);
    },
  };
}

const SIM_USAGE = "usage: watchpot sim [--port <n>] [--no-open] [--desk <file>]";

function openBrowser(url: string): void {
  const cmd =
    process.platform === "win32"
      ? ["cmd", "/c", "start", "", url]
      : process.platform === "darwin"
        ? ["open", url]
        : ["xdg-open", url];
  try {
    Bun.spawn(cmd, { stdio: ["ignore", "ignore", "ignore"] });
  } catch {
    // the url is printed already; carry on
  }
}

/** Runs `watchpot sim <argv>`. Resolves when SIGINT or SIGTERM stops the server; returns the exit code. */
export async function sim(argv: readonly string[], cwd: string, io: CliIo): Promise<number> {
  let port = DEFAULT_PORT;
  let open = true;
  let desk: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--no-open") open = false;
    else if (a === "--port") {
      const v = argv[++i];
      if (v === undefined || !/^\d+$/.test(v) || Number(v) > 65535) {
        io.err(`watchpot: --port takes a port number, not "${v ?? ""}"`);
        io.err(SIM_USAGE);
        return 1;
      }
      port = Number(v);
    } else if (a === "--desk") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) {
        io.err("watchpot: --desk takes a file");
        io.err(SIM_USAGE);
        return 1;
      }
      desk = v;
    } else {
      io.err(`watchpot: sim: unknown option "${a}"`);
      io.err(SIM_USAGE);
      return 1;
    }
  }
  const server = await startSim({ cwd, desk, port });
  io.out(`sim desk: ${server.url}`);
  if (open) openBrowser(server.url);
  await new Promise<void>((done) => {
    const stop = () => {
      server.stop();
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      done();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
  return 0;
}
