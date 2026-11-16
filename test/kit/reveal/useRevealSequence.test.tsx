import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { setReducedMotion } from "../../../src/kit/fx/motion";
import { RevealSequence, type RevealSequenceProps } from "../../../src/kit/reveal/useRevealSequence";

/** A three-rung ladder: the sequence knows no game's rarities, only where each payload's rung stands. */
const LADDER = ["low", "mid", "top"] as const;
type Rung = (typeof LADDER)[number];
interface Prize {
  rarity: Rung;
  name: string;
}

const PRIZES: readonly Prize[] = [
  { rarity: "mid", name: "Lamp" },
  { rarity: "top", name: "Crown" },
  { rarity: "low", name: "Spoon" },
];

/** Lets a face's landing (a zero timer under reduced motion) arrive. */
const settle = () => act(() => new Promise<void>((done) => setTimeout(done, 5)));

/** A bare reveal drawn from the render prop: a stage that taps, the tone, the face in the centre, a summary. */
function Bare(props: Partial<RevealSequenceProps<Rung, Prize>> & { ladder?: readonly Rung[] }) {
  return (
    <RevealSequence<Rung, Prize> result={PRIZES} ladder={LADDER} payloads={PRIZES} gift {...props}>
      {(reveal) => (
        <div
          data-testid="stage"
          data-phase={reveal.state.phase}
          data-tone={reveal.tone ?? ""}
          tabIndex={-1}
          onClick={reveal.tap}
          onKeyDown={reveal.onKeyDown}
        >
          {reveal.stage && <p data-testid="centre">{reveal.stage.payload.name}</p>}
          <span data-testid="left">{reveal.remaining}</span>
          {reveal.state.phase === "summary" && <p data-testid="best">{reveal.best}</p>}
          {reveal.state.phase !== "summary" && (
            <button type="button" onClick={reveal.skip}>
              Skip
            </button>
          )}
        </div>
      )}
    </RevealSequence>
  );
}

describe("useRevealSequence", () => {
  // Reduced motion: every beat is a fade, so a tap moves on at once and nothing waits on a turn.
  beforeEach(() => setReducedMotion("reduced"));
  afterEach(() => setReducedMotion("system"));

  test("plays the payloads in order, charges the top rung first, never lets the light fall, and reports the best", async () => {
    const turned: string[] = [];
    const landed: [string, boolean][] = [];
    const charged: string[] = [];
    const onSummary = mock(() => {});
    render(
      <Bare
        onTurn={(p) => turned.push(p.name)}
        onLand={(p, _i, landing) => landed.push([p.name, landing.big])}
        onCharge={(p) => charged.push(p.name)}
        onSummary={onSummary}
      />,
    );
    const stage = screen.getByTestId("stage");
    const tap = async () => {
      fireEvent.click(stage);
      await settle();
    };

    await tap();
    expect(screen.getByTestId("centre").textContent).toBe("Lamp");
    expect(stage.getAttribute("data-tone")).toBe("mid");
    // The top rung lifts face down and the room takes its colour before it turns.
    await tap();
    expect(charged).toEqual(["Crown"]);
    expect(screen.queryByTestId("centre")).toBeNull();
    expect(stage.getAttribute("data-tone")).toBe("top");
    await tap();
    expect(screen.getByTestId("centre").textContent).toBe("Crown");
    await tap();
    expect(screen.getByTestId("centre").textContent).toBe("Spoon");
    expect(screen.getByTestId("left").textContent).toBe("0");
    // The light never falls back: the low face stands in the top rung's.
    expect(stage.getAttribute("data-tone")).toBe("top");
    expect(turned).toEqual(["Lamp", "Crown", "Spoon"]);
    expect(landed).toEqual([
      ["Lamp", false],
      ["Crown", true],
      ["Spoon", false],
    ]);

    await tap();
    expect(stage.getAttribute("data-phase")).toBe("summary");
    expect(screen.getByTestId("best").textContent).toBe("top");
    expect(onSummary).toHaveBeenCalledTimes(1);
  });

  test("the stage's keys tap only when the stage itself has focus, and Skip goes to the summary", async () => {
    render(<Bare />);
    const stage = screen.getByTestId("stage");
    fireEvent.keyDown(screen.getByRole("button", { name: "Skip" }), { key: "Enter" });
    await settle();
    expect(screen.queryByTestId("centre")).toBeNull();
    fireEvent.keyDown(stage, { key: "Enter" });
    await settle();
    expect(screen.getByTestId("centre").textContent).toBe("Lamp");
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(stage.getAttribute("data-phase")).toBe("summary");
  });

  test("a face still lands when the ladder comes back as a new array on a re-render", async () => {
    const landed: string[] = [];
    const onLand = (p: Prize) => landed.push(p.name);
    const { rerender } = render(<Bare ladder={[...LADDER]} onLand={onLand} />);
    fireEvent.click(screen.getByTestId("stage"));
    act(() => rerender(<Bare ladder={[...LADDER]} onLand={onLand} />));
    await settle();
    expect(landed).toEqual(["Lamp"]);
  });

  test("a new result starts over at the box", async () => {
    const { rerender } = render(<Bare gift={false} />);
    const stage = screen.getByTestId("stage");
    expect(stage.getAttribute("data-phase")).toBe("chest");
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(stage.getAttribute("data-phase")).toBe("summary");
    rerender(<Bare gift={false} result={[...PRIZES]} />);
    expect(stage.getAttribute("data-phase")).toBe("chest");
  });
});
