import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode, StrictMode } from "react";
import { type AudioTap, type ShaderHandle, type Uniforms, useAudioUniforms } from "../../src/shader";
import { installFrames } from "./fakeGl";

/** A handle that keeps what it was given, call by call. */
function fakeHandle() {
  const writes: Uniforms[] = [];
  const handle: ShaderHandle = {
    canvas: null,
    setUniforms: (values: Uniforms) => void writes.push(values),
    frame: () => undefined,
  } as unknown as ShaderHandle;
  return { ref: { current: handle }, writes };
}

const strict = ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children);

describe("useAudioUniforms", () => {
  let frames: ReturnType<typeof installFrames>;
  beforeEach(() => {
    frames = installFrames();
  });
  afterEach(() => frames.restore());

  test("a tap's figures reach the handle each frame, under the default names or the ones given", () => {
    let figures = { level: 0.5, bass: 0.25, mid: 0.75, high: 0.125, flux: 1 };
    const tap: AudioTap = { read: () => figures };
    const { ref, writes } = fakeHandle();
    const { unmount } = renderHook(() => useAudioUniforms(ref, tap, { flux: "u_hit" }, false), {
      wrapper: strict,
    });
    act(() => frames.flush(16));
    expect(writes.at(-1)).toEqual({ u_level: 0.5, u_bass: 0.25, u_mid: 0.75, u_high: 0.125, u_hit: 1 });
    figures = { level: 0.1, bass: 0, mid: 0, high: 0, flux: 0 };
    act(() => frames.flush(32));
    expect(writes.at(-1)).toMatchObject({ u_level: 0.1, u_hit: 0 });
    // One loop runs, StrictMode's second mount included.
    expect(frames.pending()).toBe(1);
    unmount();
    expect(frames.pending()).toBe(0);
  });

  test("reduced motion writes zeros once and runs no loop", () => {
    const tap: AudioTap = { read: () => ({ level: 1, bass: 1, mid: 1, high: 1, flux: 1 }) };
    const { ref, writes } = fakeHandle();
    const { rerender } = renderHook(() => useAudioUniforms(ref, tap, undefined, true), { wrapper: strict });
    rerender();
    act(() => frames.flush(16));
    expect(writes).toEqual([{ u_level: 0, u_bass: 0, u_mid: 0, u_high: 0, u_flux: 0 }]);
    expect(frames.pending()).toBe(0);
  });

  test("the page's reduced-motion preference counts when the game passes none", () => {
    const original = globalThis.matchMedia;
    globalThis.matchMedia = ((query: string) => ({
      matches: query.includes("reduce"),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof matchMedia;
    try {
      const { ref, writes } = fakeHandle();
      renderHook(() =>
        useAudioUniforms(ref, { read: () => ({ level: 1, bass: 1, mid: 1, high: 1, flux: 1 }) }),
      );
      act(() => frames.flush(16));
      expect(writes).toEqual([{ u_level: 0, u_bass: 0, u_mid: 0, u_high: 0, u_flux: 0 }]);
    } finally {
      globalThis.matchMedia = original;
    }
  });
});
