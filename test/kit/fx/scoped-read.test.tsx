import { describe, expect, test } from "bun:test";
import { act, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { readToken, useScopedRead } from "../../../src/kit/fx/tokens";

/** What a scope sets, keyed by its nearest `data-world` and then its nearest `data-theme`. */
const WORLD_TOKENS: Record<string, string> = { lobby: "#ff5a36", cards: "#4fd8ff" };
const THEME_TOKENS: Record<string, string> = { game: "#0b0b0c", irl: "#e8e2d4" };

/**
 * Stubs `getComputedStyle` (happy-dom does not inherit custom properties): `--accent` answers the element's
 * nearest `data-world`, `--ground` its nearest `data-theme`. Returns the restore.
 */
function stubTokens(): () => void {
  const real = globalThis.getComputedStyle;
  globalThis.getComputedStyle = ((el: Element) => {
    const world = el.closest("[data-world]")?.getAttribute("data-world") ?? "";
    const theme = el.closest("[data-theme]")?.getAttribute("data-theme") ?? "game";
    const tokens: Record<string, string | undefined> = {
      "--accent": WORLD_TOKENS[world],
      "--ground": THEME_TOKENS[theme],
    };
    return { getPropertyValue: (name: string) => tokens[name] ?? "" };
  }) as typeof getComputedStyle;
  return () => {
    globalThis.getComputedStyle = real;
  };
}

// Module-level readers, so their identity is stable across renders (as every caller's is).
const readAccent = (scope: Element) => readToken("--accent", scope) || null;
const readGround = (scope: Element) => readToken("--ground", scope) || null;

function Probe({ read }: { read: (scope: Element) => string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const value = useScopedRead(ref, true, read);
  return <div ref={ref} data-testid="probe" data-value={value ?? ""} />;
}

const probe = () => screen.getByTestId("probe").getAttribute("data-value");

describe("a scoped read", () => {
  test("is read again when the scope's data-world changes, by a render and by the attribute", async () => {
    const restore = stubTokens();
    try {
      const view = render(
        <div data-theme="game" data-world="lobby">
          <Probe read={readAccent} />
        </div>,
      );
      expect(probe()).toBe("#ff5a36");

      // A tab switch: the page root re-renders with the next world on it.
      view.rerender(
        <div data-theme="game" data-world="cards">
          <Probe read={readAccent} />
        </div>,
      );
      expect(probe()).toBe("#4fd8ff");

      // The attribute changed under a mounted reader, outside any commit of its own.
      await act(async () => {
        view.container.firstElementChild?.setAttribute("data-world", "lobby");
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(probe()).toBe("#ff5a36");
    } finally {
      restore();
    }
  });

  test("is read from the element's own theme scope, and again when that scope changes", async () => {
    const restore = stubTokens();
    document.documentElement.dataset.theme = "irl";
    try {
      // The lobby mounting on the way back from IRL: <html> still says irl, the game tab's root says game.
      const view = render(
        <div data-theme="game">
          <Probe read={readGround} />
        </div>,
      );
      expect(probe()).toBe("#0b0b0c");
      view.unmount();

      // A reader scoped only by <html> follows <html>'s switch.
      render(<Probe read={readGround} />);
      expect(probe()).toBe("#e8e2d4");
      await act(async () => {
        document.documentElement.dataset.theme = "game";
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(probe()).toBe("#0b0b0c");
    } finally {
      document.documentElement.dataset.theme = "game";
      restore();
    }
  });
});
