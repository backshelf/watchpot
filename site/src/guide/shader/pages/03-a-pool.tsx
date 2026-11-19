// Shaders, step 3: a pool. Many small surfaces, one WebGL context, and a budget of how many of them animate at once.
import * as react from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as shader from "watchpot/shader";
import { Code, definePage, Note, Panel, Term, Try } from "../../kit";
import { ManySurfaces } from "../demos/pool-demo";

function ThePool() {
  return (
    <Panel title="A pool of surfaces">
      <ManySurfaces />
    </Panel>
  );
}

export default definePage({
  title: "A pool: many surfaces, one budget",
  idea: (
    <>
      A browser keeps about sixteen WebGL contexts alive, and one canvas is one context. A game wants a
      shimmer on every card, so the pool draws every tile on a context of its own, animating only a budget of
      them at a time.
    </>
  ),
  game: {
    file: "shader-pool.tsx",
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
    budget: { at: "MAX_LIVE" },
    tints: { at: "TINTS" },
    tile: { at: "TILE" },
    album: { at: "Album" },
  },
  Panel: ThePool,
  Body: () => (
    <>
      <p>
        Page 1's plate is a canvas of its own, and it costs the browser a WebGL context to draw it. A browser
        keeps about sixteen of those alive; past that it starts taking old ones away, and a surface that had
        one is drawing into nothing. Sixteen is plenty for a backdrop and a hero, and nowhere near enough for
        a game that wants a shimmer on every card in a collection, a glow on every button and a foil on every
        reward.
      </p>
      <p>
        So there is a second way in. <code>ShaderPool</code> keeps one context of its own and draws every{" "}
        <code>ShaderTile</code> inside it: each tile's frame is drawn on the pool's context and copied into
        the tile's own little 2D canvas, which needs no context at all. A hundred tiles are a hundred and one
        canvases and one WebGL context.
      </p>

      <h2>The budget</h2>
      <p>
        One context is cheap; a hundred surfaces animating at sixty frames a second is not. The pool takes a
        budget:
      </p>
      <Code id="budget" />
      <p>
        At most that many tiles animate at once. When a new one becomes live the oldest stops, holding the
        last frame it drew: not blank, not reset, just still. The panel's stepper sets a budget of its own to
        watch it happen. A tile that scrolls off screen sleeps too, and the pool draws nothing for the tab
        while it is hidden.
      </p>
      <p>The tiles themselves are ordinary:</p>
      <Code id="tile" />
      <p>
        <code>u_tint</code> and <code>u_speed</code> make each one its own: the tint alternates between two of
        the page's tokens, and the speed steps up down the grid so a reader can see which tiles are moving.
      </p>
      <Code id="tints" />
      <p>
        Every tile is handed the same fragment, and the pool builds one program for it and shares it: the
        string is the program's key. A grid of nine slightly different surfaces is nine programs or one,
        depending on whether their fragments differ.
      </p>

      <h2>The whole grid</h2>
      <Code id="album" />
      <p>
        <code>aria-hidden</code> on the grid because every tile is decoration: a shader is a look, and a
        screen reader has nothing to read in it. That is the canvas's own rule, applied to the grid around
        them.
      </p>
      <Try>
        <li>Add surfaces up to sixteen. Past the budget the oldest ones stop moving, one at a time.</li>
        <li>
          Set "Animate at once" to 1. One tile moves at a time, and it is always the newest one added: the
          budget belongs to what arrived last.
        </li>
        <li>Bring it back to 12 and watch the grid come alive again.</li>
      </Try>

      <Note title="A pool is for small things">
        <p>
          A full-screen backdrop wants its own <code>ShaderCanvas</code>: one context, one big surface, and
          the pixel budget spent where the reader is looking. The pool is for the small ones. Where a card's
          foil is the only shader on the page, one <code>ShaderTile</code> in a pool of one is still the
          cheaper way to draw it: it costs no context of its own, only its share of the pool's.
        </p>
      </Note>
      <Note title="The pool and reduced motion">
        <p>
          Give the pool <code>reduced</code> as well as the game's canvases. Under it every tile draws the one
          frame at its <code>reducedTime</code> and holds, and nothing in the grid moves; the pool simply
          stops asking for frames. That is page 4's business, on a surface of one.
        </p>
      </Note>
      <p>
        The section's last page puts the pieces together: a surface built from one flat colour to a finished
        look, then the same fragment four times over in a pool, with the page's <Term id="token">tokens</Term>{" "}
        read once for all of them.
      </p>
    </>
  ),
});
