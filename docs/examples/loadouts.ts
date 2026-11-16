import {
  createGameStorage,
  createIdleStore,
  createMemoryBackend,
  defineFeature,
  defineGame,
  defineLoadout,
  type Effect,
  fillLoadout,
  foldContributions,
  type LoadoutItem,
  type Slotted,
} from "watchpot/core";

/** Simmer's stove kit: three slots, and the pans and spoons a player has found. */
export const UTENSILS: LoadoutItem<Effect<"simmer">>[] = [
  { id: "glass-lid", kind: "lid", tags: ["glass"], effects: [{ stat: "simmer", add: 1 }] },
  { id: "copper-lid", kind: "lid", tags: ["copper"], effects: [{ stat: "simmer", mul: 1.5 }] },
  { id: "wooden-spoon", kind: "spoon", effects: [{ stat: "simmer", add: 2 }] },
  { id: "copper-ladle", kind: "spoon", tags: ["copper"], effects: [{ stat: "simmer", add: 1 }] },
  { id: "copper-trivet", tags: ["copper"], effects: [] },
];

/** What the player holds: found utensils, by id. */
export const cupboard = defineFeature({
  key: "cupboard",
  initial: () => ({ held: ["glass-lid", "copper-lid", "wooden-spoon", "copper-ladle", "copper-trivet"] }),
});

/** The kit: a lid slot, a spoon slot and a spare that takes anything. Three copper pieces make a set. */
export const kit = defineLoadout({
  key: "kit",
  reach: [cupboard],
  slots: [{ id: "lid", kind: "lid" }, { id: "spoon", kind: "spoon" }, { id: "spare" }],
  items: UTENSILS,
  sets: [
    {
      id: "copperware",
      tag: "copper",
      tiers: [
        { count: 2, effects: [{ stat: "simmer", mul: 1.2 }] },
        { count: 3, effects: [{ stat: "simmer", mul: 2 }] },
      ],
    },
  ],
  owns: (s, item) => s.cupboard.held.includes(item),
});

export const game = defineGame({
  id: "simmer-kit",
  save: { key: "simmer-kit.save", version: 1 },
  features: [cupboard, kit],
});

/**
 * Bubbles a second with `slotted` in the kit, from a base of 1: its contributions folded with no game around them. A
 * loadout that is only being weighed (the auto-fill below tries many) never lives in the state, so it is folded here,
 * not read off a stats feature.
 */
export const simmerRate = (slotted: Slotted) =>
  foldContributions(kit.def.loadout.contributions(slotted), { base: () => 1 })
    .stat("simmer")
    .toNumber();

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
  const best = fillLoadout(kit.def.loadout, { owns, score: simmerRate });
  for (const [slot, item] of Object.entries(best)) {
    if (item) s().kit.equip(slot, item);
    else s().kit.clear(slot);
  }
  const [copper] = kit.def.loadout.standings(s().kit.slotted);
  console.log(
    "auto-filled:",
    JSON.stringify(s().kit.slotted),
    "→",
    simmerRate(s().kit.slotted).toFixed(1),
    "a second",
  );
  console.log("copperware:", copper?.count, "pieces, tier", copper?.tier, "| next tier at", copper?.next);
}
