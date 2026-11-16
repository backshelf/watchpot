// A small Chrome DevTools Protocol driver over headless Microsoft Edge, with no dependency: enough to load a page at
// a size and pixel ratio, press things, read its console and take a screenshot. Used to capture the game shown on
// the site (`capture-game.ts`) and to look at the site itself at real sizes (`shot.ts`).
import { mkdirSync } from "node:fs";

const EDGE = process.env.EDGE_PATH ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

type Params = Record<string, unknown>;
// biome-ignore lint/suspicious/noExplicitAny: a protocol reply's shape depends on the method called
type Reply = any;

export interface Page {
  send(method: string, params?: Params): Promise<Reply>;
  on(method: string, handler: (params: Reply) => void): void;
  evaluate<T = unknown>(expression: string): Promise<T>;
  viewport(width: number, height: number, dpr: number, mobile?: boolean): Promise<void>;
  goto(url: string): Promise<void>;
  click(x: number, y: number): Promise<void>;
  move(x: number, y: number): Promise<void>;
  key(key: string, code: string, keyCode: number): Promise<void>;
  shot(file: string, clip?: { x: number; y: number; width: number; height: number }): Promise<void>;
  /** Console lines, exceptions and failed requests seen so far. */
  logs: string[];
  close(): Promise<void>;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Starts Edge headless on a debugging port with a profile folder of its own. The flags keep the page awake. */
export async function launch(port: number, profile: string, extra: string[] = []) {
  mkdirSync(profile, { recursive: true });
  const proc = Bun.spawn(
    [
      EDGE,
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--mute-audio",
      "--enable-gpu",
      "--ignore-gpu-blocklist",
      "--use-angle=d3d11",
      "--disable-features=msEdgeSidebarV2,Translate,CalculateNativeWinOcclusion",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-background-timer-throttling",
      ...extra,
      "about:blank",
    ],
    { stdout: "ignore", stderr: "ignore" },
  );
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        const info = (await res.json()) as { webSocketDebuggerUrl: string };
        return { proc, ws: info.webSocketDebuggerUrl };
      }
    } catch {
      // Not listening yet.
    }
    await sleep(250);
  }
  proc.kill();
  throw new Error("edge did not start");
}

/** Opens a tab and returns the handful of things a capture needs. */
export async function open(wsUrl: string): Promise<Page> {
  const ws = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error("could not reach the browser"));
  });
  let id = 0;
  const pending = new Map<number, { resolve: (v: Reply) => void; reject: (e: Error) => void }>();
  const handlers = new Map<string, (params: Reply) => void>();
  const logs: string[] = [];
  ws.onmessage = (event) => {
    const msg = JSON.parse(String(event.data));
    const waiting = msg.id ? pending.get(msg.id) : undefined;
    if (waiting) {
      pending.delete(msg.id);
      if (msg.error) waiting.reject(new Error(String(msg.error.message)));
      else waiting.resolve(msg.result);
      return;
    }
    handlers.get(msg.method)?.(msg.params);
    if (msg.method === "Runtime.consoleAPICalled") {
      const text = msg.params.args.map((a: Reply) => a.value ?? a.description ?? "").join(" ");
      logs.push(`[${msg.params.type}] ${text}`);
    }
    if (msg.method === "Runtime.exceptionThrown") {
      const details = msg.params.exceptionDetails;
      logs.push(`[exception] ${details.exception?.description ?? details.text}`);
    }
    if (msg.method === "Log.entryAdded") {
      logs.push(`[log:${msg.params.entry.level}] ${msg.params.entry.text} ${msg.params.entry.url ?? ""}`);
    }
  };
  const raw = (method: string, params: Params = {}, sessionId?: string) =>
    new Promise<Reply>((resolve, reject) => {
      id += 1;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  const { targetId } = await raw("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await raw("Target.attachToTarget", { targetId, flatten: true });
  const send = (method: string, params: Params = {}) => raw(method, params, sessionId);
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => {});
  await send("Page.bringToFront").catch(() => {});

  const page: Page = {
    send,
    logs,
    on: (method, handler) => void handlers.set(method, handler),
    evaluate: async (expression) => {
      const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails)
        throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    viewport: async (width, height, dpr, mobile = false) => {
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile });
      if (mobile) await send("Emulation.setTouchEmulationEnabled", { enabled: true });
    },
    goto: async (url) => {
      await send("Page.navigate", { url });
      for (let i = 0; i < 80; i++) {
        await sleep(125);
        const ready = await page.evaluate<string>("document.readyState").catch(() => "");
        if (ready === "complete") return;
      }
    },
    move: (x, y) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y }),
    click: async (x, y) => {
      await page.move(x, y);
      const press = { x, y, button: "left", clickCount: 1 };
      await send("Input.dispatchMouseEvent", { type: "mousePressed", buttons: 1, ...press });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", buttons: 0, ...press });
    },
    key: async (key, code, keyCode) => {
      const event = { key, code, windowsVirtualKeyCode: keyCode };
      await send("Input.dispatchKeyEvent", {
        type: "keyDown",
        text: key.length === 1 ? key : undefined,
        ...event,
      });
      await send("Input.dispatchKeyEvent", { type: "keyUp", ...event });
    },
    shot: async (file, clip) => {
      const r = await send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: Boolean(clip),
        clip: clip ? { ...clip, scale: 1 } : undefined,
      });
      await Bun.write(file, Buffer.from(r.data, "base64"));
    },
    close: async () => {
      await raw("Target.closeTarget", { targetId });
      ws.close();
    },
  };
  return page;
}
