// Refraction caustics from a point or spot light onto a horizontal receiver plane, written from scratch for the node
// renderer (three has none). A game runs `render` as a stage pre-pass and adds `receiverNode()` to the emissive of
// whatever lies on the plane.
//
// Each frame something has moved, for the casters the game hands in:
//   1. From the light's point of view, render the casters' front faces (world position, normal, tint) and back
//      faces (position, normal) into small render targets. Only the casters are drawn: they are lent to a scene of
//      their own for the two passes, so the renderer never walks the whole scene for them.
//   2. Splat: a grid mesh with one vertex per texel reads those maps in its vertex stage, refracts the light's ray
//      into the caster (per colour channel, with dispersion), out again at the back face, follows it to the
//      receiver plane and moves the vertex to where the light lands. Cells that converge deposit more light than
//      cells that spread (the Jacobian of the grid uv, from screen derivatives), summed additively.
//   3. Receivers project that map back through the same light frustum: `receiverNode()` is the irradiance a
//      receiver material adds to its emissive term, scaled by the strength `render` was given.
//
// The light camera is fitted to the casters' bounds, which `CasterBounds` measures with a vertex walk only when a
// caster has come, gone or moved. While nothing moves the last map stands and the pass costs a few matrix compares.
// A caster the scene's own render would not reach (hidden, under a hidden parent, out of the scene) casts nothing.
//
// `setSize` follows a quality tier (0 turns the pass off); `prewarm` compiles its materials ahead of first use.

import {
  Discard,
  dFdx,
  dFdy,
  diffuseColor,
  Fn,
  float,
  If,
  instanceIndex,
  int,
  mix,
  mrt,
  normalize,
  normalWorld,
  positionWorld,
  refract,
  screenUV,
  select,
  sign,
  smoothstep,
  texture,
  uniform,
  uv,
  varying,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import {
  AdditiveBlending,
  BackSide,
  Box3,
  BoxGeometry,
  type BufferAttribute,
  type BufferGeometry,
  type Camera,
  Color,
  DoubleSide,
  FloatType,
  HalfFloatType,
  InstancedMesh,
  type InterleavedBufferAttribute,
  type Material,
  Matrix4,
  Mesh,
  NoBlending,
  NodeMaterial,
  type Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  QuadMesh,
  RendererUtils,
  RenderTarget,
  Scene,
  Sphere,
  Texture,
  Vector3,
  type WebGPURenderer,
} from "three/webgpu";
import { compileFor } from "./compile";

/** What the casters refract with: one set for the whole pass. */
export type CausticsOptics = { ior: number; dispersion: number };

/** What a frame's caustics are drawn with. */
export interface CausticsFrame {
  /** How bright, as a multiple of the pass's gain: 0 is dark, 1 full. */
  readonly strength: number;
  /** The receiver plane's height, world. */
  readonly planeY: number;
}

/** A pass's fixed settings. */
export interface CausticsOptions {
  /**
   * Irradiance an undeviated cell deposits at strength 1, against the scene's own light. Default 10: tuned where
   * the light's direct irradiance on the plane is about 5, so focused light outshines it.
   */
  readonly gain?: number;
  /** The casters' optics until a game sets `optics`. Default quartz-like: ior 1.544, dispersion 3. */
  readonly optics?: CausticsOptics;
}

const up = new Vector3(0, 1, 0);
const scratchBox = new Box3();
const scratchPoint = new Vector3();

type Versions = { geometry: number; position: number; instances: number; colours: number };

/** One drawn object inside a caster, and what it looked like when its bounds were last measured. */
type Part = Versions & { object: Mesh; matrix: Matrix4 };

type Entry = { parts: Part[]; box: Box3; sphere: Sphere };

/** The flags three's `expandByObject` reads, present on some objects only. */
type Flags = {
  isInstancedMesh?: boolean;
  isBatchedMesh?: boolean;
  isSkinnedMesh?: boolean;
  boundingBox?: Box3 | null;
};

function hasGeometry(o: Object3D): o is Mesh {
  return (o as Mesh).geometry !== undefined;
}

function isInstanced(o: Object3D): o is InstancedMesh {
  return (o as InstancedMesh).isInstancedMesh === true;
}

/**
 * Whether the scene's own render reaches `object`: it and everything above it visible, and (when `root` is given)
 * `root` at the top. The pass draws its casters directly, so this stands in for the walk down from the scene.
 */
function reached(object: Object3D, root: Object3D | null): boolean {
  let top = object;
  for (let o: Object3D | null = object; o; o = o.parent) {
    if (!o.visible) return false;
    top = o;
  }
  return root === null || top === root;
}

/** The objects under `object` a render draws: those with geometry, hidden branches left out. */
function collect(object: Object3D, out: Mesh[]): void {
  if (!object.visible) return;
  if (hasGeometry(object)) out.push(object);
  for (const child of object.children) collect(child, out);
}

function versions(mesh: Mesh): Versions {
  const position = mesh.geometry.getAttribute("position") as BufferAttribute | undefined;
  const instanced = isInstanced(mesh) ? mesh : null;
  return {
    geometry: mesh.geometry.id,
    position: position?.version ?? -1,
    instances: instanced?.instanceMatrix.version ?? -1,
    colours: instanced?.instanceColor?.version ?? -1,
  };
}

/**
 * Grow `box` by every vertex of `object` in world space: what `Box3.expandByObject(object, true)` does for one
 * object, with the per-vertex work inlined (three's path goes through `getVertexPosition`, `applyMatrix4` and
 * `expandByPoint` for each one). Instanced and batched meshes, morphs and skins take three's own paths, so the
 * result matches it to rounding.
 */
function expandPrecise(box: Box3, object: Mesh): void {
  const geometry = object.geometry as BufferGeometry;
  const position = geometry.getAttribute("position") as
    | BufferAttribute
    | InterleavedBufferAttribute
    | undefined;
  const flags = object as Flags;
  const plain = flags.isInstancedMesh !== true && flags.isBatchedMesh !== true;
  if (position !== undefined && plain) {
    const deformed = (object.morphTargetInfluences?.length ?? 0) > 0 || flags.isSkinnedMesh === true;
    if (deformed) {
      for (let i = 0; i < position.count; i++) {
        object.getVertexPosition(i, scratchPoint).applyMatrix4(object.matrixWorld);
        box.expandByPoint(scratchPoint);
      }
    } else {
      expandByVertices(box, position, object.matrixWorld);
    }
    return;
  }
  if (flags.boundingBox !== undefined) {
    if (flags.boundingBox === null) (object as InstancedMesh).computeBoundingBox();
    scratchBox.copy(flags.boundingBox as Box3);
  } else {
    if (geometry.boundingBox === null) geometry.computeBoundingBox();
    scratchBox.copy(geometry.boundingBox as Box3);
  }
  scratchBox.applyMatrix4(object.matrixWorld);
  box.union(scratchBox);
}

function expandByVertices(
  box: Box3,
  position: BufferAttribute | InterleavedBufferAttribute,
  matrix: Matrix4,
): void {
  const e = matrix.elements;
  let minX = box.min.x;
  let minY = box.min.y;
  let minZ = box.min.z;
  let maxX = box.max.x;
  let maxY = box.max.y;
  let maxZ = box.max.z;
  const plainArray = position as BufferAttribute;
  const direct =
    plainArray.isBufferAttribute === true &&
    plainArray.normalized !== true &&
    position.itemSize === 3 &&
    plainArray.array instanceof Float32Array;
  const data = direct ? (plainArray.array as Float32Array) : null;
  for (let i = 0, n = position.count; i < n; i++) {
    let x: number;
    let y: number;
    let z: number;
    if (data) {
      const k = i * 3;
      x = data[k] as number;
      y = data[k + 1] as number;
      z = data[k + 2] as number;
    } else {
      x = position.getX(i);
      y = position.getY(i);
      z = position.getZ(i);
    }
    const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
    const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
    const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
    if (wx < minX) minX = wx;
    if (wx > maxX) maxX = wx;
    if (wy < minY) minY = wy;
    if (wy > maxY) maxY = wy;
    if (wz < minZ) minZ = wz;
    if (wz > maxZ) maxZ = wz;
  }
  box.min.set(minX, minY, minZ);
  box.max.set(maxX, maxY, maxZ);
}

/**
 * The world bounds of the casters that show, measured only when they change. Each caster is walked once per move:
 * its bounding box is the precise one (`Box3.setFromObject(caster, true)`, over what is visible in it), its sphere
 * that box's, and `sphere` is the union of every caster's, as the pass has always framed them.
 */
export class CasterBounds {
  /** World bounding sphere round every caster that shows; empty when there are none. */
  readonly sphere = new Sphere();
  /** How many times a caster has been measured (the tests watch this). */
  walks = 0;
  private readonly entries = new Map<Object3D, Entry>();
  /** The drawn objects of the caster in hand: `stale` fills it, `measure` reads it. */
  private readonly seen: Mesh[] = [];

  /**
   * Bring the bounds up to date for this frame. Returns true when a caster came, went, moved, hid or showed, so the
   * map must be drawn again. A caster counts only while the scene's render reaches it (see `reached`; `root` is the
   * scene). Each caster's world matrices are updated here, ahead of the renderer's own pass.
   */
  update(casters: ReadonlySet<Object3D>, root: Object3D | null = null): boolean {
    let changed = false;
    for (const object of this.entries.keys()) {
      if (!casters.has(object) || !reached(object, root)) {
        this.entries.delete(object);
        changed = true;
      }
    }
    this.sphere.makeEmpty();
    for (const caster of casters) {
      if (!reached(caster, root)) continue;
      caster.updateWorldMatrix(true, true);
      let entry = this.entries.get(caster);
      if (!entry) {
        entry = { parts: [], box: new Box3(), sphere: new Sphere() };
        this.entries.set(caster, entry);
      }
      if (this.stale(caster, entry)) {
        this.measure(entry);
        changed = true;
      }
      if (!entry.box.isEmpty()) this.sphere.union(entry.sphere);
    }
    return changed;
  }

  /** The casters the last `update` counted: the ones to draw. */
  shown(): IterableIterator<Object3D> {
    return this.entries.keys();
  }

  /** The measured world box of one caster, for the tests. */
  boxOf(caster: Object3D): Box3 | null {
    return this.entries.get(caster)?.box ?? null;
  }

  private stale(caster: Object3D, entry: Entry): boolean {
    const seen = this.seen;
    seen.length = 0;
    collect(caster, seen);
    if (seen.length !== entry.parts.length) return true;
    for (const [i, object] of seen.entries()) {
      const part = entry.parts[i];
      if (!part || part.object !== object || !part.matrix.equals(object.matrixWorld)) return true;
      const v = versions(object);
      if (
        v.geometry !== part.geometry ||
        v.position !== part.position ||
        v.instances !== part.instances ||
        v.colours !== part.colours
      )
        return true;
    }
    return false;
  }

  private measure(entry: Entry): void {
    const before = entry.parts;
    entry.parts = this.seen.map((object, i) => {
      const part: Part = { object, matrix: object.matrixWorld.clone(), ...versions(object) };
      // three computes an instanced mesh's box once and keeps it, whatever its instances do afterwards.
      const was = before[i];
      const moved =
        was?.object !== object || was.instances !== part.instances || was.geometry !== part.geometry;
      if (moved && isInstanced(object)) object.computeBoundingBox();
      return part;
    });
    entry.box.makeEmpty();
    for (const object of this.seen) expandPrecise(entry.box, object);
    if (entry.box.isEmpty()) entry.sphere.makeEmpty();
    else entry.box.getBoundingSphere(entry.sphere);
    this.walks++;
  }
}

type Targets = { front: RenderTarget; back: RenderTarget; map: RenderTarget; soft: RenderTarget };

/** The caustics pass: a map size, the casters' optics, a render per frame and a receiver node. */
export class CausticsPass {
  /** The map's size in texels; 0 while off. */
  size = 0;
  /** What the casters are made of, for the refraction; the game sets it for what is under the light. */
  optics: CausticsOptics;
  private readonly gain: number;
  private targets: Targets | null = null;
  private readonly lightCamera = new PerspectiveCamera(30, 1, 0.05, 2);
  private readonly frontMaterial: NodeMaterial;
  private readonly backMaterial: NodeMaterial;
  private readonly splatScene = new Scene();
  private splat: InstancedMesh | null = null;
  /**
   * The casters are lent to this scene for the two geometry passes: its `children` hold them for the draw without
   * reparenting (the renderer only walks the array), so the scene is never traversed for the caustics. Its world
   * matrices are never touched: the casters' were updated when their bounds were.
   */
  private readonly casterScene = new Scene();

  // Texture nodes are created once and re-pointed when the targets are reallocated.
  private readonly frontPos = texture(new Texture());
  private readonly frontNormal = texture(new Texture());
  private readonly frontTint = texture(new Texture());
  private readonly backPos = texture(new Texture());
  private readonly backNormal = texture(new Texture());
  private readonly rawNode = texture(new Texture());
  private readonly mapNode = texture(new Texture());
  private readonly softener: QuadMesh;

  private readonly lightPosition = uniform(new Vector3());
  /** The wide frustum (same eye as the light camera, wider angle) the map and its receivers share. */
  private readonly wideViewProjection = uniform(new Matrix4());
  private readonly wideProjection = new Matrix4();
  private readonly planeY = uniform(0);
  private readonly ior = uniform(1.544);
  private readonly dispersion = uniform(3);
  private readonly strength = uniform(0);
  private readonly texels = uniform(1);
  private readonly bounds = new CasterBounds();
  /** What the standing map was drawn for; a frame that matches it is skipped. */
  private readonly drawn = {
    eye: new Vector3(),
    planeY: Number.NaN,
    ior: Number.NaN,
    dispersion: Number.NaN,
  };
  private readonly rendererState = {} as ReturnType<typeof RendererUtils.saveRendererState>;
  private rendered = false;

  constructor(options: CausticsOptions = {}) {
    this.gain = options.gain ?? 10;
    this.optics = { ...(options.optics ?? { ior: 1.544, dispersion: 3 }) };
    this.casterScene.matrixWorldAutoUpdate = false;
    // The caster passes: unlit, writing geometry into the targets. diffuseColor carries instance colours.
    this.frontMaterial = new NodeMaterial();
    this.frontMaterial.lights = false;
    this.frontMaterial.colorNode = vec4(1);
    this.frontMaterial.mrtNode = mrt({
      pos: vec4(positionWorld, 1),
      normal: vec4(normalWorld, 1),
      tint: vec4(diffuseColor.rgb, 1),
    });
    this.frontMaterial.blending = NoBlending;
    this.backMaterial = new NodeMaterial();
    this.backMaterial.lights = false;
    this.backMaterial.colorNode = vec4(1);
    this.backMaterial.side = BackSide;
    this.backMaterial.mrtNode = mrt({ pos: vec4(positionWorld, 1), normal: vec4(normalWorld, 1) });
    this.backMaterial.blending = NoBlending;

    // A 3x3 tent over the splat: the stretched cells land as dotted slivers without it.
    const soften = new NodeMaterial();
    soften.lights = false;
    soften.fragmentNode = Fn(() => {
      const step = float(1).div(this.texels);
      const sum = vec3(0).toVar();
      const weights = [1, 2, 1, 2, 4, 2, 1, 2, 1];
      let i = 0;
      for (let y = -1; y <= 1; y++) {
        for (let x = -1; x <= 1; x++) {
          const w = weights[i++] ?? 0;
          sum.addAssign(this.rawNode.sample(uv().add(vec2(x, y).mul(step))).rgb.mul(w / 16));
        }
      }
      return vec4(sum, 1);
    })();
    this.softener = new QuadMesh(soften);
  }

  /** Allocate (or free, with 0) the targets for a map of `size` texels. */
  setSize(size: number): void {
    if (size === this.size) return;
    this.release();
    this.size = size;
    if (size <= 0) return;

    const front = new RenderTarget(size, size, { count: 3, depthBuffer: true, generateMipmaps: false });
    const [fPos, fNor, fTint] = front.textures;
    const back = new RenderTarget(size, size, { count: 2, depthBuffer: true, generateMipmaps: false });
    const [bPos, bNor] = back.textures;
    if (!fPos || !fNor || !fTint || !bPos || !bNor) throw new Error("caustics targets missing");
    fPos.name = "pos";
    fPos.type = FloatType;
    fNor.name = "normal";
    fNor.type = HalfFloatType;
    fTint.name = "tint";
    bPos.name = "pos";
    bPos.type = FloatType;
    bNor.name = "normal";
    bNor.type = HalfFloatType;
    const map = new RenderTarget(size, size, { depthBuffer: false, generateMipmaps: false });
    map.texture.type = HalfFloatType;
    const soft = new RenderTarget(size, size, { depthBuffer: false, generateMipmaps: false });
    soft.texture.type = HalfFloatType;
    this.targets = { front, back, map, soft };

    this.frontPos.value = fPos;
    this.frontNormal.value = fNor;
    this.frontTint.value = fTint;
    this.backPos.value = bPos;
    this.backNormal.value = bNor;
    this.rawNode.value = map.texture;
    this.mapNode.value = soft.texture;
    this.texels.value = size;

    // The splat grid: one vertex per two texels, three instances for red, green and blue.
    const grid = Math.max(16, size / 2);
    const geometry = new PlaneGeometry(2, 2, grid - 1, grid - 1);
    const splat = new InstancedMesh(geometry, this.buildSplatMaterial(grid), 3);
    splat.frustumCulled = false;
    this.splat = splat;
    this.splatScene.add(splat);
    this.rendered = false;
  }

  private release(): void {
    if (this.targets) {
      this.targets.front.dispose();
      this.targets.back.dispose();
      this.targets.map.dispose();
      this.targets.soft.dispose();
      this.targets = null;
    }
    if (this.splat) {
      this.splatScene.remove(this.splat);
      this.splat.geometry.dispose();
      (this.splat.material as NodeMaterial).dispose();
      this.splat = null;
    }
  }

  private buildSplatMaterial(grid: number): NodeMaterial {
    const gridUv = uv();
    const front = this.frontPos.sample(gridUv).level(int(0));
    const frontNormal = normalize(this.frontNormal.sample(gridUv).level(int(0)).xyz);
    const back = this.backPos.sample(gridUv).level(int(0));
    const backNormal = normalize(this.backNormal.sample(gridUv).level(int(0)).xyz);
    const tint = this.frontTint.sample(gridUv).level(int(0)).rgb;

    // Channel: 0 red, 1 green, 2 blue. Red bends least, blue most.
    const channel = float(instanceIndex);
    const isRed = channel.lessThan(0.5);
    const isBlue = channel.greaterThan(1.5);
    // Exaggerated against real glass so the fringes read on a map a metre or so across.
    const shift = select(isRed, float(-0.03), select(isBlue, float(0.036), float(0)));
    const iorChannel = this.ior.mul(shift.mul(this.dispersion.div(3)).add(1));

    // Into the caster at the front face.
    const incoming = normalize(front.xyz.sub(this.lightPosition));
    const inside = refract(incoming, frontNormal, float(1).div(iorChannel));
    // Out again at the back face (the same texel's back surface stands in for the true exit point).
    const hasBack = back.a.greaterThan(0.5);
    const exitPoint = select(hasBack, back.xyz, front.xyz);
    const exitNormal = backNormal.mul(sign(backNormal.dot(inside)).negate());
    const outRaw = refract(inside, exitNormal, iorChannel);
    const totalInternal = outRaw.dot(outRaw).lessThan(0.5);
    const outgoing = select(hasBack.and(totalInternal.not()), outRaw, inside);

    // Down to the receiver plane.
    const descending = outgoing.y.lessThan(-0.02);
    const t = this.planeY.sub(exitPoint.y).div(outgoing.y);
    const hit = exitPoint.add(outgoing.mul(t));
    const valid = front.a.greaterThan(0.5).and(descending).and(t.greaterThan(0));
    const clip = this.wideViewProjection.mul(vec4(hit, 1));

    const vValid = varying(select(valid, float(1), float(0)));
    const vUv = varying(gridUv);
    const vTint = varying(tint);
    // The grid is `grid` cells across `size` texels: scale so an undeviated slab deposits about 1.
    const perCell = this.texels.div(grid).pow(2);

    const material = new NodeMaterial();
    material.vertexNode = select(valid, clip, vec4(0, 0, 2, 1));
    material.fragmentNode = Fn(() => {
      // Cells touching an invalid vertex are dropped whole.
      If(vValid.lessThan(0.999), () => {
        Discard();
      });
      // How much the grid cell was squeezed on its way to the plane: texel area / landing area.
      const dx = dFdx(vUv);
      const dy = dFdy(vUv);
      const jacobian = dx.x.mul(dy.y).sub(dx.y.mul(dy.x)).abs();
      const density = jacobian.mul(this.texels.mul(this.texels)).div(perCell).clamp(0, 6);
      const one = float(1);
      const zero = float(0);
      const mask = vec3(
        select(isRed, one, zero),
        select(isRed.or(isBlue), zero, one),
        select(isBlue, one, zero),
      );
      return vec4(mask.mul(density).mul(mix(vec3(1), vTint, 0.7)), 1);
    })();
    material.lights = false;
    material.transparent = true;
    material.blending = AdditiveBlending;
    material.depthTest = false;
    material.depthWrite = false;
    material.side = DoubleSide;
    return material;
  }

  /** One of the pass's targets sampled across the screen, for `?debug=caustics|front|back`. */
  debugNode(which: "caustics" | "front" | "back") {
    const node = which === "front" ? this.frontPos : which === "back" ? this.backPos : this.mapNode;
    const sampled = node.sample(screenUV);
    return which === "caustics" ? vec4(sampled.rgb, 1) : vec4(sampled.xyz.fract(), 1);
  }

  /** Irradiance this pass adds to a receiver at `positionWorld`; multiply by the receiver's albedo. */
  receiverNode() {
    const clip = this.wideViewProjection.mul(vec4(positionWorld, 1));
    const ndc = clip.xyz.div(clip.w);
    // Render targets follow WebGPU's convention: +y in clip space is the top row.
    const mapUv = vec2(ndc.x.mul(0.5).add(0.5), float(0.5).sub(ndc.y.mul(0.5)));
    const inFrustum = clip.w
      .greaterThan(0)
      .and(mapUv.x.greaterThan(0))
      .and(mapUv.x.lessThan(1))
      .and(mapUv.y.greaterThan(0))
      .and(mapUv.y.lessThan(1));
    const onPlane = smoothstep(0.1, 0, positionWorld.y.sub(this.planeY).abs());
    const light = this.mapNode.sample(mapUv).rgb;
    return light
      .mul(this.strength)
      .mul(onPlane)
      .mul(select(inFrustum, float(1), float(0)));
  }

  /** Aim the light camera from `eye` at the casters' bounds. False when the light sits inside them. */
  private aim(renderer: WebGPURenderer, eye: Vector3): boolean {
    const bounds = this.bounds.sphere;
    const distance = eye.distanceTo(bounds.center);
    if (distance <= bounds.radius) return false;
    const halfAngle = Math.asin(bounds.radius / distance);
    const cam = this.lightCamera;
    cam.coordinateSystem = renderer.coordinateSystem;
    cam.position.copy(eye);
    cam.up.copy(up);
    cam.lookAt(bounds.center);
    cam.fov = (halfAngle * 2 * 1.1 * 180) / Math.PI;
    cam.near = Math.max(0.01, distance - bounds.radius * 1.2);
    cam.far = distance + bounds.radius * 1.2;
    cam.aspect = 1;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);

    // The wide frustum takes in the plane around the caster, where bent light lands.
    const wideHalf = Math.min(1.3, halfAngle * 2.6);
    const extent = Math.tan(wideHalf) * cam.near;
    this.wideProjection.makePerspective(
      -extent,
      extent,
      extent,
      -extent,
      cam.near,
      cam.far + 1.5,
      cam.coordinateSystem,
    );
    this.wideViewProjection.value.multiplyMatrices(this.wideProjection, cam.matrixWorldInverse);
    return true;
  }

  /**
   * Renders the caustics map for this frame. `scene` is the scene the casters live in; `light` any object whose
   * world position is the light's (a spot or point light). The map is drawn again only when a caster, the light,
   * the plane or the optics have changed since the last draw: a caster turning redraws every frame, one at rest
   * costs nothing.
   */
  render(
    renderer: WebGPURenderer,
    scene: Scene,
    light: Object3D,
    casters: ReadonlySet<Object3D>,
    frame: CausticsFrame,
  ): void {
    const planeY = frame.planeY;
    this.strength.value = this.targets ? frame.strength * this.gain : 0;
    this.planeY.value = planeY;
    this.ior.value = this.optics.ior;
    this.dispersion.value = this.optics.dispersion;
    if (!this.targets) return;

    const moved = this.bounds.update(casters, scene);
    if (this.bounds.sphere.isEmpty()) {
      if (this.rendered) this.clear(renderer);
      return;
    }
    const eye = light.getWorldPosition(this.lightPosition.value);
    const drawn = this.drawn;
    const standing =
      this.rendered &&
      !moved &&
      eye.equals(drawn.eye) &&
      planeY === drawn.planeY &&
      this.optics.ior === drawn.ior &&
      this.optics.dispersion === drawn.dispersion;
    if (standing) return;
    if (!this.aim(renderer, eye)) {
      if (this.rendered) this.clear(renderer);
      return;
    }
    drawn.eye.copy(eye);
    drawn.planeY = planeY;
    drawn.ior = this.optics.ior;
    drawn.dispersion = this.optics.dispersion;

    const stage = this.casterScene;
    for (const caster of this.bounds.shown()) stage.children.push(caster);
    RendererUtils.resetRendererState(renderer, this.rendererState);
    const cam = this.lightCamera;
    renderer.setClearColor(0x000000, 0);

    stage.overrideMaterial = this.frontMaterial;
    renderer.setRenderTarget(this.targets.front);
    renderer.render(stage, cam);

    stage.overrideMaterial = this.backMaterial;
    renderer.setRenderTarget(this.targets.back);
    renderer.render(stage, cam);
    stage.children.length = 0;

    renderer.setRenderTarget(this.targets.map);
    renderer.render(this.splatScene, cam);

    renderer.setRenderTarget(this.targets.soft);
    this.softener.render(renderer);
    this.rendered = true;

    RendererUtils.restoreRendererState(renderer, this.rendererState);
  }

  /**
   * Compile the pass's materials before the first draw needs them: the front and back geometry passes for a
   * plain mesh and for an instanced one with instance colours (a plain caster and an instanced one), the splat and the softener.
   * Each compiles against its own render target (compile.ts), so the pipelines match the ones `render` asks for.
   * Call after `setSize`; a quality change that resizes the map rebuilds the splat, so call again then. `camera` is
   * the stage's, taken for the contract; the pass renders from its own light camera.
   */
  async prewarm(renderer: WebGPURenderer, _camera: Camera): Promise<void> {
    const targets = this.targets;
    if (!targets) return;
    const box = new BoxGeometry(0.1, 0.1, 0.1);
    const plain = new Mesh(box);
    const instanced = new InstancedMesh(box, undefined, 1);
    instanced.setMatrixAt(0, new Matrix4());
    instanced.setColorAt(0, new Color(1, 1, 1));
    for (const mesh of [plain, instanced]) {
      // The real casters transmit, which the renderer carries onto the override as `transparent`.
      (mesh.material as Material).transparent = true;
      mesh.frustumCulled = false;
      mesh.position.set(0, 0, -1);
    }
    const cam = this.lightCamera;
    cam.coordinateSystem = renderer.coordinateSystem;
    cam.position.set(0, 0, 0);
    cam.up.copy(up);
    cam.lookAt(0, 0, -1);
    cam.near = 0.05;
    cam.far = 2;
    cam.fov = 30;
    cam.aspect = 1;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);

    // A scene of its own for the two geometry passes: every drawn frame refills `casterScene`, and frames go on
    // drawing while these compile.
    const warm = new Scene();
    warm.add(plain, instanced);
    const compile = (target: RenderTarget, scene: Object3D, camera: Camera) =>
      // A resize since has freed these targets: the next prewarm covers the new ones.
      this.targets === targets
        ? compileFor(renderer, { target, outputs: null }, scene, camera)
        : Promise.resolve();
    try {
      warm.overrideMaterial = this.frontMaterial;
      await compile(targets.front, warm, cam);
      warm.overrideMaterial = this.backMaterial;
      await compile(targets.back, warm, cam);
      await compile(targets.map, this.splatScene, cam);
      await compile(targets.soft, this.softener, this.softener.camera);
    } finally {
      instanced.dispose();
      box.dispose();
    }
  }

  private clear(renderer: WebGPURenderer): void {
    if (!this.targets) return;
    RendererUtils.resetRendererState(renderer, this.rendererState);
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.targets.map);
    renderer.clear();
    renderer.setRenderTarget(this.targets.soft);
    renderer.clear();
    RendererUtils.restoreRendererState(renderer, this.rendererState);
    this.rendered = false;
  }

  dispose(): void {
    this.release();
    this.frontMaterial.dispose();
    this.backMaterial.dispose();
    (this.softener.material as NodeMaterial).dispose();
  }
}
