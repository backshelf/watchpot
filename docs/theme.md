# A theme

A game keeps one `tokens.json` (colour tokens per theme, type families, fonts) and compiles it to a stylesheet with the
design-time compiler `buildTokens`, imported from `watchpot/kit/theme` (not in the kit barrel).

Example: [`examples/theme.ts`](examples/theme.ts) (`bun docs/examples/theme.ts` prints the compiled sheet).

- The first theme is `:root`; each later one is a `[data-theme="id"]` block. A colour is a string or a per-theme record.
- Name a rarity colour `rarity-<id>` for every rung of the game's ladder: the kit reads a tier as `--rarity-<id>` (`tierToken`, `tierInk`).
- Fonts are `tokens.type.fonts`; `fontBase` is the folder the stylesheet reads them from, as the css file sees it.
- `data-theme` on `<html>` (the template sets it in `index.html`) or on any scope picks a theme; `data-scheme` (the runtime's `applyColorScheme`) picks a scheme.
- A game's components read the compiled tokens through its own contract: the template's `src/ui/theme.css` maps
  them onto `--ui-*`, the variables every copy-in component reads. The table of them, and what each one paints, is
  [the registry's token contract](../templates/game/src/ui/README.md#the-token-contract). `TokensFile` (from
  `watchpot/kit/theme`) types the `tokens.json` shape.
