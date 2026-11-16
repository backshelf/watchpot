import { currencies, type Decimal, defineGame, passesIn, sweep } from "watchpot/core";
import { TOY } from "./vocab";

const wallet = currencies({ key: "wallet", vocab: TOY });
type State = { wallet: { gold: Decimal; gems: Decimal } };

/** A fishing line: a float crossing the water, three fish under it, a strike graded by how close. */
export const line = sweep<"line", State>({
  key: "line",
  setup: (s) => ({
    motion: { periodMs: s.wallet.gems.gte(10) ? 1500 : 2400 }, // a better reel, a faster float
    count: 3,
    width: 0.12,
  }),
  grades: [
    { id: "perfect", within: 0.25 },
    { id: "bite", within: 1 },
  ],
  onStrike: (d, result) => {
    if (!result.hit) return;
    wallet.draft.credit(d, "gold", (result.hit.grade === "perfect" ? 5 : 1) * result.streak);
  },
});

export const game = defineGame({
  id: "line",
  save: { key: "line.save", version: 1 },
  features: [wallet, line],
  vocab: TOY,
});
// store.getState().line.strike() → { hit, streak, pos }; line.cursor(state, now) is where to draw the float

/** What a hired hand catches in a stretch: every pass over every fish, at a share of them landed. */
export const hiredCatch = (state: State, dtMs: number, landed = 0.6): number => {
  const { motion, count } = line.setup(state);
  return passesIn(dtMs, motion) * count * landed;
};
