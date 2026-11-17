// test/rules/ holds only tests that read source as text. They import nothing that changes, so `test:changed` never
// picks them; `verify` runs the folder by path. A test that imports a module belongs in its area's folder.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ALLOWLIST, allowKey, brokenRules, trackedFiles, violations } from "../../scripts/rules";

const ROOT = join(import.meta.dir, "..", "..");
const files = trackedFiles(ROOT);
const found = violations(files, (path) => readFileSync(join(ROOT, path), "utf8")).filter((v) => !v.typeOnly);

describe("the import rules", () => {
  test("the scan reads the repository", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  test("every value import that breaks a rule is on the allowlist", () => {
    const off = found
      .filter((v) => !ALLOWLIST.has(allowKey(v.file, v.rule)))
      .map((v) => `${v.file} -> ${v.imports} (${v.rule})`);
    expect(off).toEqual([]);
  });

  test("every allowlist entry still occurs: trim an entry from scripts/rules.ts once its edge is gone", () => {
    const live = new Set(found.map((v) => allowKey(v.file, v.rule)));
    expect([...ALLOWLIST].filter((key) => !live.has(key))).toEqual([]);
  });

  // [importer, target, value names, rule, breaks it]
  const MATCHER: [string, string, string[], string, boolean][] = [
    ["src/core/save.ts", "pkg:react", ["X"], "kernel-pure", true],
    ["src/core/save.ts", "pkg:zustand", ["X"], "kernel-pure", false],
    ["src/core/save.ts", "src/core/decimal.ts", ["X"], "kernel-pure", false],
    ["src/core/save.ts", "pkg:react", ["X"], "core-no-react", true],
    ["src/sim/auto.ts", "pkg:react-dom", ["X"], "core-no-react", true],
    ["src/sim/auto.ts", "pkg:zustand", ["X"], "core-no-react", false],
    ["src/react/index.ts", "pkg:react", ["X"], "core-no-react", false],
    ["src/kit/fx/Ticker.tsx", "pkg:zustand", ["X"], "kit-props-only", true],
    ["src/kit/fx/Ticker.tsx", "src/react/store.tsx", ["X"], "kit-props-only", true],
    ["src/kit/fx/Ticker.tsx", "pkg:watchpot/sim", ["X"], "kit-props-only", true],
    ["src/kit/fx/flight.tsx", "src/kit/fx/motion.ts", ["X"], "kit-props-only", false],
    ["src/kit/fx/confetti.ts", "pkg:watchpot/core", ["defineGame"], "kit-core-narrow", true],
    ["src/kit/fx/confetti.ts", "src/core/index.ts", ["defineGame"], "kit-core-narrow", true],
    ["src/kit/fx/confetti.ts", "pkg:watchpot/core", ["fmtCount", "D"], "kit-core-narrow", false],
    ["src/kit/fx/confetti.ts", "pkg:watchpot/core", [], "kit-core-narrow", false],
    ["src/core/fmt.ts", "pkg:watchpot/core", ["defineGame"], "kit-core-narrow", false],
    ["src/ui/dialog.tsx", "pkg:react", ["useId"], "ui-headless", false],
    ["src/ui/portal.tsx", "pkg:react-dom", ["createPortal"], "ui-headless", false],
    ["src/ui/dialog.tsx", "src/ui/hooks.ts", ["useEscape"], "ui-headless", false],
    ["src/ui/page.tsx", "src/react/layout.tsx", ["usePageLayoutObserver"], "ui-headless", false],
    ["src/ui/page.tsx", "src/react/runtime.ts", ["useGameRuntime"], "ui-headless", true],
    ["src/ui/dialog.tsx", "src/kit/fx/motion.ts", ["useReducedMotion"], "ui-headless", true],
    ["src/ui/dialog.tsx", "src/ui/dialog.module.css", ["default"], "ui-headless", true],
    ["src/kit/fx/Flash.tsx", "src/kit/fx/Flash.module.css", ["default"], "kit-lookless", true],
    ["src/kit/reveal/useRevealSequence.tsx", "pkg:motion", ["motion"], "kit-lookless", true],
    ["src/kit/fx/Ticker.tsx", "pkg:@number-flow/react", ["default"], "kit-lookless", false],
    ["src/kit/fx/Flash.tsx", "src/kit/fx/motion.ts", ["prefersReducedMotion"], "kit-lookless", false],
    ["src/ui/dialog.tsx", "pkg:motion", ["motion"], "ui-headless", true],
    ["src/ui/dialog.tsx", "pkg:zustand", ["create"], "ui-headless", true],
    ["src/ui/dialog.tsx", "pkg:watchpot/react", ["useIdleStore"], "ui-headless", true],
    ["src/ui/dialog.tsx", "pkg:@number-flow/react", ["default"], "ui-headless", true],
    ["src/ui/format.ts", "src/core/fmt.ts", ["fmtTimer"], "ui-headless", false],
    ["src/ui/format.ts", "src/core/fmt.ts", ["fmtTimer"], "ui-core-narrow", false],
    ["src/ui/format.ts", "pkg:watchpot/core", ["fmtCount", "D"], "ui-core-narrow", false],
    ["src/ui/format.ts", "pkg:watchpot/core", ["defineGame"], "ui-core-narrow", true],
    ["src/ui/format.ts", "src/core/store.ts", ["createIdleStore"], "ui-core-narrow", true],
    ["src/cli/doctor.ts", "pkg:node:fs", ["readFileSync"], "cli-alone", false],
    ["src/cli/index.ts", "src/cli/doctor.ts", ["doctor"], "cli-alone", false],
    ["src/cli/doctor.ts", "src/core/fmt.ts", ["fmt"], "cli-alone", true],
    ["src/cli/doctor.ts", "pkg:react", ["useState"], "cli-alone", true],
    ["src/cli/doctor.ts", "pkg:watchpot/core", ["fmt"], "cli-alone", true],
    ["src/shader/canvas.tsx", "pkg:react", ["useEffect"], "shader-alone", false],
    ["src/shader/canvas.tsx", "src/shader/glsl.ts", ["compose"], "shader-alone", false],
    ["src/shader/canvas.tsx", "pkg:react-dom", ["createPortal"], "shader-alone", true],
    ["src/shader/canvas.tsx", "pkg:@paper-design/shaders-react", ["ShaderMount"], "shader-alone", true],
    ["src/shader/canvas.tsx", "src/kit/fx/tokens.ts", ["readToken"], "shader-alone", true],
    ["src/shader/canvas.tsx", "src/core/fmt.ts", ["fmt"], "shader-alone", true],
    ["src/three/Stage.tsx", "src/core/pace.ts", ["X"], "three-narrow", false],
    ["src/three/quality.ts", "src/react/prefs.ts", ["X"], "three-narrow", false],
    ["src/three/Stage.tsx", "src/three/post.ts", ["X"], "three-narrow", false],
    ["src/three/Stage.tsx", "pkg:three", ["X"], "three-narrow", false],
    ["src/three/Stage.tsx", "src/react/store.tsx", ["X"], "three-narrow", true],
    ["src/three/Stage.tsx", "src/kit/fx/motion.ts", ["X"], "three-narrow", true],
    ["src/three/Stage.tsx", "src/sim/index.ts", ["X"], "three-narrow", true],
    ["src/three/Stage.tsx", "pkg:watchpot/kit", ["X"], "three-narrow", true],
    ["src/three/Stage.tsx", "src/three/stage.module.css", ["X"], "three-narrow", true],
    ["src/react/index.ts", "src/three/index.ts", ["X"], "three-alone", true],
    ["src/react/index.ts", "src/devtools/index.ts", ["X"], "devtools-alone", true],
    ["src/devtools/DevPanel.tsx", "src/react/store.tsx", ["X"], "devtools-narrow", false],
    ["src/devtools/DevPanel.tsx", "src/kit/index.ts", ["X"], "devtools-narrow", true],
    ["src/kit/index.ts", "pkg:watchpot/three", ["X"], "three-alone", true],
    ["src/three/post.ts", "src/three/compile.ts", ["X"], "three-alone", false],
  ];
  test.each(MATCHER)("%s -> %s %p: %s is broken: %p", (from, target, names, rule, breaks) => {
    expect(brokenRules(from, target, names).includes(rule)).toBe(breaks);
  });
});
