import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { render, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { freshStore } from "watchpot/test";
import { type PageRuntimeOptions, useGameRuntime, usePageRuntime } from "../../src/react";
import { toy } from "../core/toy";

/** A sound engine that only counts what the runtime asks of it. */
function fakeSound() {
  const seen = { armed: 0, disarmed: 0, muted: [] as boolean[] };
  return {
    seen,
    engine: {
      armUnlock: () => {
        seen.armed++;
        return () => {
          seen.disarmed++;
        };
      },
      setMuted: (value: boolean) => void seen.muted.push(value),
    },
  };
}

const html = () => document.documentElement.dataset;

function Page({ options, report }: { options: PageRuntimeOptions; report: (reduced: boolean) => void }) {
  report(usePageRuntime(options).reduced);
  return null;
}

afterEach(() => {
  delete html().motion;
  delete html().scheme;
});

describe("usePageRuntime", () => {
  test("writes the motion and the scheme on <html>, arms and mutes the sound, and undoes all of it", () => {
    const sound = fakeSound();
    const seen: boolean[] = [];
    const report = (r: boolean) => void seen.push(r);
    const view = render(
      <StrictMode>
        <Page
          options={{ motion: "reduced", scheme: "dark", sound: { engine: sound.engine, on: false } }}
          report={report}
        />
      </StrictMode>,
    );
    expect(seen.at(-1)).toBe(true);
    expect(html().motion).toBe("reduced");
    expect(html().scheme).toBe("dark");
    expect(sound.seen.muted.at(-1)).toBe(true);
    expect(sound.seen.armed - sound.seen.disarmed).toBe(1);

    view.rerender(
      <StrictMode>
        <Page
          options={{ motion: "full", scheme: "light", sound: { engine: sound.engine, on: true } }}
          report={report}
        />
      </StrictMode>,
    );
    expect(seen.at(-1)).toBe(false);
    expect(html().motion).toBe("full");
    expect(html().scheme).toBe("light");
    expect(sound.seen.muted.at(-1)).toBe(false);

    view.unmount();
    expect(html().motion).toBeUndefined();
    expect(html().scheme).toBeUndefined();
    expect(sound.seen.armed).toBe(sound.seen.disarmed);
    // A shell that goes leaves the engine unmuted for whatever mounts next.
    expect(sound.seen.muted.at(-1)).toBe(false);
  });

  test("data-motion is the resolved motion: the OS answers for the default, never over the player's choice", () => {
    const os = spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: query.includes("reduced-motion"),
          media: query,
          addEventListener() {},
          removeEventListener() {},
        }) as unknown as MediaQueryList,
    );
    try {
      const seen: boolean[] = [];
      const report = (r: boolean) => void seen.push(r);
      const view = render(
        <StrictMode>
          <Page options={{}} report={report} />
        </StrictMode>,
      );
      expect(seen.at(-1)).toBe(true);
      expect(html().motion).toBe("reduced");
      view.rerender(
        <StrictMode>
          <Page options={{ motion: "full" }} report={report} />
        </StrictMode>,
      );
      expect(seen.at(-1)).toBe(false);
      expect(html().motion).toBe("full");
      view.unmount();
    } finally {
      os.mockRestore();
    }
  });
});

describe("useGameRuntime", () => {
  test("is the clock and the page's runtime together: the same answers, and the tab its own", () => {
    const { store } = freshStore(toy);
    const sound = fakeSound();
    const view = renderHook(() =>
      useGameRuntime(store, {
        motion: "reduced",
        scheme: "dark",
        sound: { engine: sound.engine, on: false },
      }),
    );
    expect(view.result.current).toEqual({ reduced: true, taken: false });
    expect(html().motion).toBe("reduced");
    expect(html().scheme).toBe("dark");
    expect(sound.seen.muted.at(-1)).toBe(true);
    expect(() => view.unmount()).not.toThrow();
    expect(html().motion).toBeUndefined();
  });

  test("motion and scheme default to system", () => {
    const { store } = freshStore(toy);
    const view = renderHook(() => useGameRuntime(store));
    expect(view.result.current.taken).toBe(false);
    expect(html().motion).toBeDefined();
    expect(html().scheme).toBeDefined();
    view.unmount();
  });
});
