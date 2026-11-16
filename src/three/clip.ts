// Cut a triangle mesh by signed fields: keep where every field is >= 0. A triangle that crosses a field's zero
// level is clipped there (Sutherland–Hodgman), the crossing found by bisection along the edge so a curved level
// is followed, not its chord. Every attribute is interpolated at the cut (normals renormalised), and a cut vertex
// is shared by the triangles either side of its edge, so the result stays welded.
import { BufferAttribute, BufferGeometry, Vector3 } from "three/webgpu";

/** Signed: >= 0 keeps the point. Any units; only the zero level matters. */
export type Field = (p: Vector3) => number;

const BISECTIONS = 20;

type Channel = { name: string; size: number; data: number[] };

/** A new geometry: what of `geometry` every field keeps, indexed and welded at the cuts. */
export function clipMesh(geometry: BufferGeometry, fields: readonly Field[]): BufferGeometry {
  const channels: Channel[] = Object.entries(geometry.attributes).map(([name, attr]) => {
    const a = attr as BufferAttribute;
    const data: number[] = new Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++)
      for (let k = 0; k < a.itemSize; k++) data[i * a.itemSize + k] = a.array[i * a.itemSize + k] as number;
    return { name, size: a.itemSize, data };
  });
  const pos = channels.find((c) => c.name === "position");
  if (!pos) throw new Error("clipMesh: no position attribute");
  let count = pos.data.length / 3;
  const index = geometry.getIndex();
  let tris: number[] = index
    ? Array.from(index.array as ArrayLike<number>)
    : Array.from({ length: count }, (_, i) => i);

  const p = new Vector3();
  const q = new Vector3();
  const m = new Vector3();
  const at = (i: number, out: Vector3) =>
    out.set(pos.data[i * 3] as number, pos.data[i * 3 + 1] as number, pos.data[i * 3 + 2] as number);

  /** Appends a vertex interpolated from a to b at t. */
  const lerpVertex = (a: number, b: number, t: number): number => {
    for (const c of channels) {
      const base = c.data.length;
      for (let k = 0; k < c.size; k++) {
        const va = c.data[a * c.size + k] as number;
        const vb = c.data[b * c.size + k] as number;
        c.data.push(va + (vb - va) * t);
      }
      if (c.name === "normal") {
        const x = c.data[base] as number;
        const y = c.data[base + 1] as number;
        const z = c.data[base + 2] as number;
        const l = Math.hypot(x, y, z) || 1;
        c.data[base] = x / l;
        c.data[base + 1] = y / l;
        c.data[base + 2] = z / l;
      }
    }
    return count++;
  };

  for (const field of fields) {
    const values: number[] = [];
    const value = (i: number) => {
      let v = values[i];
      if (v === undefined) {
        v = field(at(i, p));
        values[i] = v;
      }
      return v;
    };
    const cuts = new Map<number, number>();
    const cut = (a: number, b: number): number => {
      const key = a < b ? a * 4194304 + b : b * 4194304 + a;
      const hit = cuts.get(key);
      if (hit !== undefined) return hit;
      // From the kept end (lo, field >= 0) toward the cut-away end (hi).
      const [from, to] = value(a) >= 0 ? [a, b] : [b, a];
      at(from, p);
      at(to, q);
      let lo = 0;
      let hi = 1;
      for (let k = 0; k < BISECTIONS; k++) {
        const mid = (lo + hi) / 2;
        if (field(m.copy(p).lerp(q, mid)) >= 0) lo = mid;
        else hi = mid;
      }
      const v = lerpVertex(from, to, lo);
      values[v] = field(at(v, m));
      cuts.set(key, v);
      return v;
    };
    const next: number[] = [];
    const poly: number[] = [];
    for (let t = 0; t < tris.length; t += 3) {
      const a = tris[t] as number;
      const b = tris[t + 1] as number;
      const c = tris[t + 2] as number;
      const ia = value(a) >= 0;
      const ib = value(b) >= 0;
      const ic = value(c) >= 0;
      if (ia && ib && ic) {
        next.push(a, b, c);
        continue;
      }
      if (!ia && !ib && !ic) continue;
      poly.length = 0;
      const corners = [a, b, c];
      const inside = [ia, ib, ic];
      for (let k = 0; k < 3; k++) {
        const cur = corners[k] as number;
        const nxt = corners[(k + 1) % 3] as number;
        if (inside[k]) poly.push(cur);
        if (inside[k] !== inside[(k + 1) % 3]) poly.push(cut(cur, nxt));
      }
      for (let k = 1; k + 1 < poly.length; k++)
        next.push(poly[0] as number, poly[k] as number, poly[k + 1] as number);
    }
    tris = next;
  }

  // Compact: keep only the vertices the surviving triangles use.
  const remap = new Map<number, number>();
  const order: number[] = [];
  const out: number[] = [];
  for (const v of tris) {
    let r = remap.get(v);
    if (r === undefined) {
      r = order.length;
      remap.set(v, r);
      order.push(v);
    }
    out.push(r);
  }
  const g = new BufferGeometry();
  for (const c of channels) {
    const arr = new Float32Array(order.length * c.size);
    order.forEach((v, i) => {
      for (let k = 0; k < c.size; k++) arr[i * c.size + k] = c.data[v * c.size + k] as number;
    });
    g.setAttribute(c.name, new BufferAttribute(arr, c.size));
  }
  g.setIndex(out);
  return g;
}

/** Total triangle area of a mesh. */
export function meshArea(g: BufferGeometry): number {
  const pos = g.getAttribute("position");
  const index = g.getIndex();
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const n = index ? index.count : pos.count;
  let area = 0;
  for (let t = 0; t < n; t += 3) {
    const i = index ? index.getX(t) : t;
    const j = index ? index.getX(t + 1) : t + 1;
    const k = index ? index.getX(t + 2) : t + 2;
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, j).sub(a);
    c.fromBufferAttribute(pos, k).sub(a);
    area += b.cross(c).length() / 2;
  }
  return area;
}
