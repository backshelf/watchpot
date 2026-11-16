# The look

Three answers make a game's look: a palette, a type pairing (`type.md`) and a surface (its shader language). The
scaffold turns them into tokens (`design/tokens.json`, compiled to `src/tokens.css`), fonts and a starter backdrop; the
build's identity and shader passes turn them into a game nobody would mistake for another.

## Palettes

A palette is four answers: `ground` (the page), `ink` (the words), `signal` (the one loud colour: the primary button,
the current tab, the shaders' light; it reaches the page as `--ui-accent`) and one hue per rarity rung, lowest first.
The template derives the rest (paper, hairlines, the control edge, muted ink, the dark scheme for a light ground, the
states) in `.scaffold/generate.ts`, and warns when ink on ground is under 7:1 or text on the signal under 4.5:1.

Compose each option for the fiction, not from a stock list:

- **Ground and ink** carry the fiction's temperature: a warm paper and a brown-black, a deep sea and a bone white.
  Keep ink on ground at 7:1 or more (a near-black on any light ground, a near-white on any dark one).
- **The signal** is the fiction's one bright thing (a lamp, a sale sticker, a moss green). It carries black or white
  text at 4.5:1; mid-lightness saturated hues work, mid-grey ones fail. The shaders read it as their light, so pick a
  colour that looks good glowing.
- **The rarity hues climb**: the lowest rung is quiet (a grey in the ground's temperature), each rung more saturated
  or brighter, the top rung the loudest thing in the game and never the signal's twin unless the fiction wants the
  best thing to look like the lamp. 30 degrees of hue or more between neighbours.
- **Three options, far apart**: at least one dark ground and one light. Name each (two or three words) and say in a
  line what it feels like.

Worked examples:

| Name | ground | ink | signal | rarities |
| --- | --- | --- | --- | --- |
| Terrarium (light) | `#eef0e6` | `#16201a` | `#3f8f4e` | `#8a9488` `#3c8fbf` `#c9902a` |
| Black water (dark) | `#0d1620` | `#e9e4d4` | `#f2b33d` | `#7d8b96` `#4fb3c8` `#f2b33d` |
| Kiln (light) | `#f4efe4` | `#1d1a16` | `#c2410c` | `#8f877c` `#2f7d6d` `#7b4fc4` `#d99a1e` |

## The surface

The surface is what the game is made of when you look closely: the material every shader in it shares
(`shaders.md`). Offer three, each one sentence the player could picture, each naming what moves and what the game's
numbers do to it. Far apart in technique, all from the fiction:

- "Wet newsprint: two inks and a coarse dot screen; the dots swell as the presses run and the page bleeds on a
  jackpot." (`print`)
- "A harbour at night under sodium lamps: slow water, lamp glare smearing on it, the glare climbing with income."
  (`weather`)
- "A cathode tube left on: scanlines, a soft bloom on anything bright, a roll bar when something big lands."
  (`signal`)
- "Glaze crazing in a kiln: cells that crack finer as the heat rises and glow at the seams." (`cells`)

`base` picks the starter backdrop the scaffold writes (`src/shaders/<base>.ts`), so the first run already moves in the
right direction:

| `base` | Starter | For fictions that are |
| --- | --- | --- |
| `weather` | warped noise between two tokens | natural, liquid, atmospheric, slow |
| `print` | an ordered dither between two inks | paper, retro, cheap, bureaucratic, handmade |
| `signal` | scanlines, a bloom, a slow roll | electronic, broadcast, instrument, night |
| `cells` | Voronoi cells with lit seams | mineral, organic, crafted, crystalline |

The starter is replaced in the build; the sentence (`line`) is what stays, in the game's `.claude/CLAUDE.md`, as the
brief every shader is written against.
