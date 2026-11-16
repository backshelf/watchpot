# Feel: answer the player, ration the machine

Late in an idle game a dozen systems run themselves and hundreds of things happen a minute. The feel has two jobs
that pull against each other: every deliberate press is answered where it happened, at once, and nothing the machine
does buries the page in celebrations. The pieces below are the mechanism for both; what plays (the sound, the mark's
look, the banner's words) is the game's.

- **Whose doing it was:** `createGestures` (`watchpot/kit`).
- **Answered where it happened:** `createMarks` and `kick` (`watchpot/kit`).
- **What changed:** `watchChanges` (`watchpot/core`), the state before and after diffed into the game's own events.
- **Figures that count up:** `Count` (`watchpot/kit`).
- **What plays when:** `createDirector` (`watchpot/kit`), a queue of cues by tier that coalesces, rations and
  downscales.

Nearby: anticipation (`Near`, `Marquee`) and printed read-outs are in [`ui.md`](ui.md); telling the player what
happened while they were away is in [`time-away.md`](time-away.md); a slow read of the store for decorative figures
is `useSampled` ([React](react.md)).

## Whose doing it was

`createGestures({ target?, recentMs?, now?, trusted? })` listens on the window in the capture phase. While a
person's gesture is being dispatched (a `pointerdown`, `pointerup`, `click`, `keydown` or `keyup` whose
`isTrusted` is set) `active()` is true, so a store change made inside it, read from a subscriber, is the player's.
A buy whose effect lands on the next pass is caught by `recent(withinMs?)`: a gesture began within `recentMs`
(700 by default).

- `point()` is where the last gesture landed: the pointer, or the middle of the focused control for a key; `target()`
  the element it was on. `pressPoint(e)` reads the same from a handler's event (the control's middle for a click a key
  made, `detail` 0) and `middleOf(el)` from an element.
- `answer(event?)` says something answered this gesture (a sound, a mark), and `answered()` asks, so a fallback
  click for an unanswered press stays quiet. A new press clears it; a held key's repeat does not. With an event, that
  event is remembered by identity (`answered(event)`), React's through its `nativeEvent`.
- `useGestures(options?)` is a tracker for as long as the component is mounted. `trusted` is how a test lets its
  synthetic events through.

```ts
const hand = createGestures();
store.subscribe((s, prev) => {
  if (s.bought > prev.bought) {
    if (hand.recent()) {
      const { x, y } = hand.point();
      marks.at(x, y, { kind: "buy" });
      play("buy");
      hand.answer();
    } else play("tick");
  }
});
```

## Answered where it happened

`createMarks(options)` is a pool of short-lived marks for one layer, made once at module level so any handler can
leave one; `<MarkLayer marks className? style? />` is the layer (fixed over the viewport by default, never taking the
pointer, `[data-mark-layer]`, hidden from assistive tech), attached while mounted.

- `marks.at(x, y, { kind?, step?, text?, className?, vars?, keyframes?, duration?, easing? })` leaves a mark at a client
  point (`hand.point()`, `pressPoint(e)`); `marks.on(el, options)` at an element's middle. Each is an `<i>` placed
  absolutely in the layer with `data-mark` (its kind), `--step` (how far up a streak: bigger, brighter) and `--n` (a
  counter, 0..15, for a tilt or a hue), its text if any, and the layer's `className` beside its own.
- **The run.** The Web Animations API on transform and opacity only (`compositorOnly` strips anything else, so a
  hundred marks never lay out the page). The default `markKeyframes` pops it up and lifts it as it fades, centred on
  its point; pass your own keyframes, a function of reduced motion, or `null` to leave the run to your CSS (it then
  lives `lifetime`, 1600 ms).
- **Bounded.** At most `max` (18) at once, the oldest going first; each removed by a timer when its run ends (a hidden
  tab still cleans up), its element pooled for the next. Nothing is made while the page is hidden or no layer is
  attached.
- **Reduced motion.** It only fades in place, for half the time.
- `kick(el, name = "bump", { gapMs? })` restarts a CSS animation on an element: `data-<name>` flips between `a` and
  `b` (key a keyframe on each), at most once per `gapMs` (160): a balance's pill kicking as a payout lands.

```css
.layer { z-index: 40; }
.ink[data-mark="buy"] { width: calc(18px + var(--step) * 3px); aspect-ratio: 1; border: 2px solid var(--ink); border-radius: 50%; }
.pill[data-bump="a"] { animation: kick-a 160ms; }
.pill[data-bump="b"] { animation: kick-b 160ms; }
```

## What changed

`watchChanges(store, options)` subscribes once (anything with zustand's `subscribe(listener(next, prev))`) and runs
`rules` over every change. A rule is `(next, prev, emit, tools) => void`: it compares the two states and emits the
game's own events, a union it types. `on` hears them in the order they were emitted. One watcher per page area keeps
the whole of "what counts as news" in one file, beside the content it names.

- **Settling.** A load, an import or a fresh profile is not a win. `jumped(next, prev)` names such a change (the
  played time went back, a count leapt by more than a pass can make), and an import or a profile reset on an
  engine store is always one, with no test of the game's (`store.profileSwaps()`); it opens a settling window of `settleMs`
  (2000 by default), and so does the start of the watch (`startMs`, by default `settleMs`). Nothing a rule emits
  inside it goes out (`tools.settling` says so). By default rules still run, so a rule can acknowledge what arrived
  with the load and `spare`, `best` and `streak` take it in; `whileSettling: "skip"` leaves every rule (and so its
  windows and bests) alone until the window ends, and a rule given as `{ rule, whileSettling: "run" }` runs anyway
  (one that acknowledges things silently). `watch.settle(ms?)` opens one by hand.
- **Tools.** `spare(kind, ms)` is yes at most once per window per kind (a machine's win, now and then);
  `best(kind, value)` is the best it beat when the value beats the best seen since the start or the last jump, else
  undefined (the first sighting only sets it; Decimals, so a best past 1e308 compares, and a beaten 0 is still
  truthy), for "up from the old best"; `defineStreak(kind, windowMs)` is 0, then one more each time the
  kind comes back within the window (a sound climbing a ladder through a quick run of buys).
- **Reads.** `crossedMark(marks, before, after)` is the highest mark the change crossed (a milestone, a release at a
  count of runs), undefined for none; `newKeys(before, after)` the ids that appeared in a record (a first).
- **Safety.** A rule or a listener that throws is reported to `onError` (default `console.error`) and the rest still
  run: a bug in feedback never surfaces in the action that changed the store.

```ts
type Win = { kind: "milestone"; id: string; at: number } | { kind: "found"; id: string };

const rules: WatchRule<GameState, Win>[] = [
  (s, prev, emit) => {
    for (const g of GENERATORS) {
      const at = crossedMark(MILESTONES, prev.owned[g.id] ?? 0, s.owned[g.id] ?? 0);
      if (at !== undefined) emit({ kind: "milestone", id: g.id, at });
    }
  },
  (s, prev, emit) => {
    for (const id of newKeys(prev.found, s.found)) emit({ kind: "found", id });
  },
];
watchChanges(store, { rules, on: cheer, jumped: (s, prev) => s.playedMs < prev.playedMs - 1000 });
```

## Figures that count up

A payout lands harder rolled up like a slot machine's win than printed. `<Count to from? ms? delay? format ease?
onLand? skip? className? style? />` rolls its text from `from` to `to` over `ms` (900), slow at the end
(`countEase`), then sits.

- **Any size.** Each frame works out one figure, `countBetween(a, b, t)`: straight below a thousand, in log space
  above it, so 1 to 1e300 shows every order of magnitude and a figure past 1e308 rolls through its exponent. A roll
  up from 0 (or anything under 1) to a large figure goes in log space from 1, so it climbs through the orders of
  magnitude too instead of landing most of the figure in the first frames. Nothing
  counts through the value; a frame costs one `format` whatever the size, and a run never takes more than
  `countFrameCap(delay + ms)` frames (a 240 Hz screen's worth), so a stalled or racing clock still lands.
- **No render per frame.** The text is written to the span directly; React renders it once.
- **Rolling on.** A new `to` (compared by value) starts a new roll from the figure shown, so a live payout keeps
  climbing; pass `from` to start somewhere else. `[data-counting]` is set while it rolls.
- **Still.** Under reduced motion it shows the end at once; `skip` (a press on the slip) lands it now. `onLand` runs
  once, when it lands either way.
- `countUp(node, { to, from?, ms?, delay?, format, ease?, onLand?, onFigure?, maxFrames?, reduced? })` is the same
  run on any node with a `textContent`, returning `{ cancel, finish }`.

## What plays when

`createDirector<D>(options)` is a queue of cues (`{ tier, kind, data, mine?, first? }`, `data` typed by the game for
its renderers). It decides what plays when and hands the cue over; it never draws.

| Tier | Goes out as | Notes |
| --- | --- | --- |
| `micro` | a batch of one, at once (`onBatch`) | never held or rationed: keep its answer tiny |
| `small` | a batch per kind (`onBatch`) | smalls of a kind within `coalesceMs` (350) are one batch; held behind a big show |
| `medium` | the stage, one at a time | `gapMs` (900) apart; past `maxQueue` (3) waiting, it goes out as a small |
| `big` | the stage, at once | cuts a medium short (handed to the smalls), jumps the waiting mediums |

- **The stage.** `stage()` is the show on it (a `StagedCue`: the cue plus `id`, the `pushed` tier and `reduced`),
  the same object until it changes; `useStage(director)` is it as React state. The renderer calls `done(id)` when the
  show ends; an id that is no longer on the stage (a medium a big cut short) ends nothing. `waiting()` counts the
  queue.
- **Batches.** `onBatch(fn)` (or `useCueBatches(director, fn)`) hears each batch: `{ kind, cues, mine, first,
  reduced }`. A batch of ten is one bigger answer, not ten. Batches that land during a big show wait (`holdMost`, 6)
  and the newest `releaseMost` (3) go out when it ends.
- **The machine.** A cue's `mine` says it came from the player's own gesture; unset, `options.mine()` is asked at the
  push (pass a gesture tracker's `recent`). With `machine.downscale: true` a cue that is neither mine nor a `first`
  drops a tier (big to medium, medium to small); it is off by default, so a delayed or automated big show the game
  forgets to mark `first` still plays at its size. A machine's batch goes out only when it holds a first (`firstsOnly`), at most one every
  `machine.gapMs` (6000), up to `waitingMost` (3) waiting their turn, the newest kept, one of a kind merging with
  the one already waiting; `kindGapMs` drops a machine's batch of a kind shown too recently. `machine: false` turns
  rationing off. The player's own wins are never rationed.
- **Reduced motion.** Each staged cue and batch carries `reduced` (`options.reduced`, by default the kit's
  `prefersReducedMotion`), read as it goes out: the renderer shows its still.
- **Development.** `sample(name, make)` names a cue; `replay(name)` pushes it as the player's, so a show can be looked
  at without playing to it (wire it to the console or a query string). `log()` is what happened to the last
  `logMost` (200) cues and batches: `staged`, `queued`, `shown`, `held`, `waiting`, `dropped`, `demoted`, `cut`.
- `clear()` drops everything waiting and on the stage; `dispose()` also cancels its timers and forgets its listeners.

```tsx
const director = createDirector<Show>({ mine: () => hand.recent(), coalesceMs: 380, maxQueue: 2 });

function Shows() {
  const show = useStage(director);
  useCueBatches(director, (batch) => toasts.push(stickerOf(batch)));
  if (show?.data.type === "banner") return <Banner data={show.data} still={show.reduced} onDone={() => director.done(show.id)} />;
  return null;
}
```
