import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { Countdown, drawnShare, formatCountdown, Meter, Progress, Slider } from "watchpot/ui";

const share = (el: HTMLElement) => Number(el.style.getPropertyValue("--value"));

describe("Progress and Meter", () => {
  test("ARIA stays exact while the drawn share snaps to steps", () => {
    render(<Progress aria-label="Tier" value={4120} max={6000} steps={24} valueText="4,120 of 6,000" />);
    const bar = screen.getByRole("progressbar", { name: "Tier" });
    expect(bar).toHaveAttribute("aria-valuenow", "4120");
    expect(bar).toHaveAttribute("aria-valuemax", "6000");
    expect(bar).toHaveAttribute("aria-valuetext", "4,120 of 6,000");
    expect(share(bar)).toBe(16 / 24);
    expect(bar.querySelectorAll("[data-step]")).toHaveLength(24);
    expect(bar.querySelectorAll("[data-lit]")).toHaveLength(16);
    expect(bar).toHaveAttribute("data-state", "partial");
  });

  test("clamps, completes, and is indeterminate without a value", () => {
    const { rerender } = render(<Progress aria-label="Load" value={9} max={5} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "5");
    expect(bar).toHaveAttribute("data-state", "complete");
    rerender(<Progress aria-label="Load" value={null} />);
    expect(bar).not.toHaveAttribute("aria-valuenow");
    expect(bar).toHaveAttribute("data-state", "indeterminate");
  });

  test("a meter is a meter", () => {
    render(<Meter aria-label="Heat" value={0.25} />);
    const meter = screen.getByRole("meter", { name: "Heat" });
    expect(share(meter)).toBe(0.25);
  });

  test("stepProps gives each step its own props by index and whether it is lit", () => {
    render(
      <Progress
        aria-label="Heat"
        value={6}
        max={8}
        steps={8}
        stepProps={(i, lit) => ({ className: i >= 6 ? "red" : "green", "data-on": lit ? "y" : "n" }) as never}
      />,
    );
    const steps = [...screen.getByRole("progressbar").querySelectorAll("[data-step]")];
    expect(steps.map((s) => s.className)).toEqual([
      "green",
      "green",
      "green",
      "green",
      "green",
      "green",
      "red",
      "red",
    ]);
    expect(steps.map((s) => s.getAttribute("data-on")).join("")).toBe("yyyyyynn");
    expect(steps.map((s) => s.getAttribute("data-step")).join("")).toBe("01234567");
  });

  test("drawnShare: in 0..1, never full until the value is, whole steps when stepped", () => {
    expect(drawnShare(5, 0, 10)).toBe(0.5);
    expect(drawnShare(-1, 0, 10)).toBe(0);
    expect(drawnShare(99, 0, 100, 10)).toBe(0.9);
    expect(drawnShare(100, 0, 100, 10)).toBe(1);
    expect(drawnShare(5, 0, 0)).toBe(0);
    for (let v = 0; v <= 100; v += 7) {
      const s = drawnShare(v, 0, 100, 24);
      expect(Number.isInteger(Math.round(s * 24 * 1e9) / 1e9)).toBe(true);
      expect(s).toBeLessThanOrEqual(v / 100 + 1 / 48);
    }
  });
});

describe("Countdown", () => {
  test("a time element with its duration, warn under the threshold, ended at zero", () => {
    const { rerender, container } = render(<Countdown secondsLeft={700} warnUnder={600} />);
    const time = container.querySelector("time") as HTMLElement;
    expect(time).toHaveAttribute("datetime", "PT700S");
    expect(time).toHaveTextContent(formatCountdown(700));
    expect(time).not.toHaveAttribute("data-warn");
    rerender(<Countdown secondsLeft={599.6} warnUnder={600} />);
    expect(time).toHaveAttribute("data-warn");
    rerender(<Countdown secondsLeft={-3} warnUnder={600} />);
    expect(time).toHaveAttribute("data-ended");
    expect(time).not.toHaveAttribute("data-warn");
  });

  test("onEnd fires once on the edge to zero, not on a mount at zero", () => {
    const end = mock(() => {});
    const { rerender } = render(<Countdown secondsLeft={0} onEnd={end} />);
    expect(end).not.toHaveBeenCalled();
    rerender(<Countdown secondsLeft={2} onEnd={end} />);
    rerender(<Countdown secondsLeft={0} onEnd={end} />);
    rerender(<Countdown secondsLeft={0} onEnd={end} />);
    expect(end).toHaveBeenCalledTimes(1);
  });

  test("the game's own format", () => {
    render(<Countdown secondsLeft={61} format={(s) => `${s} s`} />);
    expect(screen.getByText("61 s")).toBeInTheDocument();
  });

  test("formatCountdown: clock inside a day, days and hours beyond, never negative", () => {
    expect(formatCountdown(-5)).toBe(formatCountdown(0));
    expect(formatCountdown(6 * 86_400 + 20 * 3600 + 59)).toBe("6d 20h");
  });
});

describe("Slider", () => {
  test("a range input with --value, valueText, and PageUp/Home/End steps", () => {
    const change = mock((_: number) => {});
    render(
      <Slider
        aria-label="Volume"
        defaultValue={50}
        step={5}
        valueText={(v) => `${v} percent`}
        onValueChange={change}
      />,
    );
    const slider = screen.getByRole("slider", { name: "Volume" });
    expect(slider).toHaveAttribute("aria-valuetext", "50 percent");
    expect(share(slider)).toBe(0.5);
    fireEvent.keyDown(slider, { key: "PageUp" });
    expect(change).toHaveBeenLastCalledWith(100);
    fireEvent.keyDown(slider, { key: "Home" });
    expect(change).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(slider, { key: "End" });
    expect(slider).toHaveAttribute("aria-valuetext", "100 percent");
  });
});
