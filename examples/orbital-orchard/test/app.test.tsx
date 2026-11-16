import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";
import { freshStore, renderWith } from "watchpot/test";
import { App } from "../src/app/App";
import { TABS } from "../src/app/tabs";
import { BOX_NAME, ITEMS } from "../src/content/gacha";
import { GENERATORS } from "../src/content/generators";
import { PRESTIGE_VERB } from "../src/content/prestige";
import { MAIN, NAME, PREMIUM, TAB_NAMES } from "../src/content/words";
import { game } from "../src/game/game";

/** Renders the app over `store` and opens the about sheet from the header. */
function openAbout(store: Parameters<typeof renderWith>[0]) {
  const view = renderWith(store, <App />);
  const about = screen.getByRole("button", { name: "About" });
  about.focus();
  fireEvent.click(about);
  return { view, about, sheet: screen.getByRole("dialog", { name: `About ${NAME}` }) };
}

const box = () => screen.getByRole("textbox", { name: "The save, as text" }) as HTMLTextAreaElement;

// happy-dom cancels a running motion animation with an AbortError nothing catches: the reveal's would leak one.
beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

describe("the app", () => {
  test("draws a tab per screen and opens each", () => {
    const { store } = freshStore(game);
    renderWith(store, <App />);
    const nav = screen.getByRole("navigation", { name: NAME });
    expect(nav.querySelectorAll("button[data-tab]")).toHaveLength(TABS.length);
    for (const tab of TABS) {
      fireEvent.click(within(nav).getByRole("button", { name: new RegExp(`^${tab.label}`) }));
      expect(screen.getAllByText(tab.label).length).toBeGreaterThan(0);
    }
  });

  test("every screen has at most one primary button, with everything affordable", () => {
    const { store } = freshStore(game, { at: Date.UTC(2026, 0, 1, 12), seed: "screen" });
    store.getState().wallet.credit(MAIN, 1e12);
    store.getState().wallet.credit(PREMIUM, 1e4);
    for (const g of GENERATORS) store.getState().generators.buy(g.id);
    renderWith(store, <App />);
    const nav = screen.getByRole("navigation", { name: NAME });
    const primaries: Record<string, number> = {};
    for (const tab of TABS) {
      fireEvent.click(within(nav).getByRole("button", { name: new RegExp(`^${tab.label}`) }));
      primaries[tab.id] = screen.getByRole("main").querySelectorAll('button[data-variant="primary"]').length;
    }
    const capped = Object.fromEntries(Object.entries(primaries).map(([id, n]) => [id, Math.min(n, 1)]));
    expect(primaries).toEqual(capped);
    // The orchard's one is the newest kind the sunlight pays for.
    fireEvent.click(within(nav).getByRole("button", { name: new RegExp(`^${TAB_NAMES.make}`) }));
    const row = screen.getByText(GENERATORS[GENERATORS.length - 1]?.name ?? "").closest("li");
    expect(row?.querySelector('button[data-variant="primary"]')).not.toBeNull();
  });

  test("a burn takes two presses", () => {
    const { store } = freshStore(game);
    store.getState().wallet.credit(MAIN, 1e12);
    renderWith(store, <App />);
    const nav = screen.getByRole("navigation", { name: NAME });
    fireEvent.click(within(nav).getByRole("button", { name: new RegExp(`^${TAB_NAMES.prestige}`) }));
    fireEvent.click(screen.getByRole("button", { name: PRESTIGE_VERB }));
    expect(store.getState().prestige.runs).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: /^Press again to burn/ }));
    expect(store.getState().prestige.runs).toBe(1);
  });

  test("the about sheet opens from the header, and Escape gives focus back to it", () => {
    const { store } = freshStore(game);
    const { about, sheet } = openAbout(store);
    expect(sheet).toBeInTheDocument();
    fireEvent.keyDown(sheet, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(about);
  });

  test("a net cast from the shower's sky catches something", () => {
    const { store } = freshStore(game, { at: Date.UTC(2026, 0, 1, 12), seed: "screen" });
    renderWith(store, <App />);
    const nav = screen.getByRole("navigation", { name: NAME });
    fireEvent.click(within(nav).getByRole("button", { name: new RegExp(`^${TAB_NAMES.event}`) }));
    fireEvent.click(screen.getByRole("button", { name: "Cast a net at cell 1" }));
    expect(screen.queryByRole("button", { name: "Cast a net at cell 1" })).not.toBeInTheDocument();
    expect(store.getState().events.runtime.stats.casts).toBe(1);
  });

  test("a graft opens the reveal", () => {
    const { store } = freshStore(game, { seed: "screen" });
    renderWith(store, <App />);
    const nav = screen.getByRole("navigation", { name: NAME });
    fireEvent.click(within(nav).getByRole("button", { name: new RegExp(`^${TAB_NAMES.gacha}`) }));
    fireEvent.click(screen.getByRole("button", { name: /^Graft one/ }));
    expect(screen.getByRole("dialog", { name: `${BOX_NAME} reveal` })).toBeInTheDocument();
    expect(store.getState().collection.last).toHaveLength(1);
  });

  test("the reveal turns ten grafts in order, says each, sums them up, and Back returns to the bench", async () => {
    const { store } = freshStore(game, { seed: "screen" });
    store.getState().wallet.credit(PREMIUM, 1e4);
    // Reduced motion: every beat moves on at a tap, and a face lands at once.
    store.getState().settings.change({ motion: "reduced" });
    renderWith(store, <App />);
    const nav = screen.getByRole("navigation", { name: NAME });
    fireEvent.click(within(nav).getByRole("button", { name: new RegExp(`^${TAB_NAMES.gacha}`) }));
    const graftTen = screen.getByRole("button", { name: /^Graft ten/ });
    graftTen.focus();
    fireEvent.click(graftTen);
    const room = screen.getByRole("dialog", { name: `${BOX_NAME} reveal` });
    const names = store.getState().collection.last.map((id) => ITEMS.find((it) => it.id === id)?.name);
    expect(names).toHaveLength(10);

    const live = room.querySelector('[aria-live="polite"]');
    const said: string[] = [];
    let turned = "";
    for (let i = 0; i < 40 && !screen.queryByText("10 grafts taken"); i++) {
      fireEvent.keyDown(room, { key: "Enter" });
      await act(() => new Promise<void>((done) => setTimeout(done, 5)));
      // A new face has turned when the head's count moves on (a charge holds it); then the live region says it.
      const count =
        within(room)
          .queryByText(/^\d+ of 10$/)
          ?.textContent?.trim() ?? "";
      if (count !== turned && !count.startsWith("0 ")) said.push(live?.textContent ?? "");
      turned = count;
    }
    said.push(live?.textContent ?? "");
    // Each face said as it showed, in the order the pull dealt them, then the closing line.
    expect(said.slice(0, 10).map((w) => w.split(". ")[1])).toEqual(names);
    expect(said.at(-1)).toBe("10 grafts taken.");
    expect(screen.getByText("10 grafts taken")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skip" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to the bench" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /^Graft ten/ }));
  });
});

describe("the settings", () => {
  test("a toggle changes the stored setting", () => {
    const { store } = freshStore(game);
    openAbout(store);
    fireEvent.click(screen.getByRole("checkbox", { name: "Sound" }));
    expect(store.getState().settings.sound).toBe(false);
    fireEvent.click(screen.getByRole("checkbox", { name: "Still the motion" }));
    expect(store.getState().settings.motion).toBe("reduced");
    fireEvent.click(screen.getByRole("checkbox", { name: "Still the motion" }));
    expect(store.getState().settings.motion).toBe("system");
  });

  test("a save copied out and read into a fresh store brings its balance and settings", async () => {
    const { store } = freshStore(game);
    store.getState().wallet.credit(MAIN, 12_345);
    store.getState().settings.change({ sound: false, motion: "reduced" });
    const first = openAbout(store);
    fireEvent.click(screen.getByRole("button", { name: "Copy save" }));
    await screen.findByText(/^Save copied/);
    const save = box().value;
    expect(save.length).toBeGreaterThan(0);
    first.view.unmount();

    const other = freshStore(game).store;
    openAbout(other);
    const read = screen.getByRole("button", { name: "Read save" });
    expect(read).toBeDisabled();
    fireEvent.change(box(), { target: { value: save } });
    fireEvent.click(read);
    expect(screen.getByRole("status")).toHaveTextContent(/^Save read/);
    expect(other.getState().wallet[MAIN].eq(store.getState().wallet[MAIN])).toBe(true);
    expect(other.getState().settings.sound).toBe(false);
    expect(other.getState().settings.motion).toBe("reduced");
  });

  test("a clipboard that refuses leaves the save in the box and says so", async () => {
    const { store } = freshStore(game);
    const refuse = spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    try {
      openAbout(store);
      fireEvent.click(screen.getByRole("button", { name: "Copy save" }));
      await screen.findByText(/copy it from there/);
      expect(box().value).toBe(store.getState().exportProfile());
    } finally {
      refuse.mockRestore();
    }
  });

  test("a save that cannot be read leaves the state as it was", () => {
    const { store } = freshStore(game);
    store.getState().wallet.credit(MAIN, 500);
    store.getState().settings.change({ sound: false });
    const before = store.getState().exportProfile();
    openAbout(store);
    fireEvent.change(box(), { target: { value: "not a save" } });
    fireEvent.click(screen.getByRole("button", { name: "Read save" }));
    expect(screen.getByRole("status")).toHaveTextContent(/Nothing has changed/);
    expect(store.getState().exportProfile()).toBe(before);
  });

  test("an older save with no settings loads with the defaults", () => {
    const { store } = freshStore(game);
    store.getState().wallet.credit(MAIN, 500);
    const save = JSON.parse(store.getState().exportProfile());
    // The export's envelope keeps the features' state under `state`; drop the settings, as a save from before them.
    delete save.state.settings;
    const { store: older } = freshStore(game, { save: JSON.stringify(save) });
    expect(older.getState().settings.sound).toBe(true);
    expect(older.getState().settings.motion).toBe("system");
    expect(older.getState().wallet[MAIN].eq(store.getState().wallet[MAIN])).toBe(true);
  });

  test("start over still takes two presses", () => {
    const { store } = freshStore(game);
    store.getState().wallet.credit(MAIN, 1e6);
    openAbout(store);
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(store.getState().wallet[MAIN].gte(1e6)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Press again to start over" }));
    expect(store.getState().wallet[MAIN].lt(1e6)).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
