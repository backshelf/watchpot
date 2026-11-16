# answers.json

What a game is scaffolded from: `new.ts` (and `generate.ts` under it) reads one, checks it and lists every problem at
once. The types are `Answers` in `generate.ts`; the rules below are what `plan()` checks. A complete example is
`answers.example.json` beside this file; the least one can say is `fixtures/smallest-clicker.json` (a clicker and its
words, nothing else).

| Field | What | Rules |
| --- | --- | --- |
| `name` | The game's title. | Required. |
| `slug` | Folder, package, save key stem. | Optional; from `name` (lowercase, hyphens). |
| `premise` | One or two sentences. | Required. Shown in the about sheet and the README. |
| `voice` | How the game talks. | Required; a sentence or two. |
| `player` | Who plays, when. | Optional. |
| `core` | `"generators"` or `"dimensions"`: the loop at the bottom. | Default `"generators"`. `"dimensions"` is a chain: each tier makes the tier below, every ten bought doubles it. |
| `features` | Any of `"clicker"`, `"tree"`, `"gacha"`, `"prestige"`, `"achievements"`, `"visitor"`. | Optional, none by default. The wallet, the stats and the core are always in; everything else is added by hand later. |
| `currencies.main` | `{ name, plural?, glyph?, id? }`, what the core makes. | Required. `plural` defaults to `name` + s; the id to the plural, slugged. |
| `currencies.premium` | The same, what pulls cost. | Required with `gacha`; ignored without. Its id differs from the main one's. |
| `stats` | `{ output, offline, gain? }`: the stats' names in the fiction. | `output` and `offline` required; `gain` required with `prestige`. |
| `generators` | `[{ name, line }]`, cheapest first. | 3 to 8 with the `generators` core, or none at all beside a clicker (the press is the game). With `core: "dimensions"` these are the tiers, lowest first (4 to 8). Names slug to distinct ids. The numbers are the template's. |
| `clicker` | `{ name, verb, line }`: the thing pressed, the press's verb, a flavour line. | Required with `clicker`. |
| `tree` | `{ name, nodes: [{ name, line, stat }] }`. | Required with `tree`; 2 to 12 nodes, two to a tier; `stat` is `output`, `offline` or `gain` (gain needs prestige). |
| `gacha` | `{ name, box, rarities: [{ name, id? }], items: [{ name, rarity, stat }] }`. | Required with `gacha`; 2 to 5 rungs, lowest first, distinct ids; every rung has an item; `rarity` names a rung by id (its name slugged); `stat` as for the tree. |
| `prestige` | `{ name, verb, currency: { name, plural?, glyph?, id? } }`. | Required with `prestige`; `verb` is the button. |
| `achievements` | `{ name, items: [{ name, line, when, secret? }] }`. | Required with `achievements`; 8 to 48, laid eight to a row, names slugging to distinct ids. `when` is exactly one of `{ own: <generator index>, count }`, `{ earned: <amount> }`, `{ clicks: n }` (clicker), `{ runs: n }` (prestige), `{ nodes: n }` (tree), `{ pulls: n }` (gacha). `own` counts from 0, cheapest first, and `count` is 1 or more; `earned` is the main currency earned in one run (a prestige starts it over); `nodes` counts tree nodes that hold a rank, not ranks; every number is above zero. |
| `visitor` | `{ name, line, buff: { name, mult, seconds } }`. | Required with `visitor`: something that turns up at random and, caught, multiplies output by `mult` (above 1) for `seconds` (above 0). |
| `tabs` | `{ make?, tree?, gacha?, prestige?, achievements? }`. | Optional; default the main plural and the features' names. The clicker and the visitor have no tab: they live on the main screen. |
| `session` | `"glance"`, `"short"` or `"long"`. | Required. Sets the session schedule the sim's `--sessions` run plays; the contract is judged on played hours either way. |
| `look` | The look, every part optional. | Left out: the system's fonts, the default palette, no backdrop, no moment. |
| `look.palette` | `{ ground?, ink?, signal?, rarities? }`, `#rrggbb`. | Each defaults to the template's (ink on paper, a blue signal). Ink on ground 7:1 or more, text on the signal 4.5:1 (a warning, not a refusal); `rarities` one per rung, lowest first. A dark ground makes a dark game; a light one also gets a dark scheme. |
| `look.type` | `{ display?, ui?, num? }`, each `{ family, spec?, fallback? }`. | Each defaults to the system's face (`system-ui`, `ui-monospace` for numbers). `spec` is the Google Fonts css2 `family=` value, copied exactly (`Work+Sans:wght@100..900`), and makes `index.html` link it; leave it out for a font the system has. |
| `look.surface` | `{ base, line }`: the starter backdrop and the shader language. | Optional: without it the page has no backdrop. With it, both fields: `base` is `"weather"`, `"print"`, `"signal"` or `"cells"` (a starter in `src/shaders/`, to be replaced), `line` the sentence every shader answers to. |
| `look.moment` | One sentence: the moment the look is built around. | Optional; into the concept. |

**Glyphs:** `coin`, `drop`, `gem`, `leaf`, `star`, `moon`, `bolt`, `shell`, `flame`, `key`, `sun`, `seed`. An unknown
glyph is refused. They are placeholders: a game draws its own.

**Reserved ids:** a currency whose id would be `earned`, `credit` or `debit` is refused (the wallet uses those).

The scaffold takes the minimum: names, short flavour lines (under ten words reads best) and the shape. Depth, the
late game and the numbers are written in the game afterwards.
