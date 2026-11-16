import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { act, render, screen } from "@testing-library/react";
import { StrictMode, useLayoutEffect, useRef } from "react";
import { useArrived, useClosestAttribute, useMediaQuery } from "watchpot/ui";

function Leaf({ name }: { name: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const value = useClosestAttribute(ref, name);
  return (
    <p ref={ref} data-testid="leaf">
      {value ?? "none"}
    </p>
  );
}

describe("useClosestAttribute", () => {
  test("reads the nearest ancestor that carries it, and follows it when it changes", async () => {
    render(
      <StrictMode>
        <div data-mode="outer">
          <div data-mode="inner" data-testid="host">
            <Leaf name="data-mode" />
          </div>
        </div>
      </StrictMode>,
    );
    expect(screen.getByTestId("leaf").textContent).toBe("inner");
    await act(async () => {
      screen.getByTestId("host").setAttribute("data-mode", "moved");
      await Promise.resolve();
    });
    expect(screen.getByTestId("leaf").textContent).toBe("moved");
  });

  test("is null where no ancestor has it, and stops watching when it unmounts", async () => {
    const view = render(
      <div data-testid="host">
        <Leaf name="data-absent" />
      </div>,
    );
    expect(screen.getByTestId("leaf").textContent).toBe("none");
    view.rerender(
      <div data-testid="host" data-tier="2">
        <Leaf name="data-tier" />
      </div>,
    );
    expect(screen.getByTestId("leaf").textContent).toBe("2");
    const host = screen.getByTestId("host");
    view.unmount();
    // A change after the unmount reaches nothing: no warning about a state set on an unmounted leaf.
    await act(async () => {
      host.setAttribute("data-tier", "3");
      await Promise.resolve();
    });
  });
});

/** A `matchMedia` the test moves: every list made for a query hears `set(query, matches)`. */
function fakeMedia() {
  const state = new Map<string, boolean>();
  const listeners = new Map<string, Set<() => void>>();
  const real = globalThis.matchMedia;
  globalThis.matchMedia = ((query: string) => ({
    get matches() {
      return state.get(query) ?? false;
    },
    media: query,
    addEventListener: (_: string, fn: () => void) => {
      if (!listeners.has(query)) listeners.set(query, new Set());
      listeners.get(query)?.add(fn);
    },
    removeEventListener: (_: string, fn: () => void) => void listeners.get(query)?.delete(fn),
  })) as unknown as typeof matchMedia;
  return {
    set(query: string, matches: boolean) {
      state.set(query, matches);
      for (const fn of [...(listeners.get(query) ?? [])]) fn();
    },
    listening: (query: string) => listeners.get(query)?.size ?? 0,
    restore: () => {
      globalThis.matchMedia = real;
    },
  };
}

function Narrow({ query }: { query: string }) {
  return <p data-testid="narrow">{useMediaQuery(query) ? "yes" : "no"}</p>;
}

describe("useMediaQuery", () => {
  let media: ReturnType<typeof fakeMedia> | null = null;
  afterEach(() => {
    media?.restore();
    media = null;
  });

  test("answers the query now, follows it as it changes, and stops listening when it unmounts", () => {
    media = fakeMedia();
    const query = "(max-width: 600px)";
    media.set(query, true);
    const view = render(
      <StrictMode>
        <Narrow query={query} />
      </StrictMode>,
    );
    expect(screen.getByTestId("narrow").textContent).toBe("yes");
    expect(media.listening(query)).toBe(1);
    act(() => media?.set(query, false));
    expect(screen.getByTestId("narrow").textContent).toBe("no");
    view.unmount();
    expect(media.listening(query)).toBe(0);
  });

  test("is false where there is no matchMedia", () => {
    const real = globalThis.matchMedia;
    // biome-ignore lint/suspicious/noExplicitAny: taking a global away for the test
    (globalThis as any).matchMedia = undefined;
    try {
      render(<Narrow query="(min-width: 1px)" />);
      expect(screen.getByTestId("narrow").textContent).toBe("no");
    } finally {
      globalThis.matchMedia = real;
    }
  });
});

/** A thing that says whether it is arriving, and what its first layout effect saw (the frame it is painted in). */
function Thing({ shown, painted }: { shown: boolean; painted: string[] }) {
  const arriving = useArrived(shown, 700);
  const ref = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    if (shown) painted.push(ref.current?.dataset.arriving ?? "no");
  });
  if (!shown) return null;
  return (
    <p ref={ref} data-testid="thing" data-arriving={arriving ? "yes" : undefined}>
      thing
    </p>
  );
}

describe("useArrived", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  const page = (shown: boolean, painted: string[] = []) => (
    <StrictMode>
      <Thing shown={shown} painted={painted} />
    </StrictMode>
  );
  const arriving = () => screen.getByTestId("thing").dataset.arriving === "yes";

  test("what was there at the mount never arrives", () => {
    render(page(true));
    expect(arriving()).toBe(false);
    act(() => jest.advanceTimersByTime(1000));
    expect(arriving()).toBe(false);
  });

  test("what turns up after the mount is arriving before it is painted, for ms, and again when it comes back", () => {
    const painted: string[] = [];
    const view = render(page(false, painted));
    view.rerender(page(true, painted));
    expect(arriving()).toBe(true);
    // The commit that could be painted (the last layout pass of the update) already carried the flag.
    expect(painted.at(-1)).toBe("yes");
    act(() => jest.advanceTimersByTime(699));
    expect(arriving()).toBe(true);
    act(() => jest.advanceTimersByTime(1));
    expect(arriving()).toBe(false);
    view.rerender(page(false, painted));
    view.rerender(page(true, painted));
    expect(arriving()).toBe(true);
    view.unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});
