/**
 * Turns an answers file into a game (`answers.md` beside this file is the schema). It lives with the template, so the
 * content it writes always matches the code it writes into, at whatever engine tag the template came from. `new.ts`
 * runs it and then the install; this is the step on its own.
 *
 *   bun .scaffold/generate.ts --answers <answers.json> --out <dir> [--engine <tag>] [--mode full|content] [--agents]
 *
 * `--engine` defaults to this engine's own version (`v` and its `package.json` version). `--agents` also writes a
 * generic `AGENTS.md` (copied from `templates/agents/AGENTS.md`) and the concept in `design/` (`concept.md`, the
 * answers in `answers.json`); without it a game ships no agent docs. `full` (default) copies the
 * template into `--out` when that is empty or missing (a folder holding a copy already is generated in place; the
 * template itself is refused), writes the content, drops the files and blocks of the flags not chosen, renders every
 * `*.tmpl` into its file, compiles `src/tokens.css` and formats the result with Biome. `content` only rewrites the
 * content files, for every core and feature at once: that is how the template's own example (the union of
 * everything, which the engine's checks compile and test) is made from `answers.example.json`.
 *
 * Flags: the features chosen, the core (`generators` or `dimensions`) and the backdrop's base (`weather`, `print`,
 * `signal` or `cells`). A file whose first line is `// @feature <flag>` is kept only when the flag is chosen (the line
 * is removed). Lines between `// @if <flag>` (or `// @if !<flag>`) and `// @end` are kept only when the condition
 * holds; blocks nest, and the marker lines go. `@if a|b` holds when any of them is chosen, `@if !a|b` when none is. In
 * JSX the markers are `{/* @if <f> *\/}` and `{/* @end *\/}`; in CSS, `/* @if <f> *\/` and `/* @end *\/`.
 */
import { spawnSync } from "node:child_process";
import { cp, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTokens } from "../../../src/kit/theme/build";

// ---------------------------------------------------------------------------------------------- the answers

export const FEATURES = ["clicker", "tree", "gacha", "prestige", "achievements", "visitor"] as const;
export type FeatureId = (typeof FEATURES)[number];
export const CORES = ["generators", "dimensions"] as const;
export type CoreId = (typeof CORES)[number];
export const SURFACES = ["weather", "print", "signal", "cells"] as const;
export type SurfaceId = (typeof SURFACES)[number];
export const SESSIONS = ["glance", "short", "long"] as const;
export type SessionId = (typeof SESSIONS)[number];
export const STATS = ["output", "offline", "gain"] as const;
export type StatId = (typeof STATS)[number];
export const GLYPHS = ["coin", "drop", "gem", "leaf", "star", "moon", "bolt", "shell", "flame", "key", "sun", "seed"] as const;
export type GlyphId = (typeof GLYPHS)[number];
/** What an achievement's `when` may ask, and the feature each kind needs (null: always there). */
export const WHEN_KINDS = {
  own: null,
  earned: null,
  clicks: "clicker",
  runs: "prestige",
  nodes: "tree",
  pulls: "gacha",
} as const satisfies Record<string, FeatureId | null>;
export type WhenKind = keyof typeof WHEN_KINDS;

interface WordIn {
  name: string;
  plural?: string;
  glyph?: string;
  id?: string;
}
interface FontIn {
  family: string;
  /** The Google Fonts css2 `family=` value, exactly (`Work+Sans:wght@100..900`); none for a font the system has. */
  spec?: string;
  fallback?: string;
}
/** An achievement's condition: exactly one of these keys (`own` takes `count` beside it). */
export interface WhenIn {
  own?: number;
  count?: number;
  earned?: number;
  clicks?: number;
  runs?: number;
  nodes?: number;
  pulls?: number;
}
export interface Answers {
  name: string;
  slug?: string;
  premise: string;
  voice: string;
  player?: string;
  core?: string;
  features?: string[];
  currencies: { main: WordIn; premium?: WordIn };
  stats: { output: string; offline: string; gain?: string };
  /** Cheapest first; none at all only beside a clicker. */
  generators?: { name: string; line: string }[];
  clicker?: { name: string; verb: string; line: string };
  tree?: { name: string; nodes: { name: string; line: string; stat: string }[] };
  gacha?: {
    name: string;
    box: string;
    rarities: WordIn[];
    items: { name: string; rarity: string; stat: string }[];
  };
  prestige?: { name: string; verb: string; currency: WordIn };
  achievements?: { name: string; items: { name: string; line: string; when: WhenIn; secret?: boolean }[] };
  visitor?: { name: string; line: string; buff: { name: string; mult: number; seconds: number } };
  tabs?: Partial<Record<"make" | "tree" | "gacha" | "prestige" | "achievements", string>>;
  session: string;
  /** Every part optional: system fonts, the default palette, no backdrop and no moment until the game has its own. */
  look?: {
    palette?: { ground?: string; ink?: string; signal?: string; rarities?: string[] };
    type?: { display?: FontIn; ui?: FontIn; num?: FontIn };
    surface?: { base: string; line: string };
    moment?: string;
  };
}

/** The palette a game gets when its answers name none: ink on paper, a blue signal. */
export const DEFAULT_PALETTE = { ground: "#f3f1ec", ink: "#16181d", signal: "#2f5fa7" } as const;
/** The type a game gets when its answers name none: the system's own faces, nothing to download. */
export const DEFAULT_TYPE = {
  display: { family: "system-ui", fallback: "sans-serif" },
  ui: { family: "system-ui", fallback: "sans-serif" },
  num: { family: "ui-monospace", fallback: "monospace" },
} as const satisfies Record<"display" | "ui" | "num", FontIn>;

/** The look with every default filled in. */
export interface Look {
  palette: { ground: string; ink: string; signal: string; rarities: string[] };
  type: { display: FontIn; ui: FontIn; num: FontIn };
  /** The starter backdrop and the sentence every shader answers to; null for a page with no backdrop. */
  surface: { base: SurfaceId; line: string } | null;
  moment: string | null;
}

/** A CSS-ident-safe id: lowercase letters, digits and hyphens. */
export const slugify = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const RESERVED = new Set(["earned", "credit", "debit"]);
const HEX = /^#[0-9a-fA-F]{6}$/;

interface Word {
  id: string;
  name: string;
  plural: string;
  glyph: GlyphId;
}

function word(w: WordIn, fallbackGlyph: GlyphId, where: string, problems: string[]): Word {
  const plural = w.plural ?? `${w.name}s`;
  const id = w.id ?? slugify(plural);
  if (!w.name) problems.push(`${where}: a name is required`);
  if (!id) problems.push(`${where}: "${w.name}" makes an empty id`);
  if (RESERVED.has(id)) problems.push(`${where}: the id "${id}" is reserved (earned, credit, debit)`);
  if (w.glyph !== undefined && !(GLYPHS as readonly string[]).includes(w.glyph))
    problems.push(`${where}: unknown glyph "${w.glyph}" (one of ${GLYPHS.join(", ")})`);
  const glyph = (GLYPHS as readonly string[]).includes(w.glyph ?? "") ? (w.glyph as GlyphId) : fallbackGlyph;
  return { id, name: w.name, plural, glyph };
}

/** An achievement's condition, read: its kind and its numbers. */
export interface When {
  kind: WhenKind;
  /** The generator's index, for `own`. */
  index?: number;
  n: number;
}

/** Reads one `when`, pushing what is wrong with it. */
function readWhen(w: WhenIn | undefined, where: string, pl: { features: Set<FeatureId>; size: number }, problems: string[]): When {
  const keys = Object.keys(w ?? {}).filter((k) => k !== "count") as WhenKind[];
  const kind = keys[0];
  if (!w || keys.length !== 1 || !kind || !(kind in WHEN_KINDS)) {
    problems.push(`${where}.when: exactly one of ${Object.keys(WHEN_KINDS).join(", ")}`);
    return { kind: "earned", n: 1 };
  }
  const needs = WHEN_KINDS[kind];
  if (needs && !pl.features.has(needs)) problems.push(`${where}.when: "${kind}" needs the ${needs} feature`);
  if (kind === "own") {
    const index = w.own ?? -1;
    const count = w.count ?? 0;
    if (!Number.isInteger(index) || index < 0 || index >= pl.size)
      problems.push(`${where}.when.own: a generator's index, 0 to ${pl.size - 1}`);
    if (!(count >= 1)) problems.push(`${where}.when.count: how many to own, 1 or more`);
    return { kind, index, n: count };
  }
  const n = w[kind] ?? 0;
  if (!(n > 0)) problems.push(`${where}.when.${kind}: a number above zero`);
  return { kind, n };
}

export interface Plan {
  answers: Answers;
  name: string;
  slug: string;
  core: CoreId;
  /** The core's producers or tiers, cheapest first: none for a game that is its clicker alone. */
  generators: { name: string; line: string }[];
  features: Set<FeatureId>;
  /** The starter backdrop, or null for none. */
  surface: SurfaceId | null;
  look: Look;
  main: Word;
  premium: Word | null;
  session: SessionId;
  /** Each achievement's condition, in the answers' order. */
  whens: When[];
}

/** Reads and checks an answers file; throws one error listing every problem. */
export function plan(answers: Answers): Plan {
  const problems: string[] = [];
  const features = new Set<FeatureId>();
  for (const f of answers.features ?? []) {
    if ((FEATURES as readonly string[]).includes(f)) features.add(f as FeatureId);
    else problems.push(`features: unknown "${f}" (known: ${FEATURES.join(", ")})`);
  }
  const core = (answers.core ?? "generators") as CoreId;
  if (!(CORES as readonly string[]).includes(core)) problems.push(`core: one of ${CORES.join(", ")}`);
  const slug = answers.slug ? slugify(answers.slug) : slugify(answers.name ?? "");
  if (!slug) problems.push("name: a name is required");
  if (!answers.premise) problems.push("premise: one or two sentences");
  if (!answers.voice) problems.push("voice: a sentence or two");
  const main = word(answers.currencies?.main ?? { name: "" }, "coin", "currencies.main", problems);
  let premium: Word | null = null;
  if (features.has("gacha")) {
    if (!answers.currencies?.premium) problems.push("currencies.premium: a gacha needs a premium currency");
    else premium = word(answers.currencies.premium, "gem", "currencies.premium", problems);
    if (premium && premium.id === main.id) problems.push("currencies: main and premium share an id");
  }
  if (!answers.stats?.output || !answers.stats?.offline) problems.push("stats: name the output and offline stats");
  const n = answers.generators?.length ?? 0;
  const [low, high] = core === "dimensions" ? [4, 8] : [3, 8];
  const clickerAlone = n === 0 && core === "generators" && features.has("clicker");
  if (!clickerAlone && (n < low || n > high))
    problems.push(
      `generators: ${low} to ${high} with core "${core}", ${core === "dimensions" ? "lowest tier" : "cheapest"} first${core === "generators" ? " (or none beside a clicker)" : ""} (got ${n})`,
    );
  const ids = (answers.generators ?? []).map((g) => slugify(g.name));
  if (new Set(ids).size !== ids.length) problems.push("generators: two share an id (their names slugged)");
  const statOk = (s: string, where: string) => {
    if (!(STATS as readonly string[]).includes(s)) problems.push(`${where}: stat "${s}" (one of ${STATS.join(", ")})`);
    if (s === "gain" && !features.has("prestige")) problems.push(`${where}: "gain" needs the prestige feature`);
  };
  if (features.has("clicker")) {
    const c = answers.clicker;
    if (!c?.name || !c.verb || !c.line) problems.push("clicker: { name, verb, line } with the clicker feature");
  }
  if (features.has("tree")) {
    const nodes = answers.tree?.nodes ?? [];
    if (!answers.tree?.name) problems.push("tree.name: required with the tree feature");
    if (nodes.length < 2 || nodes.length > 12) problems.push(`tree.nodes: 2 to 12 (got ${nodes.length})`);
    nodes.forEach((node, i) => statOk(node.stat, `tree.nodes[${i}]`));
  }
  if (features.has("gacha")) {
    const g = answers.gacha;
    if (!g) problems.push("gacha: required with the gacha feature");
    else {
      if (g.rarities.length < 2 || g.rarities.length > 5) problems.push("gacha.rarities: 2 to 5, lowest first");
      const rungs = g.rarities.map((r) => r.id ?? slugify(r.name));
      if (new Set(rungs).size !== rungs.length) problems.push("gacha.rarities: two rungs share an id");
      for (const id of rungs)
        if (!g.items.some((it) => slugify(it.rarity) === id))
          problems.push(`gacha.items: no item of rarity "${id}" (every rung needs one)`);
      g.items.forEach((it, i) => {
        if (!rungs.includes(slugify(it.rarity))) problems.push(`gacha.items[${i}]: unknown rarity "${it.rarity}"`);
        statOk(it.stat, `gacha.items[${i}]`);
      });
    }
  }
  if (features.has("prestige")) {
    if (!answers.prestige) problems.push("prestige: required with the prestige feature");
    if (!answers.stats?.gain) problems.push("stats.gain: name the prestige stat");
  }
  const whens: When[] = [];
  if (features.has("achievements")) {
    const a = answers.achievements;
    const items = a?.items ?? [];
    if (!a?.name) problems.push("achievements.name: required with the achievements feature");
    if (items.length < 8 || items.length > 48) problems.push(`achievements.items: 8 to 48 (got ${items.length})`);
    const seen = new Set<string>();
    items.forEach((it, i) => {
      const where = `achievements.items[${i}]`;
      if (!it.name || !it.line) problems.push(`${where}: a name and a line`);
      const id = slugify(it.name ?? "");
      if (seen.has(id)) problems.push(`${where}: "${it.name}" shares an id with another`);
      seen.add(id);
      whens.push(readWhen(it.when, where, { features, size: n }, problems));
    });
  }
  if (features.has("visitor")) {
    const v = answers.visitor;
    if (!v?.name || !v.line || !v.buff?.name) problems.push("visitor: { name, line, buff: { name, mult, seconds } }");
    else {
      if (!(v.buff.mult > 1)) problems.push("visitor.buff.mult: above 1 (it multiplies output)");
      if (!(v.buff.seconds > 0)) problems.push("visitor.buff.seconds: above zero");
    }
  }
  const session = (SESSIONS as readonly string[]).includes(answers.session)
    ? (answers.session as SessionId)
    : (problems.push(`session: one of ${SESSIONS.join(", ")}`), "short");
  const look = readLook(answers.look, problems);
  if (problems.length) throw new Error(`The answers have problems:\n- ${problems.join("\n- ")}`);
  const generators = answers.generators ?? [];
  const surface = look.surface?.base ?? null;
  return { answers, name: answers.name, slug, core, generators, features, surface, look, main, premium, session, whens };
}

/** The look with its defaults, pushing what is wrong with the parts the answers give. */
function readLook(look: Answers["look"], problems: string[]): Look {
  const p = look?.palette;
  const palette = {
    ground: p?.ground ?? DEFAULT_PALETTE.ground,
    ink: p?.ink ?? DEFAULT_PALETTE.ink,
    signal: p?.signal ?? DEFAULT_PALETTE.signal,
    rarities: p?.rarities ?? [],
  };
  for (const k of ["ground", "ink", "signal"] as const)
    if (!HEX.test(palette[k])) problems.push(`look.palette.${k}: a #rrggbb colour`);
  for (const [i, c] of palette.rarities.entries())
    if (!HEX.test(c)) problems.push(`look.palette.rarities[${i}]: a #rrggbb colour`);
  const type = { ...DEFAULT_TYPE, ...look?.type };
  for (const k of ["display", "ui", "num"] as const)
    if (!type[k]?.family) problems.push(`look.type.${k}: a family (with its Google Fonts css2 spec, or none for a system font)`);
  let surface: Look["surface"] = null;
  if (look?.surface) {
    const base = look.surface.base as SurfaceId;
    if (!(SURFACES as readonly string[]).includes(base)) problems.push(`look.surface.base: one of ${SURFACES.join(", ")}`);
    if (!look.surface.line) problems.push("look.surface.line: the sentence every shader answers to");
    surface = { base, line: look.surface.line };
  }
  return { palette, type, surface, moment: look?.moment || null };
}

/** Every flag the gating reads: the features, the core (when it has producers) and the backdrop's base (when there is one). */
export const flagsOf = (pl: Plan): Set<string> =>
  new Set<string>([...pl.features, ...(pl.generators.length ? [pl.core] : []), ...(pl.surface ? [pl.surface] : [])]);
/** Every flag there is: the template's own state, the union of every core, feature and base. */
export const ALL_FLAGS: ReadonlySet<string> = new Set<string>([...FEATURES, ...CORES, ...SURFACES]);

// ---------------------------------------------------------------------------------------------- the content

const ts = (v: unknown) => JSON.stringify(v);
const HEAD = "// Written by the scaffold from the game's answers. It is the game's now: edit it freely.";

/** Each tier's number for a ladder of `size` rungs, read off five stops (the lowest and the highest always land). */
const spread = (stops: readonly number[], size: number, i: number) =>
  stops[Math.round((i * (stops.length - 1)) / Math.max(1, size - 1))] ?? 0;

const ODDS: Record<number, number[]> = {
  2: [90, 10],
  3: [80, 17, 3],
  4: [70, 22, 6.5, 1.5],
  5: [60, 27, 9, 3, 1],
};

/** The dimensions ladder: each tier's first price and how far the price steps every ten bought (eight at most). */
const TIER_BASE = [10, 100, 1e4, 1e6, 1e9, 1e13, 1e18, 1e24];
const TIER_STEP = [1e3, 1e4, 1e5, 1e6, 1e8, 1e10, 1e12, 1e15];

/** The presses the sim's player makes at each look when the game has a clicker. */
const PRESSES = 3;

/** The pacing presets: how a session-length answer plays in the sim's session run (`--sessions`). */
export const PACING: Record<
  SessionId,
  {
    label: string;
    sessionsPerDay: [number, number];
    sessionMin: [median: number, min: number, max: number];
    lookEveryMin: [number, number];
    tabLeftOpen: number;
  }
> = {
  glance: {
    label: "a glance: many short check-ins, a minute or two each",
    sessionsPerDay: [8, 12],
    sessionMin: [2, 1, 5],
    lookEveryMin: [1, 1],
    tabLeftOpen: 0.1,
  },
  short: {
    label: "short sessions: a handful a day, about ten minutes each",
    sessionsPerDay: [4, 6],
    sessionMin: [10, 3, 25],
    lookEveryMin: [1, 3],
    tabLeftOpen: 0.3,
  },
  long: {
    label: "long sittings: two or three a day, most of an hour each, the tab often left open",
    sessionsPerDay: [2, 3],
    sessionMin: [45, 20, 90],
    lookEveryMin: [3, 6],
    tabLeftOpen: 0.6,
  },
};

/** The tabs' names: the answers', else the main plural and each feature's own name. */
function tabsOf(pl: Plan) {
  const a = pl.answers;
  return {
    make: a.tabs?.make ?? pl.main.plural,
    tree: a.tabs?.tree ?? a.tree?.name ?? "Upgrades",
    gacha: a.tabs?.gacha ?? a.gacha?.name ?? "Pulls",
    prestige: a.tabs?.prestige ?? a.prestige?.name ?? "Prestige",
    achievements: a.tabs?.achievements ?? a.achievements?.name ?? "Achievements",
  };
}

/**
 * The content files. `union` writes every core's and every feature's file (the template's own example): the files
 * of what was not chosen are dropped by the gating afterwards anyway. `agents` also writes the concept and the
 * answers in `design/` (beside `AGENTS.md`, which `generate` copies in).
 */
export function contentFiles(pl: Plan, union = false, agents = false): Record<string, string> {
  const a = pl.answers;
  const n = pl.generators.length;
  // A core with no producers (a clicker alone) writes no file of its own.
  const has = (x: FeatureId | CoreId) => union || pl.features.has(x as FeatureId) || (pl.core === x && n > 0);
  const out: Record<string, string> = {};
  const rarities = has("gacha") && a.gacha ? a.gacha.rarities.map((r) => r.id ?? slugify(r.name)) : [];
  const currencies = [pl.main, ...(pl.premium ? [pl.premium] : [])];
  const tabs = tabsOf(pl);

  out["src/content/words.ts"] = [
    HEAD,
    'import { type CurrencyOf, type RarityOf, vocab } from "watchpot/core";',
    'import type { GlyphId } from "../app/icons";',
    "",
    `export const NAME = ${ts(pl.name)};`,
    "/** The save key's and the game id's stem. */",
    `export const SLUG = ${ts(pl.slug)};`,
    `export const PREMISE = ${ts(a.premise)};`,
    "",
    "/** The currency the core makes and every upgrade costs. */",
    `export const MAIN = ${ts(pl.main.id)};`,
    ...(pl.premium
      ? ["/** The currency the pulls cost: it drips in slowly, online and away. */", `export const PREMIUM = ${ts(pl.premium.id)};`]
      : []),
    "",
    "/** The game's words: its currencies, the stats its upgrades raise, its rarity ladder (lowest first). */",
    "export const WORDS = vocab({",
    `  currencies: [${["MAIN", ...(pl.premium ? ["PREMIUM"] : [])].join(", ")}],`,
    '  stats: ["output", "offline", "gain"],',
    // The engine's vocabulary needs one rung at least: a game with no pulls gets one it never draws.
    `  rarities: ${ts(rarities.length ? rarities : ["common"])},`,
    "} as const);",
    "",
    "export type Currency = CurrencyOf<typeof WORDS>;",
    "export type Rarity = RarityOf<typeof WORDS>;",
    'export type StatId = "output" | "offline" | "gain";',
    "",
    "export interface CurrencyWords {",
    "  name: string;",
    "  plural: string;",
    "  glyph: GlyphId;",
    "}",
    "",
    "export const CURRENCY: Record<Currency, CurrencyWords> = {",
    ...currencies.map((c) => `  ${ts(c.id)}: { name: ${ts(c.name)}, plural: ${ts(c.plural)}, glyph: ${ts(c.glyph)} },`),
    "};",
    "",
    "/** What each stat is called in the fiction. */",
    "export const STAT: Record<StatId, string> = {",
    `  output: ${ts(a.stats.output)},`,
    `  offline: ${ts(a.stats.offline)},`,
    `  gain: ${ts(a.stats.gain ?? "Gain")},`,
    "};",
    "",
    "/** The tabs' names, one per screen. */",
    `export const TAB_NAMES = ${ts(Object.fromEntries(Object.entries(tabs).filter(([k]) => k === "make" || has(k as FeatureId))))};`,
    "",
    "/** The starter backdrop this game was scaffolded with (`src/shaders/`), or none; the build writes its own. */",
    `export const SURFACE: string | null = ${ts(pl.surface)};`,
    "/** The sentence every shader in the game answers to. */",
    `export const SURFACE_LINE = ${ts(pl.look.surface?.line ?? "")};`,
    "",
  ].join("\n");

  out["src/content/economy.ts"] = [
    HEAD,
    "",
    "/** What a new profile starts with. */",
    `export const START = { main: ${pl.core === "dimensions" && !union ? 10 : 15}${pl.premium ? ", premium: 20" : ""} };`,
    "/** Away, the core makes this share of its rate (before the offline stat), for at most `OFFLINE_CAP_MS`. */",
    "export const OFFLINE_BASE = 0.5;",
    "export const OFFLINE_CAP_MS = 8 * 3_600_000;",
    "/** The income a late game makes a second: where the backdrop's heat reaches 1 (log scale from 1). */",
    `export const LATE_RATE = ${pl.core === "dimensions" && !union ? "1e30" : n ? `${Number((10 * 12 ** (n - 1)).toPrecision(3))} * 100` : "1e3"};`,
    "",
  ].join("\n");

  if (has("generators")) {
    out["src/content/generators.ts"] = [
      "// @feature generators",
      HEAD,
      'import type { CostCurve } from "watchpot/core";',
      "",
      "export interface GeneratorDef {",
      "  id: string;",
      "  name: string;",
      "  line: string;",
      "  /** The price of the next one, by how many are owned. */",
      "  cost: CostCurve;",
      "  /** What one makes a second, before the stats. */",
      "  rate: number;",
      "}",
      "",
      "/** Each one owned raises the next one's price by this share. */",
      "export const COST_GROWTH = 1.15;",
      "",
      "/** Cheapest first. Each costs twelve times the last; one pays itself back in a minute, the next in two, and so on. */",
      "export const GENERATORS: readonly GeneratorDef[] = [",
      ...pl.generators.map(
        (g, i) =>
          `  { id: ${ts(slugify(g.name))}, name: ${ts(g.name)}, line: ${ts(g.line)}, cost: { base: ${10 * 12 ** i}, growth: COST_GROWTH, round: "floor" }, rate: ${Number(((10 * 12 ** i) / (60 * 2 ** i)).toPrecision(3))} },`,
      ),
      "];",
      "",
    ].join("\n");
  }

  if (has("dimensions")) {
    const tiers = pl.generators.slice(0, 8);
    out["src/content/dimensions.ts"] = [
      "// @feature dimensions",
      HEAD,
      'import type { CostCurve, DimensionSet } from "watchpot/core";',
      "",
      "export interface TierDef {",
      "  id: string;",
      "  name: string;",
      "  line: string;",
      "  /** Ten at one price, then the price steps (`every: 10`). */",
      "  cost: CostCurve;",
      "}",
      "",
      "/** Every ten bought of a tier doubles it. */",
      "export const SET: DimensionSet = { size: 10, mult: 2 };",
      "",
      "/** Lowest first: the first makes the main currency, each other makes the tier below it. */",
      "export const TIERS: readonly TierDef[] = [",
      ...tiers.map(
        (g, i) =>
          `  { id: ${ts(slugify(g.name))}, name: ${ts(g.name)}, line: ${ts(g.line)}, cost: { base: ${TIER_BASE[i]}, growth: ${TIER_STEP[i]}, every: 10 } },`,
      ),
      "];",
      "",
    ].join("\n");
  }

  if (has("clicker") && a.clicker) {
    const c = a.clicker;
    out["src/content/clicker.ts"] = [
      "// @feature clicker",
      HEAD,
      'import type { ClickCombo, ClickCrit } from "watchpot/core";',
      "",
      "/** The thing pressed, the press's verb, and its line. */",
      `export const CLICKER = { name: ${ts(c.name)}, verb: ${ts(c.verb)}, line: ${ts(c.line)} };`,
      "/** One press pays `BASE` plus `SHARE` of the income a second. */",
      "export const BASE = 1;",
      "export const SHARE = 0.05;",
      "export const CRIT: ClickCrit = { chance: 0.04, mult: 8 };",
      "/** Presses close together climb to ×2. */",
      "export const COMBO: ClickCombo = { windowMs: 800, step: 0.1, max: 2 };",
      "/** Past this many presses a second, the rest pay nothing. */",
      "export const MAX_PER_SECOND = 20;",
      "",
    ].join("\n");
  }

  if (has("tree") && a.tree) {
    const EFFECT: Record<StatId, string> = {
      output: '{ stat: "output", mul: 1.1 }',
      offline: '{ stat: "offline", add: 0.05 }',
      gain: '{ stat: "gain", mul: 1.15 }',
    };
    const MAX: Record<StatId, number> = { output: 10, offline: 5, gain: 5 };
    out["src/content/tree.ts"] = [
      "// @feature tree",
      HEAD,
      'import type { Effect, GraphNode } from "watchpot/core";',
      'import { type Currency, MAIN, type StatId } from "./words";',
      "",
      "/** A node, placed on the tree's grid: `col` its tier (left to right), `row` its place in the tier. */",
      "export type UpgradeNode = GraphNode<Effect<StatId>, Currency> & {",
      "  col: number;",
      "  row: number;",
      "};",
      "",
      `export const TREE_NAME = ${ts(a.tree.name)};`,
      "",
      "/** Two to a tier; each node after the first tier needs the one before it in its row. */",
      "export const NODES: readonly UpgradeNode[] = [",
      ...a.tree.nodes.map((node, j) => {
        const stat = node.stat as StatId;
        const requires = j >= 2 ? [slugify(a.tree?.nodes[j - 2]?.name ?? "")] : [];
        return [
          "  {",
          `    id: ${ts(slugify(node.name))},`,
          `    name: ${ts(node.name)},`,
          `    line: ${ts(node.line)},`,
          `    cost: [{ currency: MAIN, amount: ${100 * 8 ** j} }],`,
          "    costGrowth: 2.5,",
          `    maxLevel: ${MAX[stat]},`,
          `    requires: ${ts(requires)},`,
          `    effects: [${EFFECT[stat]}],`,
          `    col: ${Math.floor(j / 2)},`,
          `    row: ${j % 2},`,
          "  },",
        ].join("\n");
      }),
      "];",
      "",
    ].join("\n");
  }

  if (has("gacha") && a.gacha && pl.premium) {
    const g = a.gacha;
    const size = rarities.length;
    const odds = ODDS[size] ?? [];
    const effect = (stat: StatId, rung: number) => {
      if (stat === "offline") return `{ stat: "offline", add: ${spread([0.01, 0.02, 0.04, 0.07, 0.1], size, rung)} }`;
      if (stat === "gain") return `{ stat: "gain", mul: ${spread([1.02, 1.05, 1.1, 1.2, 1.35], size, rung)} }`;
      return `{ stat: "output", mul: ${spread([1.01, 1.03, 1.06, 1.12, 1.25], size, rung)} }`;
    };
    const top = rarities[size - 1];
    const second = rarities[size - 2];
    out["src/content/gacha.ts"] = [
      "// @feature gacha",
      HEAD,
      'import type { Effect, OddsTable, PityRule } from "watchpot/core";',
      'import type { Rarity, StatId } from "./words";',
      "",
      `export const GACHA_NAME = ${ts(g.name)};`,
      "/** The one box the pulls open; its id is the gacha's box key. */",
      `export const BOX = ${ts(slugify(g.box))};`,
      `export const BOX_NAME = ${ts(g.box)};`,
      "/** Premium per pull. */",
      "export const PULL_PRICE = 10;",
      "/** One premium drips in this often while the game runs (away, at the offline share). */",
      "export const DRIP_MS = 6 * 60_000;",
      "",
      "export const RARITY_NAME: Record<Rarity, string> = {",
      ...g.rarities.map((r, i) => `  ${ts(rarities[i])}: ${ts(r.name)},`),
      "};",
      "",
      "/** Weights per rung, lowest first. */",
      "export const ODDS: OddsTable<Rarity> = {",
      ...rarities.map((r, i) => `  ${ts(r)}: ${odds[i]},`),
      "};",
      "",
      "/** The guarantees: the second-best rung within 10 pulls, the best within 50 (its chance ramping from 41). */",
      "export const PITY: PityRule<Rarity> = [",
      ...(size > 2 ? [`  { rarity: ${ts(second)}, within: 10 },`] : []),
      `  { rarity: ${ts(top)}, within: 50, softFrom: 40 },`,
      "];",
      "",
      "export interface ItemDef {",
      "  id: string;",
      "  name: string;",
      "  rarity: Rarity;",
      "  /** What each copy owned adds. */",
      "  effect: Effect<StatId>;",
      "}",
      "",
      "export const ITEMS: readonly ItemDef[] = [",
      ...g.items.map((it) => {
        const rid = slugify(it.rarity);
        return `  { id: ${ts(slugify(it.name))}, name: ${ts(it.name)}, rarity: ${ts(rid)}, effect: ${effect(it.stat as StatId, rarities.indexOf(rid))} },`;
      }),
      "];",
      "",
    ].join("\n");
  }

  if (has("prestige") && a.prestige) {
    const p = a.prestige;
    const cur = word(p.currency, "star", "prestige.currency", []);
    // A run pays once it has earned what a thousand of the top producer would cost (dimensions: its third set).
    const per =
      pl.core === "dimensions" && !union
        ? (TIER_BASE[Math.min(n, 8) - 1] ?? 1e6) * 1e3
        : n
          ? 10 * 12 ** (n - 1) * 1000
          : 1e4;
    out["src/content/prestige.ts"] = [
      "// @feature prestige",
      HEAD,
      'import type { CurrencyWords } from "./words";',
      "",
      `export const PRESTIGE_NAME = ${ts(p.name)};`,
      "/** The button's word. */",
      `export const PRESTIGE_VERB = ${ts(p.verb)};`,
      `export const PRESTIGE_CURRENCY: CurrencyWords = { name: ${ts(cur.name)}, plural: ${ts(cur.plural)}, glyph: ${ts(cur.glyph)} };`,
      "",
      "/** The gain: `floor(k × (earned this run / per) ^ exp)`, times the gain stat. */",
      `export const GAIN = { k: 1, exp: ${pl.core === "dimensions" && !union ? 0.25 : 0.5}, per: ${per} };`,
      "/** Each unit held raises output by this share. */",
      "export const BONUS_PER_UNIT = 0.1;",
      "",
    ].join("\n");
  }

  if (has("achievements") && a.achievements) {
    const kinds = (Object.keys(WHEN_KINDS) as WhenKind[]).filter((k) => {
      const needs = WHEN_KINDS[k];
      return needs === null || has(needs);
    });
    const TYPE: Record<WhenKind, string> = {
      own: "  /** Own `count` of a producer (by id). */\n  | { own: string; count: number }",
      earned: "  /** Earn this much of the main currency in one run. */\n  | { earned: number }",
      clicks: "  /** Press this many times, ever. */\n  | { clicks: number }",
      runs: "  /** Reset this many times. */\n  | { runs: number }",
      nodes: "  /** Hold a rank in this many of the tree's nodes. */\n  | { nodes: number }",
      pulls: "  /** Pull this many times, ever. */\n  | { pulls: number }",
    };
    const whenText = (w: When): string => {
      if (w.kind === "own") return `{ own: ${ts(slugify(pl.generators[w.index ?? 0]?.name ?? ""))}, count: ${w.n} }`;
      return `{ ${w.kind}: ${w.n} }`;
    };
    out["src/content/achievements.ts"] = [
      "// @feature achievements",
      HEAD,
      "",
      `export const WALL_NAME = ${ts(a.achievements.name)};`,
      "",
      "/** What earns one. Anything subtler is the game's to write in `src/game/achievements.ts`. */",
      "export type When =",
      ...kinds.map((k) => TYPE[k]),
      "  ;",
      "",
      "export interface AchievementDef {",
      "  id: string;",
      "  name: string;",
      "  /** Its flavour line. */",
      "  line: string;",
      "  when: When;",
      "  /** Hidden until earned. */",
      "  secret?: boolean;",
      "}",
      "",
      "/** Tiles to a row. */",
      "export const COLUMNS = 8;",
      "/** Output ×`each` per achievement earned, and ×`row` per full row. */",
      "export const POWER = { each: 1.03, row: 1.25 };",
      "",
      "export const ACHIEVEMENTS: readonly AchievementDef[] = [",
      ...a.achievements.items.map(
        (it, i) =>
          `  { id: ${ts(slugify(it.name))}, name: ${ts(it.name)}, line: ${ts(it.line)}, when: ${whenText(pl.whens[i] ?? { kind: "earned", n: 1 })}${it.secret ? ", secret: true" : ""} },`,
      ),
      "];",
      "",
    ].join("\n");
  }

  if (has("visitor") && a.visitor) {
    const v = a.visitor;
    out["src/content/visitor.ts"] = [
      "// @feature visitor",
      HEAD,
      'import { MINUTE_MS, type SpawnWait } from "watchpot/core";',
      "",
      "/** What turns up, and its line. */",
      `export const VISITOR = { name: ${ts(v.name)}, line: ${ts(v.line)} };`,
      "/** What catching it starts: output ×`mult` for `seconds`. */",
      `export const BUFF = { id: ${ts(slugify(v.buff.name) || "buff")}, name: ${ts(v.buff.name)}, mult: ${v.buff.mult}, seconds: ${v.buff.seconds} };`,
      "/** At least three minutes apart, at most nine; most come late. */",
      "export const WAIT: SpawnWait = { minMs: 3 * MINUTE_MS, maxMs: 9 * MINUTE_MS, ramp: { power: 4, stepMs: 1000 / 30 } };",
      "/** How long one stays to be caught. */",
      "export const LIFE_MS = 12_000;",
      "",
    ].join("\n");
  }

  const pc = PACING[pl.session];
  // The rank bands were set for a six-node tree: a longer tree has more ranks to buy by the same day.
  const rankHigh = (six: number) => Math.ceil((six * Math.max(6, a.tree?.nodes.length ?? 6)) / 6);
  // The template's own example plays both cores at once (two incomes into one wallet), so it runs far faster than
  // any real shape: its rank and reset bands are held wide, and only the real shapes are held to the design's bands.
  // A dimensions chain compounds faster than a list of producers: the same day holds more ranks and more resets.
  const quick = pl.core === "dimensions" && !union ? 3 : 1;
  const presses = has("clicker") ? PRESSES : 0;
  const bandRows: string[] = [
    // A clicker alone has no producers to count: its contract is the balance it presses up.
    n ? `  ["kinds", [[${Math.min(3, n)}, ${n}], [${n - 1}, ${n}], [${n}, ${n}]]],` : '  ["main", [[2.5, 4], [3, 4.5], [3.25, 5]]],',
    ...(has("tree")
      ? [
          union
            ? `  ["ranks", [[1, ${rankHigh(90)}], [5, ${rankHigh(120)}], [10, ${rankHigh(150)}]]],`
            : `  ["ranks", [[1, ${rankHigh(60) * quick}], [5, ${rankHigh(90) * quick}], [10, ${rankHigh(120) * quick}]]],`,
        ]
      : []),
    // The premium drips one pull's worth in an hour, on top of the two the start pays for.
    ...(has("gacha") ? ['  ["pulls", [[1, 10], [2, 20], [3, 40]]],'] : []),
    ...(has("prestige")
      ? [union ? '  ["runs", [[0, 40], [1, 80], [2, 120]]],' : `  ["runs", [[0, ${3 * quick}], [1, ${8 * quick}], [2, ${24 * quick}]]],`]
      : []),
  ];
  out["src/content/pacing.ts"] = [
    HEAD,
    'import { activeSchedule, type BandRow, type SessionSchedule } from "watchpot/sim";',
    "",
    `/** The session the game is built for: ${pc.label}. */`,
    `export const SESSION = ${ts(pl.session)};`,
    "",
    "/**",
    ` * How the sim's player plays: at it around the clock, a look every ten seconds${presses ? ` and ${presses} presses at each` : ""}, so every`,
    " * hour of the run is a played hour. The pacing contract is judged on this.",
    " */",
    `export const ACTIVE = activeSchedule(10, ${presses});`,
    "",
    "/** How a session player comes and goes (`bun run sim -- --sessions`): a second look at the game, never judged. */",
    "export const SCHEDULE: SessionSchedule = {",
    '  kind: "sessions",',
    "  wakeHour: { min: 7, max: 9 },",
    "  sleepHour: { min: 22, max: 24 },",
    `  sessionsPerDay: { min: ${pc.sessionsPerDay[0]}, max: ${pc.sessionsPerDay[1]} },`,
    `  sessionMin: { median: ${pc.sessionMin[0]}, spread: 0.5, min: ${pc.sessionMin[1]}, max: ${pc.sessionMin[2]} },`,
    `  lookEveryMin: { min: ${pc.lookEveryMin[0]}, max: ${pc.lookEveryMin[1]} },`,
    `  tabLeftOpen: ${pc.tabLeftOpen},`,
    "  skipDay: 0,",
    "  skipWeekendDay: 0,",
    "  decay: [1],",
    "  lengthDecay: [1],",
    "  pressesPerSession: { min: 0, max: 0 },",
    "  firstDayBonusSessions: 1,",
    "};",
    "",
    "/** The played hours the contract reads (the first sitting: nobody starts an idle game and goes idle), and how many",
    " * the sim plays by default (a day at most). */",
    "export const CONTRACT_HOURS = [1, 2, 4] as const;",
    "export const SIM_HOURS = 4;",
    "/** How many days a session run plays by default. */",
    "export const SIM_DAYS = 7;",
    "",
    "/**",
    " * The pacing contract: per metric, the [low, high] it should sit in at each contract hour of play. These are the",
    " * design's intent, not a measurement: tune the content until `bun run sim -- --contract` holds them, or move a band",
    " * on purpose and say why in the commit.",
    " */",
    "export const BANDS = [",
    ...bandRows,
    "] as const satisfies readonly BandRow<string>[];",
    "",
  ].join("\n");

  out["design/tokens.json"] = `${JSON.stringify(tokens(pl, rarities), null, 2)}\n`;
  if (agents) {
    out["design/answers.json"] = `${JSON.stringify(a, null, 2)}\n`;
    out["design/concept.md"] = concept(pl, tabs);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- the look

const rgb = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
/** `t` of the way from `a` to `b`. */
export const mix = (a: string, b: string, t: number) => {
  const x = rgb(a);
  const y = rgb(b);
  return toHex(x.map((v, i) => v + ((y[i] ?? 0) - v) * t));
};
export const luminance = (hex: string) => {
  const [r = 0, g = 0, b = 0] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

/** The colour tokens the kit reads, derived from a ground, an ink and a signal. */
function surface(ground: string, ink: string, signal: string, dark: boolean) {
  const onSignal = contrast(signal, "#121214") >= contrast(signal, "#ffffff") ? "#121214" : "#ffffff";
  return {
    ground,
    "ground-raised": dark ? mix(ground, ink, 0.06) : mix(ground, "#ffffff", 0.75),
    paper: mix(ground, ink, dark ? 0.12 : 0.06),
    "paper-shade": mix(ground, ink, dark ? 0.17 : 0.11),
    ink,
    "ink-muted": mix(ink, ground, 0.35),
    "on-paper": ink,
    "on-paper-muted": mix(ink, ground, 0.35),
    hairline: mix(ground, ink, dark ? 0.12 : 0.14),
    "hairline-paper": mix(ground, ink, dark ? 0.18 : 0.2),
    edge: mix(ground, ink, 0.5),
    signal,
    "on-signal": onSignal,
    focus: ink,
    "scene-base": dark ? mix(ground, ink, 0.06) : mix(ground, "#ffffff", 0.75),
    "scene-ink": ink,
    "scene-tint": "{signal}",
    overlay: dark ? "#000000b3" : `${ink}80`,
    ok: dark ? "#5fd39a" : "#1c7044",
    warn: dark ? "#f0b23c" : "#8a5a12",
    danger: dark ? "#ff7a7a" : "#ad1b24",
    "ok-paper": "{ok}",
    "warn-paper": "{warn}",
    "danger-paper": "{danger}",
    "rarity-plate": dark ? "#000000" : "{ink}",
    glare: dark ? "#ffffff66" : "#ffffff99",
  };
}

/** CSS's generic and system families: named bare in a font stack, never quoted. */
const GENERIC = new Set(["system-ui", "ui-sans-serif", "ui-serif", "ui-monospace", "ui-rounded", "sans-serif", "serif", "monospace", "cursive", "fantasy", "math"]);

function tokens(pl: Plan, rarities: string[]) {
  const { ground, ink, signal, rarities: hues } = pl.look.palette;
  const dark = luminance(ground) < 0.4;
  const base: Record<string, string> = surface(ground, ink, signal, dark);
  rarities.forEach((id, i) => {
    base[`rarity-${id}`] = hues[i] ?? mix(ink, signal, i / Math.max(1, rarities.length - 1));
  });
  base["rarity-top"] = rarities.length ? `{rarity-${rarities[rarities.length - 1]}}` : "{signal}";
  const foil = [...hues, signal, mix(signal, "#ffffff", 0.4), mix(signal, ink, 0.3)];
  for (let i = 0; i < 5; i++) base[`foil-${i + 1}`] = foil[i % foil.length] ?? signal;
  // A light palette gets a dark scheme (Settings › Appearance, or the OS): the same hues on the ink's night side.
  const night = dark ? null : surface(mix(ink, "#000000", 0.25), mix(ground, "#ffffff", 0.3), signal, true);
  const t = pl.look.type;
  const fam = (f: FontIn) => `${GENERIC.has(f.family) ? f.family : `"${f.family}"`}, ${f.fallback ?? "sans-serif"}`;
  return {
    name: pl.name,
    version: 1,
    color: {
      themes: [{ id: "game", name: pl.name }],
      tokens: Object.entries(base).map(([name, value]) => ({ name, value })),
      ...(night
        ? {
            schemes: {
              dark: {
                colorScheme: "dark",
                name: "Dark",
                tokens: Object.fromEntries(
                  Object.entries(night).filter(([k]) => !["signal", "on-signal", "scene-tint"].includes(k)),
                ),
              },
            },
          }
        : {}),
    },
    type: {
      fonts: [],
      families: { display: fam(t.display), ui: fam(t.ui), num: fam(t.num) },
      groups: [
        {
          name: "Display",
          family: "display",
          styles: [
            { name: "headline", fontSize: "44px", lineHeight: 0.95, fontWeight: 700, letterSpacing: "-0.02em" },
            { name: "title", fontSize: "24px", lineHeight: 1, fontWeight: 700, letterSpacing: "-0.005em" },
            {
              name: "title-italic",
              fontSize: "28px",
              lineHeight: 1.05,
              fontWeight: 400,
              fontStyle: "italic",
            },
          ],
        },
        {
          name: "Interface",
          family: "ui",
          styles: [
            { name: "body", fontSize: "14px", lineHeight: 1.45, fontWeight: 400 },
            { name: "body-strong", fontSize: "14px", lineHeight: 1.45, fontWeight: 600 },
            { name: "small", fontSize: "13px", lineHeight: 1.4, fontWeight: 400 },
            { name: "label", fontSize: "12px", lineHeight: 1.2, fontWeight: 600, letterSpacing: "0.02em" },
            {
              name: "code",
              fontSize: "11px",
              lineHeight: 1,
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            },
            {
              name: "lot-number",
              fontSize: "11px",
              lineHeight: 1,
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            },
            { name: "button", fontSize: "14px", lineHeight: 1, fontWeight: 600 },
          ],
        },
        {
          name: "Numbers",
          family: "num",
          styles: [
            { name: "counter", fontSize: "40px", lineHeight: 1, fontWeight: 500, letterSpacing: "-0.02em" },
            { name: "number", fontSize: "16px", lineHeight: 1, fontWeight: 500 },
            { name: "number-small", fontSize: "12px", lineHeight: 1, fontWeight: 500 },
          ],
        },
      ],
    },
    spacing: {
      tokens: [4, 8, 12, 16, 24, 32, 48, 64].map((v, i) => ({ name: `space-${i + 1}`, value: `${v}px` })),
    },
    grid: { tokens: [{ name: "gutter", value: "2px" }] },
    radius: {
      tokens: ["radius-0", "radius-sm", "radius-md", "radius-card", "radius-pill"].map((name) => ({
        name,
        value: "0px",
      })),
    },
    shadow: {
      tokens: [
        { name: "shadow-card", value: dark ? "0 6px 16px #000000a6" : `0 6px 16px ${ink}33` },
        { name: "shadow-sheet", value: dark ? "0 -16px 48px #000000b3" : `0 -16px 48px ${ink}40` },
      ],
    },
  };
}

/** Warnings for colour pairs below the reading line; the scaffold prints them. */
export function lookWarnings(pl: Plan): string[] {
  const { ground, ink, signal } = pl.look.palette;
  const out: string[] = [];
  // Floored to two places, so a ratio just under the line never prints as the line itself.
  const ratio = (c: number) => `${(Math.floor(c * 100) / 100).toFixed(2)}:1`;
  const c1 = contrast(ground, ink);
  if (c1 < 7) out.push(`ink ${ink} on ground ${ground} is ${ratio(c1)} (aim for 7:1 or more)`);
  const on = contrast(signal, "#121214") >= contrast(signal, "#ffffff") ? "#121214" : "#ffffff";
  const c2 = contrast(signal, on);
  if (c2 < 4.5) out.push(`text ${on} on the signal ${signal} is ${ratio(c2)} (needs 4.5:1)`);
  return out;
}

/** The `<link>`s for the Google-hosted fonts, or nothing when every face is the system's. */
export function fontLinks(pl: Plan): string {
  const t = pl.look.type;
  const specs = [...new Set([t.display.spec, t.ui.spec, t.num.spec])].filter((s): s is string => !!s);
  if (!specs.length) return "";
  return [
    '<link rel="preconnect" href="https://fonts.googleapis.com" />',
    '    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />',
    ...specs.map(
      (s) => `    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${s}&display=swap" />`,
    ),
  ].join("\n");
}

function concept(pl: Plan, tabs: ReturnType<typeof tabsOf>): string {
  const a = pl.answers;
  const f = pl.features;
  const lower = (s: string) => s.toLowerCase();
  const gens = pl.generators;
  const core = !gens.length
    ? `- **${tabs.make}.** No producers: the press is the game.`
    : pl.core === "dimensions"
      ? `- **${tabs.make}.** A chain of ${gens.length} tiers: ${gens.map((g) => g.name).join(", ")}. The first makes ${lower(pl.main.plural)}, each other makes the tier below it, and every ten bought of a tier doubles it.`
      : `- **${tabs.make}.** ${gens.length} generators make ${lower(pl.main.plural)}: ${gens.map((g) => g.name).join(", ")}.`;
  const look = pl.look;
  const google = (["display", "ui", "num"] as const).some((k) => look.type[k].spec);
  const lines = [
    `# ${pl.name}`,
    "",
    "The game's concept as the scaffold took it down. The answers themselves are in `answers.json` beside this file.",
    "",
    "## Fiction",
    "",
    a.premise,
    "",
    `**Voice.** ${a.voice}`,
    ...(a.player ? ["", `**Who plays.** ${a.player}`] : []),
    "",
    "## Loop",
    "",
    core,
    ...(f.has("clicker") && a.clicker
      ? [`- **${a.clicker.name}.** ${a.clicker.verb} it for ${lower(pl.main.plural)}: a share of the income a press, a crit now and then, a combo for presses close together.`]
      : []),
    ...(f.has("tree") ? [`- **${tabs.tree}.** An upgrade tree (${a.tree?.name}) of ${a.tree?.nodes.length} nodes, bought with ${lower(pl.main.plural)}.`] : []),
    ...(f.has("gacha") && a.gacha
      ? [
          `- **${tabs.gacha}.** ${a.gacha.box} pulls for ${pl.premium?.plural.toLowerCase()}, a ladder of ${a.gacha.rarities.map((r) => r.name).join(" < ")}, ${a.gacha.items.length} things to find; every copy owned adds its bonus.`,
        ]
      : []),
    ...(f.has("prestige") && a.prestige
      ? [
          `- **${tabs.prestige}.** ${a.prestige.verb} resets the run for ${a.prestige.currency.plural ?? `${a.prestige.currency.name}s`}, each one raising ${lower(a.stats.output)} for good.`,
        ]
      : []),
    ...(f.has("achievements") && a.achievements
      ? [`- **${tabs.achievements}.** A wall of ${a.achievements.items.length} (${a.achievements.name}), eight to a row; each earned raises ${lower(a.stats.output)}, a full row more.`]
      : []),
    ...(f.has("visitor") && a.visitor
      ? [`- **${a.visitor.name}.** Turns up every few minutes and stays a few seconds; caught, it starts ${a.visitor.buff.name}: ${lower(a.stats.output)} ×${a.visitor.buff.mult} for ${a.visitor.buff.seconds} seconds.`]
      : []),
    "",
    `Stats: ${a.stats.output} (output), ${a.stats.offline} (offline share)${f.has("prestige") ? `, ${a.stats.gain} (prestige gain)` : ""}.`,
    "",
    "## Session",
    "",
    `Built for ${PACING[pl.session].label}. The pacing contract is \`src/content/pacing.ts\`.`,
    "",
    "## Look",
    "",
    `- Palette: ground \`${look.palette.ground}\`, ink \`${look.palette.ink}\`, signal \`${look.palette.signal}\`${look.palette.rarities.length ? `, rarities ${look.palette.rarities.map((c) => `\`${c}\``).join(" ")}` : ""}.`,
    `- Type: ${look.type.display.family} (display), ${look.type.ui.family} (interface), ${look.type.num.family} (numbers)${google ? ", from Google Fonts" : ""}.`,
    look.surface
      ? `- **The surface.** ${look.surface.line} (scaffolded on the \`${look.surface.base}\` starter in \`src/shaders/\`, to be replaced.)`
      : "- **The surface.** None yet: the page has no backdrop.",
    ...(look.moment ? [`- **The moment.** ${look.moment}`] : []),
    "",
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------------- gating

const FEATURE_LINE = /^\s*(?:\/\/|\/\*|#|<!--)\s*@feature\s+(\w+)/;
const IF_LINE = /^\s*(?:\/\/|\/\*|#|\{\/\*)\s*@if\s+(!?)([\w|]+)/;
const END_LINE = /^\s*(?:\/\/|\/\*|#|\{\/\*)\s*@end\b/;

/** The file's text with its gated blocks resolved, or null when the whole file belongs to a flag not chosen. */
export function gate(text: string, chosen: ReadonlySet<string>, path: string): string | null {
  const lines = text.split("\n");
  const head = lines[0]?.match(FEATURE_LINE);
  if (head) {
    if (!chosen.has(head[1] ?? "")) return null;
    lines.shift();
  }
  const out: string[] = [];
  // The open blocks' conditions, innermost last: a line stays when every one holds.
  const open: boolean[] = [];
  for (const [i, line] of lines.entries()) {
    const head = line.match(IF_LINE);
    if (head) {
      // `a|b` holds when any of them is chosen; `!a|b` when none is.
      const any = (head[2] ?? "").split("|").some((f) => chosen.has(f));
      open.push(any !== (head[1] === "!"));
      continue;
    }
    if (END_LINE.test(line)) {
      if (!open.length) throw new Error(`${path}:${i + 1}: @end without @if`);
      open.pop();
      continue;
    }
    if (open.every(Boolean)) out.push(line);
  }
  if (open.length) throw new Error(`${path}: an @if never ends`);
  return out.join("\n");
}

/**
 * The template's own text, ungated: the union of every block. The raw template is this (the markers are comments),
 * so whatever a `@if !<flag>` block holds must also make sense beside everything else.
 */
export const union = (text: string, path: string) => gate(text, ALL_FLAGS, path);

const TEXT = /\.(ts|tsx|css|json|md|html|toml|tmpl)$|^\.git(ignore|attributes)$/;

async function walk(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (["node_modules", ".git", ".scaffold"].includes(e.name)) continue;
      out.push(...(await walk(dir, r)));
    } else out.push(r);
  }
  return out;
}

async function write(path: string, text: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

// ---------------------------------------------------------------------------------------------- main

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i > 0) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq?.slice(name.length + 3);
}

/** The words the `*.tmpl` files take, by placeholder. */
export function templateVars(pl: Plan, engine: string): Record<string, string> {
  const f = pl.features;
  // The features alone: the core has its own placeholder, so it is never listed twice.
  const features = [...f].map((x) => (x === "visitor" ? "visitor (spawns + buffs)" : x === "tree" ? "tree (upgradeTree)" : x));
  return {
    name: pl.name,
    slug: pl.slug,
    engine,
    premise: pl.answers.premise,
    session: PACING[pl.session].label,
    core: pl.generators.length ? pl.core : "none (the clicker alone)",
    features: features.length ? features.join(", ") : "no other features",
    fontLinks: fontLinks(pl),
  };
}

/** This template, and the engine it ships in (a checkout, or `node_modules/watchpot`). */
const HERE = dirname(fileURLToPath(import.meta.url));
export const TEMPLATE = resolve(HERE, "..");
/**
 * Whether this file is the script being run. Compared by file name, not by `import.meta.url`: in a bundle (`new.ts`
 * built for Node) every module shares the bundle's URL, so only this tells the CLI apart from an import.
 */
const isEntry = resolve(process.argv[1] ?? "") === join(HERE, "generate.ts");

/** The engine tag a template belongs to: `v` and its engine's `package.json` version (this engine's, by default). */
export async function engineTag(template = TEMPLATE): Promise<string> {
  const pkg = JSON.parse(await readFile(join(engineOf(template), "package.json"), "utf8")) as { version: string };
  return `v${pkg.version}`;
}

/** Whether `dir` is missing or holds nothing. */
async function vacant(dir: string): Promise<boolean> {
  try {
    return (await readdir(dir)).length === 0;
  } catch {
    return true;
  }
}

/** The engine a `templates/game` folder ships in: two folders up (`<engine>/templates/game`). */
const engineOf = (template: string) => resolve(template, "..", "..");

/**
 * Copies the template into `out`, leaving out its scaffold, installs and git folder. The template keeps its ignore
 * file as `gitignore`: npm leaves every `.gitignore` out of a published package, so the dotted name never reaches a
 * game made from the npm install. It becomes `.gitignore` here.
 */
async function copyTemplate(out: string, template: string) {
  await cp(template, out, {
    recursive: true,
    filter: (src) => !/[\\/](node_modules|\.git|\.scaffold)([\\/]|$)/.test(src.slice(template.length)),
  });
  await rename(join(out, "gitignore"), join(out, ".gitignore"));
}

/** Compiles `design/tokens.json` into `src/tokens.css` with the engine's own compiler, as `bun run tokens` does. */
async function writeTokens(out: string) {
  await buildTokens({ tokens: join(out, "design", "tokens.json"), out: join(out, "src", "tokens.css") });
}

/**
 * Formats and fixes the written game with Biome (its own `biome.json`): the game's install when it has one, else the
 * engine's. False when neither has Biome; `bun run lint:fix` after the install does the same.
 */
function lintFix(out: string, engine: string): boolean {
  let bin: string;
  try {
    bin = createRequire(join(out, "package.json")).resolve("@biomejs/biome/bin/biome");
  } catch {
    try {
      bin = createRequire(join(engine, "package.json")).resolve("@biomejs/biome/bin/biome");
    } catch {
      return false;
    }
  }
  const p = spawnSync(process.execPath, [bin, "check", "--write", "."], { cwd: out, encoding: "utf8" });
  if (p.status !== 0) throw new Error(`biome check --write failed in ${out}:\n${p.stdout}${p.stderr}`);
  return true;
}

/**
 * Writes a game from an answers file. In `full` mode `out` is the game: an empty or missing folder gets a copy of this
 * template first; a folder that already holds one (its `*.tmpl` files) is generated in place. Then the content, the
 * gating, the `*.tmpl` files, `src/tokens.css` and a Biome pass. `content` mode writes the content files only.
 * `agents` also writes `AGENTS.md` (from `templates/agents/`) and the concept in `design/`, in either mode.
 */
export async function generate(opts: {
  answers: string;
  out: string;
  engine: string;
  mode: "full" | "content";
  /** Also write the agent docs: `AGENTS.md` and the concept in `design/` (default off). */
  agents?: boolean;
  /** The closing Biome pass (default on). */
  lint?: boolean;
  /** The `templates/game` folder to copy and write from (default this one, in this engine). */
  template?: string;
}) {
  // An absolute folder: Bun on Windows refuses `mkdir(".", { recursive: true })`.
  opts = { ...opts, out: resolve(opts.out) };
  const template = resolve(opts.template ?? TEMPLATE);
  const engine = engineOf(template);
  const pl = plan(JSON.parse(await readFile(opts.answers, "utf8")));
  if (opts.mode === "full") {
    if (opts.out === template)
      throw new Error("--out is the template itself: full mode would rewrite it (regenerate its content with --mode content)");
    if (await vacant(opts.out)) await copyTemplate(opts.out, template);
    else if (!(await walk(opts.out)).some((rel) => rel.endsWith(".tmpl")))
      throw new Error(`${opts.out} holds no *.tmpl files: give an empty folder, or a fresh copy of the template`);
  }
  const files = contentFiles(pl, opts.mode === "content", opts.agents);
  for (const [rel, text] of Object.entries(files)) await write(join(opts.out, rel), text);
  if (opts.agents) await write(join(opts.out, "AGENTS.md"), await readFile(join(engine, "templates", "agents", "AGENTS.md"), "utf8"));
  if (opts.mode === "content") return pl;
  const chosen = flagsOf(pl);
  const vars = templateVars(pl, opts.engine);
  for (const rel of await walk(opts.out)) {
    const base = rel.split("/").pop() ?? rel;
    if (!TEXT.test(base)) continue;
    const path = join(opts.out, rel);
    const text = await readFile(path, "utf8");
    const gated = gate(text, chosen, rel);
    if (gated === null) {
      await rm(path);
      continue;
    }
    if (rel.endsWith(".tmpl")) {
      const rendered = gated.replace(/\{\{(\w+)\}\}/g, (m, k: string) => {
        const v = vars[k];
        if (v === undefined) throw new Error(`${rel}: unknown placeholder ${m}`);
        return v;
      });
      await write(path.slice(0, -".tmpl".length), rendered);
      await rm(path);
    } else if (gated !== text) await writeFile(path, gated);
  }
  await writeTokens(opts.out);
  if (opts.lint !== false && !lintFix(opts.out, engine)) console.warn("generate: no Biome to format with; run `bun run lint:fix` after `bun install`");
  return pl;
}

if (isEntry) {
  const answers = arg("answers");
  const out = arg("out");
  if (!answers || !out) {
    console.error(
      "usage: bun .scaffold/generate.ts --answers <file> --out <dir> [--engine <tag, default this engine's>] [--mode full|content] [--agents] [--template <templates/game dir>]",
    );
    process.exit(2);
  }
  const mode = arg("mode") === "content" ? "content" : "full";
  const agents = process.argv.includes("--agents");
  const template = resolve(arg("template") ?? TEMPLATE);
  const pl = await generate({
    answers,
    out,
    engine: arg("engine") ?? (await engineTag(template)),
    mode,
    agents,
    template,
  });
  for (const w of lookWarnings(pl)) console.warn(`look: ${w}`);
  console.log(`generated ${pl.name} (${mode}): ${pl.core}${[...pl.features].map((f) => `, ${f}`).join("")}, ${pl.surface} backdrop`);
}
