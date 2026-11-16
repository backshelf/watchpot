import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { act, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import {
  createSampler,
  frameRate,
  SampleProvider,
  type SamplerOptions,
  sameShallow,
  useSample,
  useSampled,
} from "../../src/react/sample";

interface State {
  n: number;
  noise: number;
}

/** A store as the sampler reads it: a state the test moves by hand. */
function fakeStore(n: number) {
  const box: { state: State } = { state: { n, noise: 0 } };
  return { box, getState: () => box.state };
}
type Store = ReturnType<typeof fakeStore>;

const advance = (ms: number) => act(() => jest.advanceTimersByTime(ms));

let renders = 0;
let seen: unknown;

function Reader<T>({ store, options }: { store: Store; options: SamplerOptions<State, T> }) {
  const v = useSampled(store, options);
  renders++;
  seen = v;
  return <p>{JSON.stringify(v)}</p>;
}

const figures = createSampler({ initial: { n: -1 }, sample: (s: State) => ({ n: s.n }) });
function Figure({ id }: { id: string }) {
  return <p data-testid={id}>{useSample(figures).n}</p>;
}

describe("useSampled", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    renders = 0;
    seen = undefined;
  });
  afterEach(() => jest.useRealTimers());

  test("reads at mount, then only on the interval, and re-renders only when the snapshot changes", () => {
    const store = fakeStore(1);
    let reads = 0;
    const options: SamplerOptions<State, { n: number }> = {
      initial: { n: 0 },
      everyMs: 250,
      sample: (s) => {
        reads++;
        return { n: s.n };
      },
    };
    render(
      <StrictMode>
        <Reader store={store} options={options} />
      </StrictMode>,
    );
    expect(seen).toEqual({ n: 1 });
    const afterMount = renders;
    const readsAfterMount = reads;

    // The state moves fast (a field the sample ignores): no read before the interval, no render on a same snapshot.
    store.box.state = { n: 1, noise: 5 };
    advance(249);
    expect(reads).toBe(readsAfterMount);
    advance(1);
    expect(reads).toBe(readsAfterMount + 1);
    expect(renders).toBe(afterMount);

    store.box.state = { n: 7, noise: 6 };
    advance(250);
    expect(seen).toEqual({ n: 7 });
    expect(renders).toBeGreaterThan(afterMount);
  });

  test("hands the sample its last snapshot, so a trail is carried and capped by the caller", () => {
    const store = fakeStore(0);
    const options: SamplerOptions<State, readonly number[]> = {
      initial: [],
      everyMs: 100,
      sample: (s, { prev }) => [...prev.slice(-2), s.n],
    };
    render(<Reader store={store} options={options} />);
    for (const n of [1, 2, 3]) {
      store.box.state = { n, noise: 0 };
      advance(100);
    }
    expect(seen).toEqual([1, 2, 3]);
  });

  test("stops reading on unmount", () => {
    const store = fakeStore(0);
    let reads = 0;
    const options: SamplerOptions<State, number> = { initial: 0, sample: () => ++reads };
    const { unmount } = render(<Reader store={store} options={options} />);
    unmount();
    const at = reads;
    advance(2000);
    expect(reads).toBe(at);
  });

  test("counts frames between reads when asked", () => {
    const store = fakeStore(0);
    let t = 0;
    const raf = globalThis.requestAnimationFrame;
    const caf = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
      setTimeout(() => cb(t), 20) as unknown as number) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as typeof cancelAnimationFrame;
    try {
      const options: SamplerOptions<State, number> = {
        initial: 0,
        fps: true,
        everyMs: 1000,
        now: () => t,
        sample: (_s, ctx) => ctx.fps,
      };
      render(<Reader store={store} options={options} />);
      t = 1000;
      advance(1000);
      // A frame every 20ms over a second: 50, or 49 when the read lands before the frame due at the same instant.
      expect(seen).toBeGreaterThanOrEqual(49);
      expect(seen).toBeLessThanOrEqual(50);
    } finally {
      globalThis.requestAnimationFrame = raf;
      globalThis.cancelAnimationFrame = caf;
    }
  });
});

describe("createSampler", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("one provider feeds every reader; outside it a reader holds the initial snapshot", () => {
    const store = fakeStore(4);
    render(
      <>
        <SampleProvider sampler={figures} store={store}>
          <Figure id="a" />
          <Figure id="b" />
        </SampleProvider>
        <Figure id="out" />
      </>,
    );
    expect(screen.getByTestId("a").textContent).toBe("4");
    expect(screen.getByTestId("b").textContent).toBe("4");
    expect(screen.getByTestId("out").textContent).toBe("-1");
  });
});

describe("the pure parts", () => {
  test("frameRate is whole and 0 over no time", () => {
    expect(frameRate(30, 500)).toBe(60);
    expect(frameRate(10, 0)).toBe(0);
    expect(frameRate(0, 250)).toBe(0);
  });

  test("sameShallow compares one level down, arrays entry by entry", () => {
    expect(sameShallow({ a: 1, t: [1, 2] }, { a: 1, t: [1, 2] })).toBe(true);
    expect(sameShallow({ a: 1, t: [1, 2] }, { a: 1, t: [1, 3] })).toBe(false);
    expect(sameShallow({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameShallow([1, 2], [1, 2])).toBe(true);
    expect(sameShallow({ o: { x: 1 } }, { o: { x: 1 } })).toBe(false);
    expect(sameShallow(Number.NaN, Number.NaN)).toBe(true);
  });
});
