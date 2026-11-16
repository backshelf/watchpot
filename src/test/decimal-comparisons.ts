import { dirname, relative, resolve, sep } from "node:path";
import type { BinaryExpression, Node, SourceFile } from "typescript/unstable/ast";
import type { Checker, Type } from "typescript/unstable/sync";

/** One comparison operator applied to two Decimals, found by {@link decimalComparisons}. */
export interface DecimalComparison {
  /** The file, relative to the tsconfig's folder, with `/` separators. */
  file: string;
  /** 1-based line of the operator. */
  line: number;
  /** 1-based column of the operator. */
  column: number;
  /** The operator: `<`, `<=`, `>`, `>=`, `==`, `!=`, `===` or `!==`. */
  operator: string;
  /** The whole comparison's source text. */
  text: string;
}

/** What {@link decimalComparisons} checks. */
export interface DecimalComparisonsOptions {
  /** Path to the project's `tsconfig.json`; its program is what gets checked. */
  tsconfig: string;
  /**
   * Folders (relative to the tsconfig's folder) whose files are checked; the default is every file of the program
   * outside `node_modules`.
   */
  under?: readonly string[];
}

const OPERATORS = new Set(["<", "<=", ">", ">=", "==", "!=", "===", "!=="]);

/**
 * Every place the project compares two Decimals with an operator instead of a method. `D(3) < D(20)` and
 * `D(1) === D(1)` compile and are both false: `<` compares the objects' strings and `===` their identity. Use
 * `a.lt(b)`, `a.gte(b)`, `a.eq(b)` instead.
 *
 * Type-aware: it asks TypeScript 7's checker for each operand's type and flags a comparison only when both sides can
 * be a Decimal (a `DecimalSource`, or `Decimal | null`, counts), so `n < 5` on numbers, `d === null` and `.lt()`
 * calls pass. Needs `typescript` 7 installed (it uses `typescript/unstable/sync`, which spawns the native checker).
 *
 * ```ts
 * test("no Decimal is compared with an operator", async () => {
 *   expect(await decimalComparisons({ tsconfig: "tsconfig.json", under: ["src"] })).toEqual([]);
 * });
 * ```
 */
export async function decimalComparisons(options: DecimalComparisonsOptions): Promise<DecimalComparison[]> {
  const { API } = await import("typescript/unstable/sync");
  const { SyntaxKind, isBinaryExpression } = await import("typescript/unstable/ast");
  const tsconfig = resolve(options.tsconfig);
  const root = dirname(tsconfig);
  const folders = (options.under ?? [""]).map((folder) => resolve(root, folder));
  const inScope = (file: string): boolean => {
    const path = resolve(file);
    if (path.split(sep).includes("node_modules") || /\.d\.[cm]?ts$/.test(path)) return false;
    return folders.some((folder) => path === folder || path.startsWith(folder + sep) || folder === root);
  };

  const api = new API({ cwd: root });
  try {
    const project = api.updateSnapshot({ openProjects: [tsconfig] }).getProject(tsconfig);
    if (!project) throw new Error(`decimalComparisons: TypeScript did not open ${tsconfig}`);
    const found: { file: SourceFile; node: BinaryExpression }[] = [];
    for (const name of project.program.getSourceFileNames()) {
      if (!inScope(name)) continue;
      const file = project.program.getSourceFile(name);
      if (!file) continue;
      const visit = (node: Node): void => {
        if (isBinaryExpression(node) && OPERATORS.has(operatorText(node.operatorToken.kind, SyntaxKind))) {
          found.push({ file, node });
        }
        node.forEachChild(visit);
      };
      file.forEachChild(visit);
    }
    if (found.length === 0) return [];

    const types = typesOf(
      project.checker,
      found.flatMap(({ node }) => [node.left, node.right]),
    );
    const hits: DecimalComparison[] = [];
    found.forEach(({ file, node }, i) => {
      if (!canBeDecimal(types[2 * i]) || !canBeDecimal(types[2 * i + 1])) return;
      const at = node.operatorToken.getStart(file);
      const { line, character } = file.getLineAndCharacterOfPosition(at);
      hits.push({
        file: relative(root, file.fileName).split(sep).join("/"),
        line: line + 1,
        column: character + 1,
        operator: operatorText(node.operatorToken.kind, SyntaxKind),
        text: node.getText(file),
      });
    });
    return hits;
  } finally {
    api.close();
  }
}

/**
 * The operands' types in one batched request. TypeScript 7.0.2's API server panics serializing an empty tuple's
 * array literal (`[] satisfies readonly []`), failing the whole batch: microsoft/typescript-go#4804, fixed by PR #4803,
 * not released as of 7.0.2 (`latest`). The server recovers, so a failed batch is split in halves until the one operand
 * that fails is alone; it is reported as unknown, which is right, since an empty tuple is never a Decimal. Drop this
 * once the fix ships.
 */
function typesOf(checker: Checker, nodes: readonly Node[]): (Type | undefined)[] {
  try {
    return checker.getTypeAtLocation(nodes);
  } catch {
    if (nodes.length <= 1) return nodes.map(() => undefined);
    const half = Math.ceil(nodes.length / 2);
    return [...typesOf(checker, nodes.slice(0, half)), ...typesOf(checker, nodes.slice(half))];
  }
}

function operatorText(kind: number, syntax: typeof import("typescript/unstable/ast").SyntaxKind): string {
  switch (kind) {
    case syntax.LessThanToken:
      return "<";
    case syntax.LessThanEqualsToken:
      return "<=";
    case syntax.GreaterThanToken:
      return ">";
    case syntax.GreaterThanEqualsToken:
      return ">=";
    case syntax.EqualsEqualsToken:
      return "==";
    case syntax.ExclamationEqualsToken:
      return "!=";
    case syntax.EqualsEqualsEqualsToken:
      return "===";
    case syntax.ExclamationEqualsEqualsToken:
      return "!==";
    default:
      return "";
  }
}

/** Whether a type is break_eternity's Decimal, or a union or intersection with it as a member. */
function canBeDecimal(type: Type | undefined): boolean {
  if (!type) return false;
  if (type.isUnionType() || type.isIntersectionType()) return (type.getTypes() ?? []).some(canBeDecimal);
  // break_eternity.js declares the class as its default export, so the symbol's name is `default`.
  const symbol = type.getSymbol();
  return (
    (symbol?.name === "default" || symbol?.name === "Decimal") &&
    symbol.declarations.some((d) => d.path.includes("/break_eternity.js/"))
  );
}
