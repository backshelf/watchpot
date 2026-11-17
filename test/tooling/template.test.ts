// The game template's generator: the answers it refuses, the fixtures it takes, what it writes for a shape, and that
// every gating marker in the template names a flag it knows.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  ALL_FLAGS,
  type Answers,
  contentFiles,
  engineTag,
  flagsOf,
  fontLinks,
  gate,
  generate,
  lookWarnings,
  plan,
  TEMPLATE,
  templateVars,
} from "../../templates/game/.scaffold/generate";

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
    for (const a of [
      example(),
      fixture("everything"),
      fixture("dimensions"),
      fixture("dimensions-reset"),
      fixture("smallest"),
      fixture("smallest-clicker"),
    ])
      expect(problems(a)).toBe("");
  });

  test("a clicker alone needs no producers and no look: no core flag, no backdrop, the system's fonts", () => {
    const pl = plan(fixture("smallest-clicker"));
    expect([...flagsOf(pl)]).toEqual(["clicker"]);
    expect(pl.surface).toBeNull();
    expect(fontLinks(pl)).toBe("");
    const tokens = JSON.parse(contentFiles(pl)["design/tokens.json"] ?? "{}");
    expect(tokens.type.families.ui).toBe("system-ui, sans-serif");
    expect(Object.keys(contentFiles(pl))).not.toContain("src/content/generators.ts");
    // Without the clicker, no producers is no game.
    expect(problems({ ...fixture("smallest-clicker"), features: [] })).toContain("generators: 3 to 8");
    expect(problems({ ...fixture("smallest-clicker"), core: "dimensions" })).toContain("generators: 4 to 8");
  });

  test("a contrast warning never prints a ratio at or above the line it fails", () => {
    const base = fixture("smallest");
    for (let v = 0x40; v <= 0xc0; v += 1) {
      const grey = `#${v.toString(16).padStart(2, "0").repeat(3)}`;
      const pl = plan({ ...base, look: { palette: { ground: "#ffffff", ink: "#000000", signal: grey } } });
      for (const w of lookWarnings(pl)) {
        const [, ratio] = w.match(/is ([\d.]+):1 \(needs ([\d.]+):1\)/) ?? [];
        expect(Number(ratio)).toBeLessThan(4.5);
        expect(w).toContain(grey);
      }
    }
  });

  test("the smallest answers take the defaults: a generators core, no features and no backdrop", () => {
    const pl = plan(fixture("smallest"));
    expect(pl.core).toBe("generators");
    expect([...pl.features]).toEqual([]);
    expect([...flagsOf(pl)]).toEqual(["generators"]);
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

  test("the README lists the features once, never the core among them", () => {
    const vars = templateVars(plan(fixture("everything")), "v0.0.0");
    expect(vars.features?.split(", ")).not.toContain("generators");
    expect(templateVars(plan(fixture("smallest")), "v0.0.0").features).toBe("no other features");
  });

  test("full mode refuses the template itself and a folder that holds no template", async () => {
    const answers = join(TEMPLATE, ".scaffold", "fixtures", "smallest.json");
    const opts = { answers, engine: "v0.0.0", mode: "full" as const };
    await expect(generate({ ...opts, out: TEMPLATE })).rejects.toThrow("the template itself");
    const dir = await mkdtemp(join(tmpdir(), "watchpot-gen-"));
    try {
      await mkdir(join(dir, "src"));
      await writeFile(join(dir, "src", "main.ts"), "");
      await expect(generate({ ...opts, out: dir })).rejects.toThrow("no *.tmpl");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("full mode copies the template into a missing folder and leaves a game with its tokens", async () => {
    const answers = join(TEMPLATE, ".scaffold", "fixtures", "smallest-clicker.json");
    const dir = join(await mkdtemp(join(tmpdir(), "watchpot-gen-")), "game");
    try {
      await generate({ answers, out: dir, engine: "v0.0.0", mode: "full", lint: false });
      const files = readdirSync(dir, { recursive: true }).map((f) => String(f).replaceAll("\\", "/"));
      expect(files).toContain("package.json");
      expect(files).toContain("src/tokens.css");
      expect(files.filter((f) => f.endsWith(".tmpl") || f.startsWith(".scaffold"))).toEqual([]);
      expect(readFileSync(join(dir, "package.json"), "utf8")).toContain("watchpot.git#v0.0.0");
    } finally {
      await rm(dirname(dir), { recursive: true, force: true });
    }
  });

  test("a full scaffold ships no agent docs unless asked: no .claude/, AGENTS.md or design/concept.md", async () => {
    const answers = join(TEMPLATE, ".scaffold", "fixtures", "smallest.json");
    const dir = join(await mkdtemp(join(tmpdir(), "watchpot-gen-")), "game");
    try {
      await generate({ answers, out: dir, engine: "v0.0.0", mode: "full", lint: false });
      const files = readdirSync(dir, { recursive: true }).map((f) => String(f).replaceAll("\\", "/"));
      expect(files.filter((f) => f === ".claude" || f.startsWith(".claude/"))).toEqual([]);
      expect(files).not.toContain("AGENTS.md");
      expect(files).not.toContain("design/concept.md");
      expect(files).not.toContain("design/answers.json");
    } finally {
      await rm(dirname(dir), { recursive: true, force: true });
    }
  });

  test("with --agents a game gets AGENTS.md and the concept in design/, and no .claude/ folder", async () => {
    const answers = join(TEMPLATE, ".scaffold", "fixtures", "everything.json");
    const dir = join(await mkdtemp(join(tmpdir(), "watchpot-gen-")), "game");
    try {
      await generate({ answers, out: dir, engine: "v0.0.0", mode: "full", agents: true, lint: false });
      const files = readdirSync(dir, { recursive: true }).map((f) => String(f).replaceAll("\\", "/"));
      expect(files).toContain("AGENTS.md");
      expect(files).toContain("design/concept.md");
      expect(files).toContain("design/answers.json");
      expect(files.filter((f) => f === ".claude" || f.startsWith(".claude/"))).toEqual([]);
      const agents = readFileSync(join(dir, "AGENTS.md"), "utf8");
      expect(agents).toBe(readFileSync(join(TEMPLATE, "..", "agents", "AGENTS.md"), "utf8"));
    } finally {
      await rm(dirname(dir), { recursive: true, force: true });
    }
  });

  test("the template ships its ignore file undotted, and a game gets it as .gitignore", async () => {
    // npm leaves every `.gitignore` out of a published package; a game made from npm then has none and its lint fails.
    expect(readdirSync(TEMPLATE)).not.toContain(".gitignore");
    const answers = join(TEMPLATE, ".scaffold", "fixtures", "everything.json");
    const dir = join(await mkdtemp(join(tmpdir(), "watchpot-gen-")), "game");
    try {
      await generate({ answers, out: dir, engine: "v0.0.0", mode: "full", lint: false });
      const files = readdirSync(dir);
      expect(files).toContain(".gitignore");
      expect(files).not.toContain("gitignore");
    } finally {
      await rm(dirname(dir), { recursive: true, force: true });
    }
  });

  test("a scaffolded game ships no tests: no test/ folder and no test script", async () => {
    const answers = join(TEMPLATE, ".scaffold", "fixtures", "smallest.json");
    const dir = join(await mkdtemp(join(tmpdir(), "watchpot-gen-")), "game");
    try {
      await generate({ answers, out: dir, engine: "v0.0.0", mode: "full", lint: false });
      const files = readdirSync(dir, { recursive: true }).map((f) => String(f).replaceAll("\\", "/"));
      expect(files.filter((f) => f === "test" || f.startsWith("test/"))).toEqual([]);
      const scripts = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).scripts as Record<
        string,
        string
      >;
      expect(scripts.test).toBeUndefined();
      expect(scripts["test:changed"]).toBeUndefined();
      expect(scripts["test:slow"]).toBeUndefined();
    } finally {
      await rm(dirname(dir), { recursive: true, force: true });
    }
  });

  test("the default engine tag is this engine's own version", async () => {
    const pkg = JSON.parse(readFileSync(join(TEMPLATE, "..", "..", "package.json"), "utf8"));
    expect(await engineTag()).toBe(`v${pkg.version}`);
  });

  test("every .tmpl placeholder has a value", () => {
    const vars = templateVars(plan(fixture("everything")), "v0.0.0");
    for (const file of ["README.md.tmpl", "package.json.tmpl", "index.html.tmpl"]) {
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

// The Tailwind registry (templates/tailwind/src/ui) copies the game's CSS-module one, component for component.
describe("the Tailwind registry", () => {
  const GAME_UI = join(TEMPLATE, "src", "ui");
  const TAILWIND_UI = join(TEMPLATE, "..", "tailwind", "src", "ui");
  const components = (dir: string) =>
    readdirSync(dir)
      .filter((f) => f.endsWith(".tsx"))
      .sort();
  const firstLine = (file: string) => readFileSync(file, "utf8").split("\n")[0] ?? "";

  test("every component has a Tailwind copy, and every copy a component", () => {
    expect(components(TAILWIND_UI)).toEqual(components(GAME_UI));
  });

  test("a gated component keeps its @feature gate on the first line", () => {
    for (const f of components(GAME_UI)) {
      const gate = firstLine(join(GAME_UI, f));
      if (/^\s*\/\/\s*@feature\s+\w+/.test(gate)) expect(firstLine(join(TAILWIND_UI, f))).toBe(gate);
    }
  });

  test("no Tailwind copy imports a CSS module", () => {
    for (const f of components(TAILWIND_UI))
      expect(readFileSync(join(TAILWIND_UI, f), "utf8"), f).not.toContain(".module.css");
  });

  test("the theme maps every --ui-* token the game's theme declares into its @theme block", () => {
    const theme = readFileSync(join(TAILWIND_UI, "theme.css"), "utf8");
    expect(theme.startsWith('@import "tailwindcss";')).toBe(true);
    const inline = theme.slice(theme.indexOf("@theme inline {"));
    const declared = [...readFileSync(join(GAME_UI, "theme.css"), "utf8").matchAll(/^\s+(--ui-[\w-]+):/gm)];
    expect(declared.length).toBeGreaterThan(0);
    for (const [, name] of declared) expect(inline, name).toContain(`var(${name})`);
  });
});
