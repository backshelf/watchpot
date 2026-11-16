import { BufferGeometry, Vector3 } from "three/webgpu";
/** Signed: >= 0 keeps the point. Any units; only the zero level matters. */
export type Field = (p: Vector3) => number;
/** A new geometry: what of `geometry` every field keeps, indexed and welded at the cuts. */
export declare function clipMesh(geometry: BufferGeometry, fields: readonly Field[]): BufferGeometry;
/** Total triangle area of a mesh. */
export declare function meshArea(g: BufferGeometry): number;
