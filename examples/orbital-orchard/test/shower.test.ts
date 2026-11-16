import { describe, expect, test } from "bun:test";
import { D, resolveWindow } from "watchpot/core";
import { freshStore } from "watchpot/test";
import { BOX, PULL_PRICE } from "../src/content/gacha";
import { GENERATORS } from "../src/content/generators";
import { NETS, SHARDS, SHOWER, SKY, SKY_CELLS } from "../src/content/shower";
import { MAIN, PREMIUM } from "../src/content/words";
import { castAt, freshSky, leftIn, showerMods } from "../src/game/events/shower/rules";
import { game } from "../src/game/game";

/** Ten minutes into the first shower (no net back yet), and noon on the day off after it. */
const FALLING = Date.UTC(2026, 0, 1, 0, 10);
const QUIET = Date.UTC(2026, 0, 3, 12);
const nets = (s: ReturnType<typeof live>["store"]) =>
  s.getState().events.runtime.currencies[NETS]?.toNumber();

function live(at = FALLING) {
  return freshStore(game, { at, seed: "shower" });
}

describe("the meteor shower", () => {
  test("falls two days in three and starts each shower fresh", () => {
    const { store } = live();
    const s = store.getState().events;
    expect(s.live).toBe(true);
    expect(s.runtime.cycleStart).toBe(resolveWindow(SHOWER.schedule, FALLING).start);
    expect(nets(store)).toBe(3);
    expect(s.sky.cycle).toBe(s.runtime.cycleStart);
    expect(live(QUIET).store.getState().events.live).toBe(false);
  });

  test("a first look mid-shower finds the nets that came in since it began", () => {
    // An hour and ten minutes in: the three it starts with and two more, the cap.
    expect(nets(live(Date.UTC(2026, 0, 1, 1, 10)).store)).toBe(5);
  });

  test("a net cast at the sky catches what is there", () => {
    const { store } = live();
    const caught = store.getState().events.cast(0);
    if (!caught) throw new Error("the cast was refused");
    const s = store.getState().events;
    expect(nets(store)).toBe(2);
    expect(s.sky.cells[0]).toBe(caught.token);
    expect(s.runtime.currencies[SHARDS]?.toNumber()).toBe(caught.shards);
    expect(s.runtime.stats.caught).toBe(caught.shards);
    expect(s.caughtEver).toBe(caught.shards);
    expect(store.getState().events.cast(0)).toBeNull();
  });

  test("no net, no cast; no shower, no cast", () => {
    const { store } = live();
    for (let i = 0; i < 3; i++) expect(store.getState().events.cast(i)).not.toBeNull();
    expect(store.getState().events.cast(3)).toBeNull();
    const quiet = live(QUIET).store;
    expect(quiet.getState().events.cast(0)).toBeNull();
  });

  test("an emptied sky brings the next wave, every token caught once", () => {
    const { store } = live();
    const caught: string[] = [];
    for (let cell = 0; cell < SKY_CELLS; cell++) {
      store.setState((s) => {
        s.events.runtime.currencies[NETS] = D(1);
      });
      const c = store.getState().events.cast(cell);
      if (!c) throw new Error(`cell ${cell} refused`);
      caught.push(c.token);
    }
    const s = store.getState().events;
    expect(s.sky.wave).toBe(2);
    expect(s.sky.cells.every((c) => c === null)).toBe(true);
    expect(s.runtime.stats.skies).toBe(1);
    for (const t of SKY) expect(caught.filter((x) => x === t.id)).toHaveLength(t.count);
  });

  test("the draw takes only what is still up", () => {
    const sky = freshSky(0);
    sky.cells = sky.cells.map((_, i) => (i < SKY_CELLS - 1 ? "glint" : null));
    // Eleven glints marked caught is more than a sky holds: what is left can only come from the other tokens.
    const left = leftIn(sky);
    expect(left.glint).toBeLessThan(0);
    const c = castAt(sky, SKY_CELLS - 1, [1, 2, 3, 4], 1);
    expect(c?.token).not.toBe("glint");
    expect(c?.cleared).toBe(true);
  });

  test("a wider net is bought with shards and catches more", () => {
    const { store } = live();
    store.setState((s) => {
      s.events.runtime.currencies[SHARDS] = D(1_000);
    });
    expect(store.getState().events.buyNode("spare-net")).toBe(false);
    expect(store.getState().events.buyNode("wide-net")).toBe(true);
    expect(store.getState().events.buyNode("wide-net")).toBe(true);
    const rt = store.getState().events.runtime;
    expect(rt.upgrades["wide-net"]).toBe(2);
    expect(rt.currencies[SHARDS]?.lt(1_000)).toBe(true);
    expect(showerMods(rt).catchMult).toBeCloseTo(1.5625);
    // With everything but the glints caught, the next cast is a glint: one shard, two through the wider net.
    const sky = freshSky(0);
    sky.cells = sky.cells.map(
      (_, i) => (["streak", "streak", "streak", "fireball", "pod", "dark"][i] ?? null) as never,
    );
    expect(castAt(sky, 6, [9, 9, 9, 9], showerMods(rt).catchMult)).toMatchObject({
      token: "glint",
      shards: 2,
    });
  });

  test("milestones pay seeds, sunlight and a free graft kit, once each", () => {
    const { store, clock } = live();
    store.getState().tick(1_000, clock.advance(1_000));
    store.setState((s) => {
      s.events.runtime.stats.caught = 120;
    });
    const seeds = store.getState().wallet[PREMIUM];
    const sun = store.getState().wallet[MAIN];
    for (const id of ["first-light", "steady-fall", "star-field"])
      expect(store.getState().events.claim(id)).toBe(true);
    expect(store.getState().events.claim("first-light")).toBe(false);
    expect(store.getState().events.claim("long-night")).toBe(false);
    const s = store.getState();
    expect(s.wallet[PREMIUM].eq(seeds.add(20))).toBe(true);
    expect(s.wallet[MAIN].gt(sun)).toBe(true);
    expect(s.summon.tokens[BOX]).toBe(1);
    // The free kit opens without spending a seed.
    expect(s.collection.pull(1)).toBe(true);
    expect(store.getState().wallet[PREMIUM].eq(seeds.add(20))).toBe(true);
    expect(store.getState().summon.tokens[BOX]).toBe(0);
    store.getState().collection.pull(1);
    expect(store.getState().wallet[PREMIUM].eq(seeds.add(20).sub(PULL_PRICE))).toBe(true);
  });

  test("planting while it falls brings nets in, up to the cap", () => {
    const { store, clock } = live();
    store.getState().events.cast(0);
    store.getState().events.cast(1);
    const first = GENERATORS[0];
    if (!first) throw new Error("no generators");
    store.getState().wallet.credit(MAIN, 1e12);
    for (let i = 0; i < 60; i++) store.getState().generators.buy(first.id);
    store.getState().tick(1_000, clock.advance(1_000));
    expect(nets(store)).toBe(2);
  });

  test("the next shower starts fresh and keeps the record; changing orbit leaves it be", () => {
    const { store, clock } = live();
    store.getState().events.cast(0);
    const ever = store.getState().events.caughtEver;
    store.getState().wallet.credit(MAIN, 1e15);
    expect(store.getState().prestige.ascend()).toBe(true);
    expect(store.getState().events.caughtEver).toBe(ever);
    expect(store.getState().events.sky.cells[0]).not.toBeNull();
    // Three days on: the next shower.
    const next = clock.advance(3 * 86_400_000);
    store.getState().tick(1_000, next);
    const s = store.getState().events;
    expect(s.runtime.cycleStart).toBe(resolveWindow(SHOWER.schedule, next).start);
    expect(s.runtime.stats.caught ?? 0).toBe(0);
    expect(s.sky.cells[0]).toBeNull();
    expect(s.caughtEver).toBe(ever);
  });
});
