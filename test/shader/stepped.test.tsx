import { afterEach, beforeEach, expect, test } from "bun:test";
import { act, render } from "@testing-library/react";
import { StrictMode, useRef } from "react";
import {
  pinShaderClock,
  type ShaderHandle,
  type SteppedFrameOptions,
  type Uniforms,
  useSteppedFrame,
} from "watchpot/shader";
import { installFrames } from "./fakeGl";

/** The display's frames, run by hand: `run(n, ms)` calls every waiting callback `n` times, `ms` apart. */
let frames: ReturnType<typeof installFrames>;
let now = 0;
beforeEach(() => {
  frames = installFrames();
  now = 0;
});
afterEach(() => frames.restore());
const run = (n: number, ms: number) => {
  for (let i = 0; i < n; i++) {
    now += ms;
    frames.flush(now);
  }
};

/** A canvas's handle that only keeps what it is pushed: the clock each frame was called with. */
function Rig({ options, seen }: { options: SteppedFrameOptions; seen: { pushes: Uniforms[] } }) {
  const handle = useRef<ShaderHandle>({
    canvas: null,
    setUniforms: (u) => void seen.pushes.push(u),
    frame: () => {},
    pin: () => {},
  });
  useSteppedFrame(handle, (seconds) => ({ u_clock: seconds }), options);
  return null;
}
const clockOf = (seen: { pushes: Uniforms[] }) => seen.pushes.at(-1)?.u_clock as number;

test("a stepped frame draws at its rate, not the display's, and its clock keeps the display's time", () => {
  const seen = { pushes: [] as Uniforms[] };
  render(<Rig options={{ fps: 20 }} seen={seen} />);
  expect(seen.pushes).toHaveLength(1); // the first frame, at once
  act(() => run(120, 1000 / 60)); // two seconds of a 60 Hz display
  expect(seen.pushes.length).toBeGreaterThanOrEqual(38);
  expect(seen.pushes.length).toBeLessThanOrEqual(42);
  expect(clockOf(seen)).toBeCloseTo(2, 0);
});

test("under StrictMode one loop runs, not two, and it ends with the surface", () => {
  const seen = { pushes: [] as Uniforms[] };
  const view = render(
    <StrictMode>
      <Rig options={{ fps: 20 }} seen={seen} />
    </StrictMode>,
  );
  expect(frames.pending()).toBe(1);
  const mounted = seen.pushes.length;
  act(() => run(120, 1000 / 60));
  expect(seen.pushes.length - mounted).toBeLessThanOrEqual(42);
  view.unmount();
  expect(frames.pending()).toBe(0);
});

test("a tab that was away does not jump the clock", () => {
  const seen = { pushes: [] as Uniforms[] };
  render(<Rig options={{ fps: 20 }} seen={seen} />);
  act(() => run(6, 1000 / 60));
  const before = clockOf(seen);
  act(() => run(1, 60_000));
  expect(clockOf(seen) - before).toBeLessThanOrEqual(0.25);
});

test("stopped, it holds the chosen frame and asks for no more; pinned, it holds the pin", () => {
  const seen = { pushes: [] as Uniforms[] };
  const view = render(<Rig options={{ fps: 20, running: false, at: 9 }} seen={seen} />);
  act(() => run(30, 1000 / 60));
  expect(seen.pushes.length).toBeGreaterThan(0);
  expect(seen.pushes.every((u) => u.u_clock === 9)).toBe(true);
  expect(frames.pending()).toBe(0);
  view.rerender(<Rig options={{ fps: 20, pin: () => 4 }} seen={seen} />);
  act(() => run(30, 1000 / 60));
  expect(clockOf(seen)).toBe(4);
});

test("not ready, nothing is pushed", () => {
  const seen = { pushes: [] as Uniforms[] };
  render(<Rig options={{ fps: 20, ready: false }} seen={seen} />);
  act(() => run(30, 1000 / 60));
  expect(seen.pushes).toHaveLength(0);
  expect(frames.pending()).toBe(0);
});

test("the page's pin holds a stepped surface too, its own pin wins, and the clock runs on from where it was", () => {
  const seen = { pushes: [] as Uniforms[] };
  let own: number | null = null;
  render(<Rig options={{ fps: 20, pin: () => own }} seen={seen} />);
  act(() => run(60, 1000 / 60));
  const before = clockOf(seen);
  try {
    act(() => pinShaderClock(7));
    act(() => run(60, 1000 / 60));
    expect(clockOf(seen)).toBe(7);
    own = 3;
    act(() => run(6, 1000 / 60));
    expect(clockOf(seen)).toBe(3);
  } finally {
    own = null;
    act(() => pinShaderClock(null));
  }
  act(() => run(6, 1000 / 60));
  expect(clockOf(seen)).toBeGreaterThan(before);
  expect(clockOf(seen)).toBeLessThan(before + 0.2);
});
