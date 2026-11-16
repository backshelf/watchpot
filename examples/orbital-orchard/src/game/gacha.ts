import {
  type Balances,
  catalogueRoll,
  D,
  type Decimal,
  feature,
  gacha,
  type Move,
  withMoves,
} from "watchpot/core";
import { BOX, DRIP_MS, ITEMS, ODDS, PITY, PULL_PRICE } from "../content/gacha";
import { type Currency, PREMIUM, WORDS } from "../content/words";
import { wallet } from "./wallet";

/** The draw: the ladder, the odds and the guarantees, each pull's item from the catalogue. */
export const summon = gacha({
  key: "summon",
  ladder: WORDS.rarities,
  vocab: WORDS,
  odds: { [BOX]: ODDS },
  pity: { [BOX]: PITY },
  roll: catalogueRoll(ITEMS),
});

/** Away, the drip pays this share of its online rate. */
export const DRIP_AWAY = 0.5;

/** What a pull move reads: the wallet, the action, and the production a pull would raise. */
interface PullMoveState {
  wallet: Balances<Currency>;
  collection: { pull(count?: number): boolean };
  generators: { perSecond: Decimal };
}

/**
 * What the pulls found: copies owned per item (each copy adds its effect to the stats), the last pull's items for
 * the screen, and the premium drip's remainder. The collection survives a prestige.
 */
export const collection = withMoves(
  feature({
    key: "collection",
    reach: [wallet, summon],
    initial: () => ({ owned: {} as Record<string, number>, last: [] as string[], drip: 0 }),
    reset: "never",
    actions: (api) => ({
      /** Opens `count` pulls, free kits first, paying for the rest; false when the premium does not cover it. */
      pull: (count = 1): boolean => {
        let ok = false;
        api.set((s) => {
          const free = Math.min(count, s.summon.tokens[BOX] ?? 0);
          if (!wallet.debit(s, PREMIUM, PULL_PRICE * (count - free))) return;
          const open = summon.openDraft(s, BOX, count);
          s.collection.last = open.pulls.map((p) => p.item.id);
          for (const p of open.pulls)
            s.collection.owned[p.item.id] = (s.collection.owned[p.item.id] ?? 0) + 1;
          ok = true;
        });
        return ok;
      },
    }),
    steps: {
      produce: {
        // Whole premium each time `DRIP_MS` passes; the remainder waits in `drip`.
        drip: (s, ctx) => {
          const ms = s.collection.drip + (ctx.pass === "tick" ? ctx.dtMs : ctx.dtMs * DRIP_AWAY);
          const whole = Math.floor(ms / DRIP_MS);
          s.collection.drip = ms - whole * DRIP_MS;
          if (whole > 0) wallet.credit(s, PREMIUM, whole);
        },
      },
    },
  }),
  (_s: PullMoveState): Move<PullMoveState>[] => [
    {
      id: "pull",
      cost: { currency: PREMIUM, amount: D(PULL_PRICE) },
      // A pull is a slow, permanent raise: worth about a twentieth of production a second.
      value: (st) => st.generators.perSecond.toNumber() * 0.05 + 1,
      apply: (store) => store.getState().collection.pull(1),
    },
  ],
);
