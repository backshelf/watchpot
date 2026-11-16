# Type pairings

Google-hosted families only; the template links them from `index.html`. Each `spec` below was checked to return
200 from `https://fonts.googleapis.com/css2?family=<spec>&display=swap` (2026-11-16). Copy a spec exactly: a weight a
family lacks fails the whole request, and the game falls back to system fonts without saying so. To use a family not
listed, check its spec the same way first.

The display face sets the headings and titles (bold at 700), the UI face everything else, the number face every
figure (tabular). In `answers.json` each is `look.type.display`, `.ui` and `.num`: `{ family, spec, fallback }`
(`ENGINE/templates/game/.scaffold/answers.md`).

| Pairing | Says | display | ui | num |
| --- | --- | --- | --- | --- |
| Botanical | warm, bookish, patient | `Fraunces:ital,opsz,wght@0,9..144,100..900;1,9..144,100..900` | `Work+Sans:ital,wght@0,100..900;1,100..900` | `JetBrains+Mono:wght@100..800` |
| Editorial | elegant, a little arch | `Instrument+Serif:ital@0;1` | `Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900` | `IBM+Plex+Mono:wght@400;500;600` |
| Signal | technical, cold, exact | `Space+Grotesk:wght@300..700` | `Space+Grotesk:wght@300..700` | `Space+Mono:wght@400;700` |
| Gallery | clean, modern, quiet luxury | `DM+Serif+Display:ital@0;1` | `DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000` | `DM+Mono:wght@300;400;500` |
| Workshop | friendly, crafted, odd | `Bricolage+Grotesque:opsz,wght@12..96,200..800` | `Bricolage+Grotesque:opsz,wght@12..96,200..800` | `Geist+Mono:wght@100..900` |
| Theatre | grand, old-world, dramatic | `Playfair+Display:ital,wght@0,400..900;1,400..900` | `Source+Sans+3:ital,wght@0,200..900;1,200..900` | `Source+Code+Pro:wght@200..900` |
| Poster | loud, wide, confident | `Syne:wght@400..800` | `Manrope:wght@200..800` | `Azeret+Mono:wght@100..900` |
| Terminal | condensed, industrial | `Archivo:wdth,wght@62..125,100..900` | `Archivo:wdth,wght@62..125,100..900` | `Martian+Mono:wdth,wght@75..112.5,100..800` |
| Nautical | sturdy, salted, old print | `Young+Serif` | `Figtree:ital,wght@0,300..900;1,300..900` | `IBM+Plex+Mono:wght@400;500;600` |
| Arcade | pixel, playful | `Pixelify+Sans:wght@400..700` | `Figtree:ital,wght@0,300..900;1,300..900` | `VT323` |

Families: write `family` as Google names it (`Work Sans`), and a `fallback` stack (`Georgia, serif`,
`"Helvetica Neue", Arial, sans-serif`, `Menlo, monospace`). Young Serif, Instrument Serif, DM Serif Display and VT323
have one weight: the titles draw a synthesized bold in them; say so when offering them.
