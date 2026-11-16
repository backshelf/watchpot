import { D, type Decimal } from "watchpot/core";
import {
  type FitGate,
  type FitTable,
  fitTable,
  fitTableSource,
  fmtClock,
  formatFit,
  holdings,
  nicePrice,
  runFit,
} from "watchpot/sim";

/**
 * A bakery on plain state, priced by a plan. Gold grows with the bakers; a tool doubles it; a sale trades the gold and
 * the bakers for a gem, and each gem triples it. The plan says when each tool and each sale should open; the fit
 * prices them; the replay plays the bakery on the fitted table and must finish near the plan's last minute.
 *
 *   bun docs/examples/plan-and-fit.ts
 */

const MIN = 60_000;

/** The plan: the minute of play each gate should open, for a player paying attention. */
const PLAN = {
  whisk: 2,
  mixer: 5,
  "sale.1": 8,
  proofer: 11,
  kneader: 15,
  "sale.2": 19,
  roller: 23,
  sifter: 27,
} as const;
type GateKey = keyof typeof PLAN;
const TOOLS = [
  "whisk",
  "mixer",
  "proofer",
  "kneader",
  "roller",
  "sifter",
] as const satisfies readonly GateKey[];
const SALES = ["sale.1", "sale.2"] as const satisfies readonly GateKey[];

// ------------------------------------------------------------------------------------------------ the game

interface Bakery {
  gold: Decimal;
  bakers: number;
  gems: number;
  tools: Set<string>;
  sold: number;
  playedMs: number;
}

const freshBakery = (): Bakery => ({
  gold: D(0),
  bakers: 1,
  gems: 0,
  tools: new Set(),
  sold: 0,
  playedMs: 0,
});
const rate = (b: Bakery) =>
  D(b.bakers)
    .mul(2 ** b.tools.size)
    .mul(3 ** b.gems);
const bakerCost = (b: Bakery) => D(10).mul(D(1.15).pow(b.bakers));

/** The tick rule. */
function step(b: Bakery, dtMs: number) {
  b.gold = b.gold.add(rate(b).mul(dtMs / 1000));
  b.playedMs += dtMs;
}

/** The pilot: sells and buys what it can, then hires while a baker costs a tenth of the gold or less. */
function look(b: Bakery, prices: FitTable<GateKey>) {
  const sale = SALES[b.sold];
  if (sale && b.gold.gte(prices.get(sale))) {
    b.gems++;
    b.sold++;
    b.gold = D(0);
    b.bakers = 1;
  }
  for (const t of TOOLS) {
    if (b.tools.has(t) || b.gold.lt(prices.get(t))) continue;
    b.gold = b.gold.sub(prices.get(t));
    b.tools.add(t);
  }
  while (bakerCost(b).lte(b.gold.mul(0.1))) {
    b.gold = b.gold.sub(bakerCost(b));
    b.bakers++;
  }
}

const finished = (b: Bakery) => b.tools.size === TOOLS.length && b.sold === SALES.length;

/** Fits the plan, prints the table a game would write, then replays it. Returns whether the replay landed in band. */
export function fitAndReplay(): boolean {
  // ------------------------------------------------------------------------------------------------ the fit

  const bakery = freshBakery();
  // The live table: the game reads every gate's price from it, and the fit prices each gate into it.
  const prices = fitTable<GateKey>();
  const have = holdings(["gold"], () => bakery.gold);

  /** A tool is priced at nine tenths of the most gold held lately, so the pilot pays it within moments. */
  const toolGate = (key: GateKey): FitGate => ({
    key,
    atMs: PLAN[key] * MIN,
    price: () => nicePrice(have.held("gold").mul(0.9)),
  });

  /** A sale waits until the gold passes every earlier peak (a sale resets it), then asks what is held. */
  const saleGate = (key: GateKey): FitGate => {
    const clear = have.ratchet("gold");
    return {
      key,
      atMs: PLAN[key] * MIN,
      price: () => {
        if (!clear()) return null;
        const value = nicePrice(have.held("gold"));
        return value && `${value} (with ${bakery.bakers} bakers)`;
      },
    };
  };

  const lastPlanned = Math.max(...Object.values(PLAN)) * MIN;
  const result = runFit({
    table: prices,
    gates: [...TOOLS.map(toolGate), ...SALES.map(saleGate)],
    step: (dt) => step(bakery, dt),
    look: () => look(bakery, prices),
    afterStep: () => have.sample(),
    playedMs: () => bakery.playedMs,
    done: () => finished(bakery),
    limitMs: lastPlanned + 30 * MIN,
  });

  console.log(formatFit(result));
  if (!result.finished) {
    const stuck = result.gates.filter((g) => g.openedMs === undefined).map((g) => g.key);
    console.error(
      `fit: the run did not finish (never opened: ${stuck.join(", ") || "none"}). Nothing written.`,
    );
    return false;
  }
  console.log(`fit: finished at ${fmtClock(result.playedMs)} played, ${result.gates.length} gates priced\n`);
  console.log(
    fitTableSource(prices, {
      header: "Written by the fit from the plan. Never edit by hand: change the plan and fit again.",
      planImport: "./plan",
      keyType: "GateKey",
      order: Object.keys(PLAN),
    }),
  );

  // ------------------------------------------------------------------------------------------------ the replay

  // The table a game would load from the generated module: `fitTable(FIT)`.
  const fitted = fitTable<GateKey>(prices.data());
  const replay = freshBakery();
  for (let s = 0; replay.playedMs < lastPlanned * 1.5 && !finished(replay); s++) {
    if (s % 3 === 0) look(replay, fitted);
    step(replay, 1000);
  }
  const ratio = replay.playedMs / lastPlanned;
  const inBand = finished(replay) && ratio >= 0.7 && ratio <= 1.25;
  console.log(
    `replay: ${finished(replay) ? "finished" : "did not finish"} at ${fmtClock(replay.playedMs)}, ${ratio.toFixed(2)} of the plan's ${fmtClock(lastPlanned)} (band 0.7 to 1.25)`,
  );
  return inBand;
}

if (import.meta.main && !fitAndReplay()) process.exit(1);
