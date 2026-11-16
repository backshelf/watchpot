import {
  busOf,
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  defineGame,
  type Effect,
  feature,
  fillLoadout,
  type LoadoutItem,
  loadoutFeature,
  type Slotted,
  statValue,
} from "watchpot/core";

/** Simmer's stove kit: three slots, and the pans and spoons a player has found. */
export const UTENSILS: LoadoutItem<Effect>[] = [
  { id: "glass-lid", kind: "lid", tags: ["glass"], effects: [{ stat: "simmer", add: 1 }] },
  { id: "copper-lid", kind: "lid", tags: ["copper"], effects: [{ stat: "simmer", mult: 1.5 }] },
  { id: "wooden-spoon", kind: "spoon", effects: [{ stat: "simmer", add: 2 }] },
  { id: "copper-ladle", kind: "spoon", tags: ["copper"], effects: [{ stat: "simmer", add: 1 }] },
  { id: "copper-trivet", tags: ["copper"], effects: [] },
];

/** What the player holds: found utensils, by id. */
export const cupboard = feature({
  key: "cupboard",
  initial: () => ({ held: ["glass-lid", "copper-lid", "wooden-spoon", "copper-ladle", "copper-trivet"] }),
});

type Reads = { cupboard: { held: string[] } };

/** The kit: a lid slot, a spoon slot and a spare that takes anything. Three copper pieces make a set. */
export const kit = loadoutFeature({
  key: "kit",
  slots: [{ id: "lid", kind: "lid" }, { id: "spoon", kind: "spoon" }, { id: "spare" }],
  items: UTENSILS,
  sets: [
    {
      id: "copperware",
      tag: "copper",
      tiers: [
        { count: 2, effects: [{ stat: "simmer", mult: 1.2 }] },
        { count: 3, effects: [{ stat: "simmer", mult: 2 }] },
      ],
    },
  ],
  owns: (s: Reads, item) => s.cupboard.held.includes(item),
});

export const game = defineGame({
  id: "simmer-kit",
  save: { key: "simmer-kit.save", version: 1 },
  features: [cupboard, kit],
});

/** Bubbles a second from the pot's base of 1, with everything slotted. */
export const simmerRate = (slotted: Slotted) =>
  statValue(busOf(kit.loadout.contributions(slotted)), "simmer", 1);

if (import.meta.main) {
  const store = createIdleStore(game, {
    storage: createGameStorage(createMemoryBackend()),
    now: () => Date.UTC(2026, 0, 1),
  });
  const s = () => store.getState();

  console.log("a spoon in the lid slot:", s().kit.equip("lid", "wooden-spoon"));
  console.log(
    "the glass lid:",
    s().kit.equip("lid", "glass-lid"),
    "| the wooden spoon:",
    s().kit.equip("spoon", "wooden-spoon"),
  );
  console.log(
    "by hand:",
    JSON.stringify(s().kit.slotted),
    "→",
    simmerRate(s().kit.slotted).toFixed(1),
    "a second",
  );

  const owns = (item: string) => s().cupboard.held.includes(item);
  const best = fillLoadout(kit.loadout, { owns, score: simmerRate });
  for (const [slot, item] of Object.entries(best)) {
    if (item) s().kit.equip(slot, item);
    else s().kit.clear(slot);
  }
  const [copper] = kit.loadout.standings(s().kit.slotted);
  console.log(
    "auto-filled:",
    JSON.stringify(s().kit.slotted),
    "→",
    simmerRate(s().kit.slotted).toFixed(1),
    "a second",
  );
  console.log("copperware:", copper?.count, "pieces, tier", copper?.tier, "| next tier at", copper?.next);
}
