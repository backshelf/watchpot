# The dev-panel workflow

`DevPanel` (from `watchpot/devtools`) docks over the running game in a development build: time warp, a jump to day N, each feature's saved state as
JSON, and the save as text (export, check through the codec, edit, import).

Example: [`examples/dev-panel.tsx`](examples/dev-panel.tsx) (`bun docs/examples/dev-panel.tsx` runs the warp in code).

- Put it behind a route: `const [route, go] = useHashRoute()`, then
  `route === "dev" && <DevPanel onClose={() => go("")} />`. `useHashRoute` (`watchpot/react`) follows every
  `hashchange`, so typing `#dev` opens the panel, the back button or its close button shuts it, and the hash it hands
  you has no `#`.
- Two guards keep it out of a player's hands, each doing a different job. `DevPanel` guards itself: in a production
  build it draws nothing, and its code is loaded only through an import the bundler drops, so none of the panel ships.
  The inline `process.env.NODE_ENV !== "production"` check in front of the route is yours: it stops a production page
  from reacting to `#dev` at all. Write it inline, not in a helper, so the bundler can fold it.
- It reads the store from the provider (`mountGame`) and changes it only through root actions and the clock's offset.
- Typical loop: warp a day (`warpClock(store, DAY_MS, { catchUp: true })`), see what the offline cap paid, edit the save
  text to reproduce a bug, check it, import it.
- Warp moves `gameNow()` forward, never the wall, and never back.
