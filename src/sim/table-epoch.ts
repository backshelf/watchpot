/**
 * Counts changes to every fit table at once (internal, not exported from `watchpot/sim`). A game reads its prices
 * from a table outside its state, so what is worked out from the state and kept (the auto-player's move lists) cannot
 * see a price change on its own: it watches this instead.
 */
let epoch = 0;

/** Every fit table's change so far, all tables together. */
export const tablesEpoch = (): number => epoch;

/** A fit table changed. */
export const bumpTables = (): void => {
  epoch += 1;
};
