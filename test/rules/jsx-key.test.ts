import { expect, test } from "bun:test";
import { Glob } from "bun";

/**
 * A `key` written after a `{...spread}` makes the bundler fall back to the classic JSX runtime for that element and
 * warn in every game's build. The key goes first.
 */
const KEY_AFTER_SPREAD = /\{\.\.\.[^{}]*\}\s+(?:[\w-]+(?:=(?:"[^"]*"|\{[^{}]*\}))?\s+)*key=/;

test("no JSX element in src writes its key after a spread", async () => {
  const found: string[] = [];
  for await (const path of new Glob("src/**/*.tsx").scan(".")) {
    const text = await Bun.file(path).text();
    const at = text.search(KEY_AFTER_SPREAD);
    if (at >= 0) found.push(`${path.replaceAll("\\", "/")}:${text.slice(0, at).split("\n").length}`);
  }
  expect(found).toEqual([]);
});

test("the scan sees a key after a spread, and not one before it", () => {
  expect(KEY_AFTER_SPREAD.test(`<span {...props} key={i} data-step={i} />`)).toBe(true);
  expect(KEY_AFTER_SPREAD.test(`<span {...props(i, lit)} data-on="y" key={i} />`)).toBe(true);
  expect(KEY_AFTER_SPREAD.test(`<span key={i} {...props} data-step={i} />`)).toBe(false);
});
