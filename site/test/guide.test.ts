// The getting-started pages stay true to the examples they quote and run: every piece a page names is still in its
// file, every control's token is still where it was, the game still builds from the file, and the code a page tells
// the reader to type still runs. Plus the pure pieces the pages are built from.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { transform } from "sucrase";
import { createGameStorage, createIdleStore, createMemoryBackend, D, isDecimal } from "watchpot/core";
import {
  defaultsFor,
  editFor,
  exampleFiles,
  listing,
  modulesFor,
  paramFile,
  paramSite,
} from "../src/guide/data";
import { parseGlossary } from "../src/guide/glossary";
import { fresh, harness } from "../src/guide/kit/host";
import { liteTokens } from "../src/guide/kit/lite-highlight";
import type { PageDef } from "../src/guide/kit/page";
import { runProblem, syntaxProblem } from "../src/guide/kit/problem";
import { runModules } from "../src/guide/kit/run";
import { outline, pageFiles } from "../src/guide/pages";
import { dedent, findPiece, findToken } from "../src/guide/source";

const repoRoot = join(import.meta.dir, "../..");
const files = exampleFiles(repoRoot);
/** One run per line: the test checks the text, not the colours. */
const plain = (code: string) => code.split("\n").map((line) => [{ content: line }]);
const glossary = new Set(
  parseGlossary(readFileSync(join(repoRoot, "docs/glossary.md"), "utf8")).map((e) => e.id),
);
const pages = await Promise.all(
  pageFiles().map(async (f) => ({ ...f, page: (await import(f.path)).default as PageDef })),
);

describe("each getting-started page", () => {
  const steps = outline();
  for (const { slug, n, path, page } of pages) {
    describe(slug, () => {
      test("is a step of the outline, under its title", () => {
        expect(steps.find((s) => s.n === n)?.title).toBe(page.title);
      });

      test("quotes pieces that are still in their files, its controls' tokens marked", () => {
        for (const [id, def] of Object.entries(page.code ?? {})) {
          const code = listing(files, plain, def, page.game.file, page.params ?? {});
          const shown = code.lines.map((line) => line.map((run) => run[0]).join("")).join("\n");
          expect(shown.length, id).toBeGreaterThan(0);
          // The listing is the file's own text: each of its lines, folds aside, is a line of the file.
          const source = files.read(code.file);
          for (const line of shown.split("\n")) {
            if (line.trim() === "// ...") continue;
            expect(source.includes(line.trim()), `${id}: ${line}`).toBe(true);
          }
          for (const run of code.lines.flat()) {
            if (run[2])
              expect(run[0], `${id}: the token of ${run[2]}`).toBe(source.slice(...rangeOf(run[2])));
          }
        }
        function rangeOf(name: string): [number, number] {
          const def = page.params?.[name];
          if (!def) throw new Error(`no param ${name}`);
          const r = paramSite(files.read(paramFile(def, page.game.file)), def).range;
          return [r.start, r.end];
        }
      });

      test("runs its game from the file, at every value its controls can take", () => {
        const params = page.params ?? {};
        const modules = modulesFor(files, page.game.file, params);
        const defaults = defaultsFor(files, page);
        expect(() => fresh(modules, defaults, page.game)).not.toThrow();
        for (const [name, def] of Object.entries(params)) {
          const values = def.kind === "choice" ? def.options.map((_, i) => i) : [def.min, def.max];
          for (const value of values)
            expect(() => fresh(modules, { ...defaults, [name]: value }, page.game)).not.toThrow();
        }
      });

      test("names only glossary words that exist", () => {
        const text = readFileSync(path, "utf8");
        for (const m of text.matchAll(/<Term id="([^"]+)"/g))
          expect(glossary.has(m[1] ?? ""), m[1]).toBe(true);
      });

      if (page.game.edit) {
        test("has a code box whose piece is in the file and runs as it is", () => {
          const edit = editFor(files, page, "worker.js");
          expect(edit).not.toBeNull();
          if (edit) expect(runEdited(page, edit.piece)).toBeDefined();
        });
      }
    });
  }
});

/** The page's game with the box's piece replaced, run as the worker runs it: a store, made fresh. */
function runEdited(page: PageDef, piece: string) {
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
  const storage = () => createGameStorage(createMemoryBackend());
  const modules = modulesFor(files, main, {});
  const exports = runModules(
    { main, js: { ...modules.js, [main]: code } },
    harness(made, () => 0, storage),
  );
  // As the worker does: the store the example made, or one made from its `game` (game-wallet.ts makes none).
  const store = made[0] ?? createIdleStore(exports.game as never, { now: () => 0, storage: storage() });
  return store as Store;
}

type Store = { getState(): Record<string, Record<string, unknown>> };

/** Calls one of the pot's actions, failing the test when there is none. */
function press(store: Store, action: string) {
  const fn = store.getState().pot?.[action];
  if (typeof fn !== "function") throw new Error(`no pot.${action}`);
  fn();
}

describe("the button page's suggested edits", () => {
  const button = pages.find((p) => p.slug.startsWith("03-"))?.page;
  test("tapTen, typed as the page shows it, pays ten", () => {
    if (!button) throw new Error("no page 3");
    const page = readFileSync(pages.find((p) => p.slug.startsWith("03-"))?.path ?? "", "utf8");
    const typed = /\{`(tapTen: \(\) =>[\s\S]*?)`\}/.exec(page)?.[1];
    expect(typed).toBeDefined();
    const original = editFor(files, button, "worker.js")?.piece ?? "";
    // Below `tap`, as the page says: before the line that closes `actions`.
    const at = original.lastIndexOf("})");
    const edited = `${original.slice(0, at)}${(typed ?? "").replace(/^/gm, "  ")}\n${original.slice(at)}`;
    const store = runEdited(button, edited);
    press(store, "tapTen");
    expect(String(store?.getState().pot?.bubbles)).toBe("10");
  });

  test("dropping the assignment leaves the bubbles where they were", () => {
    if (!button) throw new Error("no page 3");
    const original = editFor(files, button, "worker.js")?.piece ?? "";
    const store = runEdited(
      button,
      original.replace("s.pot.bubbles = s.pot.bubbles.add(1);", "s.pot.bubbles.add(5);"),
    );
    press(store, "tap");
    expect(D(store.getState().pot?.bubbles as never).eq(0)).toBe(true);
  });
});

describe("the layer page's code box", () => {
  const entry = pages.find((p) => p.slug.startsWith("13-"));
  const words = entry ? readFileSync(entry.path, "utf8") : "";
  const layer = (piece: string) => {
    if (!entry) throw new Error("no page 13");
    return runEdited(entry.page, piece);
  };
  const original = () => (entry ? (editFor(files, entry.page, "worker.js")?.piece ?? "") : "");
  /** The box's second layer: its comment and its line. */
  const SECOND = /\n\s*\/\/ A second layer[^\n]*\n\s*\{ canBuy:[^\n]*\n/;

  test("holds a second layer the page can tell the reader to delete", () => {
    expect(SECOND.test(original())).toBe(true);
  });

  test("without the second layer, canBuy is not there", () => {
    expect(layer(original().replace(SECOND, "\n")).getState().stove?.canBuy).toBeUndefined();
  });

  test("typed back as the page shows it, canBuy answers again", () => {
    const typed = /<code>\{"(\{ canBuy: \(s\) =>[^"]+)"\}<\/code>/.exec(words)?.[1];
    expect(typed).toBeDefined();
    expect(layer(original().replace(SECOND, `\n  ${typed}\n`)).getState().stove?.canBuy).toBe(false);
  });

  test("grown with shortBy as the page shows it, shortBy is the next price while the wallet is empty", () => {
    const typed = /\{`(\{\n {2}canBuy:[\s\S]*?)`\}/.exec(words)?.[1];
    expect(typed).toBeDefined();
    const store = layer(original().replace(SECOND, `\n${(typed ?? "").replace(/^/gm, "  ")}\n`));
    const shortBy = store.getState().stove?.shortBy;
    expect(isDecimal(shortBy)).toBe(true);
    expect(String(shortBy)).toBe(String(store.getState().stove?.nextPrice));
  });

  test("a canBuy that reads itself is refused, the loop named", () => {
    const loop = "{ canBuy: (s) => s.stove.canBuy || s.wallet.bubbles.gte(s.stove.nextPrice) },";
    expect(words).toContain("canBuy: (s) => s.stove.canBuy || s.wallet.bubbles.gte(s.stove.nextPrice),");
    expect(() => layer(original().replace(SECOND, `\n  ${loop}\n`))).toThrow(/loop: stove\.canBuy/);
  });
});

describe("the derived value page's note", () => {
  test("inside an action, a derived value is as of the action's start, and current after it", () => {
    type Stove = { stove: { burners: number; nextPrice: unknown } };
    const { game } = runPage("12-").exports as { game: unknown };
    const store = createIdleStore(game as never, {
      now: () => 1,
      storage: createGameStorage(createMemoryBackend()),
    }) as unknown as { setState(recipe: (s: Stove) => void): void; getState(): Stove };
    const seen: string[] = [];
    // The note's snippet, as an action's recipe.
    store.setState((s) => {
      seen.push(String(s.stove.nextPrice));
      s.stove.burners += 1;
      seen.push(String(s.stove.nextPrice));
    });
    expect(seen[1]).toBe(seen[0]);
    expect(String(store.getState().stove.nextPrice)).not.toBe(seen[0]);
  });
});

/** A page's example, run as the panel runs it, with some of its controls moved. */
function runPage(prefix: string, values: Record<string, number> = {}) {
  const entry = pages.find((p) => p.slug.startsWith(prefix));
  if (!entry) throw new Error(`no page ${prefix}`);
  const { page } = entry;
  const modules = modulesFor(files, page.game.file, page.params ?? {});
  return fresh(modules, { ...defaultsFor(files, page), ...values }, page.game);
}

describe("what the pages show still holds", () => {
  test("the Decimal page: >= says a balance of 9 covers 10, gte does not", () => {
    const covers = (compare: number) =>
      (runPage("08-", { compare }).exports.covers as (a: unknown, b: unknown) => boolean)(D(9), D(10));
    expect(covers(0)).toBe(false);
    expect(covers(1)).toBe(true);
  });

  test("the Decimal page: past 308 zeros the number gives up and the Decimal does not", () => {
    const tenToThe = runPage("08-", { zeros: 309 }).exports.tenToThe as () => {
      plain: number;
      decimal: unknown;
    };
    const { plain, decimal } = tenToThe();
    expect(plain).toBe(Infinity);
    expect(String(decimal)).toBe("1e309");
  });

  test("the printing page: a count is rounded down, and its notation is the player's", () => {
    const onScreen = (values: Record<string, number>) =>
      (runPage("09-", values).exports.onScreen as () => { shown: { text: string } })().shown.text;
    expect(onScreen({ bubbles: 1.529e6 })).toBe("1.52M");
    expect(onScreen({ bubbles: 1.529e6, notation: 1 })).toBe("1.52e6");
  });

  test("the page that runs main.tsx mounts its App, and leaving the clock hook out still mounts it", () => {
    for (const clock of [0, 1]) expect(runPage("05-", { clock }).mount).not.toBeNull();
    expect(runPage("18-").mount).not.toBeNull();
  });
});

describe("finding a piece of an example", () => {
  const text = [
    "/** The pot. */",
    "export const pot = defineFeature({",
    '  key: "pot",',
    "  actions: (api) => ({",
    "    tap: () =>",
    "      api.set((s) => {",
    "        s.n += 1;",
    "      }),",
    "  }),",
    "});",
    "export const RATE = 1.15;",
  ].join("\n");

  test("a top-level symbol brings its doc comment and ends at its closing line", () => {
    const r = findPiece(text, "pot");
    expect(text.slice(r.start, r.end).split("\n")).toHaveLength(10);
    expect(text.slice(r.start, r.end).startsWith("/** The pot. */")).toBe(true);
  });

  test("a nested key ends at its own closing line, not its parent's", () => {
    const r = findPiece(text, "pot > actions > tap");
    expect(dedent(text.slice(r.start, r.end)).text.split("\n")).toEqual([
      "tap: () =>",
      "  api.set((s) => {",
      "    s.n += 1;",
      "  }),",
    ]);
  });

  test("a one-line entry is its line", () => {
    const r = findPiece(text, "pot > key");
    expect(text.slice(r.start, r.end).trim()).toBe('key: "pot",');
  });

  test("a name bound by destructuring, or a top-level call, is a piece of one statement", () => {
    const tsx = [
      "/** The hooks. */",
      "const { useA, useB } = make();",
      "function App() {",
      "  return null;",
      "}",
      "mountGame(store, <App />);",
    ].join("\n");
    const hooks = findPiece(tsx, "useB");
    expect(tsx.slice(hooks.start, hooks.end)).toBe("/** The hooks. */\nconst { useA, useB } = make();");
    const mount = findPiece(tsx, "mountGame");
    expect(tsx.slice(mount.start, mount.end)).toBe("mountGame(store, <App />);");
  });

  test("a token must be found once, inside its text", () => {
    const piece = findPiece(text, "RATE");
    expect(text.slice(...Object.values(findToken(text, piece, "= 1.15", "1.15")))).toBe("1.15");
    expect(() => findToken(text, piece, "= 2", "2")).toThrow();
    expect(() => findPiece(text, "nothing")).toThrow();
  });
});

describe("the code box's words", () => {
  test("a syntax error names the box's line, not the file's", () => {
    const p = syntaxProblem(new Error('Unexpected token, expected "," (16:18)'), 16, 21);
    expect(p.line).toBe(1);
    expect(p.detail).toContain("`,`");
  });

  test("an error outside the box names no line", () => {
    expect(syntaxProblem(new Error("Unexpected token (40:2)"), 16, 21).line).toBeUndefined();
  });

  test("a misspelt name is said plainly", () => {
    const e = new TypeError("Cannot read properties of undefined (reading 'add')");
    expect(runProblem(e, "x.ts", 1, 5, "while it ran").title).toContain("undefined");
    const f = new ReferenceError("bubbels is not defined");
    expect(runProblem(f, "x.ts", 1, 5, "while it ran").title).toContain("`bubbels`");
  });

  test("the colourer keeps every character", () => {
    const code = 'tap: () => api.set((s) => { s.n = s.n.add(1); /* c */ "x" })';
    expect(
      liteTokens(code)
        .map(([t]) => t)
        .join(""),
    ).toBe(code);
  });
});

describe("the glossary for popups", () => {
  test("an entry's In short line wins over its first sentence", () => {
    const [entry, other] = parseGlossary(
      "# G\n\n## Tick\n\n**In short:** One small step.\n\nLonger text. More.\n\n## Pass\n\nOne run of `every` phase. Two.\n",
    );
    expect(entry).toEqual({ id: "tick", title: "Tick", short: "One small step.", plain: true });
    expect(other?.short).toBe("One run of every phase.");
  });
});
