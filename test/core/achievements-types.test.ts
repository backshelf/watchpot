// The order of `achievements`' type parameters: key, state, effect, as `Achievement<G, E>` writes them. The checks
// are the compiler's: a wrong order fails `bun check`, and the runtime test only keeps the file in the suite.
import { expect, test } from "bun:test";
import { type AchievementsFeature, achievements } from "watchpot/core";

type Reads = { sky: { stars: number } };

test("the state type is second and is checked against `when`", () => {
  const wall = achievements<"wall", Reads>({
    key: "wall",
    columns: 2,
    list: [{ id: "first", name: "First", line: "A star.", when: (s) => s.sky.stars > 0 }],
  });
  const typed: AchievementsFeature<"wall", Reads, never> = wall;

  achievements<"bad", Reads>({
    key: "bad",
    columns: 1,
    // @ts-expect-error the state is `Reads`, which has no `moon`
    list: [{ id: "x", name: "X", line: "x", when: (s) => s.moon > 0 }],
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
        effects: [{ stat: "gain", mult: 2 }],
        when: (s: Reads) => s.sky.stars > 1,
      },
    ],
  });
  const both: AchievementsFeature<"inf", Reads, { stat: string; mult: number }> = inferred;
  expect([typed.key, both.key]).toEqual(["wall", "inf"]);
});
