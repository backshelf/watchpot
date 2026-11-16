import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { StrictMode, useRef } from "react";
import { coveredBy, type Edges, useClearUnder } from "../../src/ui/clear";

const box = (left: number, top: number, w: number, h: number): Edges => ({
  left,
  top,
  right: left + w,
  bottom: top + h,
});

describe("coveredBy", () => {
  test("is true for a mark a solid overlaps, within the margin, and false clear of it", () => {
    const marks = [box(0, 0, 10, 10), box(100, 0, 10, 10), box(200, 0, 10, 10)];
    const solids = [box(5, 5, 50, 50), box(113, 0, 10, 10)];
    expect(coveredBy(marks, solids, { margin: 4 })).toEqual([true, true, false]);
    expect(coveredBy(marks, solids, { margin: 0 })).toEqual([true, false, false]);
  });

  test("never covers a mark with no size", () => {
    expect(coveredBy([box(0, 0, 0, 0)], [box(-10, -10, 50, 50)])).toEqual([false]);
  });

  test("a solid scrolled out of the view covers nothing", () => {
    const view = box(0, 100, 500, 300);
    // The mark sits at the view's top edge; the solid is above the view, scrolled out.
    expect(coveredBy([box(0, 100, 10, 10)], [box(0, 60, 10, 38)], { view, margin: 4 })).toEqual([false]);
    expect(coveredBy([box(0, 100, 10, 10)], [box(0, 60, 10, 50)], { view, margin: 4 })).toEqual([true]);
  });
});

/** Gives an element a fixed box (happy-dom lays nothing out). */
function at(el: Element | null, b: Edges) {
  if (el)
    (el as HTMLElement).getBoundingClientRect = () =>
      ({ ...b, width: b.right - b.left, height: b.bottom - b.top, x: b.left, y: b.top }) as DOMRect;
}

function Page({ marks }: { marks: number }) {
  const decor = useRef<HTMLDivElement>(null);
  const over = useRef<HTMLDivElement>(null);
  useClearUnder(decor, over, { everyMs: 0, key: marks });
  return (
    <>
      <div ref={decor}>
        {Array.from({ length: marks }, (_, i) => (
          <span key={i} data-testid={`m${i}`} data-clear="" ref={(el) => at(el, box(i * 100, 0, 20, 20))} />
        ))}
      </div>
      <div data-testid="stage">
        <div
          ref={(el) => {
            over.current = el;
            at(el, box(0, 0, 1000, 1000));
          }}
        >
          <section data-solid="" ref={(el) => at(el, box(90, 0, 50, 50))} />
        </div>
      </div>
    </>
  );
}

describe("useClearUnder", () => {
  test("marks what a solid covers at mount, under StrictMode", () => {
    const { getByTestId } = render(
      <StrictMode>
        <Page marks={3} />
      </StrictMode>,
    );
    expect(getByTestId("m0").hasAttribute("data-covered")).toBe(false);
    expect(getByTestId("m1").hasAttribute("data-covered")).toBe(true);
    expect(getByTestId("m2").hasAttribute("data-covered")).toBe(false);
  });
});
