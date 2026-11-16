import { expect, test } from "bun:test";

/**
 * The package must not declare `sideEffects`. With it (0.3.2), Bun's development bundler wrapped
 * `zustand/middleware/immer` in a lazy initializer and called it before it had run: a game's dev page stayed blank
 * with "immer2 is not a function" while the production build was fine. What it saved a game was under a kilobyte.
 * Before bringing it back, load a game's dev server in a browser on the Bun version in use.
 */
test("the package declares no sideEffects", async () => {
  const pkg = (await Bun.file("package.json").json()) as Record<string, unknown>;
  expect("sideEffects" in pkg).toBe(false);
});
