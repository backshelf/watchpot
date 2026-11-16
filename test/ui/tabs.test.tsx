import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { BuyAmount, type BuyMode, buyCount, NavTabs, Tabs, useTabs } from "watchpot/ui";

const key = (k: string) => fireEvent.keyDown(document.activeElement ?? document.body, { key: k });

function ThreeTabs({ activation }: { activation?: "automatic" | "manual" }) {
  return (
    <Tabs.Root defaultValue="gold" activation={activation}>
      <Tabs.List aria-label="Currencies">
        <Tabs.Tab value="gold">Gold</Tabs.Tab>
        <Tabs.Tab value="gems" disabled>
          Gems
        </Tabs.Tab>
        <Tabs.Tab value="cards">Cards</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="gold">Gold panel</Tabs.Panel>
      <Tabs.Panel value="gems">Gems panel</Tabs.Panel>
      <Tabs.Panel value="cards">Cards panel</Tabs.Panel>
    </Tabs.Root>
  );
}

function OpenPanelOnly() {
  const tabs = useTabs({ defaultValue: "gold", controls: "selected" });
  return (
    <div>
      <div {...tabs.listProps} role="tablist" aria-label="Currencies">
        <button {...tabs.tabProps("gold")}>Gold</button>
        <button {...tabs.tabProps("cards")}>Cards</button>
      </div>
      <div {...tabs.panelProps(tabs.value)}>{tabs.value} panel</div>
    </div>
  );
}

describe("Tabs", () => {
  test("with only the open panel mounted, only the selected tab names a panel, and the id is in the page", () => {
    render(<OpenPanelOnly />);
    const gold = screen.getByRole("tab", { name: "Gold" });
    const cards = screen.getByRole("tab", { name: "Cards" });
    expect(gold).toHaveAttribute("aria-controls", screen.getByRole("tabpanel").id);
    expect(cards).not.toHaveAttribute("aria-controls");
    fireEvent.click(cards);
    expect(cards).toHaveAttribute("aria-controls", screen.getByRole("tabpanel").id);
    expect(gold).not.toHaveAttribute("aria-controls");
  });

  test("a tablist of tabs, each controlling its labelled panel; one tab stop", () => {
    render(<ThreeTabs />);
    expect(screen.getByRole("tablist", { name: "Currencies" })).toHaveAttribute(
      "aria-orientation",
      "horizontal",
    );
    const gold = screen.getByRole("tab", { name: "Gold" });
    const cards = screen.getByRole("tab", { name: "Cards" });
    expect(gold).toHaveAttribute("aria-selected", "true");
    expect(gold).toHaveAttribute("tabindex", "0");
    expect(cards).toHaveAttribute("tabindex", "-1");
    const panel = screen.getByRole("tabpanel", { name: "Gold" });
    expect(gold).toHaveAttribute("aria-controls", panel.id);
    expect(screen.queryByText("Cards panel")).toBeNull();
  });

  test("arrows skip a disabled tab, wrap, and select as they move; Home and End go to the ends", () => {
    render(<ThreeTabs />);
    const gold = screen.getByRole("tab", { name: "Gold" });
    const cards = screen.getByRole("tab", { name: "Cards" });
    gold.focus();
    key("ArrowRight");
    expect(document.activeElement).toBe(cards);
    expect(cards).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Cards" })).toHaveTextContent("Cards panel");
    key("ArrowRight");
    expect(document.activeElement).toBe(gold);
    key("End");
    expect(document.activeElement).toBe(cards);
    key("Home");
    expect(document.activeElement).toBe(gold);
    key("ArrowDown"); // not this axis
    expect(document.activeElement).toBe(gold);
  });

  test("manual activation moves focus without selecting; a press selects", () => {
    render(<ThreeTabs activation="manual" />);
    const gold = screen.getByRole("tab", { name: "Gold" });
    const cards = screen.getByRole("tab", { name: "Cards" });
    gold.focus();
    key("ArrowRight");
    expect(document.activeElement).toBe(cards);
    expect(gold).toHaveAttribute("aria-selected", "true");
    fireEvent.click(cards);
    expect(cards).toHaveAttribute("aria-selected", "true");
  });
});

const WORDS = { locked: ", locked", count: (n: number) => `, ${n} to claim` };

/** Three pages: the open one, one with things to claim, one locked with a count it does not say. */
function Nav({ onSelect }: { onSelect: (v: string) => void }) {
  return (
    <NavTabs.Root aria-label="Game" current="home" onSelect={onSelect}>
      <NavTabs.Item value="home" words={WORDS}>
        Home
      </NavTabs.Item>
      <NavTabs.Item value="shop" count={3} words={WORDS}>
        Shop
        <NavTabs.Badge />
      </NavTabs.Item>
      <NavTabs.Item value="vault" locked count={5} words={WORDS}>
        Vault
        <NavTabs.Badge />
      </NavTabs.Item>
    </NavTabs.Root>
  );
}

describe("NavTabs", () => {
  test("a nav of buttons: the open one is the current page, counts and locks are said in the name", () => {
    render(<Nav onSelect={() => {}} />);
    const nav = screen.getByRole("navigation", { name: "Game" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Home" })).toHaveAttribute("aria-current", "page");
    // happy-dom has no CSS, so the name computation spaces each span: match the words, not the spacing.
    const shop = screen.getByRole("button", { name: /^Shop\s*, 3 to claim$/ });
    expect(shop).not.toHaveAttribute("aria-current");
    expect(shop).toHaveAttribute("data-count", "3");
    const vault = screen.getByRole("button", { name: /^Vault\s*, locked$/ });
    expect(vault).toHaveAttribute("data-locked");
    expect(vault).not.toHaveAttribute("data-count");
    // Every item is its own tab stop.
    for (const b of screen.getAllByRole("button")) expect(b).not.toHaveAttribute("tabindex", "-1");
  });

  test("a locked item still presses", () => {
    const select = mock((_: string) => {});
    render(<Nav onSelect={select} />);
    fireEvent.click(screen.getByRole("button", { name: /^Vault\s*, locked$/ }));
    expect(select).toHaveBeenCalledWith("vault");
  });
});

describe("BuyAmount", () => {
  const OPTIONS: { value: BuyMode; label: string }[] = [
    { value: 1, label: "x1" },
    { value: 10, label: "x10" },
    { value: "max", label: "Max" },
  ];

  test("a radio group: one checked, arrows move and select, one tab stop", () => {
    const change = mock((_: BuyMode) => {});
    render(<BuyAmount aria-label="Buy amount" options={OPTIONS} onValueChange={change} />);
    expect(screen.getByRole("radiogroup", { name: "Buy amount" })).toBeInTheDocument();
    const one = screen.getByRole("radio", { name: "x1" });
    const max = screen.getByRole("radio", { name: "Max" });
    expect(one).toHaveAttribute("aria-checked", "true");
    expect(max).toHaveAttribute("tabindex", "-1");
    one.focus();
    key("ArrowLeft");
    expect(document.activeElement).toBe(max);
    expect(max).toHaveAttribute("aria-checked", "true");
    expect(max).toHaveAttribute("data-state", "checked");
    expect(change).toHaveBeenLastCalledWith("max");
    key("ArrowDown");
    expect(screen.getByRole("radio", { name: "x1" })).toHaveAttribute("aria-checked", "true");
  });

  test("buyCount: a number buys that many, max what is affordable, next what is left to the milestone", () => {
    const at = { affordable: 37.9, untilNext: 3 };
    expect(buyCount(10, at)).toBe(10);
    expect(buyCount("max", at)).toBe(37);
    expect(buyCount("next", at)).toBe(3);
    expect(buyCount("max", { affordable: -2, untilNext: 0 })).toBe(0);
    expect(buyCount("max", { affordable: Number.NaN, untilNext: 0 })).toBe(0);
  });
});
