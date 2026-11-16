import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { type JournalLine, pushLine } from "watchpot/core";
import { useHotkeys, useNews } from "watchpot/react";

afterEach(cleanup);

const line = (text: string): JournalLine => ({ at: 0, kind: "note", text });

function News({ log, onLine }: { log: JournalLine[]; onLine: (l: JournalLine) => void }) {
  useNews(log, onLine);
  return null;
}

function Keys({ keys, enabled }: { keys: Record<string, (e: KeyboardEvent) => void>; enabled?: boolean }) {
  useHotkeys(keys, { enabled });
  return <input aria-label="field" />;
}

describe("useNews", () => {
  test("nothing is news on mount", () => {
    const onLine = mock();
    render(<News log={[line("a")]} onLine={onLine} />);
    expect(onLine).not.toHaveBeenCalled();
  });

  test("each new line is called once, in order", () => {
    const onLine = mock();
    const first = [line("a")];
    const { rerender } = render(<News log={first} onLine={onLine} />);
    const next = [...first];
    pushLine(next, line("b"));
    pushLine(next, line("c"));
    rerender(<News log={next} onLine={onLine} />);
    expect(onLine.mock.calls.map(([l]) => (l as JournalLine).text)).toEqual(["b", "c"]);
  });

  test("an empty log at mount makes the first line news", () => {
    const onLine = mock();
    const { rerender } = render(<News log={[]} onLine={onLine} />);
    rerender(<News log={[line("a")]} onLine={onLine} />);
    expect(onLine).toHaveBeenCalledTimes(1);
  });

  test("a replaced log calls nothing", () => {
    const onLine = mock();
    const { rerender } = render(<News log={[line("a")]} onLine={onLine} />);
    rerender(<News log={[line("x"), line("y")]} onLine={onLine} />);
    expect(onLine).not.toHaveBeenCalled();
  });
});

describe("useHotkeys", () => {
  test("a key calls its handler, lower-cased", () => {
    const g = mock();
    render(<Keys keys={{ g }} />);
    act(() => {
      fireEvent.keyDown(window, { key: "G" });
    });
    expect(g).toHaveBeenCalledTimes(1);
  });

  test("ctrl, a field and enabled false do not", () => {
    const g = mock();
    const { getByLabelText, rerender } = render(<Keys keys={{ g }} />);
    fireEvent.keyDown(window, { key: "g", ctrlKey: true });
    fireEvent.keyDown(getByLabelText("field"), { key: "g" });
    expect(g).not.toHaveBeenCalled();
    rerender(<Keys keys={{ g }} enabled={false} />);
    fireEvent.keyDown(window, { key: "g" });
    expect(g).not.toHaveBeenCalled();
  });
});
