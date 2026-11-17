import { type Decimal, defineStats, rankContributions, reach } from "watchpot/core";
import { ITEMS } from "../content/gacha";
import { knobs } from "../content/knobs";
import { NODES } from "../content/tree";
import { WORDS } from "../content/words";
import { collection } from "./gacha";
import { upgrades } from "./tree";

const NAMES = new Map<string, string>([
  ...NODES.map((n) => [`upgrades:${n.id}`, n.name] as const),
  ...ITEMS.map((i) => [`collection:${i.id}`, i.name] as const),
]);

/**
 * The stats, under `stats`: `output` (a multiplier on every generator), `offline` (the share paid while away, never
 * above all of it) and `gain` (a multiplier on what a prestige pays). Each is a Decimal worked out from the state
 * (`s.stats.output`), never saved. Every feature that raises one feeds it here: the tree's ranks and the collection's
 * copies as contributions, the orbits held as a source. The prestige layer reads `gain`, so it is reached by type.
 */
export const stats = defineStats({
  key: "stats",
  vocab: WORDS,
  reach: () => [upgrades, collection, reach<{ prestige: { currency: Decimal } }>()],
  stats: {
    output: { base: 1 },
    // A getter, so the knob is read when the stat is worked out, not once at load.
    offline: {
      get base() {
        return knobs.get("offlineBase");
      },
      hardcap: 1,
    },
    gain: { base: 1 },
  },
  sources: [
    {
      label: "Orbits",
      owner: "prestige",
      effects: [
        { stat: "output", mul: (q) => 1 + knobs.get("bonusPerUnit") * q.prestige.currency.toNumber() },
      ],
    },
  ],
  contributions: (s) => [
    ...rankContributions("upgrades", NODES, s.upgrades.ranks),
    ...ITEMS.flatMap((item) =>
      Array.from({ length: s.collection.owned[item.id] ?? 0 }, () => ({
        source: `collection:${item.id}`,
        effect: item.effect,
      })),
    ),
  ],
  label: (source) => NAMES.get(source) ?? source,
});
