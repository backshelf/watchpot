// Sheet six: `watchpot/shader` as a lab. A specimen sheet of the chunk library (twelve tiles on one context), the
// chosen specimen large on a canvas of its own with its text in an editor, and uniforms pushed with no render.
import { useRef, useState } from "react";
import { useShaderTokens } from "watchpot/shader";
import { useMediaQuery } from "watchpot/ui";
import { SPECIMENS } from "../shaders/specimens";
import { Bench } from "./shaderlab/Bench";
import { Sheet } from "./shaderlab/Sheet";

const TOKENS = ["--paper", "--ink", "--live"] as const;

export function ShaderLab() {
  const scope = useRef<HTMLElement>(null);
  const inks = useShaderTokens(scope, TOKENS);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [selected, setSelected] = useState(0);
  const specimen = SPECIMENS[selected] ?? SPECIMENS[0];

  return (
    <section className="sheet section" id="shader" aria-labelledby="shader-title" ref={scope}>
      <header className="section__head">
        <h2 id="shader-title">Your GLSL, run well.</h2>
        <p className="section__lede">
          The engine ships the container and a library of GLSL chunks to build from; the look is the game's
          own fragment shader. It imports React and nothing else, no shader package. Each plate below is a
          fragment composed from those chunks, in this page's two inks.
        </p>
      </header>

      <div className="slab">
        <Sheet inks={inks} reduced={reduced} selected={selected} onSelect={setSelected} />
        {specimen ? <Bench specimen={specimen} inks={inks} reduced={reduced} /> : null}
      </div>

      <dl className="tb">
        <div>
          <dt className="lettering">Entry</dt>
          <dd className="num">watchpot/shader</dd>
        </div>
        <div>
          <dt className="lettering">Imports</dt>
          <dd className="num">react</dd>
        </div>
        <div>
          <dt className="lettering">Recipe</dt>
          <dd>
            <a href="./docs/shader.html">Shaders for feel</a>
          </dd>
        </div>
        <div>
          <dt className="lettering">Example</dt>
          <dd>
            <a href="./docs/examples/shader.tsx.html">examples/shader.tsx</a>
          </dd>
        </div>
      </dl>
    </section>
  );
}
