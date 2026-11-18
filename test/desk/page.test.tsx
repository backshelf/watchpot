// The sim desk's page, drawn over a fake socket and a fake desk: what a run streams in is what the page shows.
import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { App } from "../../src/desk/page/App";
import type { Connect, DeskLink, LinkHandlers } from "../../src/desk/page/link";
import type { DeskInfo, ToClient, ToServer } from "../../src/desk/protocol";

const H = 3_600_000;

const INFO: DeskInfo = {
  currency: "coins",
  currencies: ["coins", "gems"],
  windowHours: 2,
  end: { hours: 4 },
  seeds: { tuning: 1, full: 3 },
  knobs: [
    { key: "rate", value: 2, code: 2, label: "Rate", group: "Economy", min: 0, max: 10, step: 0.5 },
    { key: "delay", value: 90_000, code: 90_000, label: "Delay", group: "Timing", unit: "ms" },
  ],
  pins: {},
  tuningFile: "sim.tuning.json",
};

/** A socket the test drives: what the page sent, and a way to say what the server sent. */
function fake() {
  const sent: ToServer[] = [];
  let handlers: LinkHandlers | undefined;
  let closed = 0;
  const link: DeskLink = {
    send: (m) => void sent.push(m),
    close: () => void closed++,
  };
  const connect: Connect = (h) => {
    handlers = h;
    return link;
  };
  return {
    connect,
    sent,
    get closed() {
      return closed;
    },
    // The page connects after the desk loads: wait for it, so a message is never sent into nothing.
    open: async () => {
      await waitFor(() => expect(handlers).toBeDefined());
      act(() => handlers?.onOpen(link));
    },
    say: async (msg: ToClient) => {
      await waitFor(() => expect(handlers).toBeDefined());
      act(() => handlers?.onMessage(msg));
    },
  };
}

function window(id: number, seed: number, from: number, to: number, hours: number[], scale = 1): ToClient {
  return {
    type: "window",
    id,
    seed,
    fromMs: from * H,
    toMs: to * H,
    gates: [{ key: "g1", atMs: 1 * H, openedMs: 1.5 * H }],
    points: hours.map((h) => ({
      atMs: h * H,
      currencies: { coins: String(h * 100 * scale), gems: String(h) },
      next: { mine: { currency: "coins", cost: String(h * 150) } },
    })),
  };
}

async function draw(info: DeskInfo = INFO) {
  const socket = fake();
  render(
    <StrictMode>
      <App connect={socket.connect} load={async () => info} />
    </StrictMode>,
  );
  await screen.findByRole("checkbox", { name: "coins" });
  await socket.open();
  return socket;
}

const hourRows = () =>
  within(screen.getByRole("table", { name: "Hourly values" }))
    .getAllByRole("rowheader")
    .map((h) => h.textContent);

describe("the desk page", () => {
  test("runs on load with the knobs' values, no pins and the tuning seeds", async () => {
    const socket = await draw();
    expect(socket.sent).toEqual([
      { type: "run", id: 1, knobs: { rate: 2, delay: 90_000 }, pins: {}, seeds: 1 },
    ]);
    expect(screen.getByRole("heading", { name: "watchpot sim" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("running 0 / 4 h");
  });

  test("opens with only the main currency on", async () => {
    await draw();
    expect((screen.getByRole("checkbox", { name: "coins" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "gems" }) as HTMLInputElement).checked).toBe(false);
  });

  test("draws an empty plate, not a blank, before the first window", async () => {
    await draw();
    expect(screen.getByText(/Playing the first window/)).toBeTruthy();
    expect(screen.getByText(/Waiting for the first window: a row for every whole hour/)).toBeTruthy();
  });

  test("two windows give a row per whole hour fed; the gate lands in its table", async () => {
    const socket = await draw();
    await socket.say(window(1, 1, 0, 2, [0, 1, 2]));
    await socket.say(window(1, 1, 2, 4, [3, 4]));
    expect(hourRows()).toEqual(["0", "1", "2", "3", "4"]);
    const table = screen.getByRole("table", { name: "Hourly values" });
    expect(within(table).getByRole("columnheader", { name: "coins" })).toBeTruthy();
    expect(within(table).queryByRole("columnheader", { name: "gems" })).toBeNull();
    const gates = within(screen.getByRole("table", { name: "Gates" }));
    expect(gates.getByRole("rowheader", { name: "g1" })).toBeTruthy();
    expect(gates.getByText("+0:30")).toBeTruthy();
  });

  test("unchecking the main currency removes its column; ticking another adds it", async () => {
    const socket = await draw();
    await socket.say(window(1, 1, 0, 2, [0, 1, 2]));
    fireEvent.click(screen.getByRole("checkbox", { name: "gems" }));
    const table = () => screen.getByRole("table", { name: "Hourly values" });
    expect(within(table()).getByRole("columnheader", { name: "gems" })).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "coins" }));
    expect(within(table()).queryByRole("columnheader", { name: "coins" })).toBeNull();
    expect(within(table()).getByRole("columnheader", { name: "gems" })).toBeTruthy();
  });

  test("a buyable seen in the samples is listed under Next cost and, ticked, draws the wallet graph", async () => {
    const socket = await draw();
    await socket.say(window(1, 1, 0, 2, [0, 1, 2]));
    expect(screen.queryByRole("group", { name: /Wallet against next cost/ })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Next cost of mine" }));
    expect(screen.getByRole("group", { name: /Wallet against next cost/ })).toBeTruthy();
    expect(
      within(screen.getByRole("table", { name: "Hourly values" })).getByRole("columnheader", {
        name: "mine cost",
      }),
    ).toBeTruthy();
  });

  test("a group's toggle ticks and clears the whole group; search narrows the list", async () => {
    await draw();
    fireEvent.click(screen.getByRole("checkbox", { name: "Toggle every series under Currencies" }));
    expect((screen.getByRole("checkbox", { name: "gems" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Toggle every series under Currencies" }));
    expect((screen.getByRole("checkbox", { name: "coins" }) as HTMLInputElement).checked).toBe(false);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search series" }), { target: { value: "ge" } });
    expect(screen.queryByRole("checkbox", { name: "coins" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "gems" })).toBeTruthy();
  });

  test("an error message shows its text", async () => {
    const socket = await draw();
    await socket.say({ type: "error", id: 1, seed: 2, message: "the worker fell over" });
    expect(screen.getByRole("alert").textContent).toContain("seed 2: the worker fell over");
    expect(screen.getByRole("status").textContent).toContain("error");
  });

  test("done ends the run; answers to an older run are ignored", async () => {
    const socket = await draw();
    await socket.say(window(1, 1, 0, 2, [0, 1, 2]));
    await socket.say({ type: "done", id: 1, seed: 1, finished: true, playedMs: 4 * H });
    expect(screen.getByRole("status").textContent).toContain("done");
    fireEvent.click(screen.getByRole("button", { name: "All seeds" }));
    expect(socket.sent.at(-1)).toMatchObject({ type: "run", id: 2, seeds: 3 });
    // The new run cleared the drawn data; a straggler from run 1 is dropped.
    await socket.say(window(1, 1, 2, 4, [3, 4]));
    expect(screen.queryByRole("table", { name: "Hourly values" })).toBeNull();
    await socket.say(window(2, 1, 0, 2, [0, 1]));
    expect(hourRows()).toEqual(["0", "1"]);
  });

  test("with several seeds the table shows the median", async () => {
    const socket = await draw();
    fireEvent.click(screen.getByRole("button", { name: "All seeds" }));
    await socket.say(window(2, 1, 0, 2, [1], 1));
    await socket.say(window(2, 2, 0, 2, [1], 3));
    await socket.say(window(2, 3, 0, 2, [1], 2));
    const row = within(screen.getByRole("table", { name: "Hourly values" })).getByRole("row", {
      name: /^1 /,
    });
    expect(row.textContent).toContain("200");
  });

  test("the graph reads out every visible series at the crosshair, and the arrow keys move it", async () => {
    const socket = await draw();
    await socket.say(window(1, 1, 0, 2, [0, 1, 2]));
    const graph = screen.getByRole("group", { name: /Currencies over time/ });
    fireEvent.keyDown(graph, { key: "ArrowRight" });
    expect(graph.getAttribute("aria-describedby")).toBeTruthy();
    const read = () => document.getElementById(graph.getAttribute("aria-describedby") ?? "")?.textContent;
    expect(read()).toContain("0.00 h");
    fireEvent.keyDown(graph, { key: "ArrowRight" });
    expect(read()).toContain("1.00 h");
    expect(read()).toContain("100");
    fireEvent.keyDown(graph, { key: "ArrowLeft" });
    expect(read()).toContain("0.00 h");
  });

  test("a pointer move redraws the crosshair and the readout, never the series paths", async () => {
    const socket = fake();
    const seriesRenders = { count: 0 };
    render(
      <StrictMode>
        <App connect={socket.connect} load={async () => INFO} onSeriesRender={() => seriesRenders.count++} />
      </StrictMode>,
    );
    await screen.findByRole("checkbox", { name: "coins" });
    await socket.open();
    await socket.say(window(1, 1, 0, 2, [0, 1, 2]));
    await waitFor(() => expect(seriesRenders.count).toBeGreaterThan(0));
    const before = seriesRenders.count;
    const graph = screen.getByRole("group", { name: /Currencies over time/ });
    const read = () =>
      document.getElementById(graph.getAttribute("aria-describedby") ?? "")?.textContent ?? "";
    // Where nothing measures, the svg keeps its fallback box: give it one, so a client x finds an hour.
    const svg = document.querySelector(".graph__svg") as SVGSVGElement;
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 960, height: 400 }) as DOMRect;
    const paths = [...svg.querySelectorAll(".graph__line")];
    expect(paths.length).toBeGreaterThan(0);
    // Moves are coalesced to one update a frame: the frames are held back here, then run at once.
    const frames: FrameRequestCallback[] = [];
    const raf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    }) as typeof requestAnimationFrame;
    try {
      fireEvent.pointerMove(svg, { clientX: 300, clientY: 50 });
      fireEvent.pointerMove(svg, { clientX: 500, clientY: 60 });
      fireEvent.pointerMove(svg, { clientX: 340, clientY: 70 });
      expect(read()).toContain("Hover or focus");
      act(() => {
        for (const cb of frames.splice(0)) cb(0);
      });
      // One frame for the burst, at the last position.
      expect(frames).toHaveLength(0);
      expect(read()).toContain("1.00 h");
      fireEvent.pointerMove(svg, { clientX: 500, clientY: 50 });
      act(() => {
        for (const cb of frames.splice(0)) cb(0);
      });
      expect(read()).toContain("2.00 h");
      fireEvent.pointerLeave(svg);
      expect(read()).toContain("Hover or focus");
    } finally {
      globalThis.requestAnimationFrame = raf;
    }
    // The series layer never rendered again through all of that: its paths are the same nodes.
    expect(seriesRenders.count).toBe(before);
    expect([...svg.querySelectorAll(".graph__line")]).toEqual(paths);
    // The arrow keys still move the readout.
    fireEvent.keyDown(graph, { key: "ArrowRight" });
    expect(read()).toContain("0.00 h");
    fireEvent.keyDown(graph, { key: "ArrowRight" });
    expect(read()).toContain("1.00 h");
  });

  test("the hairline follows the pointer and the keys synchronously, before any animation frame", async () => {
    const socket = await draw();
    await socket.say(window(1, 1, 0, 2, [0, 1, 2]));
    const graph = screen.getByRole("group", { name: /Currencies over time/ });
    // Where nothing measures, the svg keeps its fallback box: give it one, so a client x finds an x in the plot.
    const svg = document.querySelector(".graph__svg") as SVGSVGElement;
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 960, height: 400 }) as DOMRect;
    // The crosshair lives in its own sheet over the plot: the series svg holds no line of it.
    const overlay = document.querySelector(".graph__overlay") as SVGSVGElement;
    const hair = overlay.querySelector(".graph__hairline") as SVGLineElement;
    expect(svg.querySelector(".graph__cross")).toBeNull();
    expect(hair.style.transform).toBe("");
    // The frames are held back: nothing may move until they are let run.
    const frames: FrameRequestCallback[] = [];
    const raf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    }) as typeof requestAnimationFrame;
    try {
      fireEvent.pointerMove(svg, { clientX: 300, clientY: 50 });
      // Placed straight on its node, at the pointer's exact x clamped to the plot — no frame has run yet.
      expect(hair.style.visibility).toBe("visible");
      expect(hair.style.transform).toBe("translateX(300.0px)");
      // The dots still wait for the store's frame, and then sit on the raw points.
      expect(overlay.querySelector(".graph__cross circle")).toBeNull();
      act(() => {
        for (const cb of frames.splice(0)) cb(0);
      });
      expect(overlay.querySelectorAll(".graph__cross circle").length).toBe(1);
      // The keyboard seats the line at the stop's x the same way, with no frame either.
      fireEvent.keyDown(graph, { key: "Home" });
      expect(hair.style.transform).toBe("translateX(35.0px)");
      fireEvent.keyDown(graph, { key: "End" });
      expect(hair.style.transform).toBe("translateX(489.5px)");
      // Leave and Escape hide it.
      fireEvent.pointerLeave(svg);
      expect(hair.style.visibility).toBe("hidden");
      fireEvent.keyDown(graph, { key: "ArrowRight" });
      expect(hair.style.visibility).toBe("visible");
      fireEvent.keyDown(graph, { key: "Escape" });
      expect(hair.style.visibility).toBe("hidden");
    } finally {
      globalThis.requestAnimationFrame = raf;
    }
  });

  test("the trend toggle smooths the strong lines of both graphs, and the choice is kept", async () => {
    localStorage.setItem("watchpot-desk-trend", "3h");
    try {
      const socket = await draw();
      // A dense run: enough points a pixel column that the strong line carries a band to hide.
      const dense = Array.from({ length: 2001 }, (_, i) => i / 1000);
      await socket.say(window(1, 1, 0, 2, dense));
      fireEvent.click(screen.getByRole("checkbox", { name: "Next cost of mine" }));
      const graph1 = () => screen.getByRole("group", { name: /Currencies over time/ }).parentElement;
      const graph2 = () => screen.getByRole("group", { name: /Wallet against next cost/ }).parentElement;
      // A saved choice is read on load: the 3h window is on, both graphs smoothed over their own raw lines.
      expect(screen.getByRole("button", { name: "3h" }).getAttribute("aria-pressed")).toBe("true");
      expect(graph1()?.querySelectorAll(".graph__line--trend").length).toBe(1);
      expect(graph1()?.querySelectorAll(".graph__line--raw").length).toBe(1);
      expect(graph1()?.querySelector(".graph__band")).toBeNull();
      expect(graph2()?.querySelectorAll(".graph__line--trend").length).toBe(2);
      expect(graph2()?.querySelectorAll(".graph__line--raw").length).toBe(2);
      expect(graph1()?.querySelector(".graph__caption")?.textContent).toContain("· trend 3h");
      expect(graph2()?.querySelector(".graph__caption")?.textContent).toContain("· trend 3h");
      // The trend is a drawing aid only: the readout and the tables keep the raw values.
      const frame = screen.getByRole("group", { name: /Currencies over time/ });
      fireEvent.keyDown(frame, { key: "End" });
      const read = document.getElementById(frame.getAttribute("aria-describedby") ?? "")?.textContent ?? "";
      expect(read).toContain("2.00 h");
      expect(read).toContain("200");
      expect(
        within(screen.getByRole("table", { name: "Hourly values" })).getByRole("row", { name: /^2 / })
          .textContent,
      ).toContain("200");
      // Off: the lines are as they were, band and all.
      fireEvent.click(screen.getByRole("button", { name: "off" }));
      expect(graph1()?.querySelector(".graph__line--trend")).toBeNull();
      expect(graph1()?.querySelectorAll(".graph__band").length).toBe(1);
      expect(graph1()?.querySelector(".graph__caption")?.textContent).not.toContain("trend");
      expect(localStorage.getItem("watchpot-desk-trend")).toBe("off");
      // Another window, and it is kept for the next visit.
      fireEvent.click(screen.getByRole("button", { name: "1h" }));
      expect(graph1()?.querySelectorAll(".graph__line--trend").length).toBe(1);
      expect(graph1()?.querySelector(".graph__caption")?.textContent).toContain("· trend 1h");
      expect(localStorage.getItem("watchpot-desk-trend")).toBe("1h");
      expect(socket.sent.length).toBe(1);
    } finally {
      localStorage.removeItem("watchpot-desk-trend");
    }
  });

  test("a closed connection is said, not silent", async () => {
    const socket = fake();
    let close: (() => void) | undefined;
    const connect: Connect = (h) => {
      close = h.onClose;
      return socket.connect(h);
    };
    render(<App connect={connect} load={async () => INFO} />);
    await screen.findByRole("checkbox", { name: "coins" });
    // The socket opens after the desk loads: wait for it, then drop it.
    await waitFor(() => expect(close).toBeDefined());
    act(() => close?.());
    expect((await screen.findByRole("alert")).textContent).toContain("connection");
  });
});

const runs = (socket: ReturnType<typeof fake>) => socket.sent.filter((m) => m.type === "run");
const wait = (ms: number) => act(() => void jest.advanceTimersByTime(ms));
const slider = () => screen.getByRole("slider", { name: "Rate" }) as HTMLInputElement;
const setRate = (v: number) => {
  fireEvent.change(slider(), { target: { value: String(v) } });
  fireEvent.pointerUp(slider());
};
const field = (name: string) => screen.getByLabelText(`${name} value`) as HTMLInputElement;
const knobRow = (name: string) => field(name).closest("li") as HTMLElement;
const gates = () => within(screen.getByRole("table", { name: "Gates" }));
const saveButton = () => screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;

/** A fake `fetch` for `/api/tuning`: records what was posted, answers what it is told. */
function fakeFetch(status: number, body: unknown) {
  const posted: { url: string; body: unknown }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    posted.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return {
    posted,
    restore: () => {
      globalThis.fetch = real;
    },
  };
}

describe("the knob panel", () => {
  beforeEach(() => {
    localStorage.setItem("watchpot-desk-open-groups", JSON.stringify(["Economy", "Timing"]));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test("knobs sit under their group's lettering, in spec order, with their units", async () => {
    await draw();
    const groups = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(groups).toEqual(["Economy · 1 knobs", "Timing · 1 knobs"]);
    expect(field("Delay").value).toBe("1:30");
    // A knob with no range is a number field only.
    expect(screen.queryByRole("slider", { name: "Delay" })).toBeNull();
    expect(slider().getAttribute("step")).toBe("0.5");
  });

  test("moving a knob marks it by hand; after a second one run goes out with the new value and the pins", async () => {
    const socket = await draw();
    jest.useFakeTimers();
    expect(within(knobRow("Rate")).queryByText("by hand")).toBeNull();
    setRate(4);
    expect(within(knobRow("Rate")).getByText("by hand")).toBeTruthy();
    wait(999);
    expect(runs(socket)).toHaveLength(1);
    wait(1);
    expect(runs(socket)).toHaveLength(2);
    expect(runs(socket)[1]).toMatchObject({
      type: "run",
      id: 2,
      knobs: { rate: 4, delay: 90_000 },
      pins: {},
      seeds: 1,
    });
  });

  test("two quick changes send one run, after the last", async () => {
    const socket = await draw();
    jest.useFakeTimers();
    setRate(3);
    wait(800);
    setRate(5);
    wait(800);
    expect(runs(socket)).toHaveLength(1);
    wait(200);
    expect(runs(socket)).toHaveLength(2);
    expect(runs(socket)[1]).toMatchObject({ knobs: { rate: 5 } });
  });

  test("the arrow keys on the slider step by the knob's step", async () => {
    await draw();
    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    expect(slider().value).toBe("2.5");
    fireEvent.keyDown(slider(), { key: "ArrowLeft" });
    fireEvent.keyDown(slider(), { key: "ArrowLeft" });
    expect(slider().value).toBe("1.5");
  });

  test("a number field sets a knob on blur; a time is typed and read as a clock", async () => {
    const socket = await draw();
    fireEvent.change(field("Delay"), { target: { value: "2:30" } });
    expect(field("Delay").value).toBe("2:30");
    fireEvent.blur(field("Delay"));
    expect(field("Delay").value).toBe("2:30");
    expect(within(knobRow("Delay")).getByText("by hand")).toBeTruthy();
    expect(within(knobRow("Delay")).getByText("code 1:30")).toBeTruthy();
    // Not a clock: not a value, and the knob stays where it was.
    fireEvent.change(field("Delay"), { target: { value: "soon" } });
    expect(field("Delay").getAttribute("aria-invalid")).toBe("true");
    fireEvent.blur(field("Delay"));
    expect(field("Delay").value).toBe("2:30");
    expect(socket.sent).toHaveLength(1);
  });

  test("typing 150 sends no run until Enter, then exactly one after the debounce; Escape drops the draft", async () => {
    const socket = await draw({
      ...INFO,
      knobs: [{ key: "cap", value: 100, code: 100, label: "Cap", group: "Economy" }],
    });
    jest.useFakeTimers();
    for (const t of ["1", "15", "150"]) fireEvent.change(field("Cap"), { target: { value: t } });
    wait(5000);
    expect(runs(socket)).toHaveLength(1);
    fireEvent.keyDown(field("Cap"), { key: "Enter" });
    wait(999);
    expect(runs(socket)).toHaveLength(1);
    wait(1);
    expect(runs(socket)).toHaveLength(2);
    expect(runs(socket)[1]).toMatchObject({ knobs: { cap: 150 } });
    fireEvent.change(field("Cap"), { target: { value: "7" } });
    fireEvent.keyDown(field("Cap"), { key: "Escape" });
    expect(field("Cap").value).toBe("150");
  });

  test("a slider drag moves the value live and asks for a run only on release", async () => {
    const socket = await draw();
    jest.useFakeTimers();
    fireEvent.change(slider(), { target: { value: "3" } });
    fireEvent.change(slider(), { target: { value: "4" } });
    wait(5000);
    expect(runs(socket)).toHaveLength(1);
    expect(within(knobRow("Rate")).getByText("by hand")).toBeTruthy();
    fireEvent.pointerUp(slider());
    wait(1000);
    expect(runs(socket)).toHaveLength(2);
    expect(runs(socket)[1]).toMatchObject({ knobs: { rate: 4 } });
  });

  test("a share is stored as a fraction and shown, and typed, as a percentage; a multiplier leads with ×", async () => {
    const socket = await draw({
      ...INFO,
      knobs: [
        { key: "away", value: 0.5, code: 0.5, label: "Away", min: 0, max: 1, step: 0.05, unit: "%" },
        { key: "grow", value: 1.15, code: 1.15, label: "Grow", min: 1, max: 2, step: 0.01, unit: "x" },
      ],
    });
    expect(field("Away").value).toBe("50");
    expect(knobRow("Away").textContent).toContain("%");
    expect(knobRow("Grow").textContent).toContain("×");
    fireEvent.change(field("Away"), { target: { value: "15" } });
    fireEvent.blur(field("Away"));
    expect(socket.sent.length).toBe(1);
    expect(within(knobRow("Away")).getByText("code 50%")).toBeTruthy();
    expect((screen.getByRole("slider", { name: "Away" }) as HTMLInputElement).value).toBe("0.15");
    fireEvent.change(field("Grow"), { target: { value: "1.47" } });
    fireEvent.blur(field("Grow"));
    expect(within(knobRow("Grow")).getByText("code 1.15")).toBeTruthy();
    expect(
      (screen.getByRole("slider", { name: "Grow" }) as HTMLInputElement).getAttribute("aria-valuetext"),
    ).toBe("×1.47");
  });

  test("Reset puts the knob back to its code value and clears the mark", async () => {
    const socket = await draw();
    jest.useFakeTimers();
    setRate(6);
    fireEvent.click(within(knobRow("Rate")).getByRole("button", { name: /Reset/ }));
    expect(slider().value).toBe("2");
    expect(within(knobRow("Rate")).queryByText("by hand")).toBeNull();
    expect(within(knobRow("Rate")).queryByRole("button", { name: /Reset/ })).toBeNull();
    wait(1000);
    expect(runs(socket)[1]).toMatchObject({ knobs: { rate: 2 } });
  });

  test("a gate's price pinned is sent in the next run's pins, marked by hand; Unpin removes it", async () => {
    const socket = await draw();
    await socket.say(window(1, 1, 0, 2, [0, 1, 2]));
    jest.useFakeTimers();
    fireEvent.click(gates().getByRole("button", { name: "Pin" }));
    fireEvent.change(gates().getByRole("textbox", { name: "Price of g1" }), { target: { value: "250" } });
    fireEvent.change(gates().getByRole("textbox", { name: "Hour of g1" }), { target: { value: "1:30" } });
    expect(gates().getAllByText("by hand").length).toBe(2);
    wait(1000);
    expect(runs(socket)).toHaveLength(2);
    expect(runs(socket)[1]).toMatchObject({ pins: { g1: { price: "250", atMs: 1.5 * H } } });
    fireEvent.click(gates().getByRole("button", { name: "Unpin" }));
    wait(1000);
    expect(runs(socket)[2]).toMatchObject({ pins: {} });
    // The gates stay listed, from the run before, while the new run plays its first window.
    expect(gates().queryByRole("button", { name: "Unpin" })).toBeNull();
    expect(gates().getByRole("button", { name: "Pin" })).toBeTruthy();
  });

  test("a price Decimal cannot read is not a pin", async () => {
    const socket = await draw();
    await socket.say(window(1, 1, 0, 2, [0, 1, 2]));
    jest.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Pin" }));
    const price = screen.getByRole("textbox", { name: "Price of g1" });
    fireEvent.change(price, { target: { value: "lots" } });
    expect(price.getAttribute("aria-invalid")).toBe("true");
    wait(1000);
    expect(runs(socket)[1]).toMatchObject({ pins: {} });
  });

  test("a second run draws over the one before: a Δ column, a before in the readout; Clear before drops it", async () => {
    const socket = await draw();
    await socket.say(window(1, 1, 0, 2, [0, 1, 2]));
    expect(screen.queryByRole("button", { name: "Clear before" })).toBeNull();
    jest.useFakeTimers();
    setRate(5);
    wait(1000);
    jest.useRealTimers();
    // The first window is replayed from the cache: part of the new run.
    const again = window(2, 1, 0, 2, [0, 1, 2], 10) as Extract<ToClient, { type: "window" }>;
    await socket.say({ ...again, cached: true });
    const table = () => screen.getByRole("table", { name: "Hourly values" });
    expect(within(table()).getByRole("columnheader", { name: "Δ vs before" })).toBeTruthy();
    // 1,000 now against 100 before: up nine times over, nine hundred per cent.
    expect(within(table()).getByRole("row", { name: /^1 / }).textContent).toContain("+900%");
    const graph = screen.getByRole("group", { name: /Currencies over time/ });
    fireEvent.keyDown(graph, { key: "ArrowRight" });
    fireEvent.keyDown(graph, { key: "ArrowRight" });
    const read = document.getElementById(graph.getAttribute("aria-describedby") ?? "")?.textContent ?? "";
    expect(read).toContain("now");
    expect(read).toContain("before");
    expect(read).toContain("+1.00");
    const dashed = () => graph.parentElement?.querySelectorAll(".graph__line--before").length;
    expect(dashed()).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Clear before" }));
    expect(within(table()).queryByRole("columnheader", { name: "Δ vs before" })).toBeNull();
    expect(dashed()).toBe(0);
  });

  test("Save posts every knob and pin, is disabled again after a 200, and says where it wrote", async () => {
    await draw();
    const fetcher = fakeFetch(200, { ok: true });
    try {
      expect(saveButton().disabled).toBe(true);
      setRate(7);
      expect(saveButton().disabled).toBe(false);
      expect(screen.getByText("Unsaved changes")).toBeTruthy();
      fireEvent.click(saveButton());
      await waitFor(() => expect(screen.getByText("saved to sim.tuning.json")).toBeTruthy());
      expect(fetcher.posted).toEqual([
        { url: "/api/tuning", body: { knobs: { rate: 7, delay: 90_000 }, pins: {} } },
      ]);
      expect(saveButton().disabled).toBe(true);
      // Still by hand against the code, but nothing differs from what is saved; Revert goes back to what is saved.
      expect(within(knobRow("Rate")).getByText("by hand")).toBeTruthy();
      setRate(8);
      expect(saveButton().disabled).toBe(false);
      fireEvent.click(screen.getByRole("button", { name: "Revert" }));
      expect(slider().value).toBe("7");
      expect(saveButton().disabled).toBe(true);
    } finally {
      fetcher.restore();
    }
  });

  test("a 400's error shows in an alert and Save stays open", async () => {
    await draw();
    const fetcher = fakeFetch(400, { error: "knob rate is not a knob" });
    try {
      setRate(3);
      fireEvent.click(saveButton());
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("knob rate is not a knob");
      expect(saveButton().disabled).toBe(false);
    } finally {
      fetcher.restore();
    }
  });

  test("a desk with no knobs shows the empty plate", async () => {
    await draw({ ...INFO, knobs: [] });
    expect(screen.getByText(/names no knobs/).textContent).toContain("defineKnobs");
    expect(screen.queryByRole("slider")).toBeNull();
  });
});

describe("the knob panel's groups and filters", () => {
  const MANY: DeskInfo = {
    ...INFO,
    knobs: [
      { key: "rate", value: 2, code: 2, label: "Rate", group: "Economy", min: 0, max: 10, step: 0.5 },
      { key: "cost", value: 5, code: 4, label: "Cost", group: "Economy" },
      { key: "delay", value: 90_000, code: 90_000, label: "Delay", group: "Timing", unit: "ms" },
      { key: "wait", value: 10, code: 10, label: "Wait", group: "Timing" },
    ],
  };
  const clearStore = () => {
    localStorage.removeItem("watchpot-desk-open-groups");
  };
  afterEach(clearStore);
  const header = (name: RegExp) => screen.getByRole("button", { name });

  test("groups start collapsed; a header opens its knobs and shows the counts", async () => {
    clearStore();
    await draw(MANY);
    expect(screen.queryByLabelText("Rate value")).toBeNull();
    expect(header(/^Economy/).textContent).toBe("Economy · 2 knobs · 1 by hand");
    expect(header(/^Timing/).textContent).toBe("Timing · 2 knobs");
    expect(header(/^Timing/).getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(header(/^Economy/));
    expect(header(/^Economy/).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText("Rate value")).toBeTruthy();
    expect(screen.queryByLabelText("Delay value")).toBeNull();
    expect(JSON.parse(localStorage.getItem("watchpot-desk-open-groups") ?? "[]")).toEqual(["Economy"]);
  });

  test("the filter shows only matching knobs across groups, open, and hides groups with none", async () => {
    clearStore();
    await draw(MANY);
    const box = screen.getByRole("searchbox", { name: "Filter knobs" });
    fireEvent.change(box, { target: { value: "WA" } });
    expect(screen.getByLabelText("Wait value")).toBeTruthy();
    expect(screen.queryByLabelText("Rate value")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Economy/ })).toBeNull();
    // A group name matches all its knobs.
    fireEvent.change(box, { target: { value: "econ" } });
    expect(screen.getByLabelText("Rate value")).toBeTruthy();
    expect(screen.getByLabelText("Cost value")).toBeTruthy();
    fireEvent.change(box, { target: { value: "zzz" } });
    expect(screen.getByText("No knobs match.")).toBeTruthy();
  });

  test("Changed only shows only knobs that differ from code, and combines with the filter", async () => {
    clearStore();
    await draw(MANY);
    const only = screen.getByRole("button", { name: "Changed only" });
    fireEvent.click(only);
    expect(only.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("Cost value")).toBeTruthy();
    expect(screen.queryByLabelText("Rate value")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Timing/ })).toBeNull();
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter knobs" }), { target: { value: "rate" } });
    expect(screen.getByText("No knobs match.")).toBeTruthy();
  });
});

describe("the waits table", () => {
  test("lists a dry spell from the run; clicking it presses it, again clears it", async () => {
    const socket = await draw();
    await socket.say(window(1, 1, 0, 2, [0, 1, 2]));
    const pick = () =>
      within(screen.getByRole("table", { name: "Longest dry spells" })).getAllByRole(
        "button",
      )[0] as HTMLElement;
    expect(pick().getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(pick());
    expect(pick().getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(pick());
    expect(pick().getAttribute("aria-pressed")).toBe("false");
  });
});
