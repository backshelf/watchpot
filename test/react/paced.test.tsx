import { afterEach, beforeEach, describe, expect, jest, spyOn, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import type { RuntimeStore } from "../../src/react";
import {
  createPacedView,
  createRuntimeHooks,
  IdleStoreProvider,
  pacedView,
  usePacedState,
} from "../../src/react";

interface State {
  n: number;
}

/** A store the test moves by hand, counting who listens. */
function fakeStore(n = 0) {
  let state: State = { n };
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    set(next: number) {
      state = { n: next };
      for (const fn of [...listeners]) fn();
    },
    listening: () => listeners.size,
  };
}
type Store = ReturnType<typeof fakeStore>;

/** The duration clock the views read, moved with the timers. */
let clock = 0;
const now = () => clock;
const pass = (ms: number) =>
  act(() => {
    clock += ms;
    jest.advanceTimersByTime(ms);
  });
const hide = (hidden: boolean) =>
  act(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event("visibilitychange"));
  });

let renders = 0;
function Reader({ store, id = "n" }: { store: Store; id?: string }) {
  const state = usePacedState(store, { idleMs: 200, inputMs: 500, now });
  renders++;
  return <p data-testid={id}>{state.n}</p>;
}
const shown = (id = "n") => screen.getByTestId(id).textContent;

const { useGameView } = createRuntimeHooks<RuntimeStore & Store>({ view: { idleMs: 200, now } });
function ViewPage() {
  return <p data-testid="n">{useGameView().n}</p>;
}

describe("usePacedState", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    clock = 10_000;
    renders = 0;
  });
  afterEach(() => {
    jest.useRealTimers();
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  });

  test("shows the state at once, then a ticking store only every idleMs", () => {
    const store = fakeStore(1);
    render(
      <StrictMode>
        <Reader store={store} />
      </StrictMode>,
    );
    expect(shown()).toBe("1");
    // The first change after the mount is not kept waiting: nothing has been handed on yet.
    act(() => store.set(2));
    pass(0);
    expect(shown()).toBe("2");
    const mounted = renders;
    // Ten ticks in a hundred milliseconds: nothing is shown until the pace allows it, then the latest.
    for (let i = 3; i <= 12; i++) {
      act(() => store.set(i));
      pass(10);
    }
    expect(shown()).toBe("2");
    expect(renders).toBe(mounted);
    pass(100);
    expect(shown()).toBe("12");
    act(() => store.set(11));
    pass(200);
    // The next one waits a whole idleMs from that hand-on, however soon it comes.
    act(() => store.set(12));
    pass(199);
    expect(shown()).toBe("11");
    pass(1);
    expect(shown()).toBe("12");
  });

  test("after the player's input every change shows at once, for inputMs, then the pace returns", () => {
    const store = fakeStore(1);
    render(
      <StrictMode>
        <Reader store={store} />
      </StrictMode>,
    );
    act(() => store.set(2));
    pass(250);
    fireEvent.pointerDown(document.body);
    act(() => store.set(3));
    expect(shown()).toBe("3");
    pass(499);
    act(() => store.set(4));
    expect(shown()).toBe("4");
    pass(1);
    act(() => store.set(5));
    expect(shown()).toBe("4");
    pass(200);
    expect(shown()).toBe("5");
    // A key counts as a press does.
    fireEvent.keyDown(document.body, { key: "a" });
    act(() => store.set(6));
    expect(shown()).toBe("6");
  });

  test("nothing shows while the tab is hidden, input or not, and it catches up as it shows", () => {
    const store = fakeStore(1);
    render(
      <StrictMode>
        <Reader store={store} />
      </StrictMode>,
    );
    hide(true);
    const before = renders;
    act(() => store.set(2));
    pass(1000);
    fireEvent.keyDown(document.body, { key: "a" });
    act(() => store.set(3));
    pass(1000);
    expect(renders).toBe(before);
    hide(false);
    expect(shown()).toBe("3");
  });

  test("readers of one store share one view; the last to leave stops the listening and the timer", () => {
    const store = fakeStore(1);
    const view = render(
      <StrictMode>
        <Reader store={store} id="a" />
        <Reader store={store} id="b" />
      </StrictMode>,
    );
    expect(store.listening()).toBe(1);
    expect(pacedView(store)).toBe(pacedView(store));
    act(() => store.set(2));
    pass(200);
    expect([shown("a"), shown("b")]).toEqual(["2", "2"]);
    act(() => store.set(3)); // a hand-on is waiting
    view.unmount();
    expect(store.listening()).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
    // With nobody listening the view answers with the state as it is.
    expect(pacedView(store).get().n).toBe(3);
  });

  test("the shared view keeps its first options and warns once about a later call's different ones", () => {
    const store = fakeStore(1);
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      const view = pacedView(store, { idleMs: 300 });
      expect(pacedView(store)).toBe(view);
      expect(pacedView(store, { idleMs: 300 })).toBe(view);
      expect(warn).not.toHaveBeenCalled();
      expect(pacedView(store, { idleMs: 100 })).toBe(view);
      expect(pacedView(store, { inputMs: 0 })).toBe(view);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain('"idleMs":100');
    } finally {
      warn.mockRestore();
    }
  });

  test("a view of its own hands on only a new state object, and reads the store while nobody listens", () => {
    const store = fakeStore(1);
    const view = createPacedView(store, { idleMs: 50, now });
    let handed = 0;
    const off = view.subscribe(() => {
      handed++;
    });
    store.set(2);
    store.set(3);
    clock += 50;
    jest.advanceTimersByTime(50);
    expect(handed).toBe(1);
    expect(view.get().n).toBe(3);
    off();
    store.set(4);
    expect(view.get().n).toBe(4);
    expect(handed).toBe(1);
  });

  test("useGameView is the paced state of the store in context", () => {
    const store = fakeStore(7);
    render(
      <StrictMode>
        <IdleStoreProvider store={store as unknown as RuntimeStore}>
          <ViewPage />
        </IdleStoreProvider>
      </StrictMode>,
    );
    expect(shown()).toBe("7");
    act(() => store.set(8));
    expect(shown()).toBe("7");
    pass(200);
    expect(shown()).toBe("8");
  });
});
