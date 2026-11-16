import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { Barcode, Checker } from "../../src/ui/print";

const heads = (root: HTMLElement) => root.querySelectorAll("[data-head]");

describe("a printed playhead", () => {
  test("Checker: head 3 marks exactly one element, a rect over cell 3; no head adds none", () => {
    const { container, rerender } = render(<Checker bits="10110010" cell={4} head={3} />);
    const marked = heads(container);
    expect(marked).toHaveLength(1);
    const rect = marked[0] as Element;
    expect(rect.tagName.toLowerCase()).toBe("rect");
    expect(rect.getAttribute("x")).toBe("12");
    expect(rect.getAttribute("width")).toBe("4");
    expect(rect.getAttribute("height")).toBe("8");
    expect(rect.getAttribute("class")).toBeNull();
    rerender(<Checker bits="10110010" cell={4} />);
    expect(heads(container)).toHaveLength(0);
    expect(container.querySelectorAll("svg > *")).toHaveLength(1);
  });

  test("Barcode: head 3 marks exactly one module; no head adds none", () => {
    const { container, rerender } = render(<Barcode value="ABC" head={3} />);
    const marked = heads(container);
    expect(marked).toHaveLength(1);
    expect((marked[0] as Element).getAttribute("x")).toBe("3");
    expect((marked[0] as Element).getAttribute("width")).toBe("1");
    rerender(<Barcode value="ABC" />);
    expect(heads(container)).toHaveLength(0);
  });

  test("a head outside the track, or not a number, draws nothing", () => {
    for (const head of [-1, 8, 99, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { container, unmount } = render(<Checker bits="10110010" head={head} />);
      expect(heads(container)).toHaveLength(0);
      unmount();
    }
  });
});
