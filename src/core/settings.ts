import { type Feature, feature } from "./feature";

/** The three namespaces of a `settings` feature, all empty: the choices are read directly and `change` writes them. */
export interface SettingsHelpers {
  readonly select: Record<never, never>;
  readonly def: Record<never, never>;
  readonly draft: Record<never, never>;
}

/** A `settings` feature: the feature plus `select`, `def` and `draft` (each empty). */
export type SettingsFeature<K extends string, S extends object> = Feature<
  K,
  S,
  { change(patch: Partial<S>): void }
> &
  SettingsHelpers;

/**
 * The settings feature every game writes: the player's choices under `key`, kept across a run reset, with one action,
 * `change(patch)`, that merges a patch in. `select`, `def` and `draft` are empty: it has nothing but state and its
 * action.
 */
export function settings<const K extends string, S extends object>(def: {
  readonly key: K;
  readonly initial: () => S;
}): SettingsFeature<K, S> {
  // `feature` types its draft over a record keyed by `K`; the slice is the one thing the action touches.
  const made = feature({
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
  return Object.assign(made, { select: {}, def: {}, draft: {} } satisfies SettingsHelpers);
}
