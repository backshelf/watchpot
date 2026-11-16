// A 3D scene on watchpot/three: a spinning box on the stage, a quality switch, a label pinned over the box, and
// the camera gliding between two poses. Type-checked by `bun run verify`; it renders only in a browser.
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { type Mesh, MeshStandardNodeMaterial, type Object3D, type SpotLight } from "three/webgpu";
import {
  createFrameRate,
  createQuality,
  DEFAULT_TIERS,
  FpsCounter,
  framePose,
  LabelProjector,
  type Pose,
  pinLabel,
  Stage,
  StageBoot,
  useCameraRig,
  useQuality,
  useStage,
  useStageStatus,
  viewPrefs,
} from "watchpot/three";

// Device prefs: the tier, the frame cap, the view. A game names its keys; `?quality=low` overrides for one load.
const quality = createQuality({ key: "toy.quality", tiers: DEFAULT_TIERS, initial: "high" });
const frameRate = createFrameRate({ key: "toy.fps" });
const view = viewPrefs({ key: "toy.view", extra: { hints: true } });

/** Two framings of the box: from the front, and from up to one side. */
const front = (aspect: number): Pose =>
  framePose({ target: [0, 0.5, 0], yaw: 0, pitch: 12, distance: 3, fov: 40, box: [2, 1.5] }, aspect);
const above = (aspect: number): Pose =>
  framePose({ target: [0, 0.5, 0], yaw: 50, pitch: 40, distance: 2.5, fov: 40, box: [1.5, 1.5] }, aspect);

function SpinningBox() {
  const box = useRef<Mesh>(null);
  const stage = useStage();
  const [material] = useState(() => new MeshStandardNodeMaterial({ color: "#d08040", roughness: 0.6 }));
  useFrame(() => {
    // Pace-clock time: one `stage.clock.setScale(0)` holds this still with everything else.
    if (box.current && !stage.reduced) box.current.rotation.y = stage.clock.now() * 0.8;
  });
  return (
    <mesh ref={box} position={[0, 0.5, 0]} castShadow material={material}>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  );
}

function Rig({ closeUp }: { closeUp: boolean }) {
  useCameraRig({ pose: closeUp ? above : front, sway: () => view.get().sway });
  return null;
}

/** The god rays' light: a spot whose shadow map the stage's plain first frame creates. */
function Light({ onLight }: { onLight: (light: SpotLight | null) => void }) {
  const spot = useRef<SpotLight>(null);
  useEffect(() => {
    onLight(spot.current);
    return () => onLight(null);
  }, [onLight]);
  return <spotLight ref={spot} position={[1, 3, 1]} angle={0.6} penumbra={0.4} intensity={40} castShadow />;
}

/** The DOM cue over the canvas while the boot compiles: the game's own, from the stage's status. */
function BootCue() {
  const { boot, lost } = useStageStatus();
  if (lost) return <p role="alert">The graphics device was lost: reload to carry on.</p>;
  return boot === "ready" ? null : <p role="status">Loading</p>;
}

export function ToyScene() {
  const tier = useQuality(quality);
  const [closeUp, setCloseUp] = useState(false);
  const light = useRef<SpotLight | null>(null);
  const label = useRef<HTMLSpanElement>(null);
  const warm = useRef<Object3D[]>([]);

  // A DOM label pinned over the box's top: sharp text at the screen's own resolution.
  useEffect(() => (label.current ? pinLabel(label.current, [0, 1.15, 0]) : undefined), []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Stage
        quality={quality}
        frameRate={frameRate}
        view={view}
        camera={{ position: [0, 1, 3], fov: 40, near: 0.05, far: 50 }}
        post={{ light: () => light.current }}
        prePasses={({ first }) => {
          // A game's own pass (caustics, a mirror) renders here, before the picture.
          void first;
        }}
        consoleName="toyStage"
        overlay={<BootCue />}
      >
        <ambientLight intensity={0.2} />
        <Light
          onLight={(l) => {
            light.current = l;
          }}
        />
        <SpinningBox />
        <Rig closeUp={closeUp} />
        <LabelProjector />
        <StageBoot warm={() => warm.current} onReady={(t) => console.info("toy ready", t.ready)} />
      </Stage>
      <span ref={label} style={{ position: "absolute", left: 0, top: 0 }}>
        a box
      </span>
      <FpsCounter rate={frameRate} />
      <button type="button" onClick={() => setCloseUp((c) => !c)}>
        {closeUp ? "Step back" : "Look closer"}
      </button>
      <select value={tier} onChange={(e) => quality.set(e.target.value as typeof tier)}>
        {quality.names.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </div>
  );
}
