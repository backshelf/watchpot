// Shaders, step 4: what a canvas does when it cannot run. The still that takes its place, the error that says why in
// the driver's own words, reduced motion's one held frame, and the cap on the pixels drawn.
import * as react from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as shader from "watchpot/shader";
import { Code, definePage, Note, Panel, Term, Try } from "../../kit";
import { LimitsDemo } from "../demos/limits-demo";

function TheLimits() {
  return (
    <Panel title="A surface that cannot run">
      <LimitsDemo />
    </Panel>
  );
}

export default definePage({
  title: "Still, reduced motion, and the cap",
  idea: (
    <>
      A canvas does not always run: the machine may have no WebGL2, a fragment may not compile, or the player
      may have asked for less movement. The engine has a prop for each of those, and a CSS still for what
      takes the canvas's place.
    </>
  ),
  game: {
    file: "shader-limits.tsx",
    store: false,
    clock: false,
    keep: "memory",
    externals: {
      react,
      "react/jsx-runtime": jsxRuntime,
      "watchpot/shader": shader,
    },
  },
  code: {
    surface: { at: "SURFACE" },
    broken: { at: "BROKEN" },
    canvas: { at: "Canvas" },
    still: { at: "STILL" },
  },
  Panel: TheLimits,
  Body: () => (
    <>
      <p>
        Every surface so far has assumed the canvas runs. On a player's machine it sometimes will not. An old
        laptop, a locked-down browser, a driver that refuses your GLSL: the canvas element is there, and
        nothing comes out of it. A game that draws a plate of nothing at the top of its screen looks broken,
        so the engine asks you for a <Term id="still">still</Term>: the same idea in CSS, drawn in the
        canvas's place.
      </p>
      <p>The surface in the panel is page 2's, reduced to its essentials:</p>
      <Code id="surface" />
      <Code id="canvas" />
      <p>
        Four props are doing the work. <code>still</code> is what renders when there is no shader to render: a
        node, usually a div with the same gradient the CSS version of the surface would be.{" "}
        <code>onError</code> is told why, in the driver's words. <code>reduced</code> holds one frame at{" "}
        <code>reducedTime</code>. <code>maxPixels</code> caps what is drawn, and it comes later on this page.
      </p>

      <h2>When the fragment does not compile</h2>
      <p>
        Here is the same surface with one argument wrong. <code>fbm</code> counts its octaves with an{" "}
        <code>int</code>, and this passes <code>3.0</code>:
      </p>
      <Code id="broken" />
      <p>
        Switch "The fragment" to "One line broken". The plate holds the still, and under it the driver's log
        arrives through <code>onError</code>. Read the line number: it is <code>main:5</code>, not{" "}
        <code>0:127</code>. The count starts after the mark <code>compose</code> leaves between its chunks and
        your code, and it counts your own text line for line: the two uniform declarations, the blank line,{" "}
        <code>void main() {"{"}</code>, and then the line that is wrong. That is the whole reason{" "}
        <code>compose</code> leaves a mark there.
      </p>
      <p>
        Switch it back: the canvas was never broken, only this fragment, and a new fragment gets a fresh try.
        A development build is where you want <code>onError</code> wired to <code>console.warn</code>; in a
        shipped game it is usually enough to leave it out and let the still do the talking.
      </p>

      <h2>The player asked for less movement</h2>
      <p>
        <Term id="reduced-motion">Reduced motion</Term> is a setting a player can ask for at the operating
        system, and a game can offer too. Under it, a canvas draws one frame and holds: no loop, no clock, no
        frames at all. The frame it holds is <code>reducedTime</code>, a moment of the surface's own timeline
        chosen to look good frozen; the default of 0 is the first frame, which is usually the emptiest one.
      </p>
      <p>
        Switch "Reduced motion" to Holding and watch the plate: the field stops, and it has stopped at four
        seconds in, because that is what the example asked for. A pool takes the same prop, and holds every
        tile.
      </p>

      <h2>The cap</h2>
      <p>
        <code>maxPixels</code> is a budget, not a size. The canvas fills its element whatever the budget is;
        past the budget the engine lowers the pixel ratio instead, drawing fewer, larger pixels and letting
        the browser scale them up. A phone at three device pixels per CSS pixel would otherwise spend nine
        times what a desktop spends on the same plate.
      </p>
      <p>
        Switch "The cap" to 120,000 and look closely: the contour lines go soft and the dither coarsens,
        because the plate is now drawn in about a fifth of the pixels it fills. A full-screen backdrop at a
        million is plenty; a card's foil needs a tenth of that. <code>dpr</code> is the other half of the same
        budget, a hard ceiling on the ratio itself.
      </p>
      <Try>
        <li>Switch the fragment to the broken one and read the log: it names the line in your own code.</li>
        <li>Switch it back: it draws again, with no reload.</li>
        <li>Switch reduced motion on: one frame, held at four seconds, and the clock with it.</li>
        <li>Take the cap down to 120,000: the surface softens as the ratio drops to fit the budget.</li>
      </Try>

      <h2>The other reasons a canvas does not run</h2>
      <p>
        The log has one more shape. A machine with no WebGL2 at all never gets as far as your fragment, and
        the error is the plain sentence <code>WebGL2 is unavailable</code>; the same still takes its place.
        There is nothing to fix in your GLSL for that one.
      </p>
      <Code id="still" />
      <Note title="A lost context comes back">
        <p>
          Browsers also take a context away from a tab that has been in the background a long time, and give
          it back when the tab returns. Neither of those is an error: the canvas asks to be restored, rebuilds
          its program when it is, and draws again. Your <code>onError</code> hears nothing about it, and the
          still is never shown.
        </p>
      </Note>
    </>
  ),
});
