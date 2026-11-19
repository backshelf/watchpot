// Shaders, step 2: uniforms. The values a surface is told rather than compiled with: the game's numbers (heat, a
// pulse, how far a transition has run) and its colours, read from the page's design tokens.
import * as shader from "watchpot/shader";
import { Code, Controls, definePage, Note, Panel, slider, Term, Try } from "../../kit";
import { ToldSurface } from "../demos/uniforms-demo";

function TheToldSurface() {
  return (
    <Panel title="A surface, told things">
      <ToldSurface />
      <Controls />
    </Panel>
  );
}

export default definePage({
  title: "Uniforms: what the surface is told",
  idea: (
    <>
      A uniform is a value the shader reads that is the same for every pixel of a frame: the time, a heat, how
      far a transition has run. The game sets it from JavaScript and the shader reads it, with nothing
      compiled again.
    </>
  ),
  game: {
    file: "shader-uniforms.ts",
    store: false,
    clock: false,
    keep: "memory",
    externals: { "watchpot/shader": shader },
  },
  params: {
    heat: slider({
      at: "UNIFORMS",
      find: "u_heat: 0.35",
      token: "0.35",
      min: 0,
      max: 1,
      step: 0.05,
      label: "u_heat: how warm the pot is",
    }),
    progress: slider({
      at: "UNIFORMS",
      find: "u_progress: 1.0",
      token: "1.0",
      min: 0,
      max: 1,
      step: 0.1,
      label: "u_progress: how far the transition has run",
    }),
  },
  code: {
    tokens: { at: "TOKENS" },
    uniforms: { at: "UNIFORMS" },
    inks: { at: "inkUniforms" },
    surface: { at: "SURFACE" },
    still: { at: "STILL" },
  },
  Panel: TheToldSurface,
  Body: () => (
    <>
      <p>
        Page 1's number lived in the shader's text, so moving it built a new program. Almost nothing a game
        wants to change works that way: the pot gets warmer, a big moment lands, a screen opens, and the
        shader should answer on the next frame, not compile. The answer is the third kind of value a fragment
        sees: a <Term id="uniform">uniform</Term>.
      </p>
      <p>
        A uniform is a value a shader reads that is the same for every pixel of one frame. The four in the
        head (<code>u_time</code>, <code>u_resolution</code>, <code>u_pixelRatio</code>,{" "}
        <code>u_pointer</code>) are the canvas's own, kept up to date for you. Anything else is yours: you
        declare it in the GLSL, and you pass it in a plain object on the canvas's <code>uniforms</code> prop.
      </p>

      <h2>The game's numbers</h2>
      <p>Two of the game's numbers, as the example writes them:</p>
      <Code id="uniforms" />
      <p>
        On the other side of the shader, the declarations say what they are:{" "}
        <code>uniform float u_heat;</code> and <code>uniform float u_progress;</code>.{" "}
        <code>uniformDecls</code> writes those lines from the same names, so the two can never drift apart.
        Here is the surface that reads them:
      </p>
      <Code id="surface" />
      <p>
        <code>u_heat</code> scales how far the field is warped and how far it is mixed, so the whole plate
        warms. <code>u_progress</code> is compared against an ordered-dither threshold: at 1 the cover is gone
        and the surface is showing; at 0 the cover is whole. Every value in between is a scattering of ink,
        which is how a screen comes and goes without a fade to mud.
      </p>
      <Controls />
      <Try>
        <li>Slide u_heat from 0 to 1: the field goes from flat to broken up, and no program is built.</li>
        <li>
          Slide u_progress down to 0 and the cover closes over the surface a dither at a time; bring it back
          to 1 to open it.
        </li>
        <li>Press "A big moment": a ring runs out from the middle and fades. Nothing re-renders to do it.</li>
      </Try>

      <h2>A value that changes every frame</h2>
      <p>
        A uniform set as a prop is compared by value, and a new one draws a frame at once. Pushing a value
        sixty times a second through React would be sixty renders, so the engine has a second way in: the
        canvas's handle. From <code>docs/shader.md</code>:
      </p>
      <pre className="guide-snippet">
        <code>{`createPulse(decayMs, now) is one number that jumps to 1 on bump() and falls back to 0;
usePulseUniform(handleRef, pulse) feeds it to a canvas as u_pulse a frame at a time,
with no React render.`}</code>
      </pre>
      <p>
        That is the engine's <code>Pulse</code>, an envelope with no clock and no React of its own. The ring
        on "A big moment" is one: the press only calls <code>bump()</code>, and the hook does the rest.
      </p>

      <h2>Colours are values too</h2>
      <p>
        Which brings the surface's inks. They are uniforms like any other, and the values come from the page's{" "}
        <Term id="token">design tokens</Term>: CSS custom properties, read at the canvas's element and passed
        straight in. A colour token arrives as <code>#rrggbbaa</code>, and a hex string is exactly what a{" "}
        <code>vec4</code> uniform takes.
      </p>
      <Code id="tokens" />
      <p>
        The hook that reads them is <code>useShaderTokens(scope, TOKENS)</code>, and its contract is worth
        having in full, from <code>docs/shader.md</code>:
      </p>
      <pre className="guide-snippet">
        <code>{`useShaderTokens(ref, ["--ground", "--glow"]) reads those custom properties at the element as
#rrggbbaa (any CSS colour, oklch() included), null until all are colours, and again
when data-theme, data-scheme, a class or a style changes on it or an ancestor. Pass
them straight in: a hex string uniform is a vec4.`}</code>
      </pre>
      <p>
        That is what the two jobs of the hook are. <code>null</code> means "not a colour yet", which is why
        the plate shows its <code>STILL</code> in the build and on the first frame instead of a black
        rectangle. And reading again on a change is why a scheme switch recolours the surface: the page's dark
        scheme redefines the same tokens, the values are read again, and the uniforms are new ones.
      </p>
      <Code id="inks" />
      <p>
        Switch "The surface's inks" to "A game's" in the panel: those are three tokens written on the element
        around the canvas, and the surface follows them at once. Switch the page's own scheme in the masthead
        and it follows that too. No shader was built for either.
      </p>
      <Code id="still" />

      <Note title="When a uniform's type is not obvious">
        <p>
          Most values say what they are: a number is a <code>float</code>, a colour string a <code>vec4</code>
          , and an array of two, three or four a <code>vec2</code>, <code>vec3</code> or <code>vec4</code>.
          Two cannot say: an <code>int</code>, which a JavaScript number would send as a <code>float</code>,
          and a<code>float[8]</code>, which has no length to infer from its values. Give the canvas a{" "}
          <code>kinds</code> map for those, and leave the rest implicit.
        </p>
      </Note>
    </>
  ),
});
