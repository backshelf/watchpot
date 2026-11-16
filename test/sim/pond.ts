/**
 * A toy game for the fit kit's tests, and the proof module the parallel proof's test hands its workers: a pond whose
 * pumps fill it, whose charms (priced by the fit) double the flow, and whose settle step draws luck from an rng kept
 * in the state, so a run that does not carry its rng's position would part at once.
 */
import {
  D,
  type Decimal,
  defineFeature,
  defineGame,
  type Move,
  nextFloat,
  type RngState,
  type StateOf,
} from "watchpot/core";
import {
  autoPlayer,
  createSimWorld,
  type FitGate,
  type FitProofModule,
  type FitRun,
  fitTable,
  type HoldingsMemory,
  holdings,
  priceAbove,
  resumeSimWorld,
  type SimSnapshot,
  simStore,
} from "watchpot/sim";

export const T0 = Date.UTC(2026, 0, 5, 8);
const MIN = 60_000;

export const PLAN = { c1: 2, c2: 5, c3: 9, c4: 14 } as const;
export type CharmKey = keyof typeof PLAN;
export const CHARMS = Object.keys(PLAN) as CharmKey[];

/** The live table the pond reads its charm prices from. */
export const TABLE = fitTable<CharmKey>();

const pumpCost = (pumps: number): Decimal => D(4).mul(D(1.25).pow(pumps));

const pond = defineFeature({
  key: "pond",
  initial: (ctx) => ({ drops: D(5), pumps: 1, charms: [] as string[], luck: [...ctx.rng], found: 0 }),
  derived: { rate: (s) => D(s.pond.pumps).mul(2 ** s.pond.charms.length) },
  actions: (api) => ({
    buyPump: (): boolean => {
      let ok = false;
      api.set((s) => {
        const cost = pumpCost(s.pond.pumps);
        if (s.pond.drops.lt(cost)) return;
        s.pond.drops = s.pond.drops.sub(cost);
        s.pond.pumps += 1;
        ok = true;
      });
      return ok;
    },
    buyCharm: (id: CharmKey): boolean => {
      let ok = false;
      api.set((s) => {
        const price = TABLE.get(id);
        if (s.pond.charms.includes(id) || s.pond.drops.lt(price)) return;
        s.pond.drops = s.pond.drops.sub(price);
        s.pond.charms.push(id);
        ok = true;
      });
      return ok;
    },
  }),
  steps: {
    produce: {
      flow: {
        pass: "both",
        run: (s, ctx) => {
          s.pond.drops = s.pond.drops.add(s.pond.rate.mul(ctx.dtMs / 1000));
        },
      },
    },
    settle: {
      luck: (s) => {
        const [x, next] = nextFloat(s.pond.luck as unknown as RngState);
        s.pond.luck = [...next];
        if (x < 0.02) {
          s.pond.drops = s.pond.drops.mul(1.05);
          s.pond.found += 1;
        }
      },
    },
  },
  moves: (s) => {
    const out: Move<typeof s>[] = [
      {
        id: "pump",
        cost: { currency: "drops", amount: pumpCost(s.pond.pumps) },
        apply: (store) => store.getState().pond.buyPump(),
      },
    ];
    for (const id of CHARMS)
      if (!s.pond.charms.includes(id))
        out.push({
          id,
          cost: { currency: "drops", amount: TABLE.get(id) },
          apply: (store) => store.getState().pond.buyCharm(id),
        });
    return out;
  },
});

export const game = defineGame({ id: "pond", save: { key: "pond.save", version: 1 }, features: [pond] });
type PondState = StateOf<(typeof game)["features"]>;

/** What a pond run keeps besides the world and the player: its holdings. */
export interface PondExtra {
  have: HoldingsMemory;
}

/** A run of the pond, fresh or carried on from a snapshot. */
export function pondRun(from?: SimSnapshot<PondExtra>) {
  const build = (now: () => number) => simStore(game, now, "pond");
  const world = from ? resumeSimWorld(build, from.world) : createSimWorld(build, T0);
  const player = autoPlayer<PondState>(game, {
    balance: (s) => s.pond.drops,
    objective: (s) => s.pond.rate.toNumber(),
    memory: from?.player,
  });
  let played = from?.atMs ?? 0;
  const state = () => world.store.getState() as unknown as PondState;
  const have = holdings(["drops"], () => state().pond.drops, { window: 30, from: from?.extra?.have });
  const run: FitRun<PondExtra> = {
    step: (dt) => {
      world.play(dt);
      played += dt;
    },
    look: () => {
      player.look(world.store as never);
    },
    playedMs: () => played,
    afterStep: () => have.sample(),
    capture: () => ({ world: world.snapshot(), player: player.remember(), extra: { have: have.remember() } }),
  };
  /** The fit's gates: each charm just above the most drops ever held, so nothing held before its minute pays it. */
  const gates: FitGate[] = CHARMS.map((key) => ({
    key,
    atMs: PLAN[key] * MIN,
    price: () => priceAbove(have.peak("drops")),
  }));
  const done = () => state().pond.charms.length === CHARMS.length;
  return { world, player, have, run, gates, done, state };
}

/** The proof module the parallel proof's workers import. */
export const fitProof: FitProofModule<PondExtra> = {
  table: TABLE,
  replay: (from) => pondRun(from).run,
};
