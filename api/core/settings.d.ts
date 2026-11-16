import { type Feature } from "./feature";
/**
 * The settings feature every game writes: the player's choices under `key`, kept across a run reset, with one action,
 * `change(patch)`, that merges a patch in.
 */
export declare function settings<const K extends string, S extends object>(def: {
    readonly key: K;
    readonly initial: () => S;
}): Feature<K, S, {
    change(patch: Partial<S>): void;
}>;
