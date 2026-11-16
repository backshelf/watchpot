// The post stack, built once per quality preset on three's node (TSL) render pipeline:
// scene (MRT where GI or TRAA need it) -> GI (SSGI or GTAO) -> god rays from one light -> TRAA -> depth of field
// -> bloom -> AgX tone mapping and sRGB -> vignette -> grain -> SMAA. Nothing here imports pmndrs postprocessing.
// Full-frame passes are kept to the ones that must exist: the GI combine rides inside the ray blend, TRAA's own
// texture feeds the lens, the lens sits out while depth of field is off, and SMAA reads an 8-bit frame.
// Every tuned number is an option; the defaults were tuned on a scene a few metres across, lit by one warm spot.

import { bilateralBlur } from "three/examples/jsm/tsl/display/BilateralBlurNode.js";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { denoise } from "three/examples/jsm/tsl/display/DenoiseNode.js";
import { dof } from "three/examples/jsm/tsl/display/DepthOfFieldNode.js";
import { film } from "three/examples/jsm/tsl/display/FilmNode.js";
import { godrays } from "three/examples/jsm/tsl/display/GodraysNode.js";
import { ao } from "three/examples/jsm/tsl/display/GTAONode.js";
import { smaa } from "three/examples/jsm/tsl/display/SMAANode.js";
import { ssgi } from "three/examples/jsm/tsl/display/SSGINode.js";
import { traa } from "three/examples/jsm/tsl/display/TRAANode.js";
import {
  abs,
  add,
  array,
  convertToTexture,
  diffuseColor as diffuseColorNode,
  Fn,
  float,
  If,
  int,
  ivec2,
  Loop,
  mix,
  mrt,
  normalView,
  output,
  packNormalToRGB,
  pass,
  perspectiveDepthToViewZ,
  reference,
  renderOutput,
  rtt,
  sample,
  screenUV,
  select,
  smoothstep,
  textureSize,
  uniform,
  unpackRGBToNormal,
  uv,
  vec2,
  vec4,
  velocity,
  viewZToOrthographicDepth,
} from "three/tsl";
import {
  type Camera,
  Color,
  type ColorRepresentation,
  type DirectionalLight,
  type Node,
  type Object3D,
  type PerspectiveCamera,
  type PointLight,
  RenderPipeline,
  type Scene,
  type SpotLight,
  type TextureNode,
  UnsignedByteType,
  Vector3,
  type WebGPURenderer,
} from "three/webgpu";
import { compileFor, compileInTurn } from "./compile";
import type { StagePreset } from "./quality";

/** A built post stack: render it each frame instead of `renderer.render`, and set what it draws with. */
export interface Post {
  /** Renders one frame through the stack. */
  render(): void;
  /** Where depth of field is sharp, in world space. */
  setFocus(point: Vector3): void;
  /** How much depth of field shows, 0 (everything sharp) to 1 (the lens's own range). */
  setDepthOfField(amount: number): void;
  /** The player's brightness: exposure as a multiple of the picture's own. */
  setBrightness(v: number): void;
  /**
   * How far the eye is from adapted to what it looks at, in stops: under zero the picture is darker than it will
   * settle, over zero brighter. The caller eases it.
   */
  setAdaptation(stops: number): void;
  /** Film grain over the picture, on or off. */
  setGrain(on: boolean): void;
  /** The god rays' colour, linear (a share of the light's own colour and strength reads as dust in the beam). */
  setRayColour(colour: Color): void;
  /**
   * The bounce-light pass's size as a share of the frame's, each way (0.25 to 1). It is most of a frame's GPU time
   * at SSGI and grows with the pixel count, while what it draws is soft: on a dense screen the stage holds it to
   * one sample a CSS pixel.
   */
  setIndirectScale(scale: number): void;
  /**
   * Compiles `object` as the scene pass will draw it, lit by the scene's lights. A shader is built for the render
   * target and the outputs it draws into, so a compile against the canvas would build one the pass never uses.
   * Frames may go on drawing meanwhile.
   */
  compile(object: Object3D): Promise<void>;
  /**
   * Compiles the whole scene for the scene pass, before the stack's first frame: all of it, in view or not. Drawn
   * uncompiled, every object would have its pipeline built as it is first drawn, each one stalling the GPU in
   * turn; compiled, they are built side by side and off the frame.
   */
  compileScene(): Promise<void>;
  dispose(): void;
}

/** The light god rays fall from. */
export type RayLight = SpotLight | DirectionalLight | PointLight;

/** Everything `buildPost` takes beyond the preset. Every number defaults to the value it was tuned at. */
export interface PostOptions {
  /** The light god rays fall from; none, and the rays are off. Its shadow map must exist already. */
  readonly light?: RayLight | null;
  /** Where depth of field is sharp at first. Default the origin. */
  readonly focus?: Vector3;
  /** Draw this instead of the picture (a debug view of some pass), or "rays" for the god rays alone. */
  readonly debug?: Node | "rays" | null;
  /** Screen-space GI (`gi: "ssgi"`). Defaults: radius 1.2, thickness 0.08, intensity 6 (a room a few metres). */
  readonly gi?: { readonly radius?: number; readonly thickness?: number; readonly intensity?: number };
  /** Ambient occlusion alone (`gi: "gtao"`). Defaults: radius 0.12, scale 1.1, samples 12. */
  readonly ao?: { readonly radius?: number; readonly scale?: number; readonly samples?: number };
  /**
   * God rays. GodraysNode's density multiplies the march length in world units (its demo is hundreds of metres
   * across), so a scene a metre or two across wants a hundred times the demo's. Defaults: density 20, maxDensity
   * 0.06, distanceAttenuation 3.2, colour #ffb97b.
   */
  readonly rays?: {
    readonly density?: number;
    readonly maxDensity?: number;
    readonly distanceAttenuation?: number;
    readonly colour?: ColorRepresentation;
  };
  /**
   * Depth of field. `range` is how far from the focal plane things go fully soft at `reference` metres of focus
   * (it grows with the square of the distance past that); `bokeh` the lens's blur scale. Defaults 0.7, 1.3, 3.2.
   */
  readonly dof?: { readonly range?: number; readonly reference?: number; readonly bokeh?: number };
  /**
   * Bloom: only what is brighter than `threshold` (linear, so over 1 is brighter than white paper under the main
   * light) glows, and only a little. Defaults: strength 0.2, radius 0.3, threshold 1.15.
   */
  readonly bloom?: { readonly strength?: number; readonly radius?: number; readonly threshold?: number };
  /** Vignette, the pmndrs formula. Defaults: offset 0.22, darkness 0.8. */
  readonly vignette?: { readonly offset?: number; readonly darkness?: number };
  /** How much of the film's noise the picture takes while grain is on. Default 0.035. */
  readonly grain?: number;
}

/** Depth of field's tuned range and focus distance. */
const DOF_RANGE = 0.7;
const DOF_REFERENCE = 1.3;

/**
 * The out-of-focus range at a focus distance: depth of field grows with the square of the distance, as a lens's
 * does, so a far corner seen from across the scene reads sharp while something up close keeps a shallow focus.
 * Never tighter than at `reference`, so a thing held up to the eye does not go soft around its edges.
 */
export function focalRangeAt(distance: number, range = DOF_RANGE, reference = DOF_REFERENCE): number {
  return range * Math.max(1, (distance / reference) ** 2);
}

/**
 * GodraysNode (r187) only knows point and directional lights, but its directional branch is written for a
 * perspective shadow camera too: it divides the shadow coordinate by w and converts perspective depth, and it
 * reads the light through getters (matrixWorld, shadow.matrix, shadow.map). A spot light therefore works when
 * the node sees it as directional. This view over the real light flips the two type flags and nothing else.
 * Searched: three r187 GodraysNode.js and the webgpu_postprocessing_godrays example; three PR #32888 (the
 * node's arrival, point and directional only) and PR #35308 (open: the directional branch's depth conversion
 * is the perspective one, which is exactly what a spot's shadow camera needs). No spot support is shipped
 * or planned.
 */
function asDirectional(light: SpotLight): DirectionalLight {
  return Object.create(light, {
    isDirectionalLight: { value: true },
    isSpotLight: { value: false },
  }) as unknown as DirectionalLight;
}

/** A node that renders to a texture and hands it out (TRAA, the depth of field): the typings leave this out. */
type Textured = { getTextureNode(): TextureNode };

/**
 * three's `depthAwareBlend` (r187) with the base colour taken as an expression rather than a texture, so the GI
 * combine (`scene × ao`, or `+ diffuse × gi`) is evaluated in the pass that follows instead of rendered to a
 * full-frame texture of its own first. The maths is the original's, step for step: eight Poisson taps on the depth
 * find a silhouette and the ray sample is pushed away from it so the glow never leaks across an edge. (The
 * original ends its push with a `.normalize()` whose result is never assigned, so the push keeps its length here
 * too: same picture.) `size` is a texture at the frame's resolution, for the texel step.
 */
function rayBlend(
  base: Node<"vec4">,
  size: TextureNode,
  rays: TextureNode,
  depth: TextureNode,
  camera: PerspectiveCamera,
  tint: Node<"color">,
): Node<"vec4"> {
  const edgeRadius = int(2);
  const edgeStrength = float(2);
  return Fn(() => {
    const uvNode = uv();
    const near = reference("near", "float", camera);
    const far = reference("far", "float", camera);
    const viewZ = perspectiveDepthToViewZ(depth, near, far);
    const correctDepth = viewZToOrthographicDepth(viewZ, near, far);
    const pushDir = vec2(0).toVar();
    const count = float(0).toVar();
    const resolution = ivec2(textureSize(size) as unknown as Node<"ivec2">).toConst();
    const pixelStep = vec2(1).div(resolution);
    const poissonDisk = array([
      vec2(0.493393, 0.394269),
      vec2(0.798547, 0.885922),
      vec2(0.259143, 0.650754),
      vec2(0.605322, 0.023588),
      vec2(-0.574681, 0.137452),
      vec2(-0.430397, -0.638423),
      vec2(-0.849487, -0.366258),
      vec2(0.170621, -0.569941),
    ]);
    Loop(8, ({ i }) => {
      const offset = poissonDisk.element(i).mul(edgeRadius);
      const sampleUv = uvNode.add(offset.mul(pixelStep));
      const sampleDepth = depth.sample(sampleUv);
      const sampleViewZ = perspectiveDepthToViewZ(sampleDepth, near, far);
      const sampleLinearDepth = viewZToOrthographicDepth(sampleViewZ, near, far);
      If(abs(sampleLinearDepth.sub(correctDepth)).lessThan(float(0.05).mul(correctDepth)), () => {
        pushDir.addAssign(offset);
        count.addAssign(1);
      });
    });
    count.assign(count.equal(0).select(1, count));
    pushDir.divAssign(count);
    const sampleUv = pushDir
      .length()
      .greaterThan(0)
      .select(uvNode.add(edgeStrength.mul(pushDir.div(resolution))), uvNode);
    const bestChoice = rays.sample(sampleUv).r;
    return vec4(mix(base, vec4(tint, 1), bestChoice));
  })() as unknown as Node<"vec4">;
}

/** Builds the post stack for `preset` over `scene` seen by `camera`. */
export function buildPost(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: Camera,
  preset: StagePreset,
  options: PostOptions = {},
): Post {
  const persp = camera as PerspectiveCamera;
  const pipeline = new RenderPipeline(renderer);
  const disposables: { dispose(): void }[] = [];
  const grainAmount = options.grain ?? 0.035;
  const dofRange = options.dof?.range ?? DOF_RANGE;
  const dofReference = options.dof?.reference ?? DOF_REFERENCE;

  // Scene pass, with the extra targets the later passes read.
  const scenePass = pass(scene, camera);
  disposables.push(scenePass);
  const targets: Record<string, Node> = { output };
  const wantsNormals = preset.gi !== "off";
  if (wantsNormals) targets.normal = packNormalToRGB(normalView);
  if (preset.gi === "ssgi") targets.diffuseColor = diffuseColorNode;
  if (preset.aa === "traa") targets.velocity = velocity;
  scenePass.setMRT(mrt(targets));

  const sceneColor = scenePass.getTextureNode("output");
  const sceneDepth = scenePass.getTextureNode("depth");
  const viewZ = scenePass.getViewZNode();
  let normalNode: Node | null = null;
  if (wantsNormals) {
    scenePass.getTexture("normal").type = UnsignedByteType;
    const packed = scenePass.getTextureNode("normal") as TextureNode;
    normalNode = sample((uv: Node) => unpackRGBToNormal(packed.sample(uv)));
  }

  type Rgba = Node<"vec4">;
  let colour: Rgba = sceneColor as unknown as Rgba;

  // Indirect light.
  let indirect: { resolutionScale: number } | null = null;
  if (preset.gi === "ssgi" && normalNode) {
    scenePass.getTexture("diffuseColor").type = UnsignedByteType;
    const sceneDiffuse = scenePass.getTextureNode("diffuseColor");
    const gi = ssgi(sceneColor, sceneDepth, normalNode, persp);
    gi.sliceCount.value = preset.giSlices;
    gi.stepCount.value = preset.giSteps;
    // Samples reach across what is in front of the camera, not the whole scene.
    gi.radius.value = options.gi?.radius ?? 1.2;
    gi.thickness.value = options.gi?.thickness ?? 0.08;
    gi.giIntensity.value = options.gi?.intensity ?? 6;
    gi.useTemporalFiltering = preset.aa === "traa";
    indirect = gi;
    disposables.push(gi);
    const aoNode = gi.getAONode();
    const giNode = gi.getGINode();
    colour = vec4(
      add(sceneColor.rgb.mul(aoNode), sceneDiffuse.rgb.mul(giNode.rgb)),
      sceneColor.a,
    ) as unknown as Rgba;
  } else if (preset.gi === "gtao" && normalNode) {
    const aoPass = ao(sceneDepth, normalNode, persp);
    aoPass.radius.value = options.ao?.radius ?? 0.12;
    aoPass.scale.value = options.ao?.scale ?? 1.1;
    aoPass.samples.value = options.ao?.samples ?? 12;
    disposables.push(aoPass);
    const clean = denoise(aoPass.getTextureNode(), sceneDepth, normalNode, persp);
    disposables.push(clean);
    colour = vec4(sceneColor.rgb.mul((clean as unknown as Rgba).r), sceneColor.a) as unknown as Rgba;
  }

  // God rays from the light, raymarched at half resolution and blended depth-aware.
  const rayColour = uniform(new Color(options.rays?.colour ?? "#ffb97b"));
  let rayDebug: Node | null = null;
  const light = options.light ?? null;
  if (preset.godraySteps > 0 && light) {
    const seen = (light as SpotLight).isSpotLight ? asDirectional(light as SpotLight) : light;
    const rays = godrays(sceneDepth, persp, seen as DirectionalLight | PointLight);
    rays.raymarchSteps.value = preset.godraySteps;
    rays.density.value = options.rays?.density ?? 20;
    rays.maxDensity.value = options.rays?.maxDensity ?? 0.06;
    rays.distanceAttenuation.value = options.rays?.distanceAttenuation ?? 3.2;
    disposables.push(rays);
    const blurred = bilateralBlur(rays.getTextureNode());
    disposables.push(blurred);
    rayDebug = blurred.getTextureNode();
    // The GI combine above is folded into this pass rather than drawn to a texture first.
    colour = rayBlend(
      colour,
      sceneColor as unknown as TextureNode,
      blurred.getTextureNode(),
      sceneDepth,
      persp,
      rayColour,
    );
  }

  // Temporal anti-aliasing settles SSGI's noise; it runs on linear colour before depth of field.
  if (preset.aa === "traa") {
    const traaPass = traa(colour, sceneDepth, scenePass.getTextureNode("velocity"), persp);
    disposables.push(traaPass);
    // The resolved texture itself: handing the node on would have the next pass copy it to a texture first.
    colour = (traaPass as unknown as Textured).getTextureNode() as unknown as Rgba;
  }

  const focusDistance = uniform(0.8);
  const focalRange = uniform(dofRange);
  /** 1 while depth of field shows; at 0 the sharp frame goes straight on and the lens's passes do not run. */
  const dofOn = uniform(1);
  if (preset.dof) {
    const sharp = convertToTexture(colour);
    const lens = dof(sharp, viewZ, focusDistance, focalRange, options.dof?.bokeh ?? 3.2);
    disposables.push(lens);
    // The lens draws its seven passes from its frame update, so that update sits out while it is off. (Setting its
    // `updateBeforeType` to NONE would also stop it, but three lists a node for updates only as a shader builds: a
    // rebuild while the lens rested would leave it off the list for good.)
    const draw = lens.updateBefore.bind(lens);
    lens.updateBefore = (frame) => (dofOn.value > 0.5 ? draw(frame) : undefined);
    colour = select(dofOn.greaterThan(0.5), lens, sharp) as unknown as Rgba;
  }

  if (preset.bloom) {
    // The bloom's bright pass reads its input in place, so a choice of two textures costs it nothing. A low
    // threshold puts a halo on every pale thing and washes the picture out.
    const glow = bloom(
      colour,
      options.bloom?.strength ?? 0.2,
      options.bloom?.radius ?? 0.3,
      options.bloom?.threshold ?? 1.15,
    );
    disposables.push(glow);
    colour = colour.add(glow) as unknown as Rgba;
  }

  // Tone mapping (renderer.toneMapping, AgX) and sRGB happen here, so vignette, grain and SMAA see display colour.
  // The exposure is the renderer's own (`toneMappingExposure`, which the tone mapping reads each frame): `render`
  // sets it from the brightness and the adaptation.
  pipeline.outputColorTransform = false;
  colour = renderOutput(colour) as unknown as Rgba;

  const offset = options.vignette?.offset ?? 0.22;
  const darkness = options.vignette?.darkness ?? 0.8;
  const dist = screenUV
    .sub(0.5)
    .length()
    .mul(darkness + offset);
  colour = vec4(colour.rgb.mul(smoothstep(0.8, offset * 0.799, dist)), colour.a) as unknown as Rgba;

  const grain = uniform(grainAmount);
  colour = film(colour, grain) as unknown as Rgba;

  if (preset.aa === "smaa") {
    // Display colour fits 8 bits: the frame SMAA reads is half the bandwidth of the default half-float texture.
    const display = rtt(colour, null, null, { type: UnsignedByteType });
    disposables.push(display);
    const aaPass = smaa(display);
    disposables.push(aaPass);
    colour = aaPass as unknown as Rgba;
  }

  const debug = options.debug ?? null;
  pipeline.outputNode = debug === "rays" ? (rayDebug ?? colour) : (debug ?? colour);

  const focus = (options.focus ?? new Vector3()).clone();
  let dofAmount = 1;
  let brightness = 1;
  let adaptation = 0;
  const scratch = new Vector3();

  return {
    render() {
      scratch.copy(focus).applyMatrix4(camera.matrixWorldInverse);
      focusDistance.value = Math.max(0.05, -scratch.z);
      // Off is an endless in-focus range, so easing the amount opens the focus out rather than cross-fading.
      focalRange.value =
        focalRangeAt(focusDistance.value, dofRange, dofReference) / Math.max(dofAmount, 1e-3);
      dofOn.value = dofAmount > 0 ? 1 : 0;
      renderer.toneMappingExposure = brightness * 2 ** adaptation;
      pipeline.render();
    },
    setFocus(point) {
      focus.copy(point);
    },
    setDepthOfField(amount) {
      dofAmount = Math.min(1, Math.max(0, amount));
    },
    setBrightness(v) {
      brightness = v;
    },
    setAdaptation(stops) {
      adaptation = stops;
    },
    setGrain(on) {
      grain.value = on ? grainAmount : 0;
    },
    setRayColour(c) {
      rayColour.value.copy(c);
    },
    setIndirectScale(scale) {
      // The node sizes its target from this at each frame's draw.
      if (indirect) indirect.resolutionScale = Math.min(1, Math.max(0.25, scale));
    },
    compile(object) {
      const to = { target: scenePass.renderTarget, outputs: scenePass.getMRT() };
      return compileFor(renderer, to, object, camera, scene);
    },
    compileScene() {
      // three's own compile of a pass sizes the target as the first render will, so the pipelines match. It
      // compiles what its camera can see, and whatever stood outside that view would have its pipelines built on
      // first sight (a stall each, the first time the camera turns). So nothing is culled while it runs; no frame
      // draws meanwhile.
      return compileInTurn(async () => {
        const culled: Object3D[] = [];
        scene.traverse((o) => {
          if (!o.frustumCulled) return;
          o.frustumCulled = false;
          culled.push(o);
        });
        try {
          await scenePass.compileAsync(renderer);
        } finally {
          for (const o of culled) o.frustumCulled = true;
        }
      });
    },
    dispose() {
      for (const d of disposables) d.dispose();
      pipeline.dispose();
    },
  };
}
