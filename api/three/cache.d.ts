import type { Material } from "three/webgpu";
/** One holder's grip on a cached value. */
export interface Held<V> {
    readonly value: V;
    /** True when this acquire built the value (a miss), false on a hit. */
    readonly built: boolean;
    /** Lets go; the value is disposed when nothing else holds it. Safe to call twice. */
    release(): void;
}
/** A reference-counted cache by string key. */
export interface RefCache<V> {
    /** The value under `key`, built on a miss; the caller holds it until `release`. */
    acquire(key: string): Held<V>;
    /** Builds the value now and holds it for the next `acquire`, which takes the hold over. A cached key is left as it is. */
    prebuild(key: string): V;
    /** Lets go of a prebuilt value nobody took; it leaves the cache unless something holds it. */
    drop(key: string): void;
    /** How many holders `key` has (0 when it is only prebuilt, or not cached). */
    refs(key: string): number;
    /** The cached value under `key` without taking it, if any. */
    peek(key: string): V | undefined;
    /** How many entries the cache holds. */
    readonly size: number;
}
/** What a cache builds and disposes. */
export interface RefCacheDef<V> {
    build(key: string): V;
    dispose(value: V): void;
}
/** A cache that builds with `build` and disposes with `dispose`. */
export declare function createRefCache<V>(def: RefCacheDef<V>): RefCache<V>;
/**
 * Which shader a material builds, as three r187's `RenderObject.getMaterialCacheKey` tells materials apart: its
 * node graphs, then every property (getters included) with numbers reduced to zero or not. Two materials with one
 * key share a compiled shader (on the same geometry attributes and render pass), so a boot compiles one mesh per key.
 */
export declare function variantKey(material: Material): string;
