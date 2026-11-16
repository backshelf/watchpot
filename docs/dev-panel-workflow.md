# The dev-panel workflow

`DevPanel` docks over the running game in a development build: time warp, a jump to day N, each feature's saved state as
JSON, and the save as text (export, check through the codec, edit, import).

Example: [`examples/dev-panel.tsx`](examples/dev-panel.tsx) (`bun docs/examples/dev-panel.tsx` runs the warp in code).

- Mount it behind a route and the inline check `process.env.NODE_ENV !== "production" && route === "#dev"`: the
  bundler folds a production build so none of the panel ships.
- It reads the store from the provider (`mountGame`) and changes it only through root actions and the clock's offset.
- Typical loop: warp a day (`warpClock(store, DAY_MS, { catchUp: true })`), see what the offline cap paid, edit the save
  text to reproduce a bug, check it, import it.
- Warp moves `gameNow()` forward, never the wall, and never back.
