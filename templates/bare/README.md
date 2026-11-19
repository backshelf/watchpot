# The bare game template

`templates/bare/` is what `create-watchpot` writes: one button, one number, a saved setting, and the boilerplate that
makes it a game (the store, the save, the clock, the typed hooks, the build and the lint). It has no mechanics and no
look. It is plain HTML, so a game that wants more adds it.

- `*.tmpl` files take `{{name}}`, `{{nameHtml}}`, `{{slug}}`, `{{engine}}` and `{{componentsLine}}` (`create-watchpot`
  renders them); `src/game/words.ts` is a real file (so the engine's typecheck covers it) whose `NAME` and `SLUG`
  the scaffold rewrites.
- `components/App.tsx.tmpl` is the page the scaffold writes over `src/App.tsx` when the starter components are asked
  for: the same game on `src/ui/` (copied from `templates/game/src/ui/`, or `templates/tailwind/src/ui/` with
  Tailwind). It is a `.tmpl` so the engine's typecheck does not read it without a `src/ui/`.
- It is not the template `/watchpot-init` fills: that is `templates/game/`, with every system and its gating.
