import { describe, expect, spyOn, test } from "bun:test";
import { act, render, screen } from "@testing-library/react";
import { StrictMode, useRef } from "react";
import { parseColour, useShaderTokens } from "watchpot/shader";

/**
 * Prints the tokens read at its own scope, or "none". The tokens sit on the scope itself: happy-dom does not
 * inherit custom properties into children, where a browser would read them from the theme above.
 */
function Palette() {
  const ref = useRef<HTMLDivElement>(null);
  const tokens = useShaderTokens(ref, ["--ground", "--ink"]);
  return (
    <div ref={ref} data-testid="scope" style={{ "--ground": "#ffffff", "--ink": "#000000" }}>
      {tokens ? `${tokens["--ground"]} ${tokens["--ink"]}` : "none"}
    </div>
  );
}

/** Asks for a token its scope does not define. */
function Missing() {
  const ref = useRef<HTMLDivElement>(null);
  const tokens = useShaderTokens(ref, ["--ground", "--glow"]);
  return (
    <div ref={ref} style={{ "--ground": "#ffffff" }}>
      {tokens ? "read" : "none"}
    </div>
  );
}

describe("parseColour", () => {
  test("every hex form becomes #rrggbbaa; empty and unknown are null", () => {
    expect(parseColour("#abc")).toBe("#aabbccff");
    expect(parseColour(" #AABBCC ")).toBe("#aabbccff");
    expect(parseColour("#11223344")).toBe("#11223344");
    expect(parseColour("")).toBeNull();
  });
});

describe("useShaderTokens", () => {
  test("reads the tokens at its scope as colours, null until all are; again when the scope changes", async () => {
    render(<Palette />);
    const scope = screen.getByTestId("scope");
    expect(scope).toHaveTextContent("#ffffffff #000000ff");
    await act(async () => scope.setAttribute("style", "--ground: #102030; --ink: #fff"));
    expect(scope).toHaveTextContent("#102030ff #ffffffff");
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    await act(async () => scope.setAttribute("style", "--ground: #102030"));
    warn.mockRestore();
    expect(scope).toHaveTextContent("none");
  });

  test("a token with no value is named in development, once, under StrictMode", () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    try {
      render(
        <StrictMode>
          <Missing />
        </StrictMode>,
      );
      expect(screen.getByText("none")).toBeInTheDocument();
      expect(warn).toHaveBeenCalledTimes(1);
      const said = String(warn.mock.calls[0]?.[0]);
      expect(said).toContain("--glow");
      expect(said).not.toContain("--ground");
    } finally {
      warn.mockRestore();
    }
  });

  test("an ancestor's data-theme, data-scheme or class change reads again", async () => {
    render(
      <div data-testid="theme" data-theme="day">
        <Palette />
      </div>,
    );
    const reads = spyOn(globalThis, "getComputedStyle");
    try {
      const theme = screen.getByTestId("theme");
      await act(async () => theme.setAttribute("data-theme", "night"));
      const afterTheme = reads.mock.calls.length;
      expect(afterTheme).toBeGreaterThan(0);
      await act(async () => document.documentElement.setAttribute("data-scheme", "dark"));
      await act(async () => theme.setAttribute("class", "x"));
      expect(reads.mock.calls.length).toBeGreaterThan(afterTheme + 1);
      await act(async () => theme.setAttribute("title", "ignored"));
      const settled = reads.mock.calls.length;
      await act(async () => theme.setAttribute("title", "still ignored"));
      expect(reads.mock.calls.length).toBe(settled);
    } finally {
      reads.mockRestore();
      document.documentElement.removeAttribute("data-scheme");
    }
  });
});
