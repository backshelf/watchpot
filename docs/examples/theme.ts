import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildTokens } from "watchpot/kit/theme";

/**
 * A game keeps one `tokens.json` (colours per theme, type, fonts) and a three-line script that compiles it to the
 * stylesheet the app imports. The compiler is a design-time tool: it is not in the `watchpot/kit` barrel.
 */
export const TOKENS = {
  name: "Toy",
  color: {
    themes: [{ id: "game" }, { id: "night" }],
    tokens: [
      { name: "ground", value: { game: "#ffffff", night: "#101014" } },
      { name: "ink", value: { game: "#101014", night: "#ffffff" } },
      { name: "signal", value: "#ffd400" },
      { name: "rarity-common", value: "#888888" },
      { name: "rarity-rare", value: "#2f6df6" },
      { name: "rarity-epic", value: "#a23cf0" },
    ],
  },
  type: {
    families: { display: "Toy Display, sans-serif", body: "system-ui, sans-serif" },
    groups: [],
  },
};

/** The caller: write `tokens.json`, then `buildTokens`. */
export async function build(dir: string): Promise<string> {
  await Bun.write(join(dir, "tokens.json"), JSON.stringify(TOKENS));
  await buildTokens({ tokens: join(dir, "tokens.json"), out: join(dir, "tokens.css"), fontBase: "fonts" });
  return readFile(join(dir, "tokens.css"), "utf8");
}

if (import.meta.main) {
  const css = await build(await mkdtemp(join(tmpdir(), "watchpot-theme-")));
  console.log(css);
}
