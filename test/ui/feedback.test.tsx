import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  createToasts,
  FloatingNumbers,
  type FloatingNumbersOptions,
  Pressable,
  Toaster,
  type ToastStore,
  useFloatingNumbers,
} from "watchpot/ui";

/** A click target whose presses spawn "+1" at the press. */
function Clicker(options: FloatingNumbersOptions) {
  const floats = useFloatingNumbers(options);
  return (
    <div>
      <Pressable onPress={(p) => floats.spawn({ x: p.x, y: p.y, node: "+1" })}>Mine</Pressable>
      <FloatingNumbers floats={floats} data-testid="host" />
    </div>
  );
}

/** A toaster that draws each toast's title and a dismiss button. */
function Toasts({ store }: { store: ToastStore }) {
  return (
    <Toaster
      store={store}
      aria-label="Notices"
      renderToast={(t, dismiss) => (
        <>
          <p>{t.title}</p>
          <button type="button" onClick={dismiss}>
            Dismiss
          </button>
        </>
      )}
    />
  );
}

const press = () =>
  fireEvent.pointerDown(screen.getByRole("button", { name: "Mine" }), {
    pointerType: "mouse",
    pointerId: 1,
    button: 0,
    clientX: 30,
    clientY: 4,
  });

describe("FloatingNumbers", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("spawns at the press, hidden from assistive tech, and removes each after its lifetime", () => {
    render(<Clicker lifetime={1000} />);
    press();
    const host = screen.getByTestId("host");
    expect(host).toHaveAttribute("aria-hidden", "true");
    const float = host.querySelector("[data-float]") as HTMLElement;
    expect(float).toHaveTextContent("+1");
    expect(float.style.left).toBe("30px");
    act(() => jest.advanceTimersByTime(1000));
    expect(host.querySelector("[data-float]")).toBeNull();
  });

  test("removes one when its own animation ends, not a child's; keeps at most max", () => {
    render(<Clicker max={3} />);
    for (let i = 0; i < 5; i++) press();
    const host = screen.getByTestId("host");
    expect(host.querySelectorAll("[data-float]")).toHaveLength(3);
    const first = host.querySelector("[data-float]") as HTMLElement;
    fireEvent.animationEnd(first);
    expect(host.querySelectorAll("[data-float]")).toHaveLength(2);
  });
});

describe("Toasts", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("a live region; each toast goes after its duration, the next waiting one takes its place", () => {
    const store = createToasts({ max: 1, duration: 1000 });
    render(<Toasts store={store} />);
    const region = screen.getByRole("status", { name: "Notices" });
    expect(region).toHaveAttribute("aria-live", "polite");
    act(() => {
      store.push({ title: "Saved", tone: "success" });
      store.push({ title: "Level up" });
    });
    expect(screen.getByText("Saved").closest("[data-toast]")).toHaveAttribute("data-tone", "success");
    expect(screen.queryByText("Level up")).toBeNull();
    expect(store.snapshot().waiting).toBe(1);
    act(() => jest.advanceTimersByTime(1000));
    expect(screen.queryByText("Saved")).toBeNull();
    expect(screen.getByText("Level up")).toBeInTheDocument();
  });

  test("hover pauses the time, leaving resumes with what was left; dismiss closes at once", () => {
    const store = createToasts({ duration: 1000 });
    render(<Toasts store={store} />);
    act(() => {
      store.push({ title: "Saved" });
    });
    act(() => jest.advanceTimersByTime(600));
    const region = screen.getByRole("status");
    fireEvent.pointerEnter(region);
    act(() => jest.advanceTimersByTime(5000));
    expect(screen.getByText("Saved")).toBeInTheDocument();
    fireEvent.pointerLeave(region);
    act(() => jest.advanceTimersByTime(399));
    expect(screen.getByText("Saved")).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(1));
    expect(screen.queryByText("Saved")).toBeNull();
    act(() => {
      store.push({ title: "Again" });
    });
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Again")).toBeNull();
  });

  test("focus inside holds the time until it leaves; a pushed id updates in place", () => {
    const store = createToasts({ duration: 1000, mode: "stack" });
    render(<Toasts store={store} />);
    act(() => {
      store.push({ id: "save", title: "Saving" });
    });
    act(() => screen.getByRole("button", { name: "Dismiss" }).focus());
    act(() => jest.advanceTimersByTime(3000));
    expect(store.snapshot().paused).toBe(true);
    act(() => {
      store.push({ id: "save", title: "Saved" });
    });
    expect(store.snapshot().visible).toHaveLength(1);
    expect(screen.getByText("Saved")).toBeInTheDocument();
    act(() => screen.getByRole("button", { name: "Dismiss" }).blur());
    act(() => jest.advanceTimersByTime(1000));
    expect(screen.queryByText("Saved")).toBeNull();
  });

  test("focus lost with a dismissed toast's button stops holding the time", () => {
    const store = createToasts({ duration: 1000 });
    render(<Toasts store={store} />);
    act(() => {
      store.push({ title: "First" });
    });
    const button = screen.getByRole("button", { name: "Dismiss" });
    act(() => button.focus());
    // A browser fires no blur when the focused element is removed.
    const silent = (e: Event) => e.stopImmediatePropagation();
    button.addEventListener("focusout", silent, true);
    button.addEventListener("blur", silent, true);
    act(() => {
      store.dismiss(store.snapshot().visible[0]?.id ?? "");
    });
    act(() => {
      store.push({ title: "Second" });
    });
    act(() => jest.advanceTimersByTime(1000));
    expect(screen.queryByText("Second")).toBeNull();
  });
});
