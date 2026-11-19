// Shaders, step 5: one surface, in the order it is built. A flat colour, then a field of contour lines, then the
// page's inks and the game's numbers on the same fragment — with the finished thing live at the end of the page.
import * as shader from "watchpot/shader";
import { Code, Controls, definePage, Note, Panel, slider, Term, Try } from "../../kit";
import { Finished } from "../demos/finished";
import { Worked } from "../demos/worked-demo";

function TheWorkedSurface() {
  return (
    <Panel title="The surface, so far">
      <Worked />
    </Panel>
  );
}

export default definePage({
  title: "A worked surface, blank to finished",
  idea: (
    <>
      One surface, in the order it is built: a colour, then a field, then the game's inks and numbers, then
      the same fragment four times over in a pool. Each step is the one before it with a single thing added.
    </>
  ),
  game: {
    file: "shader-worked.ts",
    store: false,
    clock: false,
    keep: "memory",
    externals: { "watchpot/shader": shader },
  },
  params: {
    depth: slider({
      at: "UNIFORMS",
      find: "u_depth: 0.35",
      token: "0.35",
      min: 0,
      max: 1,
      step: 0.05,
      label: "u_depth: how deep into the run",
    }),
  },
  code: {
    blank: { at: "BLANK" },
    field: { at: "FIELD" },
    warm: { at: "WARM" },
    uniforms: { at: "UNIFORMS" },
    tokens: { at: "TOKENS" },
    still: { at: "STILL" },
  },
  Panel: TheWorkedSurface,
  Body: () => (
    <>
      <p>
        The four ideas so far, in the order a surface is actually built. The panel's three stages are one
        surface at each step, and each step is a fragment you can read whole: nothing appears that the step
        before it did not have, and one thing is added at a time.
      </p>

      <h2>One colour</h2>
      <p>
        The first version of any surface is a colour, and the point of it is that the canvas works at all: one
        frame drawn, a rectangle of the right colour in the right place.
      </p>
      <Code id="blank" />
      <p>
        There are no chunks and no uniforms in it. <code>compose</code> takes code as readily as chunks, so
        this is a whole fragment as the canvas wants it. Step the panel to "One colour" and it fills the
        plate.
      </p>

      <h2>A field</h2>
      <p>
        Then something worth looking at: a noise field warped by another, drawn as its contour lines. This is
        the section's one drawing trick, and the contour is three lines of it:
      </p>
      <Code id="field" />
      <p>
        <code>centeredUv()</code> is a square field with the middle at zero, so the cells stay the same shape
        at any canvas. <code>domainWarp</code> pushes that field along a second, slower field: straight
        contour lines come out as the ragged ones a survey map has. The third line is the contour itself.{" "}
        <code>level</code> is the field in units of 0.09; <code>at</code> is the distance, in device pixels,
        to the nearest whole multiple of those units; and dividing by the field's own slope (<code>dFdx</code>
        , <code>dFdy</code>) is what makes a line one pixel wide on a steep face and on a flat one.
      </p>

      <h2>The inks and the numbers</h2>
      <p>
        Last, the surface becomes the game's rather than the example's: its tokens for the colours, uniforms
        for the numbers.
      </p>
      <Code id="tokens" />
      <Code id="uniforms" />
      <Code id="warm" />
      <p>
        Same field, three things added. The colour is <code>oklabMix</code> between the page's paper and its
        ink, which mixes evenly where a plain <code>mix</code> would go muddy through the middle. The contour
        lines and the high side of the field take the live tone. And the numbers: <code>u_depth</code> makes
        the field finer and the mix stronger as a run goes on, <code>u_heat</code> warps it harder,{" "}
        <code>u_pulse</code> is the ring from page 2.
      </p>
      <p>
        Step the panel through all three: the plate is the same plate, and the surface is the same drawing, at
        three distances from finished.
      </p>
      <Code id="still" />
      <p>
        The still is the CSS version, from the same tokens, and it is what the plate showed in the build and
        shows now when the canvas cannot run (page 4).
      </p>

      <h2>The finished surface</h2>
      <p>
        Here is all of it at once: the last fragment, in the page's inks, its pulse pushed through the
        canvas's handle, and four more of it below at four depths on one pool. Drag "u_depth" and the large
        one and all four small ones move together: one uniform record, read once for each surface.
      </p>
      <Finished />
      <Controls />
      <Try>
        <li>Press "A big moment": a ring runs out over the plate, and the pulse costs no render.</li>
        <li>
          Slide u_depth from 0 to 1: the field tightens, the lines crowd, and the four small surfaces move
          with it.
        </li>
        <li>
          Switch the page's scheme in the masthead: the inks come from the page's tokens, so all five surfaces
          follow.
        </li>
      </Try>

      <h2>What is left to you</h2>
      <p>
        The engine ships the container and the chunks; the look is the GLSL. A surface is a fragment string
        and a still, a pool is a context and a budget, and every value that moves is a{" "}
        <Term id="uniform">uniform</Term> or a token. The rest is drawing.
      </p>
      <Note title="Next: the 3D stage">
        <p>
          Everything here is one rectangle of pixels. The engine's other surface is{" "}
          <code>watchpot/three</code>: a three.js scene, for the games that want depth, a model or a camera.
          The same instincts hold (the values come from the game, the colours from its tokens, the frame drawn
          only while it is on screen), and that page is still being written.
        </p>
      </Note>
    </>
  ),
  next: { href: "../shader.html", title: "Shaders for feel", label: "Reference" },
});
