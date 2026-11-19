// Shaders, step 1: one surface. A fragment of GLSL and the canvas that runs it, the five lines the engine puts in
// front of every fragment, and a number written inside the shader itself (which is why moving it builds a new one).
import * as shader from "watchpot/shader";
import { Code, Controls, definePage, Note, Panel, slider, Term, Try } from "../../kit";
import { OneSurface } from "../demos/surface-demo";

function TheSurface() {
  return (
    <Panel title="One surface">
      <OneSurface />
      <Controls />
    </Panel>
  );
}

export default definePage({
  title: "A surface: the 2D canvas",
  idea: (
    <>
      A surface is a canvas and a fragment: a small program the graphics card runs for every pixel of every
      frame, to answer "what colour should this one be?". The engine draws it well; the look is the GLSL you
      write.
    </>
  ),
  game: {
    file: "shader-surface.ts",
    store: false,
    clock: false,
    keep: "memory",
    externals: { "watchpot/shader": shader },
  },
  params: {
    drift: slider({
      at: "DRIFT",
      find: "= 0.12",
      token: "0.12",
      min: 0,
      max: 0.6,
      step: 0.02,
      label: "Drift",
    }),
  },
  code: {
    surface: { at: "SURFACE" },
    drift: { at: "DRIFT" },
    still: { at: "STILL" },
  },
  Panel: TheSurface,
  Body: () => (
    <>
      <p>
        A <Term id="shader">shader</Term> is a program that runs on the graphics card, beside the page rather
        than on its processor. This section is about one kind of it. A{" "}
        <Term id="fragment-shader">fragment shader</Term> is run once for every pixel of a rectangle, every
        frame, and answers one question: what colour is this pixel? The rectangle is a canvas, and a canvas
        with a fragment in it is what this section calls a surface.
      </p>
      <p>
        The engine's entry for all of this is <code>watchpot/shader</code>, and its surface is{" "}
        <code>ShaderCanvas</code>. Give it a fragment and it fills its element with what the fragment draws:
        sized by CSS, drawn only while it is on screen and the tab is showing, held on one frame when the
        player asks for less movement, and replaced by a CSS still on a machine without WebGL2. The plate in
        the panel is one.
      </p>

      <h2>The head in front of every fragment</h2>
      <p>
        A fragment is not a whole program. The engine writes a head in front of yours: the version, the
        precision, and the values it will keep up to date for you.
      </p>
      <pre className="guide-snippet">
        <code>{`#version 300 es
precision highp float;
precision highp int;
uniform float u_time;
uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform vec2 u_pointer;
out vec4 fragColor;`}</code>
      </pre>
      <p>
        That is the engine's <code>SHADER_HEAD</code>, from <code>src/shader/head.ts</code>;{" "}
        <code>docs/shader.md</code> lists the same four values and the output in prose. <code>u_time</code> is
        seconds, counted only while the canvas draws. <code>u_resolution</code> is the canvas in pixels, and{" "}
        <code>u_pixelRatio</code> how many device pixels there are to a CSS pixel. <code>u_pointer</code> is
        the pointer from the bottom-left, 0 to 1, and it is only tracked if you ask for it.{" "}
        <code>fragColor</code> is where your <code>main</code> writes the answer.
      </p>

      <h2>One surface, whole</h2>
      <p>Here is all of the surface in the panel:</p>
      <Code id="surface" />
      <p>
        <code>compose</code> puts the chunks you name in front of your code, each once, and each after the
        chunks it needs. <code>UV</code> is where <code>screenUv()</code> and <code>centeredUv()</code> come
        from; <code>FBM</code> is the noise field; <code>IGN</code> is a dither, one last line of ±1/255 that
        stops a smooth gradient banding on an eight-bit screen.
      </p>
      <p>
        Read <code>main</code> from the inside out. <code>gl_FragCoord</code> is the pixel being drawn,
        counted from the canvas's bottom-left corner. <code>centeredUv()</code> turns that into a square field
        with the middle at zero and the short side running -0.5 to 0.5, so the shapes stay the same shapes at
        any canvas size. <code>fbm</code> gives a wobbly height. <code>level</code> is that height in units of
        0.07, and <code>at</code> is how many pixels away the nearest whole multiple of it is: the contour
        lines. The <code>dFdx</code> and <code>dFdy</code> are how fast the field changes across the screen,
        which is what keeps a line one device pixel wide however steep the slope under it.
      </p>

      <h2>A number in the shader</h2>
      <p>The movement is one number, and it is written into the fragment's own text:</p>
      <Code id="drift" />
      <p>
        <code>compose</code> builds that string once, when the module loads, so the drift is a number inside
        the text the driver compiles. Move the slider and the number in the string changes: the canvas sees a
        different fragment, throws the old program away and builds a new one. For a number you change while
        you are writing the game, that is fine. For one the game changes while it runs, it is the wrong tool:
        the next page is the right one.
      </p>
      <Controls />
      <Try>
        <li>Watch the contour lines drift across the plate.</li>
        <li>
          Slide Drift to 0. The field stops dead, and the canvas goes on drawing sixty frames a second: a
          shader is drawn whether or not what it draws moves.
        </li>
        <li>
          Slide it to 0.6 and the lines race. The number in the listing is filled while it is not the file's.
        </li>
        <li>
          Press Held. The last frame stays and the clock stops with it; press Drawing and it carries on from
          where it stopped, not from where it would have been.
        </li>
      </Try>

      <h2>What the plate shows before the first frame</h2>
      <p>
        The page you are reading was drawn to HTML by a process with no graphics card at all, and the plate
        had to look like something before your browser had drawn a single frame. So every surface on these
        pages has a CSS version of itself under it:
      </p>
      <Code id="still" />
      <p>
        It is a gradient in the surface's own colours, and it is what the plate shows when the canvas cannot
        run at all. Page 4 is about that, and about the two props that make it work.
      </p>
      <Note title="One canvas is one context">
        <p>
          The plate here is a canvas of its own, and a browser keeps about sixteen of those alive at once.
          That is plenty for one backdrop, and far too few for a shimmer on every card. Page 3 is the pool
          that solves it.
        </p>
      </Note>
    </>
  ),
  prev: { href: "../index.html", title: "The docs", label: "Back to" },
});
