// @feature gacha
import { type Balances, catalogueRoll, D, feature, gacha, type Move, withMoves } from "watchpot/core";
import { BOX, DRIP_MS, ITEMS, ODDS, PITY, PULL_PRICE } from "../content/gacha";
import { type Currency, PREMIUM, WORDS } from "../content/words";
import { type IncomeSources, incomeOf } from "./income";
import { wallet } from "./wallet";

/** The draw, on the engine's gacha: the ladder, the odds and the guarantees, each pull's item from the catalogue. */
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

/** What a pull move reads: the wallet, the action, and the income a pull would raise. */
interface PullMoveState extends IncomeSources {
  wallet: Balances<Currency>;
  collection: { pull(count?: number): boolean };
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
      /** Opens `count` pulls, free ones (granted tokens) first, paying for the rest; false when the premium is short. */
      pull: (count = 1): boolean => {
        let ok = false;
        api.set((s) => {
          const free = Math.min(count, s.summon.tokens[BOX] ?? 0);
          if (!wallet.debit(s, PREMIUM, PULL_PRICE * (count - free))) return;
          const open = summon.openDraft(s, BOX, count);
          s.collection.last = open.pulls.map((p) => p.item.id);
          for (const p of open.pulls) s.collection.owned[p.item.id] = (s.collection.owned[p.item.id] ?? 0) + 1;
          ok = true;
        });
        return ok;
      },
    }),
    steps: {
      produce: {
        // Whole premium each time `DRIP_MS` passes; the remainder waits in `drip`.
        drip: { pass: "both", run: (s, ctx) => {
          const ms = s.collection.drip + (ctx.pass === "tick" ? ctx.dtMs : ctx.dtMs * DRIP_AWAY);
          const whole = Math.floor(ms / DRIP_MS);
          s.collection.drip = ms - whole * DRIP_MS;
          if (whole > 0) wallet.credit(s, PREMIUM, whole);
        } },
      },
    },
  }),
  (_s: PullMoveState): Move<PullMoveState>[] => [
    {
      id: "pull",
      cost: { currency: PREMIUM, amount: D(PULL_PRICE) },
      // A pull is a slow, permanent raise: worth about a twentieth of the income a second.
      value: (st) => incomeOf(st).toNumber() * 0.05 + 1,
      apply: (store) => store.getState().collection.pull(1),
    },
  ],
);
