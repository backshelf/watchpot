import { describe, expect, mock, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import {
  NavTabs,
  PageLayoutProvider,
  PageShell,
  type PageViews,
  type ScreenTable,
  type SheetRegistry,
  usePageLayout,
} from "watchpot/ui";

type Tab = "home" | "shop";
type Page = "vault";
type Sheet = { kind: "note"; text: string } | { kind: "blank" };

/** Says the page's width, to prove the layout reaches a screen. */
function Width() {
  return <p>{usePageLayout().wide ? "wide" : "narrow"}</p>;
}

const SCREENS: ScreenTable<Tab> = {
  home: () => (
    <>
      <p>Home screen</p>
      <Width />
    </>
  ),
  shop: () => <p>Shop screen</p>,
};
const PAGES: PageViews<Page> = { vault: () => <p>Vault page</p> };
const SHEETS: SheetRegistry<Sheet> = {
  note: (sheet, close) => (
    <div role="dialog" aria-label="Note">
      {sheet.text}
      <button type="button" onClick={close}>
        Done
      </button>
    </div>
  ),
  blank: () => null,
};

/** The shell over the tables, its three facts in state as a store would hold them. */
function Game({
  onCloseSheet,
  initialSheet = null,
}: {
  onCloseSheet?: () => void;
  initialSheet?: Sheet | null;
}) {
  const [tab, setTab] = useState<Tab>("home");
  const [page, setPage] = useState<Page | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(initialSheet);
  return (
    <PageShell<Tab, Page, Sheet>
      data-testid="root"
      tab={tab}
      screens={SCREENS}
      page={page}
      pages={PAGES}
      onClosePage={() => setPage(null)}
      pageBar={(_, back) => (
        <button type="button" onClick={back}>
          Back
        </button>
      )}
      sheet={sheet}
      sheets={SHEETS}
      onCloseSheet={() => {
        onCloseSheet?.();
        setSheet(null);
      }}
      covered={sheet !== null}
      header={({ wide }) => (
        <header>
          <button type="button" onClick={() => setSheet({ kind: "note", text: "Hello" })}>
            Open note
          </button>
          <button type="button" onClick={() => setPage("vault")}>
            Open vault
          </button>
          <span>{wide ? "header wide" : "header narrow"}</span>
        </header>
      )}
      nav={({ reselect }) => (
        <NavTabs.Root
          aria-label="Game"
          current={tab}
          onSelect={(v) => (v === tab ? reselect() : setTab(v as Tab))}
        >
          <NavTabs.Item value="home">Home</NavTabs.Item>
          <NavTabs.Item value="shop">Shop</NavTabs.Item>
        </NavTabs.Root>
      )}
    />
  );
}

describe("PageShell", () => {
  test("draws the open tab's screen in a main region; a press on another tab swaps it", () => {
    render(<Game />);
    expect(screen.getByRole("main")).toHaveTextContent("Home screen");
    expect(screen.getByTestId("root")).toHaveAttribute("data-tab", "home");
    fireEvent.click(screen.getByRole("button", { name: "Shop" }));
    expect(screen.getByRole("main")).toHaveTextContent("Shop screen");
    expect(screen.getByTestId("root")).toHaveAttribute("data-tab", "shop");
  });

  test("a page stacks over the screen: focus moves to its bar, the screen is inert, Escape goes back", () => {
    render(<Game />);
    const opener = screen.getByRole("button", { name: "Open vault" });
    act(() => opener.focus());
    fireEvent.click(opener);
    expect(screen.getByText("Vault page")).toBeInTheDocument();
    expect(screen.getByTestId("root")).toHaveAttribute("data-page", "vault");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Home screen").closest("[data-under]")).toHaveAttribute("inert");
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(screen.queryByText("Vault page")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  test("the open tab pressed again closes the page", () => {
    render(<Game />);
    fireEvent.click(screen.getByRole("button", { name: "Open vault" }));
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(screen.queryByText("Vault page")).toBeNull();
  });

  test("a sheet is drawn from the registry and covers the column and nav", () => {
    render(<Game />);
    fireEvent.click(screen.getByRole("button", { name: "Open note" }));
    expect(screen.getByRole("dialog", { name: "Note" })).toHaveTextContent("Hello");
    expect(screen.getByRole("main", { hidden: true })).toHaveAttribute("inert");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("main")).not.toHaveAttribute("inert");
  });

  test("a sheet the registry cannot draw is closed", () => {
    const closed = mock(() => {});
    render(<Game initialSheet={{ kind: "blank" }} onCloseSheet={closed} />);
    expect(closed).toHaveBeenCalledTimes(1);
  });

  test("the page layout a provider pins reaches the header, the root and the screens", () => {
    render(
      <PageLayoutProvider value={{ wide: true, width: 1200 }}>
        <Game />
      </PageLayoutProvider>,
    );
    expect(screen.getByTestId("root")).toHaveAttribute("data-wide");
    expect(screen.getByText("header wide")).toBeInTheDocument();
    expect(screen.getByText("wide")).toBeInTheDocument();
  });
});
