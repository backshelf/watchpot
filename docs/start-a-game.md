# Start a game

A game is features. `feature` declares one slice (its saved state, actions and tick steps), `defineGame` lists them
and says where the game saves, and `createIdleStore` runs them.

Example: [`examples/start-a-game.ts`](examples/start-a-game.ts) (`bun docs/examples/start-a-game.ts`).

A real game starts from the template instead ([`templates/game/`](../templates/game/.scaffold/README.md), filled by
`/watchpot` from an answers file): its `src/game/` is exactly these steps already taken, with the wallet, a `stats`
feature, the core on [`generators`](generators.md) or [`dimensions`](dimensions.md), and the chosen systems
([`clicker`](clicker.md), [`upgradeTree`](upgrade-tree.md), [the gacha](gacha.md), [`prestige`](prestige-layer.md),
[`achievements`](achievements.md), [`spawns`](spawns.md) with [`buffs`](buffs.md)) listed in one `defineGame`. Read
on to see what it is made of.

1. Declare each slice with `defineFeature({ key, initial, actions, steps })`. The store's type is read off the features;
   never write it by hand. A feature that touches another names it in `reach: [other]`.
2. `defineGame({ id, save: { key, version }, features })`. Add `vocab` once you have currencies (see
   [add a currency](add-a-currency.md)).
3. `createIdleStore(game, { now })`. `now` is the one wall read the game makes (`Date.now`); the engine never reads
   the wall for game time itself. Leave `storage` out: the store saves to localStorage, or to memory where there is
   none, and then reports `saveStatus` "unsaved" so the page can tell the player nothing is being kept. Pass
   `storage` only to change the backend or the write window.
4. Boot with `startGameClock(store)` (or `useGameRuntime` in React): one catch-up for the time away, then ticks.

Things that bite: a step runs in a phase (`guard, sync, rates, produce, automate, settle, commit, after`), so put
income in `produce`; a rate worked out from the state is a derived value (`derived: { perSecond: (s) => … }`), not a
step. `transient: ["flash"]` keeps a key out of the save. Next:
[add a generator](add-a-generator.md).
