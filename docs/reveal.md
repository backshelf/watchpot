# A reveal

`useRevealSequence` (or `<RevealSequence>` as a render prop) is the director for every pull, without a look: the box,
the lid, the deal, one face per tap, the big rung charging before it turns, Skip, and the best rung. It knows no rarity
name; every step reads a payload's rung on the game's ladder. It renders nothing: the game draws the room, the cards and
the closing lot, and plays every effect from its callbacks.

Example: [`examples/reveal.tsx`](examples/reveal.tsx).

- Give it `ladder` (lowest first), a stable `payloads` array, and a `result` that changes when the game opens again;
  `gift` skips the box.
- It hands back `state` (`phase`: `chest`, `opening`, `cards`, `summary`), `stage` (the payload holding the centre),
  `charging`, `tone` (the rung the room should take: it never falls back), `best`, `remaining`, and the moves: `tap`
  (ignored until the face in the centre has shown), `skip`, `face(i)` (a renderer's flip reached edge-on), and
  `onKeyDown` for the stage (Enter, Space, ArrowRight).
- The moments: `onOpening` (the lid), `onCharge` (a big rung lifts face down: its swell), `onTurn` (a face starts to
  turn: its sting), `onLand` (the face has shown: its burst, its words; `landing.big` and `landing.top` from the
  ladder's steps), `onSummary`.
- From the middle of the ladder up the face charges before it turns (`BIG_STEP`, `chargeMs`); pass `charge` to time
  it yourself. Under reduced motion every beat is a short fade (`REVEAL_TIMING.reducedStep`).
- The pure pieces are exported too: `reduceReveal`, `nextDelay`, `cardRole`, `cardPose` and `cardLayer` (a fan of
  backs, a stage, a shelf, in pixels from the stage's centre), `printKeyOf`, and the pity ladder (`pityRungs`,
  `nearestGuarantee`, `shelfLight`).
- Put it in a `Dialog` from `watchpot/ui` through a `Portal` for a true modal; the effects (`burst`, `Flash`,
  `useShake`) come from `watchpot/kit` and take the game's class.
