import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { useEscape, useOpenerFocus } from "watchpot/ui";

function Layer({ onEscape, ambient }: { onEscape: () => void; ambient?: boolean }) {
  useEscape(onEscape, true, { ambient });
  return null;
}

/** A sheet whose page drops focus in the commit that mounts it, as a header turning `inert` beside it does. */
function Sheet({ onClose }: { onClose: () => void }) {
  useOpenerFocus(true);
  return (
    <div
      role="dialog"
      aria-label="Sheet"
      ref={(el) => {
        if (el && document.activeElement instanceof HTMLElement) document.activeElement.blur();
      }}
    >
      <button type="button" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

function Page() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && <Sheet onClose={() => setOpen(false)} />}
    </div>
  );
}

describe("useEscape", () => {
  test("an ambient layer gets Escape only while no ordinary layer is enabled, however late it arrived", () => {
    const sheet = mock(() => {});
    const notice = mock(() => {});
    const { rerender } = render(
      <>
        <Layer onEscape={sheet} />
        <Layer onEscape={notice} ambient />
      </>,
    );
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(sheet).toHaveBeenCalledTimes(1);
    expect(notice).toHaveBeenCalledTimes(0);
    rerender(<Layer onEscape={notice} ambient />);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(notice).toHaveBeenCalledTimes(1);
  });
});

describe("useOpenerFocus", () => {
  test("under StrictMode, whose extra cleanup runs straight after the mount, focus still goes back at the close", () => {
    render(
      <StrictMode>
        <Page />
      </StrictMode>,
    );
    const opener = screen.getByRole("button", { name: "Open" });
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).not.toBe(opener);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(document.activeElement).toBe(opener);
  });

  test("focus goes back to the opener even when the page dropped it in the commit that mounted the layer", () => {
    render(<Page />);
    const opener = screen.getByRole("button", { name: "Open" });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole("dialog", { name: "Sheet" })).toBeTruthy();
    expect(document.activeElement).not.toBe(opener);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(document.activeElement).toBe(opener);
  });
});
