// What types `achievements`' callbacks: the state from an annotation or from `reach`, the effect from the list. The
// checks are the compiler's: a wrong type fails `bun check`, and the runtime test only keeps the file in the suite.
import { expect, test } from "bun:test";
import { type AchievementsFeature, achievements, feature } from "watchpot/core";

type Reads = { sky: { stars: number } };

const sky = feature({ key: "sky", initial: () => ({ stars: 0 }) });
const moon = feature({ key: "moon", initial: () => ({ phase: 0 }) });

test("an annotated callback gives the state, and a wrong read fails", () => {
  const wall = achievements({
    key: "wall",
    columns: 2,
    list: [{ id: "first", name: "First", line: "A star.", when: (s: Reads) => s.sky.stars > 0 }],
  });
  const typed: AchievementsFeature<"wall", Reads, never> = wall;

  achievements({
    key: "bad",
    columns: 1,
    // @ts-expect-error the state is `Reads`, which has no `moon`
    list: [{ id: "x", name: "X", line: "x", when: (s: Reads) => s.moon > 0 }],
  });

  // Inferred: the state from the annotated callback, the effect from the list.
  const inferred = achievements({
    key: "inf",
    columns: 1,
    list: [
      {
        id: "y",
        name: "Y",
        line: "y",
        effects: [{ stat: "gain", mul: 2 }],
        when: (s: Reads) => s.sky.stars > 1,
      },
    ],
  });
  const both: AchievementsFeature<"inf", Reads, { stat: string; mul: number }> = inferred;
  expect([typed.key, both.key]).toEqual(["wall", "inf"]);
});

test("`reach` types the callbacks: a reached feature reads, an unreached one does not", () => {
  const wall = achievements({
    key: "wall",
    reach: () => [sky],
    columns: 2,
    list: [{ id: "first", name: "First", line: "A star.", when: (s) => s.sky.stars > 0 }],
    onEarn: (d) => {
      d.wall.fresh.length;
      d.sky.stars;
    },
  });

  achievements({
    key: "bad",
    reach: [sky],
    columns: 1,
    list: [
      {
        id: "x",
        name: "X",
        line: "x",
        // @ts-expect-error moon is not reached
        when: (s) => s.moon.phase > 0,
      },
    ],
  });

  // Its own slice is always there.
  achievements({
    key: "own",
    columns: 1,
    list: [{ id: "z", name: "Z", line: "z", when: (s) => Object.keys(s.own.earned).length > 3 }],
  });
  expect([wall.key, moon.key]).toEqual(["wall", "moon"]);
});
