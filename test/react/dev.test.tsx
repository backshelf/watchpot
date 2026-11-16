import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { DAY_MS, HOUR_MS, readClock } from "watchpot/core";
import { warpClock } from "watchpot/react";
import { freshStore, renderWith } from "watchpot/test";
import { DevPanel } from "../../src/react/dev/DevPanel";
import { checkSave, featureJson, jumpToDay, profileDay } from "../../src/react/dev/devTools";
import { toy } from "../core/toy";

afterEach(cleanup);

describe("time warp", () => {
  test("moves gameNow forward by the clock's offset, never the wall", () => {
    const { store, clock } = freshStore(toy);
    const wall = clock.now();
    const before = store.getState().gameNow();
    warpClock(store, HOUR_MS);
    expect(store.getState().gameNow()).toBe(before + HOUR_MS);
    expect(clock.now()).toBe(wall);
    expect(readClock(store.getState(), toy.clock).offsetMs).toBe(HOUR_MS);
  });

  test("refuses to run the clock backwards", () => {
    const { store } = freshStore(toy);
    const before = store.getState().gameNow();
    warpClock(store, -HOUR_MS);
    expect(store.getState().gameNow()).toBe(before);
  });

  test("a jump to a later day catches up over the days between; an earlier one does nothing", () => {
    const { store } = freshStore(toy);
    expect(profileDay(store)).toBe(1);
    const gold = store.getState().wallet.gold;
    jumpToDay(store, 3);
    expect(profileDay(store)).toBe(3);
    // The catch-up ran: the generator paid for the time away, and the clock was last seen at the new now.
    expect(store.getState().wallet.gold.gt(gold)).toBe(true);
    expect(readClock(store.getState(), toy.clock).lastSeen).toBe(store.getState().gameNow());
    const at = store.getState().gameNow();
    jumpToDay(store, 2);
    expect(store.getState().gameNow()).toBe(at);
    expect(at - readClock(store.getState(), toy.clock).createdAt).toBeGreaterThanOrEqual(2 * DAY_MS);
  });
});

describe("the save editor's codec", () => {
  test("an export checks; junk names the codec's reason", () => {
    const { store } = freshStore(toy);
    expect(checkSave(store, store.getState().exportProfile())).toEqual({
      ok: true,
      version: toy.save.version,
    });
    expect(checkSave(store, "not a save")).toEqual({ ok: false, reason: "bad-json" });
  });

  test("a feature's state reads as JSON with Decimals as strings", () => {
    const { store } = freshStore(toy);
    const json = JSON.parse(featureJson(store, "wallet")) as Record<string, unknown>;
    expect(typeof json.gold).toBe("string");
    // Transient keys are not saved, so not shown.
    expect("flash" in json).toBe(false);
  });
});

describe("DevPanel", () => {
  test("warps the clock from its buttons and lists each feature", () => {
    const { store } = freshStore(toy);
    renderWith(store, <DevPanel />);
    const before = store.getState().gameNow();
    act(() => fireEvent.click(screen.getByRole("button", { name: "+1 h" })));
    expect(store.getState().gameNow()).toBe(before + HOUR_MS);
    for (const f of toy.features) expect(screen.getByText(f.key)).toBeInTheDocument();
  });
});
