#!/usr/bin/env bun
/**
 * 0.3.0: the engine's styled kit retires. Run from the game's root:
 *
 *   bun ../watchpot/codemods/0.3.0-headless-kit.ts [--write] [--vendor] [--force] [--local <dir>]
 *
 * Always: every import and export-from of `watchpot/kit` and `watchpot/react` is split by where its names live
 * now. Names that stayed are left alone; `cx`, `FOCUSABLE`, `useOpenerFocus`, `formatCountdown` and the sheet
 * outlet move to `watchpot/ui`; everything the engine no longer ships is repointed to the game's local copy
 * (`<local>/index`, default `src/vendor/kit`). `useOpenerFocus()` becomes `useOpenerFocus(true)`.
 *
 * `--vendor` copies the retired sources as they stood at v0.1.11 out of this engine checkout into `<local>`, with
 * their imports of files that stayed in the engine repointed to the package entries, an `index.ts` re-exporting
 * every name that left the engine, and `legacy-effects.css` with the old look of the two effects that went headless. It
 * refuses to overwrite files already in `<local>` without `--force`.
 *
 * A dry run by default: it prints the edits and changes nothing until `--write`. What it cannot prove (namespace
 * imports, the kit's CSS, uses of components whose look moved) it lists for a human with file and line.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";

/** The last release with the styled kit; the vendored copies are its sources. */
export const TAG = "v0.1.11";
export const DEFAULT_LOCAL = "src/vendor/kit";

const KIT = "watchpot/kit";
const REACT = "watchpot/react";
const UI = "watchpot/ui";
type Entry = typeof KIT | typeof REACT;
export type Bucket = "stayed" | "moved" | "left";

/**
 * Every export of `watchpot/kit` and `watchpot/react` at v0.1.11, one row per barrel statement: its entry, the
 * module it came from (under `src/`, no extension), where it went, and its names (`type:` marks a type). A test
 * holds this table equal to the v0.1.11 barrels, so no name is missed or sorted twice.
 */
type Row = readonly [entry: "kit" | "react", module: string, bucket: Bucket, names: string];

export const ROWS: readonly Row[] = [
  // `src/kit/fx`
  [
    "kit",
    "kit/fx/cards",
    "left",
    "CARD_BASE CARD_PRINTINGS type:CardArt type:CardArtSource CardCanvas type:CardCanvasProps type:CardLight " +
      "type:CardPrinting type:CardRarity type:CardSetup cardRenderer cardScheduler MATERIALS type:MaterialName " +
      "PLAIN_ART startCardGl type:UniformKind type:UniformValue",
  ],
  [
    "kit",
    "kit/fx/confetti",
    "stayed",
    "burst type:ConfettiColors cents centsShots confettiShots type:FireOptions readConfettiColors type:Shot",
  ],
  ["kit", "kit/fx/DitherMark", "left", "DitherMark type:DitherMarkProps"],
  ["kit", "kit/fx/Flash", "stayed", "Flash type:FlashProps"],
  ["kit", "kit/fx/flight", "stayed", "FLIGHT FlightHost type:FlyOptions staggerOf useFlight"],
  [
    "kit",
    "kit/fx/motion",
    "stayed",
    "hasWebGL osPrefersReducedMotion prefersReducedMotion riseIn setReducedMotion subscribeReducedMotion " +
      "useReducedMotion",
  ],
  ["kit", "kit/fx/rarity", "stayed", "type:RarityTier tierIntensity tierOf tierRamp tierStep tierToken"],
  [
    "kit",
    "kit/fx/scenes",
    "left",
    "clamp01 DITHER type:Drive type:DriveEvent EVENT_CODE EVENT_PULSE type:Focus fieldLife HASH hexToVec4 " +
      "pulseAt SCENE_HEAD Scene type:ScenePalette type:SceneProps type:SceneUniforms STAGE_PIXELS STILL_FRAME " +
      "useSceneUniforms VALUE_NOISE type:WorldScene",
  ],
  ["kit", "kit/fx/scheme", "stayed", "applyColorScheme resolveScheme"],
  [
    "kit",
    "kit/fx/sound",
    "stayed",
    "type:ClipLayer createSound type:Layer mixLayers type:Sound type:SoundCue type:SoundOptions soundSeconds " +
      "toParams type:Voice type:Wave type:ZzfxParams",
  ],
  ["kit", "kit/fx/Ticker", "stayed", "Money type:MoneyProps Ticker type:TickerProps"],
  ["kit", "kit/fx/tokens", "stayed", "longHex luminance mixHex readFoil readToken useScopedRead"],
  ["kit", "kit/fx/useShake", "stayed", "shake useShake"],
  // `src/kit/reveal`
  [
    "kit",
    "kit/reveal/Room",
    "left",
    "type:Landing POSTER_FOCUS RevealRoom type:RevealRoomHandle type:RevealRoomProps useRevealRoom",
  ],
  [
    "kit",
    "kit/reveal/RevealHost",
    "left",
    "RevealHost type:RevealHostProps type:StageContext type:SummaryContext",
  ],
  ["kit", "kit/reveal/RevealPull", "left", "type:PullFaceContext RevealPull"],
  ["kit", "kit/reveal/ladder", "stayed", "BIG_STEP bestOf ROOM_STEPS roomStep rungAtLeast"],
  [
    "kit",
    "kit/reveal/pity",
    "stayed",
    "type:Guarantee nearestGuarantee type:PityRung pityRungs type:ShelfLight shelfLight",
  ],
  [
    "kit",
    "kit/reveal/scene",
    "left",
    "REVEAL_SCENE type:RevealMoment type:RoomTone revealDrive revealLife revealUniforms roomLight",
  ],
  ["kit", "kit/reveal/sequence", "stayed", "type:CardRole chargeMs REVEAL_TIMING type:RevealState"],
  ["kit", "kit/reveal/useOpenFlare", "left", "type:Flare type:Shown useOpenFlare"],
  // `src/kit/ui`
  [
    "kit",
    "kit/ui/CurrencyPill/CurrencyPill",
    "left",
    "CurrencyPill type:CurrencyPillProps CurrencyStack type:CurrencyStackItem",
  ],
  ["kit", "kit/ui/Badge/Badge", "left", "Badge type:BadgeProps badgeText"],
  ["kit", "kit/ui/Button/Button", "left", "Button type:ButtonProps type:ButtonSize type:ButtonVariant"],
  ["kit", "kit/ui/Card/artContext", "left", "useCardArt"],
  ["kit", "kit/ui/Card/BankCard", "left", "BankCard type:BankCardProps"],
  ["kit", "kit/ui/Card/Card", "left", "Card type:CardProps type:CardVariant WORDS_MIN"],
  ["kit", "kit/ui/Chest/Chest", "left", "Chest type:ChestLook type:ChestPrice type:ChestProps"],
  ["kit", "kit/ui/Counter/Counter", "left", "Counter type:CounterProps"],
  ["kit", "kit/ui/cx", "moved", "cx"],
  ["kit", "kit/ui/dialog", "moved", "FOCUSABLE useOpenerFocus"],
  ["kit", "kit/ui/dialog", "left", "useDialogKeys"],
  ["kit", "kit/ui/format", "moved", "formatCountdown"],
  ["kit", "kit/ui/format", "left", "WARN_UNDER_SECONDS"],
  [
    "kit",
    "kit/ui/icons",
    "left",
    "type:Glyph glyph14 type:IconProps LockBadge line20 SparkleGlyph TickBadge",
  ],
  ["kit", "kit/ui/Offer/Offer", "left", "Offer type:OfferContent type:OfferProps"],
  ["kit", "kit/ui/Panel/Panel", "left", "Panel type:PanelProps type:PanelTone"],
  [
    "kit",
    "kit/ui/PassTrack/PassTrack",
    "left",
    "type:PassLane type:PassReward type:PassTier PassTrack type:PassTrackProps type:RewardState",
  ],
  ["kit", "kit/ui/ProgressBar/ProgressBar", "left", "ProgressBar type:ProgressBarProps"],
  ["kit", "kit/ui/RarityChip/RarityChip", "left", "RarityChip type:RarityChipProps"],
  ["kit", "kit/ui/Ribbon/Ribbon", "left", "Ribbon type:RibbonProps type:RibbonTone"],
  ["kit", "kit/ui/Sheet/Sheet", "left", "Sheet type:SheetAction type:SheetFact type:SheetProps"],
  ["kit", "kit/ui/TabBar/TabBar", "left", "TabBar type:TabBarProps type:TabBarTab"],
  ["kit", "kit/ui/Timer/Timer", "left", "Timer type:TimerProps"],
  ["kit", "kit/ui/Title/Title", "left", "Title type:TitleProps"],
  ["kit", "kit/ui/Tree/Tree", "left", "Tree type:TreeNodeView type:TreeProps"],
  ["kit", "kit/ui/types", "stayed", "isTopTier tierInk tierLabel"],
  ["kit", "kit/ui/types", "left", "type:OddsRow"],
  ["kit", "kit/ui/world", "left", "carriesInk overlayStyle"],
  // `src/react`
  ["react", "react/boot", "stayed", "type:BootMachine useBoot"],
  ["react", "react/clock", "stayed", "clockLens useClockNow useTickNow warpClock"],
  ["react", "react/dev/gate", "stayed", "DevPanel type:DevPanelProps"],
  [
    "react",
    "react/GameShell",
    "left",
    "GameShell type:GameShellProps type:PageTable type:ShellPage type:ShellTab type:TabTable",
  ],
  ["react", "react/GameShell", "moved", "SheetOutlet type:SheetOutletProps type:SheetRegistry"],
  ["react", "react/gameClock", "stayed", "type:GameClockState useGameClock"],
  ["react", "react/hotkeys", "stayed", "useHotkeys"],
  [
    "react",
    "react/layout",
    "stayed",
    "type:PageLayout PageLayoutProvider usePageLayout usePageLayoutObserver WIDE_AT",
  ],
  ["react", "react/news", "stayed", "useNews"],
  [
    "react",
    "react/runtime",
    "stayed",
    "type:GameRuntime type:GameRuntimeOptions type:RuntimeSound useGameRuntime",
  ],
  [
    "react",
    "react/store",
    "stayed",
    "createRuntimeHooks IdleStoreContext IdleStoreProvider mountGame type:RuntimeHooks type:RuntimeStore " +
      "type:StoreState useIdleStore",
  ],
  ["react", "react/swap", "stayed", "type:LayerSwap type:LayerSwapOptions useLayerSwap"],
  ["react", "react/tabTitle", "stayed", "claimTabTitle releaseTabTitle"],
];

/** Names added to the entries after v0.1.11 (0.2.0 and later) that stay where they are. */
export const LATER: Record<Entry, readonly string[]> = {
  [KIT]: [
    "flashKeyframes",
    "FlightHostProps",
    "RevealLanding",
    "RevealSequence",
    "RevealSequenceApi",
    "RevealSequenceOptions",
    "RevealSequenceProps",
    "useRevealSequence",
  ],
  [REACT]: ["usePrefs"],
};

export interface OldExport {
  entry: Entry;
  module: string;
  bucket: Bucket;
  name: string;
  type: boolean;
}

export const OLD_EXPORTS: readonly OldExport[] = ROWS.flatMap(([entry, module, bucket, names]) =>
  names.split(/\s+/).map((word) => ({
    entry: entry === "kit" ? KIT : REACT,
    module,
    bucket,
    name: word.replace(/^type:/, ""),
    type: word.startsWith("type:"),
  })),
);

const BUCKETS: Record<Entry, Map<string, Bucket>> = { [KIT]: new Map(), [REACT]: new Map() };
for (const e of OLD_EXPORTS) BUCKETS[e.entry].set(e.name, e.bucket);
for (const entry of [KIT, REACT] as const)
  for (const name of LATER[entry]) BUCKETS[entry].set(name, "stayed");

/** The retired files at v0.1.11: everything the vendored copy holds. */
const RETIRED = [
  /^src\/kit\/ui\//,
  /^src\/kit\/fx\/cards\//,
  /^src\/kit\/fx\/scenes\//,
  /^src\/kit\/fx\/DitherMark\.[^/]+$/,
  /^src\/kit\/reveal\/(Room\.tsx|Room\.module\.css|RevealHost\.tsx|RevealPull\.tsx|Reveal\.module\.css|scene\.ts|useOpenFlare\.ts)$/,
  /^src\/react\/GameShell\.[^/]+$/,
];
export const isRetired = (path: string): boolean => RETIRED.some((re) => re.test(path));

/** Kept components whose look changed: a use is listed so the game can restore what it relied on. */
const WATCH: Record<Entry, Record<string, (local: string) => string>> = {
  [KIT]: {
    Ticker: () =>
      "`Ticker` no longer adds the `wh-num` class: pass `className` if the game's CSS relied on it",
    Money: () => "`Money` no longer adds the `wh-num` class: pass `className` if the game's CSS relied on it",
    Flash: (local) =>
      `\`Flash\` is headless now: it takes \`className\`; the old look is ${local}/legacy-effects.css (--vendor)`,
    FlightHost: (local) =>
      `\`FlightHost\` is headless now: it takes \`className\`; the old look is ${local}/legacy-effects.css (--vendor)`,
  },
  [REACT]: {
    GameShell: () =>
      "`GameShell` is the old styled page, now the vendored copy: replace it with watchpot/ui's `PageShell` " +
      "when the game owns its look",
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Reading source as text. No parser: the engine's TypeScript is the native port, without the old compiler API,
// and import statements are regular enough to read once comments and string bodies are out of the way.

const IDENT = /[\w$]/;
/** Words after which a `/` starts a regex rather than dividing. */
const REGEX_AFTER = new Set([
  "return",
  "typeof",
  "instanceof",
  "case",
  "do",
  "else",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "yield",
  "await",
]);

/**
 * The source with comments, string bodies, template text and regex bodies blanked to spaces (newlines and quote
 * marks kept), so a search over it sees only code and offsets still match the source.
 */
export function maskSource(src: string): string {
  const out = src.split("");
  const n = src.length;
  let i = 0;
  let last = ""; // the last significant code character; "a" after a string or regex
  let word = "";
  let depth = 0;
  const subs: number[] = []; // the brace depth of each open `${`
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < n; k++) if (out[k] !== "\n" && out[k] !== "\r") out[k] = " ";
  };
  const template = () => {
    const from = i;
    while (i < n) {
      const c = src[i];
      if (c === "\\") i += 2;
      else if (c === "`") {
        blank(from, i);
        i++;
        last = "a";
        return;
      } else if (c === "$" && src[i + 1] === "{") {
        blank(from, i);
        i += 2;
        depth++;
        subs.push(depth);
        last = "(";
        return;
      } else i++;
    }
    blank(from, n);
  };
  const regexMayStart = () => {
    if (last === "") return true;
    if (last === "a") return false;
    if (IDENT.test(last)) return REGEX_AFTER.has(word);
    // `</` closes a JSX tag; `)`, `]` and `}` end an operand.
    return !")]}<".includes(last);
  };
  while (i < n) {
    const c = src[i] as string;
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      const e = src.indexOf("\n", i);
      const end = e < 0 ? n : e;
      blank(i, end);
      i = end;
      continue;
    }
    if (c === "/" && next === "*") {
      const e = src.indexOf("*/", i + 2);
      const end = e < 0 ? n : e + 2;
      blank(i, end);
      i = end;
      continue;
    }
    if (c === '"' || c === "'") {
      let k = i + 1;
      while (k < n && src[k] !== c && src[k] !== "\n") k += src[k] === "\\" ? 2 : 1;
      blank(i + 1, k);
      i = k + 1;
      last = "a";
      word = "";
      continue;
    }
    if (c === "`") {
      i++;
      template();
      word = "";
      continue;
    }
    if (c === "/" && regexMayStart()) {
      let k = i + 1;
      let cls = false;
      while (k < n && src[k] !== "\n") {
        const d = src[k];
        if (d === "\\") {
          k += 2;
          continue;
        }
        if (d === "[") cls = true;
        else if (d === "]") cls = false;
        else if (d === "/" && !cls) break;
        k++;
      }
      blank(i + 1, k);
      i = k + 1;
      last = "a";
      word = "";
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      if (subs.length > 0 && subs[subs.length - 1] === depth) {
        subs.pop();
        depth--;
        i++;
        template();
        word = "";
        continue;
      }
      depth--;
    }
    if (IDENT.test(c)) {
      word = i > 0 && IDENT.test(src[i - 1] ?? "") ? word + c : c;
      last = c;
    } else if (!/\s/.test(c)) {
      last = c;
      word = "";
    }
    i++;
  }
  return out.join("");
}

export interface Spec {
  name: string;
  alias?: string;
  type: boolean;
}

/** One import, export-from, dynamic import or require of a module. */
export interface Ref {
  kind: "import" | "export" | "dynamic";
  form: "named" | "namespace" | "star" | "default" | "bare" | "dynamic";
  typeOnly: boolean;
  module: string;
  /** The named form's specifiers; null when one could not be read. */
  specs: Spec[] | null;
  /** The statement's span, past its `;` when it has one. */
  start: number;
  end: number;
  /** The module string's body. */
  modStart: number;
  modEnd: number;
  quote: string;
  semi: boolean;
}

const HEAD =
  /(import|export)(\s+type(?=[\s{*]))?\s*(\{[^}]*\}|\*\s*as\s+[\w$]+|\*|[\w$]+\s*,\s*\{[^}]*\}|[\w$]+\s*,\s*\*\s*as\s+[\w$]+|[\w$]+)\s*from\s*(["'])/y;
const BARE = /import\s*(["'])/y;
const DYNAMIC = /import\s*\(\s*(["'])/y;
const SPEC = /^(?:(type)\s+)?([\w$]+)(?:\s+as\s+([\w$]+))?$/;

function parseSpecs(inner: string): Spec[] | null {
  const specs: Spec[] = [];
  for (const part of inner.split(",")) {
    const text = part.trim();
    if (text === "") continue;
    const m = SPEC.exec(text);
    if (!m?.[2]) return null;
    specs.push({ name: m[2], ...(m[3] ? { alias: m[3] } : {}), type: m[1] === "type" });
  }
  return specs;
}

/** Every module reference in a source file, in order. */
export function scanRefs(src: string, masked = maskSource(src)): Ref[] {
  const refs: Ref[] = [];
  let skip = 0;
  const finish = (
    at: number,
    open: number,
    rest: Omit<Ref, "start" | "end" | "modStart" | "modEnd" | "module" | "quote" | "semi">,
  ) => {
    const quote = masked[open] as string;
    const close = masked.indexOf(quote, open + 1);
    if (close < 0) return;
    let end = close + 1;
    if (rest.kind === "dynamic") end = close + 1;
    const semi = /^[ \t]*;/.exec(src.slice(end, end + 64));
    if (semi && rest.kind !== "dynamic") end += semi[0].length;
    refs.push({
      ...rest,
      module: src.slice(open + 1, close),
      start: at,
      end,
      modStart: open + 1,
      modEnd: close,
      quote,
      semi: semi !== null && rest.kind !== "dynamic",
    });
    skip = end;
  };
  for (const m of masked.matchAll(/\b(import|export)\b/g)) {
    const at = m.index;
    if (at < skip || masked[at - 1] === "." || masked[at - 1] === "$") continue;
    HEAD.lastIndex = at;
    const head = HEAD.exec(masked);
    if (head) {
      const binds = head[3] as string;
      const kind = head[1] as "import" | "export";
      let form: Ref["form"];
      let specs: Spec[] | null = null;
      if (binds.startsWith("{")) {
        form = "named";
        specs = parseSpecs(binds.slice(1, -1));
      } else if (binds.startsWith("*")) form = binds.includes("as") ? "namespace" : "star";
      else form = "default";
      finish(at, at + head[0].length - 1, { kind, form, typeOnly: head[2] !== undefined, specs });
      continue;
    }
    if (m[1] !== "import") continue;
    DYNAMIC.lastIndex = at;
    const dyn = DYNAMIC.exec(masked);
    if (dyn) {
      finish(at, at + dyn[0].length - 1, { kind: "dynamic", form: "dynamic", typeOnly: false, specs: null });
      continue;
    }
    BARE.lastIndex = at;
    const bare = BARE.exec(masked);
    if (bare)
      finish(at, at + bare[0].length - 1, { kind: "import", form: "bare", typeOnly: false, specs: null });
  }
  for (const m of masked.matchAll(/(?<![\w$.])require\s*\(\s*(["'])/g)) {
    finish(m.index, m.index + m[0].length - 1, {
      kind: "dynamic",
      form: "dynamic",
      typeOnly: false,
      specs: null,
    });
  }
  return refs.sort((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------------------------------------------------------
// Writing statements and edits.

const WIDTH = 110;

const specText = (s: Spec) => `${s.type ? "type " : ""}${s.name}${s.alias ? ` as ${s.alias}` : ""}`;
const specKey = (s: Spec) => `${s.name} as ${s.alias ?? s.name}`;

interface Style {
  quote: string;
  semi: boolean;
  eol: string;
}

function render(kind: "import" | "export", typeOnly: boolean, specs: Spec[], module: string, style: Style) {
  const head = `${kind}${typeOnly ? " type" : ""} `;
  const tail = ` from ${style.quote}${module}${style.quote}${style.semi ? ";" : ""}`;
  const parts = specs.map(specText);
  const one = `${head}{ ${parts.join(", ")} }${tail}`;
  if (one.length <= WIDTH) return one;
  return `${head}{${style.eol}${parts.map((p) => `  ${p},`).join(style.eol)}${style.eol}}${tail}`;
}

/** Specifiers merged by name and alias (a value beats a type), written `import type` when every one is a type. */
function renderGroup(kind: "import" | "export", specs: Spec[], module: string, style: Style) {
  const byKey = new Map<string, Spec>();
  for (const s of specs) {
    const had = byKey.get(specKey(s));
    if (!had || (had.type && !s.type)) byKey.set(specKey(s), s);
  }
  const merged = [...byKey.values()];
  const allTypes = merged.every((s) => s.type);
  return render(
    kind,
    allTypes,
    allTypes ? merged.map((s) => ({ ...s, type: false })) : merged,
    module,
    style,
  );
}

export interface Op {
  start: number;
  end: number;
  /** Where the edit ends on its last line, before a removed statement's line break. */
  shownEnd: number;
  text: string;
}

/** Replaces a statement; an empty replacement takes its line with it when nothing else is on the line. */
function replaceRef(src: string, ref: Ref, text: string): Op {
  let end = ref.end;
  if (text === "") {
    const atLineStart = ref.start === 0 || src[ref.start - 1] === "\n";
    const tail = /^[ \t]*(\r?\n|$)/.exec(src.slice(end));
    if (atLineStart && tail) end += tail[0].length;
  }
  return { start: ref.start, end, shownEnd: ref.end, text };
}

function applyOps(src: string, ops: Op[]): string {
  let out = src;
  for (const op of [...ops].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, op.start) + op.text + out.slice(op.end);
  }
  return out;
}

function lineIndex(src: string): (at: number) => number {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === "\n") starts.push(i + 1);
  return (at) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((starts[mid] as number) <= at) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

export interface Hunk {
  line: number;
  before: string[];
  after: string[];
}

/** The edits as whole lines before and after, ops on shared lines in one hunk. */
export function hunks(src: string, ops: Op[]): Hunk[] {
  const lineOf = lineIndex(src);
  const groups: { ls: number; le: number; ops: Op[] }[] = [];
  for (const op of [...ops].sort((a, b) => a.start - b.start)) {
    const ls = op.start === 0 ? 0 : src.lastIndexOf("\n", op.start - 1) + 1;
    const found = src.indexOf("\n", op.shownEnd);
    const le = found < 0 ? src.length : found;
    const g = groups[groups.length - 1];
    if (g && ls <= g.le) {
      g.ops.push(op);
      g.le = Math.max(g.le, le);
    } else groups.push({ ls, le, ops: [op] });
  }
  const lines = (s: string) => (s.trim() === "" ? [] : s.replaceAll("\r", "").split("\n"));
  return groups.map((g) => {
    let after = "";
    let at = g.ls;
    for (const op of g.ops) {
      after += src.slice(at, op.start) + op.text;
      at = op.shownEnd;
    }
    after += src.slice(at, g.le);
    return { line: lineOf(g.ls), before: lines(src.slice(g.ls, g.le)), after: lines(after) };
  });
}

/** A relative module path from one root-relative file to another, POSIX, starting with a dot. */
export function relativeModule(fromFile: string, target: string): string {
  const rel = posix.relative(posix.dirname(fromFile), target);
  return rel.startsWith(".") ? rel : `./${rel}`;
}

const escapeRe = (s: string) => s.replace(/[$]/g, "\\$&");

// ---------------------------------------------------------------------------------------------------------------
// The game's imports.

export interface HumanItem {
  file: string;
  line: number;
  why: string;
}

export interface FilePlan {
  file: string;
  before: string;
  after: string;
  ops: Op[];
  statements: number;
  calls: number;
  /** Names now imported or re-exported from the local copy. */
  local: number;
}

/** Rewrites one game file's imports of the kit and react entries; `file` is root-relative POSIX. */
export function rewriteFile(
  src: string,
  file: string,
  local: string,
): { plan: FilePlan; human: HumanItem[] } {
  const masked = maskSource(src);
  const refs = scanRefs(src, masked);
  const lineOf = lineIndex(src);
  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  const human: HumanItem[] = [];
  const note = (at: number, why: string) => human.push({ file, line: lineOf(at), why });
  const localModule = relativeModule(file, `${local}/index`);

  const watched = new Map<string, string>();
  const openers: string[] = [];
  const toUi: Spec[] = [];
  const toLocal: Spec[] = [];
  let uiAnchor: Ref | undefined;
  let localAnchor: Ref | undefined;
  const splits = new Map<Ref, Record<Bucket, Spec[]>>();

  for (const ref of refs) {
    const mod = ref.module;
    if (mod.startsWith(`${KIT}/`)) {
      if (mod === `${KIT}/theme`) continue;
      note(
        ref.start,
        mod.endsWith(".css")
          ? `\`${mod}\`: the kit's stylesheets are gone; the vendored copies carry their own CSS modules, and ` +
              "what this sheet gave the game moves into the game's CSS"
          : `\`${mod}\` is not an entry of the engine any more`,
      );
      continue;
    }
    if (mod !== KIT && mod !== REACT) continue;
    const where = `watchpot/ui, ${localModule} or ${mod}`;
    if (ref.form === "dynamic") {
      note(ref.start, `a dynamic import of ${mod} cannot be proved: each name now lives in ${where}`);
      continue;
    }
    if (ref.form === "namespace" || ref.form === "star") {
      note(
        ref.start,
        `${ref.form === "star" ? "`export *`" : "a namespace import"} of ${mod} cannot be proved: ` +
          `each name now lives in ${where}`,
      );
      continue;
    }
    if (ref.form === "default" || ref.form === "bare") {
      note(
        ref.start,
        `${ref.form === "bare" ? "a side-effect" : "a default"} import of ${mod}: check it by hand`,
      );
      continue;
    }
    if (!ref.specs) {
      note(ref.start, `could not read this statement's names; sort them by hand between ${where}`);
      continue;
    }
    const split: Record<Bucket, Spec[]> = { stayed: [], moved: [], left: [] };
    for (const spec of ref.specs) {
      const bucket = BUCKETS[mod].get(spec.name);
      if (!bucket) {
        note(ref.start, `\`${spec.name}\` is not a known export of ${mod}; left in place`);
        split.stayed.push(spec);
        continue;
      }
      split[bucket].push(spec);
      const watch = WATCH[mod][spec.name];
      const isValue = !spec.type && !ref.typeOnly;
      if (ref.kind === "import" && isValue) {
        if (watch) watched.set(spec.alias ?? spec.name, watch(local));
        if (mod === KIT && spec.name === "useOpenerFocus") openers.push(spec.alias ?? spec.name);
      }
      if (ref.kind === "export" && isValue && (watch || spec.name === "useOpenerFocus")) {
        note(
          ref.start,
          spec.name === "useOpenerFocus"
            ? "re-exports `useOpenerFocus`, now `(active: boolean, restore = true)`: fix the callers that import " +
                "it from here"
            : `re-exports ${watch?.(local)}; check the modules that import it from here`,
        );
      }
    }
    if (split.moved.length === 0 && split.left.length === 0) continue;
    splits.set(ref, split);
    if (ref.kind === "import") {
      const carry = (s: Spec) => (ref.typeOnly ? { ...s, type: true } : s);
      if (split.moved.length > 0) {
        uiAnchor ??= ref;
        toUi.push(...split.moved.map(carry));
      }
      if (split.left.length > 0) {
        localAnchor ??= ref;
        toLocal.push(...split.left.map(carry));
      }
    }
  }

  // An import the file already has from the same place takes the moved names rather than a second statement.
  const target = (modules: string[], group: Spec[]) => {
    if (group.length === 0) return undefined;
    const named = refs.filter(
      (r) => r.kind === "import" && r.form === "named" && r.specs && modules.includes(r.module),
    );
    if (group.every((s) => s.type)) return named.find((r) => r.typeOnly) ?? named.find((r) => !r.typeOnly);
    return named.find((r) => !r.typeOnly);
  };
  const uiTarget = target([UI], toUi);
  const localTarget = target([localModule, relativeModule(file, local)], toLocal);

  const ops: Op[] = [];
  for (const [ref, split] of splits) {
    const style = { quote: ref.quote, semi: ref.semi, eol };
    const carry = (specs: Spec[]) => (ref.typeOnly ? specs.map((s) => ({ ...s, type: true })) : specs);
    const parts: string[] = [];
    const kind = ref.kind === "export" ? "export" : "import";
    if (split.stayed.length > 0) parts.push(render(kind, ref.typeOnly, split.stayed, ref.module, style));
    if (ref.kind === "export") {
      if (split.moved.length > 0) parts.push(renderGroup("export", carry(split.moved), UI, style));
      if (split.left.length > 0) parts.push(renderGroup("export", carry(split.left), localModule, style));
    } else {
      if (ref === uiAnchor && !uiTarget) parts.push(renderGroup("import", toUi, UI, style));
      if (ref === localAnchor && !localTarget) parts.push(renderGroup("import", toLocal, localModule, style));
    }
    ops.push(replaceRef(src, ref, parts.join(eol)));
  }
  for (const [into, group] of [
    [uiTarget, toUi],
    [localTarget, toLocal],
  ] as const) {
    if (!into?.specs) continue;
    const have = into.specs.map((s) => (into.typeOnly ? { ...s, type: true } : s));
    const keys = new Set(have.map(specKey));
    const fresh = group.filter((s) => !keys.has(specKey(s)));
    if (fresh.length === 0) continue;
    const text = renderGroup("import", [...have, ...fresh], into.module, {
      quote: into.quote,
      semi: into.semi,
      eol,
    });
    ops.push(replaceRef(src, into, text));
  }
  const statements = ops.length;

  const inRef = (at: number) => refs.some((r) => at >= r.start && at < r.end);
  let calls = 0;
  for (const name of new Set(openers)) {
    for (const m of masked.matchAll(new RegExp(`(?<![\\w$.])${escapeRe(name)}\\s*\\(`, "g"))) {
      if (inRef(m.index) || /function\s+$/.test(masked.slice(Math.max(0, m.index - 30), m.index))) continue;
      const open = m.index + m[0].length - 1;
      const close = /^\s*\)/.exec(masked.slice(open + 1));
      if (close) {
        const end = open + 1 + close[0].length;
        ops.push({ start: open, end, shownEnd: end, text: "(true)" });
        calls++;
      } else {
        note(
          m.index,
          `\`${name}(…)\` passes options: watchpot/ui's \`useOpenerFocus\` is \`(active: boolean, restore = true)\`; ` +
            "rewrite this call by hand",
        );
      }
    }
  }
  for (const [name, why] of watched) {
    const lines = new Set<number>();
    const use = new RegExp(`<${escapeRe(name)}(?=[\\s/><])|(?<![\\w$.])${escapeRe(name)}\\s*\\(`, "g");
    for (const m of masked.matchAll(use)) {
      if (inRef(m.index) || lines.has(lineOf(m.index))) continue;
      lines.add(lineOf(m.index));
      note(m.index, why);
    }
  }
  const toCopy = [...splits.values()].reduce((n, s) => n + s.left.length, 0);
  return {
    plan: { file, before: src, after: applyOps(src, ops), ops, statements, calls, local: toCopy },
    human,
  };
}

const SKIP_DIRS = new Set(["node_modules", "dist"]);
const SOURCE = /\.(c|m)?(t|j)sx?$/;

/** The game's sources and stylesheets, root-relative POSIX, outside `node_modules`, `dist`, dot-folders and `local`. */
export function gameFiles(root: string, local: string): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const d of readdirSync(join(root, rel), { withFileTypes: true })) {
      const path = rel === "" ? d.name : `${rel}/${d.name}`;
      if (d.isDirectory()) {
        if (SKIP_DIRS.has(d.name) || d.name.startsWith(".") || path === local) continue;
        walk(path);
      } else if (d.isFile() && (SOURCE.test(d.name) || d.name.endsWith(".css"))) out.push(path);
    }
  };
  walk("");
  return out.sort();
}

// ---------------------------------------------------------------------------------------------------------------
// Vendoring the retired sources.

/** Where the old engine's files come from: git at the tag by default, a fixture in the tests. */
export interface OldTree {
  /** Every file, as a repository path (`src/kit/ui/cx.ts`). */
  list(): string[];
  read(path: string): string;
}

/** One `git archive` of the tag, unpacked in memory. */
export function gitTree(engine: string, tag = TAG, paths = ["src/kit", "src/react"]): OldTree {
  const r = Bun.spawnSync(["git", "-C", engine, "archive", "--format=tar", tag, "--", ...paths], {
    stdout: "pipe",
    stderr: "pipe",
  });
  if (r.exitCode !== 0)
    throw new Error(`git archive ${tag} failed in ${engine}: ${r.stderr.toString().trim()}`);
  const files = untar(r.stdout);
  return {
    list: () => [...files.keys()],
    read: (path) => {
      const text = files.get(path);
      if (text === undefined) throw new Error(`${path} is not in ${tag}`);
      return text;
    },
  };
}

function untar(buf: Uint8Array): Map<string, string> {
  const files = new Map<string, string>();
  const dec = new TextDecoder();
  const str = (from: number, len: number) => {
    const s = buf.subarray(from, from + len);
    const z = s.indexOf(0);
    return dec.decode(z < 0 ? s : s.subarray(0, z));
  };
  let at = 0;
  let longName: string | undefined;
  while (at + 512 <= buf.length) {
    const name = str(at, 100);
    if (name === "") break;
    const size = Number.parseInt(str(at + 124, 12).trim() || "0", 8);
    const flag = buf[at + 156] ?? 0;
    const prefix = str(at + 345, 155);
    const body = at + 512;
    if (flag === 0x78) {
      // A pax header ("x"): a long path rides in it.
      longName = /\d+ path=([^\n]*)\n/.exec(dec.decode(buf.subarray(body, body + size)))?.[1];
    } else if (flag === 0x30 || flag === 0) {
      files.set(
        longName ?? (prefix ? `${prefix}/${name}` : name),
        dec.decode(buf.subarray(body, body + size)),
      );
      longName = undefined;
    } else if (flag !== 0x67) longName = undefined;
    at = body + Math.ceil(size / 512) * 512;
  }
  return files;
}

const ENTRY_OF: [prefix: string, entry: string][] = [
  ["src/kit/", KIT],
  ["src/react/", REACT],
  ["src/core/", "watchpot/core"],
];

const candidates = (p: string) => [p, `${p}.ts`, `${p}.tsx`, `${p}.d.ts`, `${p}/index.ts`, `${p}/index.tsx`];

const packageName = (mod: string) => {
  const parts = mod.split("/");
  return (mod.startsWith("@") ? parts.slice(0, 2) : parts.slice(0, 1)).join("/");
};

export interface VendorPlan {
  /** Root-relative destination and text. */
  files: { path: string; text: string }[];
  repointed: { file: string; from: string; to: string }[];
  human: HumanItem[];
  /** Each package the copies import, with the copies importing it. */
  peers: Map<string, string[]>;
}

/** Rewrites one copied file: relative imports of files that stayed become their package entry. */
function rewriteCopy(
  src: string,
  path: string,
  all: Set<string>,
  dest: string,
  local: string,
  plan: VendorPlan,
): string {
  const refs = scanRefs(src);
  const lineOf = lineIndex(src);
  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  const ops: Op[] = [];
  const merged = new Map<string, { ref: Ref; specs: Spec[]; module: string; dirty: boolean }>();
  for (const ref of refs) {
    let module = ref.module;
    if (module.startsWith(".")) {
      const target = posix.normalize(posix.join(posix.dirname(path), module));
      const hit = candidates(target).find((c) => all.has(c));
      if (hit && isRetired(hit)) continue;
      const entry = ENTRY_OF.find(([prefix]) => (hit ?? target).startsWith(prefix))?.[1];
      if (!entry) {
        plan.human.push({
          file: dest,
          line: lineOf(ref.start),
          why: `imports ${module}, which is neither vendored nor in an engine entry`,
        });
        continue;
      }
      plan.repointed.push({ file: dest, from: module, to: entry });
      module = entry;
      // A copy that renders a kept component whose look went headless loses that look with it.
      for (const s of ref.specs ?? []) {
        const watch = entry === KIT && !s.type && !ref.typeOnly ? WATCH[KIT][s.name] : undefined;
        if (watch)
          plan.human.push({ file: dest, line: lineOf(ref.start), why: `a vendored copy: ${watch(local)}` });
      }
    } else if (!module.startsWith("watchpot/")) {
      const pkg = packageName(module);
      if (pkg !== "react" && pkg !== "react-dom") {
        const users = plan.peers.get(pkg) ?? [];
        if (!users.includes(dest)) users.push(dest);
        plan.peers.set(pkg, users);
      }
    }
    // Several files that stayed collapse into one entry: their imports merge into the first.
    if (ref.kind === "import" && ref.form === "named" && ref.specs && module.startsWith("watchpot/")) {
      const key = `${ref.typeOnly}|${module}`;
      const seen = merged.get(key);
      if (seen) {
        const keys = new Set(seen.specs.map(specKey));
        seen.specs.push(...ref.specs.filter((s) => !keys.has(specKey(s))));
        seen.dirty = true;
        ops.push(replaceRef(src, ref, ""));
      } else merged.set(key, { ref, specs: [...ref.specs], module, dirty: module !== ref.module });
      continue;
    }
    if (module !== ref.module)
      ops.push({ start: ref.modStart, end: ref.modEnd, shownEnd: ref.modEnd, text: module });
  }
  for (const m of merged.values()) {
    if (!m.dirty) continue;
    const style = { quote: m.ref.quote, semi: m.ref.semi, eol };
    ops.push(replaceRef(src, m.ref, render("import", m.ref.typeOnly, m.specs, m.module, style)));
  }
  return applyOps(src, ops);
}

/** `<local>/index.ts`: what the game imported from the entries that now lives in the copies. */
export function indexSource(): string {
  const byModule = new Map<string, Spec[]>();
  for (const e of OLD_EXPORTS) {
    if (e.bucket !== "left") continue;
    const specs = byModule.get(e.module) ?? [];
    specs.push({ name: e.name, type: e.type });
    byModule.set(e.module, specs);
  }
  const style = { quote: '"', semi: true, eol: "\n" };
  const lines = [...byModule].map(([module, specs]) => render("export", false, specs, `./${module}`, style));
  return [
    `// The styled components watchpot retired in 0.3.0, as they stood at ${TAG}, vendored by its`,
    "// codemods/0.3.0-headless-kit.ts. The game owns them now: restyle, rename or replace them with watchpot/ui.",
    ...lines,
    "",
  ].join("\n");
}

/** The old look of the two effects that stayed in the engine but went headless, keyed on their data attributes. */
export const LEGACY_EFFECTS_CSS = `/*
 * The look watchpot's Flash and FlightHost had before 0.3.0 made them headless, keyed on the data attributes
 * they still set. Import this once from the game's entry; drop a rule once the game styles that effect itself.
 */

/* The flash: a sheet of paper over its parent, faded by the component. */
[data-flash] {
  background: var(--paper);
  z-index: 10;
}

/* The flight's layer, above the page's sheets. */
[data-flight-layer] {
  z-index: 60;
}

/* One flying glyph: the currency's 14px mark drawn at 22px. */
[data-flight-glyph] {
  width: 22px;
  height: 22px;
  color: var(--ink);
  filter: drop-shadow(0 2px 3px var(--ground));
  will-change: transform, opacity;
}
[data-flight-glyph] svg {
  display: block;
  width: 100%;
  height: 100%;
}

/* The pill takes the hit: a quick swell and a brightening, back in 160ms. */
@keyframes flight-bump {
  0% {
    scale: 1;
    filter: none;
  }
  35% {
    scale: 1.14;
    filter: brightness(1.6);
  }
  100% {
    scale: 1;
    filter: none;
  }
}
[data-pill][data-bump] {
  animation-name: flight-bump;
  animation-duration: 160ms;
  animation-timing-function: var(--ease-out);
}

/* Reduced motion: no swell, the pill is lit for the bump's 160ms instead. */
@media (prefers-reduced-motion: reduce) {
  [data-pill][data-bump] {
    animation-name: none;
    filter: brightness(1.6);
  }
}
:root[data-motion="reduced"] [data-pill][data-bump] {
  animation-name: none;
  filter: brightness(1.6);
}
`;

/** The copies of the retired files, rewritten, plus the index and the legacy effects. */
export function planVendor(tree: OldTree, local: string): VendorPlan {
  const all = new Set(tree.list());
  const plan: VendorPlan = { files: [], repointed: [], human: [], peers: new Map() };
  for (const path of [...all].filter(isRetired).sort()) {
    const dest = `${local}/${path.slice("src/".length)}`;
    const text = tree.read(path);
    plan.files.push({
      path: dest,
      text: SOURCE.test(path) ? rewriteCopy(text, path, all, dest, local, plan) : text,
    });
  }
  plan.files.push({ path: `${local}/index.ts`, text: indexSource() });
  plan.files.push({ path: `${local}/legacy-effects.css`, text: LEGACY_EFFECTS_CSS });
  return plan;
}

// ---------------------------------------------------------------------------------------------------------------
// The run.

export interface Options {
  /** The game's root. */
  root: string;
  /** The local dir, root-relative. */
  local?: string;
  vendor?: boolean;
  /** The retired sources; git at {@link TAG} in this engine checkout when absent. */
  from?: OldTree;
}

export interface Plan {
  local: string;
  files: FilePlan[];
  human: HumanItem[];
  vendor?: VendorPlan;
  /** Files the vendor would overwrite. */
  overwrite: string[];
}

export function plan(opts: Options): Plan {
  const local = opts.local ?? DEFAULT_LOCAL;
  const files: FilePlan[] = [];
  const human: HumanItem[] = [];
  for (const file of gameFiles(opts.root, local)) {
    const src = readFileSync(join(opts.root, file), "utf8");
    if (file.endsWith(".css")) {
      const lineOf = lineIndex(src);
      for (const m of src.matchAll(/watchpot\/kit\/[^"')\s;]*/g)) {
        human.push({
          file,
          line: lineOf(m.index),
          why: `\`${m[0]}\`: the kit's stylesheets are gone; what this sheet gave the game moves into its own CSS`,
        });
      }
      continue;
    }
    if (!src.includes("watchpot/")) continue;
    const r = rewriteFile(src, file, local);
    human.push(...r.human);
    if (r.plan.ops.length > 0) files.push(r.plan);
  }
  let vendor: VendorPlan | undefined;
  const overwrite: string[] = [];
  if (opts.vendor) {
    vendor = planVendor(opts.from ?? gitTree(join(import.meta.dir, "..")), local);
    for (const f of vendor.files) if (existsSync(join(opts.root, f.path))) overwrite.push(f.path);
  }
  const byPlace = (a: HumanItem, b: HumanItem) =>
    a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1;
  return { local, files, human: human.sort(byPlace), ...(vendor ? { vendor } : {}), overwrite };
}

export function apply(root: string, p: Plan): void {
  for (const f of p.files) writeFileSync(join(root, f.file), f.after);
  for (const f of p.vendor?.files ?? []) {
    const path = join(root, f.path);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, f.text);
  }
}

const GLOBALS = "wh-paper, wh-foil, wh-lotno, wh-num, wh-rule, wh-sr";

export function report(root: string, p: Plan, flags: { write: boolean; force: boolean }): string[] {
  const out: string[] = [];
  out.push(
    `watchpot 0.3.0 codemod: the styled kit leaves the engine${flags.write ? "" : " (dry run: pass --write to apply)"}`,
  );
  const statements = p.files.reduce((n, f) => n + f.statements, 0);
  const calls = p.files.reduce((n, f) => n + f.calls, 0);
  if (p.files.length > 0) {
    out.push("", `Import rewrites (${p.files.length} files)`);
    for (const f of p.files) {
      out.push(f.file);
      for (const h of hunks(f.before, f.ops)) {
        out.push(`  line ${h.line}`);
        for (const l of h.before) out.push(`  - ${l}`);
        for (const l of h.after) out.push(`  + ${l}`);
      }
    }
  }
  const v = p.vendor;
  if (v) {
    const copies = v.files.length - 2;
    out.push(
      "",
      `Vendor: ${copies} files from watchpot ${TAG} to ${p.local}/, plus index.ts and legacy-effects.css`,
      `  ${v.repointed.length} relative imports of files that stayed in the engine now name its entries:`,
    );
    for (const r of v.repointed) out.push(`    ${r.file.slice(p.local.length + 1)}: "${r.from}" -> ${r.to}`);
    if (p.overwrite.length > 0) {
      out.push(
        `  ${flags.force ? "Overwrites" : "Would overwrite (pass --force)"} ${p.overwrite.length} files:`,
      );
      for (const f of p.overwrite) out.push(`    ${f}`);
    }
    out.push("  Packages the copies import (add each to the game's dependencies if it is not there):");
    for (const [pkg, users] of [...v.peers].sort(([a], [b]) => a.localeCompare(b))) {
      out.push(`    ${pkg}: ${users.map((u) => u.slice(p.local.length + 1)).join(", ")}`);
    }
    out.push(
      "  The copies' CSS modules lean on the global classes and theme tokens the old template's app.css",
      `  defined (${GLOBALS}, --ink, --paper, ...): keep them defined in the game's CSS.`,
      `  Import ${p.local}/legacy-effects.css once from the game's entry: the old look of Flash and FlightHost.`,
    );
  } else if (p.files.some((f) => f.local > 0) && !existsSync(join(root, p.local, "index.ts"))) {
    out.push("", `Imports now name ${p.local}/index, which does not exist yet: run again with --vendor.`);
  }
  const human = [...p.human, ...(v?.human ?? [])];
  if (human.length > 0) {
    out.push("", `For a human (${human.length})`);
    for (const h of human) out.push(`  ${h.file}:${h.line}  ${h.why}`);
  }
  const vendored = v ? `${v.files.length} files vendored` : "nothing vendored";
  out.push(
    "",
    `Summary: ${statements} statements rewritten, ${calls} calls rewritten, ${p.files.length} files touched, ` +
      `${vendored}, ${human.length} items for a human.`,
  );
  if (statements > 0)
    out.push("Run the game's formatter afterwards: the rewritten imports are written plainly.");
  return out;
}

export const USAGE = `Usage: bun <watchpot>/codemods/0.3.0-headless-kit.ts [--write] [--vendor] [--force] [--local <dir>]

Run from the game's root. A dry run unless --write.
  --write        apply the edits (and the vendored files)
  --vendor       copy the retired kit sources from ${TAG} into the local dir
  --force        let --vendor overwrite files already in the local dir
  --local <dir>  the local dir, relative to the game's root (default ${DEFAULT_LOCAL})`;

export function main(
  argv: string[],
  io: { cwd: string; log: (line: string) => void; from?: OldTree } = { cwd: process.cwd(), log: console.log },
): number {
  const flags = { write: false, vendor: false, force: false };
  let local = DEFAULT_LOCAL;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === "--write") flags.write = true;
    else if (arg === "--vendor") flags.vendor = true;
    else if (arg === "--force") flags.force = true;
    else if (arg === "--help" || arg === "-h") {
      io.log(USAGE);
      return 0;
    } else if (arg === "--local" || arg.startsWith("--local=")) {
      const value = arg === "--local" ? argv[++i] : arg.slice("--local=".length);
      if (!value || value.startsWith("--")) {
        io.log(`--local needs a directory\n\n${USAGE}`);
        return 2;
      }
      local = value;
    } else {
      io.log(`Unknown argument: ${arg}\n\n${USAGE}`);
      return 2;
    }
  }
  const rel = relative(io.cwd, resolve(io.cwd, local)).replaceAll("\\", "/");
  if (rel === "" || rel.startsWith("..") || /^[a-zA-Z]:/.test(rel) || rel.startsWith("/")) {
    io.log(`--local must be a folder inside the game's root: ${local}\n\n${USAGE}`);
    return 2;
  }
  let p: Plan;
  try {
    p = plan({ root: io.cwd, local: rel, vendor: flags.vendor, ...(io.from ? { from: io.from } : {}) });
  } catch (e) {
    io.log(`Nothing written: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
  for (const line of report(io.cwd, p, flags)) io.log(line);
  if (flags.write) {
    if (p.overwrite.length > 0 && !flags.force) {
      io.log(
        `\nNothing written: ${p.overwrite.length} files in ${p.local} would be overwritten; pass --force.`,
      );
      return 1;
    }
    apply(io.cwd, p);
  }
  return 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
