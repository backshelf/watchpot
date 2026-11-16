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
export declare function decimalComparisons(options: DecimalComparisonsOptions): Promise<DecimalComparison[]>;
