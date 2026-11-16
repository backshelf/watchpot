# watchpot/devtools

The dev panel and the sound desk: the one entry with a stylesheet. [dev-panel-workflow](dev-panel-workflow.md) is the daily loop.

## Dev panel

`DevPanel` docks over the running game in a development build: time warp (+1 min to +1 day, through `warpClock`), a
jump to day N (the profile's day counted from its `createdAt`, a warp to the same time that day and a catch-up), each
feature's saved state as JSON (Decimals as strings, read when opened, refreshed on demand), and the save as text:
export, copy, check through the codec and the game's migrations, edit, import. It reads the store in context and
changes it only through its root actions and the clock's offset, so `test/rules/wall-clock.test.ts` holds.

It is a developer's tool, not game UI, and the one stylesheet in the engine: `DevPanel.module.css` is self-contained
(its colours and faces are its own `--dp-*` properties, light and dark), so it reads no game token and needs no global
the game defines (`test/rules/headless.test.ts`).

A game mounts it behind its own route (`useHashRoute`, from [`watchpot/react`](react.md)) and a build-time check, written inline so the
bundler folds it; the template mounts it this way on `#dev`:

```tsx
const [route, go] = useHashRoute();
// ...
{process.env.NODE_ENV !== "production" && route === "dev" && <DevPanel onClose={() => go("")} />}
```

The entry exports it through `dev/gate.tsx`, which reaches the panel's module only through `import()` behind the same
check; in a production build that branch is dead, so the panel's script, styles and helpers are absent from the
bundle and its source map. The panel's helpers (`profileDay`, `jumpToDay`, `featureJson`, `checkSave`) are not in the
barrel for the same reason.
