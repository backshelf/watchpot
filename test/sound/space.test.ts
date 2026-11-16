// The space: a place on the screen read as a pan, a distance and an occlusion, and the listener's mode sent to the
// core. happy-dom's viewport is 1024 by 768 and lays nothing out, so an element's box is set by hand.
import { afterEach, describe, expect, test } from "bun:test";
import type { CorePort } from "../../src/sound/port";
import { decodeCommands, type SoundCommand, SPACE_MODE } from "../../src/sound/protocol";
import { createSpace } from "../../src/sound/space";

function fakePort() {
  let up = false;
  const sent: SoundCommand[] = [];
  const port: CorePort = {
    whenUp: (fn) => fn(),
    listen: () => () => {},
    rate: () => 48000,
    time: () => 0,
    frame: () => 0,
    send(records) {
      if (up) sent.push(...decodeCommands(records));
    },
    up: () => up,
    frames: () => 0,
    sample: () => 0,
  };
  return {
    port,
    sent,
    setUp: (value: boolean) => {
      up = value;
    },
  };
}

const W = window.innerWidth;
const H = window.innerHeight;

/** An element in the document whose box is centred on `(x, y)`. */
function boxAt(x: number, y: number, size = 20): HTMLElement {
  const el = document.createElement("div");
  document.body.append(el);
  el.getBoundingClientRect = () =>
    ({
      left: x - size / 2,
      top: y - size / 2,
      right: x + size / 2,
      bottom: y + size / 2,
      width: size,
      height: size,
      x: x - size / 2,
      y: y - size / 2,
    }) as DOMRect;
  return el;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the space", () => {
  test("a point at the left edge pans negative, the centre pans 0, the right edge positive", () => {
    const { api } = createSpace(fakePort().port);
    const left = api.resolve({ x: 0, y: H / 2 });
    expect(left.pan).toBeLessThan(0);
    expect(left.pan).toBeCloseTo(-0.7, 5);
    expect(api.resolve({ x: W / 2, y: H / 2 })).toEqual({ pan: 0, distance: 0, occlusion: 0 });
    expect(api.resolve({ x: W, y: H / 2 }).pan).toBeCloseTo(0.7, 5);
    expect(createSpace(fakePort().port, { spread: 1 }).api.resolve({ x: 0, y: 0 }).pan).toBeCloseTo(-1, 5);
  });

  test("the distance is 0 in the central third, rises to 1 at the edge, and is 1 off the screen", () => {
    const { api } = createSpace(fakePort().port);
    expect(api.resolve({ x: W * 0.6, y: H * 0.4 }).distance).toBe(0);
    const between = api.resolve({ x: W * 0.8, y: H / 2 }).distance;
    expect(between).toBeGreaterThan(0);
    expect(between).toBeLessThan(1);
    expect(api.resolve({ x: W, y: H / 2 }).distance).toBeCloseTo(1, 5);
    expect(api.resolve({ x: W / 2, y: 0 }).distance).toBeCloseTo(1, 5);
    expect(api.resolve(boxAt(W / 2, H + 400)).distance).toBe(1);
  });

  test("an element is read at its centre, now, and occluded by what `place` said of it or an ancestor", () => {
    const { api } = createSpace(fakePort().port);
    const el = boxAt(0, H / 2);
    expect(api.resolve(el).pan).toBeCloseTo(-0.7, 5);
    // Moved: read again, never cached.
    el.getBoundingClientRect = () =>
      ({
        left: W - 10,
        top: H / 2 - 10,
        right: W + 10,
        bottom: H / 2 + 10,
        width: 20,
        height: 20,
      }) as DOMRect;
    expect(api.resolve(el).pan).toBeCloseTo(0.7, 5);

    const panel = document.createElement("section");
    document.body.append(panel);
    const inner = boxAt(W / 2, H / 2);
    panel.append(inner);
    api.place(panel, { occluded: 0.6 });
    expect(api.resolve(inner).occlusion).toBeCloseTo(0.6, 5);
    api.place(inner, { occluded: 2 });
    expect(api.resolve(inner).occlusion).toBe(1);
    api.place(inner, {});
    api.place(panel, {});
    expect(api.resolve(inner).occlusion).toBe(0);
  });

  test("an element no longer in the document is at the centre", () => {
    const { api } = createSpace(fakePort().port);
    const el = boxAt(0, 0);
    el.remove();
    expect(api.resolve(el)).toEqual({ pan: 0, distance: 0, occlusion: 0 });
  });

  test("headphones mode is sent, and sent again each time the core comes up", () => {
    const fake = fakePort();
    const space = createSpace(fake.port);
    space.api.listener({ mode: "headphones" }); // before the core is up: remembered
    expect(fake.sent).toHaveLength(0);
    fake.setUp(true);
    space.boot();
    expect(fake.sent).toEqual([expect.objectContaining({ op: "SPACE_SET", mode: SPACE_MODE.headphones })]);
    space.api.listener({ mode: "speakers" });
    expect(fake.sent.at(-1)).toMatchObject({ op: "SPACE_SET", mode: SPACE_MODE.speakers });
  });
});
