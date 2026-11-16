// The game template's generator: the answers it refuses, the fixtures it takes, what it writes for a shape, and that
// every gating marker in the template names a flag it knows.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ALL_FLAGS,
  type Answers,
  contentFiles,
  flagsOf,
  gate,
  plan,
  templateVars,
} from "../../templates/game/.scaffold/generate";

const TEMPLATE = join(import.meta.dir, "..", "..", "templates", "game");
const fixture = (name: string): Answers =>
  JSON.parse(readFileSync(join(TEMPLATE, ".scaffold", "fixtures", `${name}.json`), "utf8"));
const example = (): Answers =>
  JSON.parse(readFileSync(join(TEMPLATE, ".scaffold", "answers.example.json"), "utf8"));

/** The problems `plan` lists for answers, or none. */
const problems = (a: Answers): string => {
  try {
    plan(a);
    return "";
  } catch (e) {
    return (e as Error).message;
  }
};

describe("the template's answers", () => {
  test("the example and every fixture plan cleanly", () => {
    for (const a of [example(), fixture("everything"), fixture("dimensions"), fixture("smallest")])
      expect(problems(a)).toBe("");
  });

  test("the smallest answers take the defaults: a generators core and no features", () => {
    const pl = plan(fixture("smallest"));
    expect(pl.core).toBe("generators");
    expect([...pl.features]).toEqual([]);
    expect([...flagsOf(pl)].sort()).toEqual(["generators", "weather"]);
  });

  test("a dimensions core needs four tiers, a generators core three, and eight at most", () => {
    const small = fixture("smallest");
    expect(problems({ ...small, core: "dimensions" })).toContain("generators: 4 to 8");
    const nine = Array.from({ length: 9 }, (_, i) => ({ name: `G${i}`, line: "x" }));
    expect(problems({ ...small, generators: nine })).toContain("generators: 3 to 8");
    expect(problems({ ...small, core: "layers" })).toContain("core: one of");
  });

  test("every problem is listed at once", () => {
    const a = fixture("everything");
    const broken: Answers = {
      ...a,
      achievements: { name: "Wall", items: [{ name: "One", line: "x", when: { clicks: 1, runs: 1 } }] },
      visitor: { name: "V", line: "x", buff: { name: "B", mult: 1, seconds: 0 } },
      look: { ...a.look, surface: { base: "neon", line: "" } },
    };
    const said = problems(broken);
    expect(said).toContain("achievements.items: 8 to 48");
    expect(said).toContain("exactly one of");
    expect(said).toContain("visitor.buff.mult");
    expect(said).toContain("visitor.buff.seconds");
    expect(said).toContain("look.surface.base");
    expect(said).toContain("look.surface.line");
  });

  test("an achievement may only ask about a feature the game has", () => {
    const a = fixture("dimensions");
    const items = (a.achievements?.items ?? []).map((it, i) =>
      i === 0 ? { ...it, when: { pulls: 5 } } : it,
    );
    const said = problems({ ...a, achievements: { name: "Wall", items } });
    expect(said).toContain('"pulls" needs the gacha feature');
    const own = (a.achievements?.items ?? []).map((it, i) =>
      i === 0 ? { ...it, when: { own: 9, count: 1 } } : it,
    );
    expect(problems({ ...a, achievements: { name: "Wall", items: own } })).toContain("a generator's index");
  });
});

describe("what the template writes", () => {
  test("a shape gets the content of what it chose and nothing else", () => {
    const small = Object.keys(contentFiles(plan(fixture("smallest"))));
    for (const f of ["clicker", "tree", "gacha", "prestige", "achievements", "visitor", "dimensions"])
      expect(small).not.toContain(`src/content/${f}.ts`);
    expect(small).toContain("src/content/generators.ts");
    const dims = Object.keys(contentFiles(plan(fixture("dimensions"))));
    expect(dims).toContain("src/content/dimensions.ts");
    expect(dims).not.toContain("src/content/generators.ts");
    expect(dims).toContain("src/content/achievements.ts");
  });

  test("an achievement's 'own' names the producer by id, and the When type only the kinds the game has", () => {
    const text = contentFiles(plan(fixture("dimensions")))["src/content/achievements.ts"] ?? "";
    expect(text).toContain('when: { own: "gossip", count: 10 }');
    expect(text).toContain("{ clicks: number }");
    expect(text).not.toContain("{ pulls: number }");
  });

  test("the tabs' names list only the screens the game has", () => {
    const words = contentFiles(plan(fixture("smallest")))["src/content/words.ts"] ?? "";
    expect(words).toContain('export const TAB_NAMES = {"make":"Pebbles"}');
  });

  test("every .tmpl placeholder has a value", () => {
    const vars = templateVars(plan(fixture("everything")), "v0.0.0");
    for (const file of ["README.md.tmpl", ".claude/CLAUDE.md.tmpl", "package.json.tmpl", "index.html.tmpl"]) {
      const text = readFileSync(join(TEMPLATE, file), "utf8");
      for (const [, key] of text.matchAll(/\{\{(\w+)\}\}/g)) expect(vars[key ?? ""]).toBeDefined();
    }
  });
});

describe("gating", () => {
  test("blocks nest, negate and take alternatives, in every comment form", () => {
    const text = [
      "a",
      "// @if clicker",
      "b",
      "// @if !visitor",
      "c",
      "// @end",
      "// @end",
      "{/* @if tree|gacha */}",
      "d",
      "{/* @end */}",
      "/* @if print */",
      ".e {}",
      "/* @end */",
    ].join("\n");
    expect(gate(text, new Set(["clicker"]), "t")).toBe("a\nb\nc");
    expect(gate(text, new Set(["clicker", "visitor", "gacha", "print"]), "t")).toBe("a\nb\nd\n.e {}");
    expect(gate("/* @feature cells */\n.x {}", new Set(["weather"]), "t")).toBeNull();
    expect(() => gate("// @if tree\nx", new Set(), "t")).toThrow("never ends");
  });

  test("every marker in the template names a flag the generator knows", () => {
    const marker = /@(?:if|feature)\s+!?([\w|]+)/g;
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? [".scaffold", "node_modules"].includes(e.name)
            ? []
            : walk(join(dir, e.name))
          : [join(dir, e.name)],
      );
    const unknown: string[] = [];
    for (const file of walk(TEMPLATE)) {
      if (!/\.(ts|tsx|css|tmpl|md|json)$/.test(file)) continue;
      for (const [, flags] of readFileSync(file, "utf8").matchAll(marker))
        for (const f of (flags ?? "").split("|")) if (!ALL_FLAGS.has(f)) unknown.push(`${file}: ${f}`);
    }
    expect(unknown).toEqual([]);
  });
});
