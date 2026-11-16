# Branches

A branch is a copy of the game as it stands, played on by itself. `branchStore` cuts one from a store: a plain store
over the same game, holding every feature's slice on data of its own, so nothing the branch does reaches the store it
came from. Cut several, give each a different future, read what each came to, and `adoptBranch` puts the one the
game (or the player) picks back into the real store. Use it for an absence that could have gone several ways, a
"what if I bought this" preview that plays a minute ahead, or an auto-player's hour shown before it is taken.

Example: [`examples/branches.ts`](examples/branches.ts) (`bun docs/examples/branches.ts`). A cellar ages wine while
nobody is in it, and each absence is rolled three ways for the player to pick from:

<!-- example-code: branches.ts -->

```ts
/**
 * Three ways the absence could have gone: three branches cut from the store as the player left it, each given its
 * own draws (the stream is reseeded from the saved one and the branch's number), each caught up over the same gap.
 */
export function waysItWent(store: { getState(): State }, at: number, count = 3): PlainStore<State>[] {
  const [stem] = nextFloat(store.getState().cellar.rng);
  return Array.from({ length: count }, (_, i) => {
    const branch = branchStore(game, store, { now: () => at });
    branch.setState((s) => {
      s.cellar.rng = seedRng(`${stem}:${i}`);
    });
    branch.getState().catchUp(at);
    return branch;
  });
}
```

<!-- example-output: branches.ts -->

```
held: 10 bottles, as the player left them
way 1: luck ×2.32 → 1,402 bottles
way 2: luck ×0.70 → 428 bottles
way 3: luck ×1.24 → 751 bottles
adopted: 1,402 bottles
```

- **`branchStore(game, from, { now, seed?, entropy? })`** returns a `PlainStore` (`createPlainStore`'s) holding a
  copy of `from`'s state: saved and transient fields alike, the clock's `lastSeen` with them, derived values worked
  out afresh. `now` is the wall the branch reads; hand it a fixed moment, or the original's clock. Everything a plain
  store does, a branch does: its actions, `tick` and `catchUp`, `setState`, `trial`, `snapshot`.
- **Making branches part.** A branch is an exact copy, and the engine's draws are positions saved in the state
  (`rng.ts`), so two branches played the same way end the same. Reseed the streams that should differ on each branch
  before playing it (`branch.setState`), from something in the saved state and the branch's number, as `waysItWent`
  does: the same save then always offers the same ways, and a reload cannot reroll them.
- **`adoptBranch(store, branch, at?)`** replaces the store's profile with the branch's state, exactly as an import of
  the branch's save would: saved fields only (a transient field starts again from `initial`), the clock's `lastSeen`
  on the wall time `at` (default: now), and a profile swap rather than play (`profileSwaps`, so `watchAway` and
  `watchChanges` do not report it). It throws for a store `createIdleStore` did not make.
- **Holding an absence.** To branch over time away, the game has to get to the absence before the clock's catch-up
  does. `startGameClock(store, { away })` (and `useGameClock` and `useGameRuntime`, which take the same `away`) tells
  the game of each absence first, as an `AwayGap`: `{ elapsedMs, at, opening, release }`. Return `"hold"` and the
  clock runs no catch-up, and neither ticks nor flushes, until `gap.release()`: the store, and the save, stay as the
  player left them, so a tab closed in the middle of the choice offers the whole absence again. Cut the branches,
  catch each up to `gap.at`, adopt one, release.

## Things that bite

- **A held clock pays nothing.** The time the player spends choosing is not credited: `adoptBranch` lands
  `lastSeen` on now. Keep the choice short, or catch the store up after the adoption for the time it took.
- **A branch is plain data.** It has no save, no subscribers and no export, and a recipe that throws on it leaves
  what it had already written. It is the sim's store (`plain.ts`): `plainParity` (`watchpot/test`) is the proof a
  game plays the same on both.
- **Cost.** Cutting a branch copies the state once; a catch-up on it costs what the game's own steps cost. A handful
  per return is nothing; hundreds a frame is a sim, and belongs in a worker.

## Reference

- API: [`api/core/branch.d.ts`](../api/core/branch.d.ts), [`api/core/clock-feature.d.ts`](../api/core/clock-feature.d.ts)
  (`AwayGap`, `GameClockOptions`), [`api/core/plain.d.ts`](../api/core/plain.d.ts).
- Time away without branches: [time-away](time-away.md).
