// The sim desk's page, drawn over a fake socket and a fake desk: what a run streams in is what the page shows.
import { describe, expect, test } from "bun:test";
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
  knobs: [{ key: "rate", value: 2, code: 2, label: "Rate", group: "Economy" }],
  pins: {},
  tuningFile: "/g/sim.tuning.json",
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

async function draw() {
  const socket = fake();
  render(
    <StrictMode>
      <App connect={socket.connect} load={async () => INFO} />
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
    expect(socket.sent).toEqual([{ type: "run", id: 1, knobs: { rate: 2 }, pins: {}, seeds: 1 }]);
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
