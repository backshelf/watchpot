// A reference-counted cache for things the GPU should hold once (geometry, materials): several holders take the
// same entry and it is disposed when the last lets go. A piece can be made ahead of need (`prebuild`) and is then
// held until a holder takes the hold over, or `drop` lets it go.
import type { Material, Texture } from "three/webgpu";

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
export function createRefCache<V>(def: RefCacheDef<V>): RefCache<V> {
  type Entry = { value: V; refs: number; held: boolean };
  const entries = new Map<string, Entry>();
  const forget = (key: string, entry: Entry) => {
    if (entries.get(key) !== entry) return;
    entries.delete(key);
    def.dispose(entry.value);
  };
  return {
    acquire(key) {
      let entry = entries.get(key);
      let built = false;
      if (!entry) {
        entry = { value: def.build(key), refs: 0, held: false };
        entries.set(key, entry);
        built = true;
      } else if (entry.held) entry.held = false;
      entry.refs++;
      const current = entry;
      let released = false;
      return {
        value: current.value,
        built,
        release() {
          if (released) return;
          released = true;
          current.refs--;
          if (current.refs > 0 || current.held) return;
          forget(key, current);
        },
      };
    },
    prebuild(key) {
      let entry = entries.get(key);
      if (!entry) {
        entry = { value: def.build(key), refs: 0, held: true };
        entries.set(key, entry);
      }
      return entry.value;
    },
    drop(key) {
      const entry = entries.get(key);
      if (!entry?.held) return;
      entry.held = false;
      if (entry.refs === 0) forget(key, entry);
    },
    refs: (key) => entries.get(key)?.refs ?? 0,
    peek: (key) => entries.get(key)?.value,
    get size() {
      return entries.size;
    },
  };
}

const SKIPPED_PROPERTY =
  /^(is[A-Z]|_)|^(visible|version|uuid|name|opacity|userData|iridescenceThicknessRange)$/;
const ENUM_PROPERTIES = new Set(["side", "blending", "combine", "normalMapType"]);
const getterKeys = new Map<unknown, string[]>();

/**
 * Which shader a material builds, as three r187's `RenderObject.getMaterialCacheKey` tells materials apart: its
 * node graphs, then every property (getters included) with numbers reduced to zero or not. Two materials with one
 * key share a compiled shader (on the same geometry attributes and render pass), so a boot compiles one mesh per key.
 */
export function variantKey(material: Material): string {
  const m = material as unknown as Record<string, unknown> & { customProgramCacheKey(): string };
  let getters = getterKeys.get(m.constructor);
  if (!getters) {
    getters = [];
    for (let p = Object.getPrototypeOf(m); p; p = Object.getPrototypeOf(p)) {
      const d = Object.getOwnPropertyDescriptors(p);
      for (const k in d) if (typeof d[k]?.get === "function") getters.push(k);
    }
    getterKeys.set(m.constructor, getters);
  }
  let key = `${m.customProgramCacheKey()}:`;
  for (const k of [...Object.keys(m), ...getters]) {
    if (SKIPPED_PROPERTY.test(k)) continue;
    const v = m[k];
    if (v === null || v === undefined) key += `${String(v)},`;
    else if (typeof v === "number") key += `${ENUM_PROPERTIES.has(k) ? v : v !== 0 ? 1 : 0},`;
    else if (typeof v === "object") {
      const t = v as Partial<Texture>;
      key += t.isTexture
        ? `{${t.mapping}${t.channel}${t.magFilter}${t.minFilter}${t.wrapS}${t.wrapT}}`
        : "{}";
    } else key += `${String(v)},`;
  }
  return key;
}
