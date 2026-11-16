import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  D,
  type Decimal,
  type DecimalSource,
  defineFeature,
  defineGame,
  defineStats,
  fmt,
  vocab,
} from "watchpot/core";

const n = (value: DecimalSource): string => fmt(value, { decimals: 1 }).text;

const WORDS = vocab({ currencies: ["gold"], stats: ["dig", "haul", "luck"] });

/** The state the effects read. */
const mine = defineFeature({
  key: "mine",
  initial: () => ({ gold: D(0) as Decimal, drills: 0, charms: 0, hushed: false }),
  actions: (api) => ({
    set: (next: Partial<{ gold: Decimal; drills: number; charms: number; hushed: boolean }>) =>
      api.set((s) => {
        Object.assign(s.mine, next);
      }),
  }),
});

/**
 * The stats, declared once: every base said, digging softcapped past 1e5. Each stat is a Decimal on the state
 * (`s.numbers.dig`), worked out again only when something it read has changed; an effect reads another stat the same
 * way (`q.numbers.haul`).
 */
const numbers = defineStats({
  key: "numbers",
  vocab: WORDS,
  reach: () => [mine],
  stats: {
    dig: { base: 1, softcap: { start: 1e5, power: 0.5, label: "The rock hardens" } },
    haul: { base: 1 },
    luck: { base: 1 },
  },
  flags: ["autoHaul"],
  sources: [
    {
      label: "Drills",
      owner: "workshop",
      group: "tools",
      active: (q) => q.mine.drills > 0,
      effects: [{ stat: "dig", add: (q) => q.mine.drills }],
    },
    {
      // Multiplied by the log of the gold held: a value no constant effect could carry.
      label: "Gold fever",
      owner: "vault",
      active: (q) => q.mine.gold.gte(100),
      effects: [{ stat: "dig", mul: (q) => q.mine.gold.add(1).log10().add(1) }],
      flags: ["autoHaul"],
    },
    {
      label: "Lucky charms",
      owner: "pouch",
      active: (q) => q.mine.charms > 0,
      effects: [
        { stat: "luck", add: (q) => q.mine.charms },
        { stat: "haul", mul: (q) => q.numbers.luck.sqrt() },
      ],
    },
    // One stat feeding another.
    { label: "Cart", owner: "workshop", effects: [{ stat: "dig", mul: (q) => q.numbers.haul, quiet: true }] },
  ],
  // A muted group's rows stay in the breakdown, marked, and stop counting.
  muted: (s, group) => group === "tools" && s.mine.hushed,
});

const game = defineGame({
  id: "stat-graph",
  save: { key: "stat-graph", version: 1 },
  vocab: WORDS,
  features: [mine, numbers],
});

if (import.meta.main) {
  const store = createIdleStore(game, { now: () => 0, storage: createGameStorage(createMemoryBackend()) });
  store.getState().mine.set({ gold: D("1e40"), drills: 120, charms: 4000 });
  const b = numbers.select.explain(store.getState(), "dig");
  console.log(`dig ${n(b.value)}  (base ${n(b.base)} + ${n(b.add)}) x ${n(b.mult)} = ${n(b.raw)}`);
  if (b.softcapped) console.log(`  softcapped: ${b.softcapped}`);
  for (const p of b.parts)
    console.log(`  ${p.op === "add" ? "+" : "x"}${n(p.value)}  ${p.label} (${p.owner})`);
  console.log("auto haul:", store.getState().numbers.flags.autoHaul);

  // Muting the tools drops the drills' effect and keeps every flag.
  store.getState().mine.set({ hushed: true });
  const s = store.getState();
  console.log(`hushed dig ${n(s.numbers.dig)}`, "auto haul:", s.numbers.flags.autoHaul);
}
