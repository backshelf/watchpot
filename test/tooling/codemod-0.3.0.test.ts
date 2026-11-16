// The 0.3.0 codemod over a small fixture game built in a temp dir, and its vendor step over a fixture tree of old
// engine files (no git). The table is held to the real v0.1.11 barrels with one `git archive` of the five barrels.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import {
  gitTree,
  isRetired,
  LEGACY_EFFECTS_CSS,
  main,
  OLD_EXPORTS,
  type OldTree,
  plan,
  planVendor,
  rewriteFile,
  scanRefs,
  TAG,
} from "../../codemods/0.3.0-headless-kit";

const ROOT = join(import.meta.dir, "..", "..");

const GAME: Record<string, string> = {
  "src/app/App.tsx": `import { GameShell, type SheetRegistry, useGameRuntime } from "watchpot/react";
import { Button, cx, Ticker } from "watchpot/kit";
import "watchpot/kit/tokens.css";

const sheets: SheetRegistry = {};
export function App() {
  useGameRuntime({});
  return (
    <GameShell<"a"> sheets={sheets}>
      <Button className={cx("a")}>
        <Ticker value={1} />
      </Button>
    </GameShell>
  );
}
`,
  "src/screens/shop/Shop.tsx": `import type { ButtonProps, RarityTier } from "watchpot/kit";
import { formatCountdown as countdown, Panel as Box, useOpenerFocus, tierOf } from "watchpot/kit";
import { Tabs } from "watchpot/ui";

export function Shop(props: ButtonProps & { tier: RarityTier }) {
  useOpenerFocus();
  useOpenerFocus({ preventScroll: true });
  return <Box>{countdown(3)}{tierOf(1)}<Tabs /></Box>;
}
`,
  "src/index.ts": `export { Button, cx, shake } from "watchpot/kit";
export type { CardProps, FlashProps } from "watchpot/kit";
`,
  "src/fx.tsx": `import { Flash, FlightHost } from "watchpot/kit";

export const Fx = () => (
  <FlightHost>
    <Flash active />
  </FlightHost>
);
`,
  "test/ns.test.ts": `import * as kit from "watchpot/kit";
// import { Button } from "watchpot/kit";
const text = 'import { Button } from "watchpot/kit";';
export const all = [kit, text];
`,
  "sim/run.ts": `import { useIdleStore } from "watchpot/react";
export const run = useIdleStore;
`,
  "src/app/app.css": `@import "watchpot/kit/base.css";
body { margin: 0; }
`,
  "node_modules/dep/index.ts": `import { Button } from "watchpot/kit";\n`,
  "src/vendor/kit/stale.ts": `import { Button } from "watchpot/kit";\n`,
};

let root = "";
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "codemod-030-"));
  for (const [path, text] of Object.entries(GAME)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const after = (p: ReturnType<typeof plan>, file: string) => p.files.find((f) => f.file === file)?.after;
const humanAt = (p: ReturnType<typeof plan>) => p.human.map((h) => `${h.file}:${h.line}`);

describe("the import rewrite", () => {
  test("splits a react and a kit import three ways, into one ui and one local statement", () => {
    expect(
      after(plan({ root }), "src/app/App.tsx"),
    ).toStartWith(`import { useGameRuntime } from "watchpot/react";
import { type SheetRegistry, cx } from "watchpot/ui";
import { GameShell, Button } from "../vendor/kit/index";
import { Ticker } from "watchpot/kit";
import "watchpot/kit/tokens.css";
`);
  });

  test("keeps type-only imports type-only, keeps aliases, and merges into the file's own ui import", () => {
    expect(
      after(plan({ root }), "src/screens/shop/Shop.tsx"),
    ).toStartWith(`import type { RarityTier } from "watchpot/kit";
import { type ButtonProps, Panel as Box } from "../../vendor/kit/index";
import { tierOf } from "watchpot/kit";
import { Tabs, formatCountdown as countdown, useOpenerFocus } from "watchpot/ui";

export function Shop(props: ButtonProps & { tier: RarityTier }) {
  useOpenerFocus(true);
  useOpenerFocus({ preventScroll: true });
`);
  });

  test("splits an export-from, and an export type-from stays type-only", () => {
    expect(after(plan({ root }), "src/index.ts")).toBe(`export { shake } from "watchpot/kit";
export { cx } from "watchpot/ui";
export { Button } from "./vendor/kit/index";
export type { FlashProps } from "watchpot/kit";
export type { CardProps } from "./vendor/kit/index";
`);
  });

  test("leaves names that stayed, comments and strings alone, and skips node_modules and the local dir", () => {
    const p = plan({ root });
    expect(p.files.map((f) => f.file).sort()).toEqual([
      "src/app/App.tsx",
      "src/index.ts",
      "src/screens/shop/Shop.tsx",
    ]);
  });

  test("lists what it cannot prove, with file and line", () => {
    const p = plan({ root });
    expect(humanAt(p)).toEqual([
      "src/app/App.tsx:3", // the kit's CSS
      "src/app/App.tsx:9", // <GameShell
      "src/app/App.tsx:11", // <Ticker
      "src/app/app.css:1", // the kit's CSS from CSS
      "src/fx.tsx:4", // <FlightHost
      "src/fx.tsx:5", // <Flash
      "src/screens/shop/Shop.tsx:7", // useOpenerFocus with options
      "test/ns.test.ts:1", // namespace import
    ]);
    const why = (at: string) => p.human.find((h) => `${h.file}:${h.line}` === at)?.why ?? "";
    expect(why("src/app/App.tsx:9")).toContain("PageShell");
    expect(why("src/app/App.tsx:11")).toContain("wh-num");
    expect(why("src/fx.tsx:5")).toContain("src/vendor/kit/legacy-effects.css");
    expect(why("src/screens/shop/Shop.tsx:7")).toContain("(active: boolean, restore = true)");
    expect(why("test/ns.test.ts:1")).toContain("cannot be proved");
  });

  test("--local moves the target of every repointed import", () => {
    const p = plan({ root, local: "src/legacy" });
    expect(after(p, "src/app/App.tsx")).toContain(`import { GameShell, Button } from "../legacy/index";`);
    expect(after(p, "src/index.ts")).toContain(`export { Button } from "./legacy/index";`);
    // The old default local dir is a game folder now, and its stale import is read.
    expect(p.files.map((f) => f.file)).toContain("src/vendor/kit/stale.ts");
  });

  test("is idempotent: a second run over its own output changes nothing", () => {
    expect(main(["--write"], { cwd: root, log: () => {} })).toBe(0);
    const second = plan({ root });
    expect(second.files).toEqual([]);
  });

  test("keeps CRLF and a missing semicolon, and wraps a long statement", () => {
    const src =
      'import { Button, ButtonProps, Card, CardProps, Chest, ChestProps, Counter, CounterProps, Offer, Panel, cx } from "watchpot/kit"\r\nexport const x = 1\r\n';
    const out = rewriteFile(src, "src/a.ts", "src/vendor/kit").plan.after;
    expect(out).toBe(
      'import { cx } from "watchpot/ui"\r\n' +
        "import {\r\n  Button,\r\n  ButtonProps,\r\n  Card,\r\n  CardProps,\r\n  Chest,\r\n  ChestProps,\r\n" +
        '  Counter,\r\n  CounterProps,\r\n  Offer,\r\n  Panel,\r\n} from "./vendor/kit/index"\r\nexport const x = 1\r\n',
    );
  });

  test("a statement wholly merged elsewhere goes with its line, unless a comment shares the line", () => {
    const src = 'import { Tabs } from "watchpot/ui";\nimport { cx } from "watchpot/kit";\nx;\n';
    expect(rewriteFile(src, "a.ts", "src/vendor/kit").plan.after).toBe(
      'import { Tabs, cx } from "watchpot/ui";\nx;\n',
    );
    const commented = 'import { Tabs } from "watchpot/ui";\nimport { cx } from "watchpot/kit"; // why\nx;\n';
    expect(rewriteFile(commented, "a.ts", "src/vendor/kit").plan.after).toBe(
      'import { Tabs, cx } from "watchpot/ui";\n // why\nx;\n',
    );
  });

  test("a file at the root reaches the local index by ./", () => {
    const out = rewriteFile('import { Button } from "watchpot/kit";\n', "a.ts", "src/vendor/kit").plan.after;
    expect(out).toBe('import { Button } from "./src/vendor/kit/index";\n');
  });
});

describe("the command line", () => {
  test("a dry run writes nothing and prints before and after", () => {
    const lines: string[] = [];
    expect(main([], { cwd: root, log: (l) => lines.push(l) })).toBe(0);
    expect(readFileSync(join(root, "src/index.ts"), "utf8")).toBe(GAME["src/index.ts"] as string);
    const out = lines.join("\n");
    expect(out).toContain('  - export { Button, cx, shake } from "watchpot/kit";');
    expect(out).toContain('  + export { cx } from "watchpot/ui";');
    expect(out).toContain("does not exist yet: run again with --vendor");
    expect(out).toContain(
      "Summary: 7 statements rewritten, 1 calls rewritten, 3 files touched, nothing vendored, 8 items for a human.",
    );
  });

  test("a bad flag prints the usage and fails", () => {
    const lines: string[] = [];
    expect(main(["--wirte"], { cwd: root, log: (l) => lines.push(l) })).toBe(2);
    expect(lines.join("\n")).toContain("Usage:");
    expect(main(["--local"], { cwd: root, log: () => {} })).toBe(2);
    expect(main(["--local", "../elsewhere"], { cwd: root, log: () => {} })).toBe(2);
  });
});

// ---------------------------------------------------------------------------------------------------------------

/** A few old engine files: retired ones that import both retired and kept files, and kept ones that must not copy. */
const OLD: Record<string, string> = {
  "src/kit/ui/Button/Button.tsx": `import { motion } from "motion/react";
import { useState } from "react";
import { useReducedMotion } from "../../fx/motion";
import { readToken } from "../../fx/tokens";
import { cx } from "../cx";
import s from "./Button.module.css";

export const Button = () => [motion, useState, useReducedMotion, readToken, cx, s];
`,
  "src/kit/ui/Button/Button.module.css": ".wh-button {\n  color: red;\n}\n",
  "src/kit/ui/cx.ts": "export const cx = (...a: string[]) => a.join(' ');\n",
  "src/kit/fx/motion.ts": "export const useReducedMotion = () => false;\n",
  "src/kit/fx/tokens.ts": "export const readToken = () => '';\n",
  "src/kit/fx/Flash.tsx": "export const Flash = () => null;\n",
  "src/kit/fx/scenes/Scene.tsx": `import { MeshGradient } from "@paper-design/shaders-react";
export const Scene = MeshGradient;
`,
  "src/kit/reveal/RevealHost.tsx": `import { fmt } from "watchpot/core";
import type { RarityTier } from "../fx/rarity";
import { tierOf } from "../fx/rarity";
import { Button } from "../ui/Button/Button";
import { roomStep } from "./ladder";
import { Flash } from "../fx/Flash";
import { Scene } from "../fx/scenes";
`,
  "src/kit/fx/rarity.ts": "export type RarityTier = number;\nexport const tierOf = () => 0;\n",
  "src/kit/fx/scenes/index.ts": `export { Scene } from "./Scene";\n`,
  "src/kit/reveal/ladder.ts": "export const roomStep = 1;\n",
  "src/kit/reveal/sequence.ts": "export const chargeMs = 1;\n",
  "src/react/GameShell.tsx": `import { cx } from "../kit/ui/cx";
import { PageLayoutProvider } from "./layout";
`,
  "src/react/layout.tsx": "export const PageLayoutProvider = null;\n",
};
const oldTree: OldTree = {
  list: () => Object.keys(OLD),
  read: (path) => OLD[path] as string,
};

describe("the vendor step", () => {
  test("copies exactly the retired files, mirrored under the local dir", () => {
    const v = planVendor(oldTree, "src/vendor/kit");
    expect(v.files.map((f) => f.path)).toEqual([
      "src/vendor/kit/kit/fx/scenes/Scene.tsx",
      "src/vendor/kit/kit/fx/scenes/index.ts",
      "src/vendor/kit/kit/reveal/RevealHost.tsx",
      "src/vendor/kit/kit/ui/Button/Button.module.css",
      "src/vendor/kit/kit/ui/Button/Button.tsx",
      "src/vendor/kit/kit/ui/cx.ts",
      "src/vendor/kit/react/GameShell.tsx",
      "src/vendor/kit/index.ts",
      "src/vendor/kit/legacy-effects.css",
    ]);
  });

  test("keeps relative imports of retired files and names the entry for files that stayed, merged", () => {
    const v = planVendor(oldTree, "src/vendor/kit");
    const text = (p: string) => v.files.find((f) => f.path === `src/vendor/kit/${p}`)?.text;
    expect(text("kit/ui/Button/Button.tsx")).toBe(`import { motion } from "motion/react";
import { useState } from "react";
import { useReducedMotion, readToken } from "watchpot/kit";
import { cx } from "../cx";
import s from "./Button.module.css";

export const Button = () => [motion, useState, useReducedMotion, readToken, cx, s];
`);
    expect(text("kit/reveal/RevealHost.tsx")).toBe(`import { fmt } from "watchpot/core";
import type { RarityTier } from "watchpot/kit";
import { tierOf, roomStep, Flash } from "watchpot/kit";
import { Button } from "../ui/Button/Button";
import { Scene } from "../fx/scenes";
`);
    // The copy renders a kept effect that went headless.
    expect(v.human.map((h) => `${h.file}:${h.line}`)).toEqual(["src/vendor/kit/kit/reveal/RevealHost.tsx:6"]);
    expect(v.human[0]?.why).toContain("legacy-effects.css");
    expect(text("react/GameShell.tsx")).toBe(`import { cx } from "../kit/ui/cx";
import { PageLayoutProvider } from "watchpot/react";
`);
    expect(text("kit/ui/Button/Button.module.css")).toBe(
      OLD["src/kit/ui/Button/Button.module.css"] as string,
    );
    expect([...v.peers.keys()].sort()).toEqual(["@paper-design/shaders-react", "motion"]);
    expect(v.peers.get("motion")).toEqual(["src/vendor/kit/kit/ui/Button/Button.tsx"]);
  });

  test("the index re-exports the names that left, and not the ones that stayed or moved", () => {
    const index = planVendor(oldTree, "x").files.find((f) => f.path === "x/index.ts")?.text ?? "";
    expect(index).toContain('  type TabTable,\n} from "./react/GameShell";');
    expect(index).toContain('export { useDialogKeys } from "./kit/ui/dialog";');
    expect(index).toContain('export { type OddsRow } from "./kit/ui/types";');
    const names = scanRefs(index)
      .flatMap((r) => r.specs ?? [])
      .map((s) => s.name);
    const left = OLD_EXPORTS.filter((e) => e.bucket === "left").map((e) => e.name);
    expect(names.sort()).toEqual(left.sort());
    for (const gone of ["cx", "FOCUSABLE", "useOpenerFocus", "formatCountdown", "SheetOutlet", "isTopTier"]) {
      expect(names).not.toContain(gone);
    }
  });

  test("the legacy CSS keys the old look on the effects' data attributes, unwrapped from :global", () => {
    for (const rule of [
      "[data-flash]",
      "[data-flight-layer]",
      "[data-flight-glyph] svg",
      "@keyframes flight-bump",
    ]) {
      expect(LEGACY_EFFECTS_CSS).toContain(rule);
    }
    expect(LEGACY_EFFECTS_CSS).toContain(':root[data-motion="reduced"] [data-pill][data-bump]');
    expect(LEGACY_EFFECTS_CSS).not.toContain(":global");
  });

  test("--write --vendor writes the copies, and a second vendor needs --force", () => {
    const io = { cwd: root, log: () => {}, from: oldTree };
    expect(main(["--write", "--vendor"], io)).toBe(0);
    expect(readFileSync(join(root, "src/vendor/kit/kit/ui/cx.ts"), "utf8")).toBe(
      OLD["src/kit/ui/cx.ts"] as string,
    );
    expect(existsSync(join(root, "src/vendor/kit/legacy-effects.css"))).toBe(true);
    const lines: string[] = [];
    expect(main(["--write", "--vendor"], { ...io, log: (l) => lines.push(l) })).toBe(1);
    expect(lines.join("\n")).toContain("pass --force");
    expect(main(["--write", "--vendor", "--force"], io)).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------

describe("the table", () => {
  const BARRELS = [
    "src/kit/index.ts",
    "src/kit/fx/index.ts",
    "src/kit/reveal/index.ts",
    "src/kit/ui/index.ts",
    "src/react/index.ts",
  ];

  test(`sorts every export of the ${TAG} kit and react entries into exactly one bucket`, () => {
    const tree = gitTree(ROOT, TAG, BARRELS);
    const found: string[] = [];
    const walk = (barrel: string, entry: string) => {
      for (const ref of scanRefs(tree.read(barrel))) {
        const module = posix.join(posix.dirname(barrel), ref.module).slice("src/".length);
        if (ref.form === "star") walk(`src/${module}/index.ts`, entry);
        else
          for (const s of ref.specs ?? [])
            found.push(`${entry}|${module}|${s.name}|${s.type || ref.typeOnly}`);
      }
    };
    walk("src/kit/index.ts", "watchpot/kit");
    walk("src/react/index.ts", "watchpot/react");
    const table = OLD_EXPORTS.map((e) => `${e.entry}|${e.module}|${e.name}|${e.type}`);
    expect(table.sort()).toEqual(found.sort());
    const names = OLD_EXPORTS.map((e) => `${e.entry}|${e.name}`);
    expect(new Set(names).size).toBe(names.length);
  });

  test("the retired matcher takes whole folders and the named files only", () => {
    expect(isRetired("src/kit/ui/cx.ts")).toBe(true);
    expect(isRetired("src/kit/fx/DitherMark.module.css")).toBe(true);
    expect(isRetired("src/kit/reveal/Reveal.module.css")).toBe(true);
    expect(isRetired("src/kit/reveal/sequence.ts")).toBe(false);
    expect(isRetired("src/kit/fx/Flash.tsx")).toBe(false);
    expect(isRetired("src/react/layout.tsx")).toBe(false);
  });
});
