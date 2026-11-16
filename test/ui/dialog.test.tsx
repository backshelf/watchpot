import { describe, expect, mock, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { ConfirmPress, Dialog, Portal, useDialog } from "watchpot/ui";

const tab = (shift = false) =>
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Tab", shiftKey: shift });
const pressEscape = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

/** A dialog that opens a second one over itself, portalled to the body. */
function Nested() {
  const [inner, setInner] = useState(false);
  return (
    <Dialog.Root defaultOpen>
      <Dialog.Panel>
        <Dialog.Title>Outer</Dialog.Title>
        <button type="button" onClick={() => setInner(true)}>
          More
        </button>
        <Dialog.Root open={inner} onOpenChange={setInner}>
          <Portal>
            <Dialog.Panel>
              <Dialog.Title>Inner</Dialog.Title>
              <button type="button">Ok</button>
            </Dialog.Panel>
          </Portal>
        </Dialog.Root>
      </Dialog.Panel>
    </Dialog.Root>
  );
}

/** A page with an opener, a dialog of two controls and a description, and the page made inert behind it. */
function Page({ modal = true, onOpenChange }: { modal?: boolean; onOpenChange?: (open: boolean) => void }) {
  const page = useRef<HTMLDivElement>(null);
  return (
    <Dialog.Root modal={modal} inertTarget={page} onOpenChange={onOpenChange}>
      <div ref={page} data-testid="page">
        <Dialog.Trigger>Open shop</Dialog.Trigger>
        <button type="button">Elsewhere</button>
      </div>
      <Dialog.Scrim data-testid="scrim" />
      <Dialog.Panel className="sheet">
        <Dialog.Title>Gems</Dialog.Title>
        <Dialog.Description>Spend gems on gold.</Dialog.Description>
        <button type="button">Buy</button>
        <Dialog.Close>Close</Dialog.Close>
      </Dialog.Panel>
    </Dialog.Root>
  );
}

/** A dialog whose title comes and goes: named by its label until the title mounts. */
function Bare({ titled }: { titled: boolean }) {
  return (
    <Dialog.Root defaultOpen>
      <Dialog.Panel aria-label={titled ? undefined : "Shop"}>
        {titled && <Dialog.Title>Gems</Dialog.Title>}
        <button type="button">Buy</button>
      </Dialog.Panel>
    </Dialog.Root>
  );
}

/** A dialog drawn from the hook's props alone: spread whole, or with a ref of its own on the panel. */
function Own({ keep }: { keep: boolean }) {
  const mine = useRef<HTMLDivElement>(null);
  const dialog = useDialog({ open: true });
  const { ref, ...panel } = dialog.panelProps;
  return keep ? (
    <div
      {...panel}
      ref={(node) => {
        mine.current = node;
        ref.current = node;
      }}
    >
      <h2 {...dialog.titleProps}>Kept</h2>
      <button {...dialog.closeProps}>Close</button>
    </div>
  ) : (
    <div {...dialog.scrimProps}>
      <div {...dialog.panelProps}>
        <h2 {...dialog.titleProps}>Spread</h2>
        <button {...dialog.closeProps}>Close</button>
      </div>
    </div>
  );
}

const open = () => fireEvent.click(screen.getByRole("button", { name: "Open shop" }));

describe("Dialog", () => {
  test("opens labelled by its title and described, with the trigger's ARIA and the panel's state", () => {
    render(<Page />);
    const trigger = screen.getByRole("button", { name: "Open shop" });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).toBeNull();
    open();
    const dialog = screen.getByRole("dialog", { name: "Gems" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("Spend gems on gold.");
    expect(dialog).toHaveAttribute("data-state", "open");
    expect(dialog).toHaveClass("sheet");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls", dialog.id);
  });

  test("moves focus to the first control, wraps Tab both ways and makes the page inert", () => {
    render(<Page />);
    open();
    const buy = screen.getByRole("button", { name: "Buy" });
    const close = screen.getByRole("button", { name: "Close" });
    expect(document.activeElement).toBe(buy);
    expect(screen.getByTestId("page")).toHaveAttribute("inert");
    close.focus();
    tab();
    expect(document.activeElement).toBe(buy);
    tab(true);
    expect(document.activeElement).toBe(close);
    // From the panel itself (a click on its text), Shift+Tab goes to the last control.
    screen.getByRole("dialog").focus();
    tab(true);
    expect(document.activeElement).toBe(close);
  });

  test("Escape closes, returns focus to the opener and lifts inert", () => {
    const changes = mock((_: boolean) => {});
    render(<Page onOpenChange={changes} />);
    const trigger = screen.getByRole("button", { name: "Open shop" });
    trigger.focus();
    open();
    pressEscape();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(changes.mock.calls).toEqual([[true], [false]]);
    expect(document.activeElement).toBe(trigger);
    expect(screen.getByTestId("page")).not.toHaveAttribute("inert");
  });

  test("the scrim and Close close it", () => {
    render(<Page />);
    open();
    fireEvent.click(screen.getByTestId("scrim"));
    expect(screen.queryByRole("dialog")).toBeNull();
    open();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("non-modal: no aria-modal, no inert, Tab is not held", () => {
    render(<Page modal={false} />);
    open();
    const dialog = screen.getByRole("dialog");
    expect(dialog).not.toHaveAttribute("aria-modal");
    expect(screen.getByTestId("page")).not.toHaveAttribute("inert");
    screen.getByRole("button", { name: "Close" }).focus();
    expect(tab()).toBe(true); // not prevented: the browser moves on out
  });

  test("an armed ConfirmPress takes Escape before the dialog, then the dialog closes on the next", () => {
    const pay = mock(() => {});
    render(
      <Dialog.Root defaultOpen>
        <Dialog.Panel>
          <Dialog.Title>Pay</Dialog.Title>
          <ConfirmPress onConfirm={pay}>{(armed) => (armed ? "Press again" : "Pay")}</ConfirmPress>
        </Dialog.Panel>
      </Dialog.Root>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Pay" }));
    pressEscape();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pay" })).not.toHaveAttribute("data-armed");
    pressEscape();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(pay).not.toHaveBeenCalled();
  });

  test("the topmost layer takes Escape: a nested dialog closes before its parent", () => {
    render(<Nested />);
    const more = screen.getByRole("button", { name: "More" });
    act(() => more.focus());
    fireEvent.click(more);
    expect(screen.getByRole("dialog", { name: "Inner" })).toBeInTheDocument();
    pressEscape();
    expect(screen.queryByRole("dialog", { name: "Inner" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Outer" })).toBeInTheDocument();
    expect(document.activeElement).toBe(more);
  });

  test("asChild puts the panel's behaviour on the game's own element", () => {
    render(
      <Dialog.Root defaultOpen>
        <Dialog.Panel asChild>
          <section data-testid="own" className="mine">
            <Dialog.Title>Mine</Dialog.Title>
          </section>
        </Dialog.Panel>
      </Dialog.Root>,
    );
    const own = screen.getByTestId("own");
    expect(own.tagName).toBe("SECTION");
    expect(own).toHaveAttribute("role", "dialog");
    expect(own).toHaveAccessibleName("Mine");
    expect(own).toHaveClass("mine");
  });

  test("a dialog with no title mounted is not pointed at one, and is once the title mounts", () => {
    const view = render(<Bare titled={false} />);
    expect(screen.getByRole("dialog")).not.toHaveAttribute("aria-labelledby");
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Shop");
    view.rerender(<Bare titled />);
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Gems");
    view.rerender(<Bare titled={false} />);
    expect(screen.getByRole("dialog")).not.toHaveAttribute("aria-labelledby");
  });

  test("a scrim that wraps the panel closes on a press on itself, never on one inside the panel", () => {
    const changed = mock((_open: boolean) => {});
    render(
      <Dialog.Root defaultOpen onOpenChange={changed}>
        <Dialog.Scrim data-testid="scrim">
          <Dialog.Panel>
            <Dialog.Title>Gems</Dialog.Title>
            <button type="button">Buy</button>
          </Dialog.Panel>
        </Dialog.Scrim>
      </Dialog.Root>,
    );
    expect(screen.getByRole("dialog", { name: "Gems" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Buy" }));
    fireEvent.click(screen.getByRole("dialog"));
    expect(changed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("scrim"));
    expect(changed).toHaveBeenCalledWith(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("the hook's props spread onto the game's own elements, with or without a ref of the game's own", () => {
    const view = render(<Own keep={false} />);
    expect(screen.getByRole("dialog", { name: "Spread" })).toContainElement(
      document.activeElement as HTMLElement,
    );
    view.unmount();
    render(<Own keep />);
    expect(screen.getByRole("dialog", { name: "Kept" })).toContainElement(
      document.activeElement as HTMLElement,
    );
  });
});
