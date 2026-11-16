# watchpot/three

Everything a 3D idle game needs around its scene that is not the scene itself: the canvas on three's WebGPU
renderer, quality tiers, the frame loop, the post stack, the boot that compiles every shader before the first frame,
camera poses and glides, DOM labels pinned to the world, and a handful of helpers. A game writes its meshes,
materials and content; it takes the rest from here.

The stack is three r187 `WebGPURenderer` (`three/webgpu`, with three's WebGL2 backend where WebGPU is missing), TSL
node materials and TSL post-processing, through `@react-three/fiber` 9. There is no GLSL anywhere: drei's `Text` and
troika draw with GLSL materials and do not work on this renderer (use `textTexture`).

`three` and `@react-three/fiber` are optional peers: install them (and `@types/three`) in a game that imports
`watchpot/three`. No other entry reaches them. drei is the game's to bring. The entry imports nothing from the engine
but `watchpot/core` and the prefs hook, ships no CSS, and sets no class names.

Example: [`examples/three-stage.tsx`](examples/three-stage.tsx) (a spinning box, a quality switch, a pinned label, a
camera glide between two poses).

## The stage

```tsx
<Stage quality={quality} frameRate={frameRate} view={view} camera={{ fov: 40, near: 0.05, far: 50 }}
  post={{ light: () => spot.current }} prePasses={runMyPass} reduced={reducedMotion} overlay={<Hud />}>
  {scene}
</Stage>
```

`Stage` mounts an r3f `Canvas` on an async `WebGPURenderer` (`antialias: false`, `powerPreference`, AgX tone mapping,
sRGB output, PCF shadows), its DPR capped by the tier's `dpr`. It owns the render loop at `useFrame` priority 1, so
everything a game animates runs at 0 (or below 1) and the stage draws after it. Each display tick:

1. The clock tick (priority -1000): `stage.dt()` becomes this tick's real seconds, clamped to 0.1.
2. Depth of field eases toward on or off (`dofEase`, 0.6 s).
3. The frame cap (`frameRate`) skips the tick if it is not due; a perf run draws every tick.
4. While the post stack's first compile runs, nothing draws.
5. The renderer is pointed back at the canvas and its MRT cleared (a compile in flight can leave it elsewhere: see
   `compile.ts`).
6. `prePasses(ctx)`: the game's own passes (caustics, a mirror), with the renderer, scene, camera, tier, `dt` and
   whether this is the first frame.
7. The very first frame renders the scene once with a plain material (it creates the shadow maps the god rays read),
   builds the post stack and compiles its scene pass, raced against `compilePatience` (20 s). After that, the post
   stack renders.
8. A quality change builds the new stack beside the old one: the old draws the screen while the new renders one
   frame off screen (where its shaders compile), and the swap is the next frame. No blank frame.
9. A queued capture reads the canvas; a perf run logs its frame.

`useStage()` (inside the canvas, or in `overlay`) is the handle a game drives each frame:

- `clock`: the pace clock (`createPaceClock`). Read `clock.now()` in `useFrame` so one `clock.setScale(0)` holds the
  whole scene still; `clock.real()` for easing that must not slow.
- `dt()`: this tick's real seconds, clamped. A hidden tab or a stall never jumps a frame.
- `reduced`: the game's reduced-motion setting, passed to `<Stage reduced>`. Hold still what can hold still.
- `setFocus(point)`, `setDepthOfField(on)`: where depth of field is sharp and whether it shows. The view's own
  `depthOfField` still gates it.
- `setAdaptation(stops, channel?)`: the eye's exposure offset, eased by the caller. Channels sum: `"scene"` (the
  default) for the light of where the camera is, another for something bright held close.
- `setBrightness(v)`, `setGrain(on)`: when no `view` store is passed (a `view` is read each frame and wins).
- `setRayColour(colour)`: the god rays' colour, linear; set it each frame from the light if the light changes.
- `compile(object)`: compile something the scene does not hold yet, as the stack on screen will draw it.
- `capture(scale)`, `frames()`, `post()`, `hold()`, `renderer()`, `params`.

`useStageStatus()` gives the UI what the stage is doing: `boot` (the boot's phase), `lost`, `webgl` (three fell back
to WebGL2, which runs the lowest tier whatever was chosen) and `hidden`. Render a boot cue, a lost-device notice or a
HUD through `overlay`, which sits over the canvas under the stage's context.

The stage stops drawing while the page is hidden and resumes with a clamped `dt`. On a lost WebGPU device or WebGL
context it sets `lost`, stops drawing and calls `onLost`; three's own log still runs.

`?webgl` runs the WebGL2 backend on a WebGPU machine, `?precompile=0` draws at once without compiling first, and
`?perf=WxH` is the perf harness: the canvas renders at exactly WxH device pixels, fitted in the window, plays two
seconds of warm-up and ten measured, then logs `perf p50 … p95 … ms` with GPU times where the adapter reports them (`onPerf` on the stage takes the
report and the line instead, for a game that keeps its own log format).
`readStageParams(search, names)` reads them; pass `params` to override (a game can keep its own parameter names).
`consoleName` puts `{ renderer, scene, camera, clock, capture, stage }` on `window` for tuning in the console.

## The post stack

`buildPost(renderer, scene, camera, preset, options)` builds: scene pass (MRT with normals, diffuse and velocity as
the tier needs) → SSGI or GTAO → god rays → TRAA → depth of field → bloom → tone mapping and sRGB → vignette → film
grain → SMAA. The stage builds it; a game passes `post` options to the stage, and `light` as a getter (asked when a
stack is built, after the plain first frame has made its shadow map). God rays are off without a light. A spot light
works through `GodraysNode`'s directional branch (see `asDirectional`'s comment).

Every tuned number is an option whose default is the value it was tuned at: `gi` (radius 1.2, thickness 0.08,
intensity 6), `ao` (0.12, 1.1, 12 samples), `rays` (density 20, maxDensity 0.06, distanceAttenuation 3.2, colour
`#ffb97b`), `dof` (range 0.7 at a reference focus of 1.3 m, bokeh 3.2), `bloom` (0.2, 0.3, threshold 1.15),
`vignette` (offset 0.22, darkness 0.8), `grain` (0.035). `debug` replaces the picture with a node of the game's (a
pass's target) or `"rays"`. `focalRangeAt(distance)` is the out-of-focus range the stack uses: it grows with the
square of the focus distance past the reference.

To add a pre-pass, render it in `prePasses`: the renderer is on the canvas, and the pass may set targets of its own
(save and restore the renderer state, as `CausticsPass` does with `RendererUtils`). To add a post option, pass it in
`post`; for a pass the stack does not have, fork `buildPost` in the game.

`CausticsPass` is a pre-pass that ships here: refraction caustics from any spot or point light through casters the
game names onto a horizontal plane. Size it from the tier (`setSize`, 0 is off), `prewarm` it in the boot, render it
in `prePasses` with `{ strength, planeY }`, and add `receiverNode()` to the receivers' emissive.

## Quality tiers

```ts
const quality = createQuality({ key: "mygame.quality", tiers: DEFAULT_TIERS, initial: "high" });
```

A tier store on `prefs()`: the choice is a device pref, `?quality=<tier>` is the tier a load starts on, unsaved,
until the player picks another (a bare tier name an older build stored under the key reads as that tier).
Tiers run lowest first (`lowest` is what the WebGL2 fallback runs). `DEFAULT_TIERS` is four tiers, `low` to `ultra`,
of `StagePreset` (dpr, shadowSize, gi, giSlices, giSteps, godraySteps, dof, aa, bloom). A game extends the preset with
its own fields (`{ ...DEFAULT_TIERS.high, mapSize: 1024 }`) and reads them through `quality.preset()` or
`usePreset(quality)`. `useQuality(quality)` re-renders on a change; `quality.set(tier)` saves it.

Beside it: `createFrameRate({ key })` (a cap from 30 to 180 fps on a fixed grid, and a measured-fps reading for
`<FpsCounter rate>`, an unstyled `<output data-fps>`), and `viewPrefs({ key, extra })` (brightness 0.6 to 1.4, grain,
depth of field, sway 0 to 1, plus the game's own fields).

## Boot

```tsx
<StageBoot warm={() => warmMeshes} prepare={({ renderer, camera }) => pass.prewarm(renderer, camera)}
  textures={() => scans} before={() => fontsReady(faces)} onReady={start} />
```

Mount once inside the stage, after the scene. It holds the frame loop until `before` settles and the scene's own
effects have had two frames, puts the warm set (one object per shader the scene will need but does not show yet) in a
group far below the floor, runs `prepare`, uploads `textures`, then lets the stage compile and draw `settleFrames`
(4) frames through the post stack. When the GPU has caught up with those frames (`drained`), the warm set leaves the
scene (the game keeps the objects, so three keeps their shaders), the status goes `ready`, `onReady` runs with the
timings, and one `boot:` line is logged. The phases (`waiting`, `compiling`, `settling`, `ready`) are in
`useStageStatus().boot` for the game's own cue. `useStageBoot(options)` is the same as a hook.

## Camera

`framePose(framing, aspect, { bounds })` stands a camera back from a target at a yaw and pitch until a box fits the
window: from 16:9 up the vertical angle is the framing's own, below it the horizontal angle holds, and in `bounds` a
camera that would back through a wall stops there and widens the lens. `bandOf(aspect)` names the window's shape
(narrow, wide, ultrawide) for a game's per-shape adjustments; `lensFor` is the lens rule alone.

`useCameraRig({ pose, loan, sway, adjust, onArrive })` asks `pose(aspect)` every frame and glides there on real time
(`Glide`: Hermite, arriving at rest, with a carried speed capped so it never overshoots; a new pose mid-glide
`retarget`s from where the camera is). At rest the view leans toward the pointer (`lean`, eased at 2.2/s, held while
the button is down) scaled by the player's `sway`. `adjust(shot, frame)` changes the shot after the glide and before
the lean: an edge glance (`stepGlance`, `glanceAim`) goes there. The rig sets the stage's focus from the pose, eased
along the glide. Under reduced motion glides are cuts and there is no lean. `createCameraLoan(canLend)` lends the
camera to something else (a close-up, a `Turntable` shot); the rig glides on from wherever it was given back.
`samplePath(keys, t)` is a scripted camera path: Catmull-Rom through keys in time, with rests.

`usePickFilter(hits => ...)` gates which of r3f's hits may take the pointer; tag a subtree's root in `userData` and
use `withoutTagged(hits, tag)` to switch it off.

`makeEyes` and `stepEyes` ease the eye's adaptation between a bright and a dim place (feed `setAdaptation`).

## Labels

```ts
useEffect(() => pinLabel(element, [x, y, z], () => visible), []);
```

`<LabelProjector />` (inside the stage, priority 0.6: after the rig, before the stage draws) places every pinned DOM
element over its world point each frame, in whole pixels, hidden behind the camera or well off screen. Style the
elements as the game likes; the projector only sets `transform` and `visibility`. `createLabelBoard()` makes a board
of its own.

## Helpers

- `textTexture({ width, height, draw, ready })`, `redraw`, `fontsReady(faces)`, `cssFont`: words on a canvas
  texture, redrawn once the game's fonts load.
- `compileFor`, `compileInTurn`: compile ahead against the right target, one at a time (works round two r187 faults;
  see the comment).
- `runIdle(generator, { urgent })`: a long build in idle time, a few milliseconds a slice.
- `clipMesh(geometry, fields)`, `meshArea`: cut a mesh by signed fields, welded at the cut.
- `SpritePool`: a ring of GPU-flown point sprites (chips, sparks, dust).
- `Turntable`, `closeIn`: lift a thing into view, turn it with flick inertia, put it down.
- `spring`, `stepSpring`, `toMin`, `toMax`: a spring between hard stops that knocks and settles.
- `planOf`, `moveAt`, `spanOf`: a job's moves fitted to the economy's timer.
- `createRefCache`, `variantKey`: hold geometry and materials once; tell apart materials that build different shaders.
- `clamp01`, `easeOut`, `easeInOut`, `smooth`, `follow`, `approach`.
- TSL (`tsl.ts`): `triplanar`, `triplanarNormal` (whiteout blend), `tangentNormal`, `boxFaces`, `boxProjection`,
  `bumpNormal` (bump from a height in metres, no UVs), `derivativeFade`, `whenLit`, `pieceSeed`, `cellHash`,
  `fresnel`, `bayer4` (with `bayer4At` on the CPU).

## What stays the game's

Every mesh and material role, every texture and scan, the lights and their state, which objects cast caustics,
stations and which pose each wants, the sky, set dressing, content-specific geometry, the director's beats, audio,
and the DOM: the boot cue, the HUD, the settings sheet, the labels' look. The engine names none of them.
