import { type Feature, feature } from "./feature";

/**
 * The settings feature every game writes: the player's choices under `key`, kept across a run reset, with one action,
 * `change(patch)`, that merges a patch in.
 */
export function settings<const K extends string, S extends object>(def: {
  readonly key: K;
  readonly initial: () => S;
}): Feature<K, S, { change(patch: Partial<S>): void }> {
  // `feature` types its draft over a record keyed by `K`; the slice is the one thing the action touches.
  return feature({
    key: def.key,
    initial: def.initial,
    reset: "never",
    actions: (api) => ({
      change: (patch: Partial<S>) =>
        api.set((draft) => {
          Object.assign((draft as unknown as Record<K, S>)[def.key], patch);
        }),
    }),
  }) as unknown as Feature<K, S, { change(patch: Partial<S>): void }>;
}
