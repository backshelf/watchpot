// `watchpot/env`: the ambient declarations the engine's own sources need (CSS modules, audio file imports, and `--`
// custom properties in React style objects). A game names it in its tsconfig's `types` (`"types": ["bun",
// "watchpot/env"]`) so its typecheck passes through the dev panel and sound desk inside `node_modules/watchpot`.
/// <reference path="../env.d.ts" />
/// <reference path="./css-vars.d.ts" />
