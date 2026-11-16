import { Box3, type Camera, type Object3D, Scene, Sphere, type WebGPURenderer } from "three/webgpu";
/** What the casters refract with: one set for the whole pass. */
export type CausticsOptics = {
    ior: number;
    dispersion: number;
};
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
/**
 * The world bounds of the casters that show, measured only when they change. Each caster is walked once per move:
 * its bounding box is the precise one (`Box3.setFromObject(caster, true)`, over what is visible in it), its sphere
 * that box's, and `sphere` is the union of every caster's, as the pass has always framed them.
 */
export declare class CasterBounds {
    /** World bounding sphere round every caster that shows; empty when there are none. */
    readonly sphere: Sphere;
    /** How many times a caster has been measured (the tests watch this). */
    walks: number;
    private readonly entries;
    /** The drawn objects of the caster in hand: `stale` fills it, `measure` reads it. */
    private readonly seen;
    /**
     * Bring the bounds up to date for this frame. Returns true when a caster came, went, moved, hid or showed, so the
     * map must be drawn again. A caster counts only while the scene's render reaches it (see `reached`; `root` is the
     * scene). Each caster's world matrices are updated here, ahead of the renderer's own pass.
     */
    update(casters: ReadonlySet<Object3D>, root?: Object3D | null): boolean;
    /** The casters the last `update` counted: the ones to draw. */
    shown(): IterableIterator<Object3D>;
    /** The measured world box of one caster, for the tests. */
    boxOf(caster: Object3D): Box3 | null;
    private stale;
    private measure;
}
/** The caustics pass: a map size, the casters' optics, a render per frame and a receiver node. */
export declare class CausticsPass {
    /** The map's size in texels; 0 while off. */
    size: number;
    /** What the casters are made of, for the refraction; the game sets it for what is under the light. */
    optics: CausticsOptics;
    private readonly gain;
    private targets;
    private readonly lightCamera;
    private readonly frontMaterial;
    private readonly backMaterial;
    private readonly splatScene;
    private splat;
    /**
     * The casters are lent to this scene for the two geometry passes: its `children` hold them for the draw without
     * reparenting (the renderer only walks the array), so the scene is never traversed for the caustics. Its world
     * matrices are never touched: the casters' were updated when their bounds were.
     */
    private readonly casterScene;
    private readonly frontPos;
    private readonly frontNormal;
    private readonly frontTint;
    private readonly backPos;
    private readonly backNormal;
    private readonly rawNode;
    private readonly mapNode;
    private readonly softener;
    private readonly lightPosition;
    /** The wide frustum (same eye as the light camera, wider angle) the map and its receivers share. */
    private readonly wideViewProjection;
    private readonly wideProjection;
    private readonly planeY;
    private readonly ior;
    private readonly dispersion;
    private readonly strength;
    private readonly texels;
    private readonly bounds;
    /** What the standing map was drawn for; a frame that matches it is skipped. */
    private readonly drawn;
    private readonly rendererState;
    private rendered;
    constructor(options?: CausticsOptions);
    /** Allocate (or free, with 0) the targets for a map of `size` texels. */
    setSize(size: number): void;
    private release;
    private buildSplatMaterial;
    /** One of the pass's targets sampled across the screen, for `?debug=caustics|front|back`. */
    debugNode(which: "caustics" | "front" | "back"): import("three/webgpu").JoinNode<"vec4">;
    /** Irradiance this pass adds to a receiver at `positionWorld`; multiply by the receiver's albedo. */
    receiverNode(): import("three/webgpu").Node<"vec3">;
    /** Aim the light camera from `eye` at the casters' bounds. False when the light sits inside them. */
    private aim;
    /**
     * Renders the caustics map for this frame. `scene` is the scene the casters live in; `light` any object whose
     * world position is the light's (a spot or point light). The map is drawn again only when a caster, the light,
     * the plane or the optics have changed since the last draw: a caster turning redraws every frame, one at rest
     * costs nothing.
     */
    render(renderer: WebGPURenderer, scene: Scene, light: Object3D, casters: ReadonlySet<Object3D>, frame: CausticsFrame): void;
    /**
     * Compile the pass's materials before the first draw needs them: the front and back geometry passes for a
     * plain mesh and for an instanced one with instance colours (a plain caster and an instanced one), the splat and the softener.
     * Each compiles against its own render target (compile.ts), so the pipelines match the ones `render` asks for.
     * Call after `setSize`; a quality change that resizes the map rebuilds the splat, so call again then. `camera` is
     * the stage's, taken for the contract; the pass renders from its own light camera.
     */
    prewarm(renderer: WebGPURenderer, _camera: Camera): Promise<void>;
    private clear;
    dispose(): void;
}
