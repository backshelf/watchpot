import { afterEach, beforeEach, describe, expect, jest, mock, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { type ReactNode, StrictMode } from "react";
import { HoverTips, type HoverTipsProps, useTipSlot } from "watchpot/ui";

const WORDS = {
  gold: "Spent on upgrades.",
  ore: "Dug from the ground.",
  buy: "Buys one.",
  rate: "What it makes a second.",
  cost: "What the next one costs.",
};
const says = (key: string): string | null => (WORDS as Record<string, string>)[key] ?? null;

/** A page of tipped things under one layer, in StrictMode (the layer's listeners are an effect). */
function page(body: ReactNode, props: Partial<HoverTipsProps> = {}) {
  return render(
    <StrictMode>
      {body}
      <HoverTips content={says} {...props} />
    </StrictMode>,
  );
}
const tip = () => screen.queryByRole("tooltip");
const wait = (ms: number) => act(() => jest.advanceTimersByTime(ms));
const hover = (el: Element) => fireEvent.pointerOver(el, { pointerType: "mouse" });
const touch = (el: Element, held = 0) => {
  fireEvent.pointerDown(el, { pointerType: "touch", clientX: 5, clientY: 5 });
  if (held > 0) wait(held);
  fireEvent.pointerUp(el, { pointerType: "touch" });
  return fireEvent.click(el);
};

describe("HoverTips", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("one box for the page: the nearest tipped ancestor's key is asked for, and only when it opens", () => {
    const content = mock(says);
    page(
      <p data-tip="ore">
        Ore, and{" "}
        <span data-tip="gold">
          gold <b>coins</b>
        </span>
      </p>,
      { content },
    );
    expect(document.querySelectorAll('[role="tooltip"]')).toHaveLength(1);
    expect(content).not.toHaveBeenCalled();
    hover(screen.getByText("coins"));
    wait(450);
    expect(tip()).toHaveTextContent("Spent on upgrades.");
    expect(tip()).toHaveAttribute("data-state", "open");
    expect(tip()).toHaveAttribute("data-by", "hover");
    expect(content.mock.calls.every(([key]) => key === "gold")).toBe(true);
  });

  test("hover waits for the delay, leaving waits for the close delay, and the next tip comes sooner", () => {
    page(
      <>
        <span data-tip="gold">Gold</span>
        <span data-tip="ore">Ore</span>
        <span>Plain</span>
      </>,
    );
    hover(screen.getByText("Gold"));
    wait(449);
    expect(tip()).toBeNull();
    wait(1);
    expect(tip()).toHaveTextContent("Spent on upgrades.");
    hover(screen.getByText("Ore"));
    wait(70);
    expect(tip()).toHaveTextContent("Dug from the ground.");
    hover(screen.getByText("Plain"));
    wait(119);
    expect(tip()).not.toBeNull();
    wait(1);
    expect(tip()).toBeNull();
  });

  test("leaving before the delay opens nothing, and a press on the thing closes its tip", () => {
    page(
      <>
        <span data-tip="gold">Gold</span>
        <span>Plain</span>
      </>,
    );
    hover(screen.getByText("Gold"));
    wait(200);
    hover(screen.getByText("Plain"));
    wait(1000);
    expect(tip()).toBeNull();
    hover(screen.getByText("Gold"));
    wait(450);
    expect(tip()).not.toBeNull();
    fireEvent.pointerDown(screen.getByText("Gold"), { pointerType: "mouse" });
    expect(tip()).toBeNull();
  });

  test("the box describes its anchor while open and gives the anchor's own description back", () => {
    page(
      <span data-tip="gold" aria-describedby="mine">
        Gold
      </span>,
    );
    const gold = screen.getByText("Gold");
    hover(gold);
    wait(450);
    expect(gold.getAttribute("aria-describedby")).toBe(`mine ${tip()?.id}`);
    hover(document.body);
    wait(120);
    expect(gold.getAttribute("aria-describedby")).toBe("mine");
  });

  test("a box that takes the pointer stays while the pointer is on it", () => {
    page(
      <>
        <span data-tip="gold">Gold</span>
        <span>Plain</span>
      </>,
    );
    hover(screen.getByText("Gold"));
    wait(450);
    const box = tip() as HTMLElement;
    hover(screen.getByText("Plain"));
    hover(box);
    wait(1000);
    expect(tip()).not.toBeNull();
    hover(screen.getByText("Plain"));
    wait(120);
    expect(tip()).toBeNull();
  });

  test("keyboard focus opens at once, blur closes, and Escape closes", () => {
    page(
      <button type="button" data-tip="buy">
        Buy
      </button>,
    );
    const buy = screen.getByRole("button", { name: "Buy" });
    act(() => buy.focus());
    expect(tip()).toHaveTextContent("Buys one.");
    expect(tip()).toHaveAttribute("data-by", "focus");
    act(() => buy.blur());
    expect(tip()).toBeNull();
    act(() => buy.focus());
    fireEvent.keyDown(buy, { key: "Escape" });
    expect(tip()).toBeNull();
  });

  test("a scope shows its tips to a focused control: with the control's own at once, alone after a rest", () => {
    page(
      <>
        <div data-tip-scope="">
          <span data-tip="rate">Rate</span>
          <span data-tip="cost">Cost</span>
          <span data-tip="gold">Gold</span>
          <button type="button">Plain</button>
          <button type="button" data-tip="buy">
            Tipped
          </button>
        </div>
        <button type="button">Outside</button>
      </>,
      { scopeMost: 2, children: (parts) => parts.map((p) => <p key={p.key}>{p.node}</p>) },
    );
    act(() => screen.getByRole("button", { name: "Plain" }).focus());
    wait(699);
    expect(tip()).toBeNull();
    wait(1);
    expect([...(tip()?.querySelectorAll("p") ?? [])].map((p) => p.textContent)).toEqual([
      WORDS.rate,
      WORDS.cost,
    ]);
    act(() => screen.getByRole("button", { name: "Tipped" }).focus());
    expect([...(tip()?.querySelectorAll("p") ?? [])].map((p) => p.textContent)).toEqual([
      WORDS.buy,
      WORDS.rate,
      WORDS.cost,
    ]);
    act(() => screen.getByRole("button", { name: "Outside" }).focus());
    wait(1000);
    expect(tip()).toBeNull();
  });

  test("on a touch, a tap on a tipped word toggles its tip and is not a press on the button around it", () => {
    const press = mock(() => {});
    page(
      <button type="button" onClick={press}>
        Buy with <span data-tip="gold">gold</span>
      </button>,
    );
    const word = screen.getByText("gold");
    expect(touch(word)).toBe(false); // the click was taken
    expect(tip()).toHaveTextContent("Spent on upgrades.");
    expect(tip()).toHaveAttribute("data-by", "touch");
    touch(word);
    expect(tip()).toBeNull();
    expect(press).not.toHaveBeenCalled();
    touch(screen.getByRole("button"));
    expect(press).toHaveBeenCalledTimes(1);
  });

  test("on a touch, a tipped button shows its tip on a held press, which then is not a press; a tap still is", () => {
    const press = mock(() => {});
    page(
      <button type="button" data-tip="buy" onClick={press}>
        Buy
      </button>,
    );
    const buy = screen.getByRole("button", { name: "Buy" });
    touch(buy);
    expect(tip()).toBeNull();
    expect(press).toHaveBeenCalledTimes(1);
    touch(buy, 500);
    expect(tip()).toHaveTextContent("Buys one.");
    expect(press).toHaveBeenCalledTimes(1);
    // A touch that moves is a scroll, not a hold.
    fireEvent.pointerDown(document.body, { pointerType: "touch" });
    expect(tip()).toBeNull();
    fireEvent.pointerDown(buy, { pointerType: "touch", clientX: 5, clientY: 5 });
    fireEvent.pointerMove(buy, { pointerType: "touch", clientX: 5, clientY: 40 });
    wait(600);
    expect(tip()).toBeNull();
  });

  test("a key that says nothing opens nothing, and nothing opens while disabled", () => {
    const view = page(
      <>
        <span data-tip="unknown">Mystery</span>
        <span data-tip="gold">Gold</span>
      </>,
    );
    hover(screen.getByText("Mystery"));
    wait(1000);
    expect(tip()).toBeNull();
    hover(screen.getByText("Gold"));
    wait(450);
    expect(tip()).not.toBeNull();
    view.rerender(
      <StrictMode>
        <span data-tip="gold">Gold</span>
        <HoverTips content={says} disabled />
      </StrictMode>,
    );
    expect(tip()).toBeNull();
    hover(document.body);
    hover(screen.getByText("Gold"));
    wait(1000);
    expect(tip()).toBeNull();
  });

  test("a tip goes when its anchor leaves the page", () => {
    const view = page(<span data-tip="gold">Gold</span>);
    hover(screen.getByText("Gold"));
    wait(450);
    expect(tip()).not.toBeNull();
    view.rerender(
      <StrictMode>
        <HoverTips content={says} />
      </StrictMode>,
    );
    wait(250);
    expect(tip()).toBeNull();
  });

  test("another attribute names the tips, and its `-side` places one element's", () => {
    page(
      <span data-hint="gold" data-hint-side="right">
        Gold
      </span>,
      { attr: "data-hint" },
    );
    hover(screen.getByText("Gold"));
    wait(450);
    expect(tip()).toHaveTextContent("Spent on upgrades.");
    expect(tip()?.style.position).toBe("fixed");
  });

  test("after it unmounts nothing listens: a hover opens no tip and no timer is left", () => {
    const view = page(<span data-tip="gold">Gold</span>);
    hover(screen.getByText("Gold"));
    view.unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});

function Slotted({ words }: { words: ReactNode }) {
  const key = useTipSlot(words);
  return <span data-tip={key}>Slotted</span>;
}

describe("useTipSlot", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("a tip of the caller's own node, read as it opens, whatever the layer's content says", () => {
    const view = page(<Slotted words={<em>first</em>} />, { content: () => null });
    view.rerender(
      <StrictMode>
        <Slotted words={<em>second</em>} />
        <HoverTips content={() => null} />
      </StrictMode>,
    );
    hover(screen.getByText("Slotted"));
    wait(450);
    expect(tip()).toHaveTextContent("second");
  });
});
