import { describe, expect, spyOn, test } from "bun:test";
import { fireEvent, screen, within } from "@testing-library/react";
import { freshStore, renderWith } from "watchpot/test";
import { App } from "../src/app/App";
import { TABS } from "../src/app/tabs";
import { MAIN, NAME } from "../src/content/words";
import { game } from "../src/game/game";
// @if clicker
import { CLICKER } from "../src/content/clicker";
// @end
// @if achievements
import { ACHIEVEMENTS, WALL_NAME } from "../src/content/achievements";
import { TAB_NAMES } from "../src/content/words";
// @end
// @if visitor
import { BUFF, VISITOR, WAIT } from "../src/content/visitor";
import { VISITOR_KIND } from "../src/game/visitor";
// @end

/** Renders the app over `store` and opens the about sheet from the header. */
function openAbout(store: Parameters<typeof renderWith>[0]) {
  const view = renderWith(store, <App />);
  const about = screen.getByRole("button", { name: "About" });
  about.focus();
  fireEvent.click(about);
  return { view, about, sheet: screen.getByRole("dialog", { name: `About ${NAME}` }) };
}

const box = () => screen.getByRole("textbox", { name: "Save as text" }) as HTMLTextAreaElement;

describe("the app", () => {
  test("draws a tab per screen and opens each", () => {
    const { store } = freshStore(game);
    renderWith(store, <App />);
    const nav = screen.getByRole("navigation", { name: NAME });
    expect(nav.querySelectorAll("button[data-tab]")).toHaveLength(TABS.length);
    for (const tab of TABS) {
      // A prefix: a tab with a count (`count` in the tab table) adds its words to the name.
      fireEvent.click(within(nav).getByRole("button", { name: new RegExp(`^${tab.label}`) }));
      expect(screen.getAllByText(tab.label).length).toBeGreaterThan(0);
    }
  });

  // @if generators|dimensions
  test("the buy amount switches what a buy button asks for", () => {
    const { store } = freshStore(game);
    store.getState().wallet.credit(MAIN, 1e12);
    renderWith(store, <App />);
    const modes = screen.getByRole("radiogroup", { name: "How many to buy" });
    fireEvent.click(within(modes).getByRole("radio", { name: "×10" }));
    expect(screen.getAllByRole("button", { name: /^Get 10/ }).length).toBeGreaterThan(0);
  });
  // @end

  test("#dev opens the dev panel over the game, and its close clears the hash", async () => {
    const { store } = freshStore(game);
    location.hash = "#dev";
    renderWith(store, <App />);
    const panel = await screen.findByRole("complementary", { name: "Dev" });
    fireEvent.click(within(panel).getByRole("button", { name: "Close" }));
    expect(location.hash).toBe("");
  });

  // @if clicker
  test("a press on the thing pressed pays", () => {
    const { store } = freshStore(game, { seed: "press" });
    renderWith(store, <App />);
    const before = store.getState().wallet[MAIN];
    fireEvent.click(screen.getByRole("button", { name: `${CLICKER.verb} ${CLICKER.name}` }));
    expect(store.getState().clicker.clicks).toBe(1);
    expect(store.getState().wallet[MAIN].gt(before)).toBe(true);
  });
  // @end

  // @if achievements
  test("the wall draws every achievement, a secret one hidden until earned", () => {
    const { store } = freshStore(game);
    renderWith(store, <App />);
    const nav = screen.getByRole("navigation", { name: NAME });
    fireEvent.click(within(nav).getByRole("button", { name: new RegExp(`^${TAB_NAMES.achievements}`) }));
    const grid = screen.getByRole("grid", { name: WALL_NAME });
    expect(within(grid).getAllByRole("gridcell")).toHaveLength(ACHIEVEMENTS.length);
    const secret = ACHIEVEMENTS.find((a) => a.secret);
    if (secret) expect(within(grid).queryByText(secret.name)).not.toBeInTheDocument();
  });
  // @end

  // @if visitor
  test("a visitor shows over the page while it is here, and a press catches it", () => {
    const { store, clock } = freshStore(game, { seed: "visit" });
    for (let t = 0; t <= WAIT.maxMs && !store.getState().visitors.kinds[VISITOR_KIND]?.live; t += 1_000)
      store.getState().tick(1_000, clock.advance(1_000));
    renderWith(store, <App />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${VISITOR.name}`) }));
    expect(store.getState().visitors.kinds[VISITOR_KIND]?.caught).toBe(1);
    expect(screen.getByText(BUFF.name)).toBeInTheDocument();
  });
  // @end

  test("the about sheet opens from the header, and Escape gives focus back to it", () => {
    const { store } = freshStore(game);
    const { about, sheet } = openAbout(store);
    expect(sheet).toBeInTheDocument();
    fireEvent.keyDown(sheet, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(about);
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
    await screen.findByText("Save copied.");
    const save = box().value;
    expect(save.length).toBeGreaterThan(0);
    first.view.unmount();

    const other = freshStore(game).store;
    openAbout(other);
    const read = screen.getByRole("button", { name: "Read save" });
    expect(read).toBeDisabled();
    fireEvent.change(box(), { target: { value: save } });
    fireEvent.click(read);
    expect(within(screen.getByRole("dialog")).getByRole("status")).toHaveTextContent("Save loaded.");
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
    expect(within(screen.getByRole("dialog")).getByRole("status")).toHaveTextContent("could not be read");
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
