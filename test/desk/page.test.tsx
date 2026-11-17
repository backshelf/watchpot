// The sim desk's page, drawn over a fake socket and a fake desk: what a run streams in is what the page shows.
import { afterEach, describe, expect, jest, test } from "bun:test";
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
const setRate = (v: number) => fireEvent.change(slider(), { target: { value: String(v) } });
const knobRow = (name: string) =>
  screen.getByRole("spinbutton", { name: `${name} value` }).closest("li") as HTMLElement;
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
  afterEach(() => {
    jest.useRealTimers();
  });

  test("knobs sit under their group's lettering, in spec order, with their units", async () => {
    await draw();
    const groups = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(groups).toEqual(["Economy", "Timing"]);
    expect(knobRow("Delay").textContent).toContain("1:30");
    // A knob with no range is a number field only.
    expect(screen.queryByRole("slider", { name: "Delay" })).toBeNull();
    expect(slider().getAttribute("step")).toBe("0.5");
  });

  test("moving a knob marks it by hand; after 500 ms one run goes out with the new value and the pins", async () => {
    const socket = await draw();
    jest.useFakeTimers();
    expect(within(knobRow("Rate")).queryByText("by hand")).toBeNull();
    setRate(4);
    expect(within(knobRow("Rate")).getByText("by hand")).toBeTruthy();
    wait(499);
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
    wait(400);
    setRate(5);
    wait(400);
    expect(runs(socket)).toHaveLength(1);
    wait(100);
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

  test("a number field sets a knob too, and a time reads as a clock", async () => {
    await draw();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Delay value" }), {
      target: { value: "150000" },
    });
    expect(knobRow("Delay").textContent).toContain("2:30");
    expect(within(knobRow("Delay")).getByText("by hand")).toBeTruthy();
  });

  test("Reset puts the knob back to its code value and clears the mark", async () => {
    const socket = await draw();
    jest.useFakeTimers();
    setRate(6);
    fireEvent.click(within(knobRow("Rate")).getByRole("button", { name: /Reset/ }));
    expect(slider().value).toBe("2");
    expect(within(knobRow("Rate")).queryByText("by hand")).toBeNull();
    expect(within(knobRow("Rate")).queryByRole("button", { name: /Reset/ })).toBeNull();
    wait(500);
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
    wait(500);
    expect(runs(socket)).toHaveLength(2);
    expect(runs(socket)[1]).toMatchObject({ pins: { g1: { price: "250", atMs: 1.5 * H } } });
    fireEvent.click(gates().getByRole("button", { name: "Unpin" }));
    wait(500);
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
    wait(500);
    expect(runs(socket)[1]).toMatchObject({ pins: {} });
  });

  test("a second run draws over the one before: a Δ column, a before in the readout; Clear before drops it", async () => {
    const socket = await draw();
    await socket.say(window(1, 1, 0, 2, [0, 1, 2]));
    expect(screen.queryByRole("button", { name: "Clear before" })).toBeNull();
    jest.useFakeTimers();
    setRate(5);
    wait(500);
    jest.useRealTimers();
    // The first window is replayed from the cache: part of the new run.
    const again = window(2, 1, 0, 2, [0, 1, 2], 10) as Extract<ToClient, { type: "window" }>;
    await socket.say({ ...again, cached: true });
    const table = () => screen.getByRole("table", { name: "Hourly values" });
    expect(within(table()).getByRole("columnheader", { name: "Δ coins" })).toBeTruthy();
    expect(within(table()).getByRole("row", { name: /^1 / }).textContent).toContain("+1.00");
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
    expect(within(table()).queryByRole("columnheader", { name: "Δ coins" })).toBeNull();
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
