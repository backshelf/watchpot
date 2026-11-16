import { describe, expect, mock, test } from "bun:test";
import { createClock, type Visibility } from "watchpot/core";

/** A clock on a hand-moved wall and a hand-flipped visibility, with no interval running. */
function harness() {
  let at = 0;
  let hidden = false;
  let notify = () => {};
  const visibility: Visibility = {
    hidden: () => hidden,
    subscribe: (cb) => {
      notify = cb;
      return () => {};
    },
  };
  const onTick = mock((_dt: number, _now: number) => {});
  const onAway = mock((_elapsed: number, _now: number) => {});
  const clock = createClock(
    { onTick, onAway },
    {
      now: () => at,
      maxStepMs: 1000,
      awayAfterMs: 5000,
      schedule: () => null,
      cancel: () => {},
      visibility,
    },
  );
  clock.start();
  const away = (ms: number) => {
    hidden = true;
    notify();
    at += ms;
    hidden = false;
    notify();
  };
  return { onTick, onAway, away };
}

describe("createClock, on return to the tab", () => {
  test("a hidden spell up to awayAfterMs is paid as live ticks, in maxStepMs slices", () => {
    const { onTick, onAway, away } = harness();
    away(2500);
    expect(onAway).not.toHaveBeenCalled();
    const dts = onTick.mock.calls.map(([dt]) => dt);
    expect(dts.every((dt) => dt > 0 && dt <= 1000)).toBe(true);
    expect(dts.reduce((a, b) => a + b, 0)).toBe(2500);
    const ends = onTick.mock.calls.map(([, now]) => now);
    expect(ends).toEqual([...ends].sort((a, b) => a - b));
    expect(ends.at(-1)).toBe(2500);
  });

  test("a longer spell is time away, paid once", () => {
    const { onTick, onAway, away } = harness();
    away(5001);
    expect(onTick).not.toHaveBeenCalled();
    expect(onAway.mock.calls).toEqual([[5001, 5001]]);
  });
});
