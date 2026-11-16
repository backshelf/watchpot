import { D, type Decimal, type DecimalSource, fmt, liveIndex, type StatGraph } from "watchpot/core";

const n = (value: DecimalSource): string => fmt(value, { decimals: 1 }).text;

type Stat = "dig" | "haul" | "luck";
type Flag = "autoHaul";
type Group = "tools";

/** The state the effects read. */
interface Mine {
  gold: Decimal;
  drills: number;
  charms: number;
  hushed: boolean;
}

/**
 * A reader over one state: what the effects are handed. It holds the graph, so an effect can read another stat
 * (`q.stat("haul")`) as easily as the state. Make a new reader after the state changes.
 */
class Reader {
  readonly graph: StatGraph<Stat, Flag>;
  constructor(readonly s: Mine) {
    this.graph = INDEX.over(this, { muted: (group) => group === "tools" && s.hushed });
  }
  stat(id: Stat): Decimal {
    return this.graph.stat(id);
  }
}

/** Indexed once, from content. Every stat starts at 1; digging softcaps past 1e5. */
const INDEX = liveIndex<Stat, Flag, Reader, Group>({
  caps: { dig: { softcap: { start: 1e5, power: 0.5, label: "The rock hardens" } } },
});

INDEX.add(
  { effects: [{ stat: "dig", op: "add", value: (q) => q.s.drills }] },
  { label: "Drills", owner: "workshop", group: "tools", active: (q) => q.s.drills > 0 },
);
INDEX.add(
  // Multiplied by the log of the gold held: a value no constant effect could carry.
  {
    effects: [{ stat: "dig", op: "mul", value: (q) => q.s.gold.add(1).log10().add(1) }],
    flags: ["autoHaul"],
  },
  { label: "Gold fever", owner: "vault", active: (q) => q.s.gold.gte(100) },
);
INDEX.add(
  {
    effects: [
      { stat: "luck", op: "add", value: (q) => q.s.charms },
      { stat: "haul", op: "mul", value: (q) => q.stat("luck").sqrt() },
    ],
  },
  { label: "Lucky charms", owner: "pouch", active: (q) => q.s.charms > 0 },
);
INDEX.add(
  // One stat feeding another, through the reader.
  { effects: [{ stat: "dig", op: "mul", value: (q) => q.stat("haul"), quiet: true }] },
  { label: "Cart", owner: "workshop", active: () => true },
);

if (import.meta.main) {
  const q = new Reader({ gold: D("1e40"), drills: 120, charms: 4000, hushed: false });
  const b = q.graph.explain("dig");
  console.log(`dig ${n(b.value)}  (base ${n(b.base)} + ${n(b.add)}) x ${n(b.mult)} = ${n(b.raw)}`);
  if (b.softcapped) console.log(`  softcapped: ${b.softcapped}`);
  for (const p of b.parts)
    console.log(`  ${p.op === "add" ? "+" : "x"}${n(p.value)}  ${p.label} (${p.owner})`);
  console.log("auto haul:", q.graph.flag("autoHaul"));

  // Muting the tools drops the drills' effect and keeps every flag.
  const hushed = new Reader({ ...q.s, hushed: true });
  console.log(`hushed dig ${n(hushed.stat("dig"))}`, "auto haul:", hushed.graph.flag("autoHaul"));
}
