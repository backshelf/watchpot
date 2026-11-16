# The game's components

These are this game's own: copied in by the scaffold, then changed, restyled or deleted as the game needs. Each is a
thin wrapper over a headless primitive from the engine's `watchpot/ui` (behaviour, keyboard, focus, ARIA and `data-*`
state) with a CSS module beside it (the look). Nothing here is shared with any other game, and nothing upstream
changes it.

The look they start with is deliberately plain: layout, spacing, states, focus rings and reduced motion are done;
colour, type and shape come from a small set of tokens and wait for a real design.

## The token contract

Every colour, face, radius and duration the CSS modules here read is one of these custom properties, set on `:root`
in `theme.css`. Nothing in `src/ui` hard-codes a colour, a font family or a corner. `theme.css` maps them from the
generated design tokens (`src/tokens.css`, compiled from `design/tokens.json` by `bun run tokens`), so the dark scheme
and any palette change reach them for free.

| Token               | Default (from `src/tokens.css`) | What reads it                                                                                                                                   |
| ------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `--ui-ground`       | `var(--ground)`                 | the page (`theme.css`), the backdrop's base colour, the tooltip's ink                                                                           |
| `--ui-surface`      | `var(--ground-raised)`          | panels, buttons, sheets, pills, tree tiles, the tab bar, toasts, the click target, an arrival, a buff chip                                       |
| `--ui-sunken`       | `var(--paper)`                  | progress tracks, a sunken panel, the open tab, unearned achievements, the buy-mode well                                                         |
| `--ui-ink`          | `var(--ink)`                    | all text, the chosen tree node's ring, the tooltip's and the achievement detail's fill, the backdrop's shadows                                  |
| `--ui-ink-muted`    | `var(--ink-muted)`              | secondary text: rates, labels, a panel's aside, glyphs, locked and idle tabs                                                                    |
| `--ui-line`         | `var(--edge)`                   | every border and rule, the tree's unlit edges                                                                                                   |
| `--ui-accent`       | `var(--signal)`                 | the primary button, progress fills, badges and tab counts, lit tree edges and tiles, earned achievements, floating numbers, the backdrop's light, an arrival's ring, a buff chip |
| `--ui-on-accent`    | `var(--on-signal)`              | text on the accent: the primary button, badges, tab counts                                                                                      |
| `--ui-focus`        | `var(--focus)`                  | the focus ring (`theme.css`)                                                                                                                    |
| `--ui-scrim`        | `var(--overlay)`                | the sheet's scrim                                                                                                                               |
| `--ui-danger`       | `var(--danger)`                 | the danger button, a timer under its warning, a danger toast, a buff chip's last fifth                                                                                    |
| `--ui-font`         | `var(--font-ui)`                | the page's text (`theme.css`) and everything that inherits it                                                                                   |
| `--ui-font-display` | `var(--font-display)`           | titles, panel and sheet headings, the tree's detail name                                                                                        |
| `--ui-font-num`     | `var(--font-num)`               | every figure: prices, balances, the counter, ranks, timers, counts                                                                              |
| `--ui-radius`       | `var(--radius-md)`              | every corner                                                                                                                                    |
| `--ui-duration`     | `160ms`                         | hover and press transitions, the sheet's and the toasts' entrance, the tooltip's fade                                                           |

A rarity's hue is the generated `--rarity-<id>` token (one per rung); `RarityChip` reads it through `tierInk`.

## Making the look your own

1. **The palette and the faces**: `design/tokens.json`, then `bun run tokens`. Every component follows.
2. **The mapping and the shape**: `theme.css`. Point a token somewhere else (`--ui-line: var(--hairline)`), round the
   corners (`--ui-radius: 12px`), slow the motion (`--ui-duration: 240ms`).
3. **A component's form**: its `.module.css`. Style from the primitives' `data-*` (`[data-state="open"]`,
   `[data-current]`, `[data-armed]`, `[data-lit]`, `[data-earned]`...); never from a class the engine adds (it adds
   none).

Then the bigger moves are yours: replace the starter backdrop in `src/shaders/` with the game's own place
(`watchpot/shader` chunks, the engine's `docs/shader.md`), give the primary button a glow, draw the tree's edges as
vines.

## What is here

| Component                | On                                    | Notes                                                                                                                                                                   |
| ------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Shell`                  | `PageShell`                           | header, the open tab's screen in its own scroll, `TabBar` along the foot (a rail on a wide page), sheets, a backdrop slot; provides the page root a `Sheet` makes inert |
| `TabBar`                 | `NavTabs`                             | a count is drawn by `NavTabs.Badge` with `format={badgeText}` (capped at 99) and said through `words.count`                                                             |
| `Sheet`, `ConfirmButton` | `Dialog`, `Portal`, `useConfirmPress` | a true modal: portalled to the body, the page inert, focus held and returned; `ConfirmButton` arms on the first press                                                   |
| `Button`                 | a native button                       | `variant`, `size`, a price with its glyph and its unit said                                                                                                             |
| `Panel`, `Title`         | real headings                         | a panel is an `<article>` named by its heading                                                                                                                          |
| `Counter`                | the kit's `Ticker`                    | needs `@number-flow/react`; `animated={false}` is plain text                                                                                                            |
| `CurrencyPill`           | `data-pill`                           | what the kit's currency flight lands on and bumps                                                                                                                       |
| `ProgressBar`            | `Progress`                            | `steps` lights whole blocks by `drawnShare` (never full until it is)                                                                                                    |
| `Timer`                  | `Countdown`                           | words before the digits from props; `data-warn`, `data-ended`                                                                                                           |
| `Tree`                   | `TreeGraph`                           | rows start at 0 (`grid-row: calc(var(--row) + 2)`, the tier headings take row 1); on a phone a press brings the detail drawer into view                                 |
| `Tooltip`                | `Tooltip`, `Portal`                   | words only; a control in a bubble is a popover                                                                                                                          |
| `AchievementWall`        | `AchievementGrid`                     | tiles and rows styled from `data-earned`, `data-hidden`, `data-complete`                                                                                                |
| `BuyAmount`              | `BuyAmount`                           | the ×1 / ×10 / Max switch; pair with `buyCount`                                                                                                                         |
| `ClickTarget`            | `Pressable`, `FloatingNumbers`        | a press returns the figure that floats from where it landed                                                                                                             |
| `Toasts`                 | `Toaster`, `createToasts`             | push from anywhere through the store                                                                                                                                    |
| `RarityChip`, `Badge`    |                                       | a rung's word in its hue; a small count                                                                                                                                 |
| `Backdrop`               | `ShaderCanvas`, `useShaderTokens`     | runs the game's fragment from `src/shaders/` behind the page with `u_ground`, `u_ink`, `u_accent` and `u_heat`; the surface's CSS still without WebGL2; logs a failed compile |
| `Arrival`                | `Pressable`                           | something that turns up and is caught (a spawn): placed by `at` (0..1), a ring that empties with `life` (`--life`), a bob that reduced motion stills                    |
| `BuffChip`               | `Countdown`                           | a running timed bonus: name, effect, time left, a bar draining by `--left`; `data-low` in its last fifth                                                                |

No component holds an English word: every label, unit, count phrase and lock comes from the game's copy through
props.

Components that belong to one feature arrive only with it: `ClickTarget` (clicker), `Tree` (tree), `RarityChip`
(gacha), `AchievementWall` (achievements), `Arrival` and `BuffChip` (visitor). The rest arrive in every game.
