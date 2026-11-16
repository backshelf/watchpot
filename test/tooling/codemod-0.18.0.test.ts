// The 0.18.0 codemod: explicit `achievements` type arguments keep their meaning in the new key, state, effect order.
import { describe, expect, test } from "bun:test";
import { planFile } from "../../codemods/0.18.0-achievements-generics";

describe("the 0.18.0 achievements codemod", () => {
  test("swaps the last two of three, nested arguments and arrows included", () => {
    const src = `const a = achievements<"stamps", Effect<Stat>, { run: (s: number) => boolean }>({ key: "stamps" });\n`;
    const { after, human } = planFile("a.ts", src);
    expect(after).toBe(
      `const a = achievements<"stamps", { run: (s: number) => boolean }, Effect<Stat>>({ key: "stamps" });\n`,
    );
    expect(human.map((h) => h.line)).toEqual([1]);
  });

  test("gives two arguments the old default state, and leaves one, none and a type alone", () => {
    const src = [
      `achievements<"a", Effect>({});`,
      `achievements<"b">({});`,
      `achievements({});`,
      `type F = AchievementsFeature<"c", State, Effect>;`,
      `// achievements<"d", E, G> in prose is not a call`,
    ].join("\n");
    const { after, human } = planFile("b.ts", src);
    const lines = after.split("\n");
    expect(lines[0]).toBe(`achievements<"a", object, Effect>({});`);
    expect(lines.slice(1)).toEqual(src.split("\n").slice(1));
    expect(human).toHaveLength(1);
  });
});
