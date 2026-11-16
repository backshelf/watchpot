// The 0.18.0 codemod: the helper's names move, and the store's action, the pass name and an alias stay.
import { describe, expect, test } from "bun:test";
import { planFile } from "../../codemods/0.18.0-offline-credit";

describe("the 0.18.0 offline-credit codemod", () => {
  test("renames the imported helpers and their uses, and nothing named like them", () => {
    const src = `import { catchUp, type CatchUpSteps, catchUpSteps as steps, D } from "watchpot/core";
import * as core from "watchpot/core";
// catchUp(1, 2, 3) in a comment
const span: CatchUpSteps = steps(1, { capMs: 2 });
const credit = catchUp(ctx.dtMs, 0.5, CAP).creditedMs + core.catchUpSteps(1, { capMs: 2 }).steps;
store.getState().catchUp(now);
const step = { pass: "catchUp" };
`;
    const { after, human } = planFile("src/game/away.ts", src);
    expect(after).toContain(
      `import { offlineCredit, type OfflineSteps, offlineSteps as steps, D } from "watchpot/core";`,
    );
    expect(after).toContain("const span: OfflineSteps = steps(1");
    expect(after).toContain("offlineCredit(ctx.dtMs, 0.5, CAP)");
    expect(after).toContain("core.offlineSteps(1");
    expect(after).toContain("// catchUp(1, 2, 3) in a comment");
    expect(after).toContain("store.getState().catchUp(now);");
    expect(after).toContain(`{ pass: "catchUp" }`);
    expect(human).toHaveLength(0);
  });

  test("leaves a file that imports none of them alone, and lists an object key for a human", () => {
    const untouched = `import { D } from "watchpot/core";\nconst actions = { catchUp: () => {} };\n`;
    expect(planFile("a.ts", untouched).after).toBe(untouched);
    const keyed = `import { catchUp } from "watchpot/core";\nconst o = { catchUp: catchUp };\n`;
    const { after, human } = planFile("b.ts", keyed);
    expect(after).toContain("{ catchUp: offlineCredit }");
    expect(human.map((h) => h.line)).toEqual([2]);
  });
});
