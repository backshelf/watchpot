import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, render, screen } from "@testing-library/react";
import { createRef } from "react";
import {
  createShaderScheduler,
  HEAD_LINES,
  pinShaderClock,
  ShaderCanvas,
  type ShaderHandle,
  ShaderPool,
  type ShaderSchedulerDeps,
  ShaderTile,
} from "watchpot/shader";
import { installFakeGl, installFrames } from "./fakeGl";

const FRAGMENT = `uniform vec4 u_tint;
uniform float u_level;
void main() { fragColor = u_tint * u_level; }`;

let gl: ReturnType<typeof installFakeGl>;
let frames: ReturnType<typeof installFrames>;

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("ShaderCanvas", () => {
  beforeEach(() => {
    gl = installFakeGl();
    frames = installFrames();
  });
  afterEach(() => {
    gl.restore();
    frames.restore();
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  });

  test("compiles once with the head, draws on mount, and loops while it can be seen", () => {
    render(<ShaderCanvas fragment={FRAGMENT} uniforms={{ u_tint: "#ff000080", u_level: 0.5 }} />);
    expect(gl.counts.programs).toBe(1);
    expect(gl.sources.some((s) => s.startsWith("#version 300 es") && s.endsWith(FRAGMENT))).toBe(true);
    expect(gl.counts.draws).toBe(1);
    expect(gl.last("u_tint")).toEqual([1, 0, 0, 128 / 255]);
    act(() => frames.flush(16));
    act(() => frames.flush(32));
    expect(gl.counts.draws).toBe(3);
    expect(gl.last("u_time")?.[0]).toBeCloseTo(0.016, 5);
  });

  test("a still canvas redraws when a uniform changes by value, not when it is merely a new object", () => {
    const { rerender } = render(<ShaderCanvas fragment={FRAGMENT} time={1} uniforms={{ u_level: 0.5 }} />);
    expect(frames.pending()).toBe(0);
    const drawn = gl.counts.draws;
    rerender(<ShaderCanvas fragment={FRAGMENT} time={1} uniforms={{ u_level: 0.5 }} />);
    expect(gl.counts.draws).toBe(drawn);
    rerender(<ShaderCanvas fragment={FRAGMENT} time={1} uniforms={{ u_level: 0.75 }} />);
    expect(gl.counts.draws).toBe(drawn + 1);
    expect(gl.last("u_level")).toEqual([0.75]);
    expect(gl.counts.programs).toBe(1);
  });

  test("the handle pushes uniforms with no render and draws a frame on demand", () => {
    const ref = createRef<ShaderHandle>();
    render(<ShaderCanvas ref={ref} fragment={FRAGMENT} paused uniforms={{ u_level: 0 }} />);
    const drawn = gl.counts.draws;
    act(() => ref.current?.setUniforms({ u_level: 0.25 }));
    expect(gl.last("u_level")).toEqual([0.25]);
    act(() => ref.current?.frame());
    expect(gl.counts.draws).toBe(drawn + 2);
    expect(ref.current?.canvas).toBeInstanceOf(HTMLCanvasElement);
  });

  test("a pushed uniform outlives a render: the props replace only the names they pass, and draw nothing new", () => {
    const ref = createRef<ShaderHandle>();
    const { rerender } = render(
      <ShaderCanvas ref={ref} fragment={FRAGMENT} paused uniforms={{ u_level: 0.5 }} />,
    );
    act(() => ref.current?.setUniforms({ u_tint: "#00ff00ff" }));
    const drawn = gl.counts.draws;
    rerender(<ShaderCanvas ref={ref} fragment={FRAGMENT} paused uniforms={{ u_level: 0.5 }} />);
    expect(gl.counts.draws).toBe(drawn);
    gl.uniforms.length = 0;
    rerender(<ShaderCanvas ref={ref} fragment={FRAGMENT} paused uniforms={{ u_level: 0.75 }} />);
    expect(gl.counts.draws).toBe(drawn + 1);
    expect(gl.last("u_level")).toEqual([0.75]);
    expect(gl.last("u_tint")).toEqual([0, 1, 0, 1]);
  });

  test("an fps cap draws that often and no more, and the clock keeps the display's time", () => {
    render(<ShaderCanvas fragment={FRAGMENT} fps={20} />);
    const drawn = gl.counts.draws;
    for (let i = 1; i <= 120; i++) act(() => frames.flush((i * 1000) / 60)); // two seconds at 60 Hz
    const capped = gl.counts.draws - drawn;
    expect(capped).toBeGreaterThanOrEqual(38);
    expect(capped).toBeLessThanOrEqual(42);
    expect(gl.last("u_time")?.[0]).toBeGreaterThan(1.9);
  });

  test("a pinned clock holds one frame at the pinned time, then runs on from where it was", () => {
    const ref = createRef<ShaderHandle>();
    render(<ShaderCanvas ref={ref} fragment={FRAGMENT} />);
    act(() => frames.flush(16));
    act(() => frames.flush(32));
    act(() => ref.current?.pin(2.5));
    expect(gl.last("u_time")).toEqual([2.5]);
    expect(frames.pending()).toBe(0);
    act(() => ref.current?.pin(null));
    expect(gl.last("u_time")?.[0]).toBeCloseTo(0.016, 5);
    act(() => frames.flush(1000));
    act(() => frames.flush(1016));
    expect(gl.last("u_time")?.[0]).toBeCloseTo(0.032, 5);
  });

  test("the page's pin holds every canvas, a driven one too, and a canvas's own pin wins", () => {
    const ref = createRef<ShaderHandle>();
    render(
      <>
        <ShaderCanvas fragment={FRAGMENT} time={1} uniforms={{ u_level: 1 }} />
        <ShaderCanvas ref={ref} fragment={FRAGMENT} uniforms={{ u_level: 2 }} />
      </>,
    );
    try {
      act(() => ref.current?.pin(9));
      const before = gl.counts.draws;
      act(() => pinShaderClock(4));
      expect(gl.counts.draws).toBe(before + 2);
      const times = gl.uniforms.filter((u) => u.name === "u_time").slice(-2);
      expect(times.map((u) => u.values[0]).sort()).toEqual([4, 9]);
      expect(frames.pending()).toBe(0);
    } finally {
      act(() => pinShaderClock(null));
    }
  });

  test("stops when the tab is hidden and starts again when it shows", () => {
    render(<ShaderCanvas fragment={FRAGMENT} />);
    act(() => frames.flush(16));
    const drawn = gl.counts.draws;
    act(() => setHidden(true));
    expect(frames.pending()).toBe(0);
    act(() => frames.flush(32));
    expect(gl.counts.draws).toBe(drawn);
    act(() => setHidden(false));
    act(() => frames.flush(48));
    expect(gl.counts.draws).toBe(drawn + 1);
  });

  test("under reduced motion draws one frame at the fixed time and holds", () => {
    render(<ShaderCanvas fragment={FRAGMENT} reduced reducedTime={6} />);
    expect(gl.counts.draws).toBe(1);
    expect(gl.last("u_time")).toEqual([6]);
    expect(frames.pending()).toBe(0);
  });

  test("rebuilds the program and redraws after a lost context is restored", () => {
    const { container } = render(<ShaderCanvas fragment={FRAGMENT} paused />);
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    const lost = new Event("webglcontextlost", { cancelable: true });
    act(() => {
      canvas.dispatchEvent(lost);
    });
    expect(lost.defaultPrevented).toBe(true);
    const drawn = gl.counts.draws;
    act(() => {
      canvas.dispatchEvent(new Event("webglcontextrestored"));
    });
    expect(gl.counts.programs).toBe(2);
    expect(gl.counts.draws).toBe(drawn + 1);
  });

  test("a failed compile shows the still and reports the log at the fragment's line", () => {
    gl.status.compile = false;
    gl.status.log = `ERROR: 0:${HEAD_LINES + 3}: 'u_nope' : undeclared identifier`;
    const onError = mock((_: string) => {});
    render(<ShaderCanvas fragment={FRAGMENT} still={<div>Still</div>} onError={onError} />);
    expect(screen.getByText("Still")).toBeInTheDocument();
    expect(document.querySelector("canvas")).toBeNull();
    expect(onError).toHaveBeenCalledWith("ERROR: 0:3: 'u_nope' : undeclared identifier");
  });
});

describe("ShaderCanvas without WebGL2", () => {
  test("shows the still and says why", () => {
    const off = installFakeGl({ webgl2: false });
    try {
      const onError = mock((_: string) => {});
      render(<ShaderCanvas fragment={FRAGMENT} still={<div>Still</div>} onError={onError} />);
      expect(screen.getByText("Still")).toBeInTheDocument();
      expect(onError).toHaveBeenCalledWith("WebGL2 is unavailable");
    } finally {
      off.restore();
    }
  });
});

describe("ShaderPool", () => {
  /** A scheduler whose frames the test runs and whose tiles are all on screen. */
  function scheduler() {
    let queue: ((now: number) => void)[] = [];
    const deps: ShaderSchedulerDeps = {
      raf: (cb) => queue.push(cb),
      caf: () => {
        queue = [];
      },
      observe: (_el, onChange) => {
        onChange(true);
        return () => {};
      },
      hidden: () => false,
      onHidden: () => () => {},
      reduced: () => false,
    };
    return {
      s: createShaderScheduler(deps, { maxLive: 4 }),
      frame(now: number) {
        const run = queue;
        queue = [];
        for (const cb of run) cb(now);
      },
    };
  }

  test("many tiles share one context and one program per fragment", () => {
    const gl2 = installFakeGl();
    try {
      const sch = scheduler();
      render(
        <ShaderPool scheduler={sch.s}>
          <ShaderTile fragment={FRAGMENT} uniforms={{ u_level: 1 }} />
          <ShaderTile fragment={FRAGMENT} uniforms={{ u_level: 0.5 }} />
          <ShaderTile fragment={FRAGMENT} paused />
        </ShaderPool>,
      );
      act(() => sch.frame(16));
      expect(gl2.counts.webgl2).toBe(1);
      expect(gl2.counts.programs).toBe(1);
      expect(gl2.counts.draws).toBe(3);
      act(() => sch.frame(32));
      // The paused tile holds; the two live ones draw again.
      expect(gl2.counts.draws).toBe(5);
    } finally {
      gl2.restore();
    }
  });

  test("a tile whose fragment fails shows its still", () => {
    const gl2 = installFakeGl();
    gl2.status.compile = false;
    try {
      const sch = scheduler();
      const onError = mock((_: string) => {});
      render(
        <ShaderPool scheduler={sch.s}>
          <ShaderTile fragment={FRAGMENT} still={<span>Plain</span>} onError={onError} />
        </ShaderPool>,
      );
      act(() => sch.frame(16));
      expect(screen.getByText("Plain")).toBeInTheDocument();
      expect(onError).toHaveBeenCalledTimes(1);
    } finally {
      gl2.restore();
    }
  });
});
