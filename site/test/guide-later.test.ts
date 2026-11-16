// The code that getting started's later steps tell the reader to type still does what the words say: step 13's
// layer, typed back and grown, and the loop it refuses. (Steps 10 to 18; `guide.test.ts` checks every page's pieces.)
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { transform } from "sucrase";
import { createGameStorage, createIdleStore, createMemoryBackend, isDecimal } from "watchpot/core";
import { editFor, exampleFiles, modulesFor } from "../src/guide/data";
import { harness } from "../src/guide/kit/host";
import type { PageDef } from "../src/guide/kit/page";
import { runModules } from "../src/guide/kit/run";
import { pageFiles } from "../src/guide/pages";

const repoRoot = join(import.meta.dir, "../..");
const files = exampleFiles(repoRoot);

type Store = { getState(): Record<string, Record<string, unknown>> };

const layerPage = pageFiles().find((f) => f.slug === "13-a-later-layer");
const page = layerPage ? ((await import(layerPage.path)).default as PageDef) : null;
const words = layerPage ? readFileSync(layerPage.path, "utf8") : "";

/** The page's game with the box's piece replaced, run as the worker runs it: a store, made fresh. */
function runEdited(piece: string): Store {
  if (!page) throw new Error("no step 13");
  const edit = editFor(files, page, "worker.js");
  if (!edit) throw new Error("no code box");
  const pad = " ".repeat(edit.indent);
  const body = piece
    .split("\n")
    .map((l) => (l.trim() === "" ? "" : pad + l))
    .join("\n");
  const main = page.game.file;
  const code = transform(edit.before + body + edit.after, {
    transforms: ["typescript", "imports"],
    production: true,
  }).code;
  const made: unknown[] = [];
  const exports = runModules(
    { main, js: { ...modulesFor(files, main, {}).js, [main]: code } },
    harness(
      made,
      () => 0,
      () => createGameStorage(createMemoryBackend()),
    ),
  );
  // As the worker does: the store the example made, or one made from its `game` (game-wallet.ts makes none).
  return (made[0] ??
    createIdleStore(exports.game as never, {
      now: () => 0,
      storage: createGameStorage(createMemoryBackend()),
    })) as Store;
}

const original = () => {
  if (!page) throw new Error("no step 13");
  return editFor(files, page, "worker.js")?.piece ?? "";
};

/** The box's second layer: its comment and its line. */
const SECOND = /\n\s*\/\/ A second layer[^\n]*\n\s*\{ canBuy:[^\n]*\n/;

describe("step 13's layer", () => {
  test("the box holds a second layer the page can tell the reader to delete", () => {
    expect(SECOND.test(original())).toBe(true);
  });

  test("without the second layer, canBuy is not there", () => {
    const store = runEdited(original().replace(SECOND, "\n"));
    expect(store.getState().stove?.canBuy).toBeUndefined();
  });

  test("typed back as the page shows it, canBuy answers again", () => {
    const typed = /<code>\{"(\{ canBuy: \(s\) =>[^"]+)"\}<\/code>/.exec(words)?.[1];
    expect(typed).toBeDefined();
    const store = runEdited(original().replace(SECOND, `\n  ${typed}\n`));
    expect(store.getState().stove?.canBuy).toBe(false);
  });

  test("grown with shortBy as the page shows it, shortBy is the next price while the wallet is empty", () => {
    const typed = /\{`(\{\n {2}canBuy:[\s\S]*?)`\}/.exec(words)?.[1];
    expect(typed).toBeDefined();
    const store = runEdited(original().replace(SECOND, `\n${(typed ?? "").replace(/^/gm, "  ")}\n`));
    const shortBy = store.getState().stove?.shortBy;
    expect(isDecimal(shortBy)).toBe(true);
    expect(String(shortBy)).toBe(String(store.getState().stove?.nextPrice));
  });

  test("a canBuy that reads itself is refused, the loop named", () => {
    const loop = "{ canBuy: (s) => s.stove.canBuy || s.wallet.bubbles.gte(s.stove.nextPrice) },";
    expect(words).toContain("canBuy: (s) => s.stove.canBuy || s.wallet.bubbles.gte(s.stove.nextPrice),");
    expect(() => runEdited(original().replace(SECOND, `\n  ${loop}\n`))).toThrow(/loop: stove\.canBuy/);
  });
});
