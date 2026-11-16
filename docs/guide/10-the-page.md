# The page

So far the page has been a few plain buttons over a number. This chapter turns the store into a screen a person
enjoys looking at. By the end you will know the three ways to read the store and which to reach for, how a screen
calls an action, what starts the clock, how the engine's headless controls get your game's look, and where theme,
feel and the dev panel fit in.

The code for this chapter is one file, `docs/examples/guide-the-page.tsx`. It grows Simmer's page from chapter 2: it
imports Simmer as chapter 4 left it (`docs/examples/simmer/game-wallet.ts`), makes chapter 2's
[store](../glossary.md#store) over it with the same line, `createIdleStore(game, { now: Date.now })`, and reads and
draws it the way a bigger page does.

## What the page is allowed to do

Before any code, one idea that the rest of the chapter leans on. The page does two things only:

1. It **reads** the store and draws what it finds.
2. It **calls** [actions](../glossary.md#action) when the player does something.

It never changes state any other way, and it never runs the game's rules on a timer of its own. The clock and the
features do that (chapter 3). This is why a watchpot page can be thrown away and rebuilt without touching the game:
everything that matters lives in the store, and the page is a view of it.

## The three hooks

React components need a way to reach the store. watchpot puts the store in a React context when you mount the
game, and hands you typed hooks to read it. You make those hooks once, in one module, typed over your store:

<!-- example-code: guide-the-page.tsx -->

```tsx
export const { useGameStore, useGameState, useGameView } = createRuntimeHooks<typeof store>();
type State = StoreState<typeof store>;
```

<sub>`docs/examples/guide-the-page.tsx`</sub>

`createRuntimeHooks` comes from `watchpot/react`. The type argument is your store's type, so every hook below knows
your game's state. `StoreState` reads the state type off the store, which is handy for typing your own helpers.

The three hooks are:

- `useGameStore()` gives you the store itself. You use it in event handlers, to call actions.
- `useGameState(selector)` gives you one value picked out of the state, and re-renders when that value changes.
- `useGameView()` gives you the whole state, handed on at a calm pace.

The store gets into context through `mountGame(store, <App />)`, which renders your app into `#root` inside the
provider (and inside React's `StrictMode`). Any component that uses these hooks must be rendered under it.

VOID IF REMOVED makes the same three hooks the same way, in a module of its own:

```ts
import { createRuntimeHooks } from "watchpot/react";
import type { GameStore } from "../game/store";

/**
 * The typed store hooks: every screen reads the store through these. `useGameView` is the whole state for a screen
 * that reads much of it, paced by the engine: redrawn at once in answer to the player's hand, a few times a second
 * while the game runs by itself, never while hidden. A screen that needs a figure every tick reads it with a narrow
 * `useGameState` selector instead.
 */
export const { useGameStore, useGameState, useGameView } = createRuntimeHooks<GameStore>();
```

<sub>VOID IF REMOVED, `src/app/hooks.ts`</sub>

## Reading one figure: `useGameState`

A [selector](../glossary.md#selector) is a small function that takes the whole state and returns the one thing a
component needs. `useGameState` runs it against the store and re-renders the component when the result changes.

Here is Simmer's balance:

<!-- example-code: guide-the-page.tsx -->

```tsx
export function Balance() {
  const text = useGameState((s) => fmt(s.wallet.bubbles).text);
  return <h1>{text} bubbles</h1>;
}
```

<sub>`docs/examples/guide-the-page.tsx`</sub>

Line by line:

- `useGameState((s) => ...)` subscribes this component to the store.
- The selector returns `fmt(s.wallet.bubbles).text`, the formatted string, not the number. That choice matters.
  The wallet gains a fraction of a bubble on every tick, so the number changes many times a second. The text,
  "1,234" (fractions floored away), changes far less often. `useGameState` compares the new result with the last one, and a string that reads the
  same is the same, so the component only re-renders when what the player sees would change.

Select what you show. A narrow selector that returns a string, a number or a boolean is the cheapest read there is,
and it is the right one for a figure that has to move with every tick.

### The selector trap

`useGameState` decides whether to re-render by asking "is this result the same value as last time?" It asks with
JavaScript's `Object.is`, the same check as `===`. For a string or a number that does what you expect. For an object
it asks whether it is the same object, and a selector that builds a new object returns a different one every time.

So this looks harmless and is not:

```tsx
// Wrong: a new object on every call.
const { bubbles, burners } = useGameState((s) => ({ bubbles: s.wallet.bubbles, burners: s.stove.burners }));
```

Under the hood, `useGameState` is zustand's `useStore`, which sits on React's `useSyncExternalStore`. React calls the
selector, gets an object, calls it again to check, gets a different object, decides the store has changed, and
renders again. It never settles. You get React's "Maximum update depth exceeded" error, and the page goes blank. In a
development build the engine warns first, once per selector, with the selector's source and the fix, so the console
tells you which line to change.

The same trap hides in arithmetic. A [Decimal](../glossary.md#decimal) is an object, and every Decimal operation
returns a new one, so `useGameState((s) => s.wallet.bubbles.add(1))` loops just the same. Do the arithmetic outside
the selector, or turn the result into a string, number or boolean inside it.

When you do want several values from one read, wrap the selector in `useShallow`:

<!-- example-code: guide-the-page.tsx -->

```tsx
export function Summary() {
  const { burners, rate } = useGameState(
    useShallow((s: State) => ({
      burners: s.stove.burners,
      rate: fmtRate(rateOf(s)),
    })),
  );
  return (
    <p>
      {fmtCounted(burners, ["burner", "burners"])} lit, {rate}
    </p>
  );
}
```

<sub>`docs/examples/guide-the-page.tsx`</sub>

`useShallow`, from `watchpot/react`, compares the object one level down, key by key, and hands back the previous
object when every key is the same. The component re-renders only when `burners` or `rate` really changes. It
compares a Decimal by its value too, so `useShallow((s) => s.wallet.bubbles.mul(2))` is steady as well.

`rateOf` is a helper in the same file: the pot's simmer plus the stove's own `perSecond` (which already has the lid's
doubling in it) while the stove is lit. It does Decimal arithmetic inside the selector, which is fine here because
`fmtRate` turns the result into a string before anything compares it.

<!-- example-code: guide-the-page.tsx -->

```tsx
/** Bubbles a second, all told: the pot's simmer, plus the stove's own rate (lid included) while it is lit. */
const rateOf = (s: State) => (s.stove.off ? ZERO : s.stove.perSecond).add(SIMMER_PER_SECOND);
```

<sub>`docs/examples/guide-the-page.tsx`</sub>

## Reading a whole screen: `useGameView`

A screen with a dozen figures on it would need a dozen selectors, or one big `useShallow` object. There is an easier
way for that kind of screen. `useGameView()` returns the whole state, and re-renders at a pace the engine picks:

- at once, for half a second after the player presses, clicks or types, so their own doing is never late;
- at most every 200 ms while the game runs by itself;
- not at all while the tab is hidden, catching up when it shows again.

That pacing is what makes it safe. Without it, reading the whole state would re-render the screen on every tick.

With the whole state in hand, a screen works its figures out in render, as plain function calls:

<!-- example-code: guide-the-page.tsx -->

```tsx
export function Stove() {
  const game = useGameStore();
  const s = useGameView();
  const price = burnerPrice(s.stove.burners);
  const canAfford = s.wallet.bubbles.gte(price);
  return (
    <section aria-labelledby="stove-title">
      <h2 id="stove-title">The stove</h2>
      <p>Each burner adds {fmtRate(BURNER_PER_SECOND)}.</p>
      <button type="button" disabled={!canAfford} onClick={() => game.getState().stove.buyBurner()}>
        Light a burner for {fmt(price).text} bubbles
      </button>
    </section>
  );
}
```

<sub>`docs/examples/guide-the-page.tsx`</sub>

`burnerPrice` builds a new Decimal on every render, but that is fine here: it runs in render, not inside a selector,
so nothing compares it.

### Which read to use

| What you are drawing | Read it with | Why |
| --- | --- | --- |
| A figure that moves every tick (the balance) | `useGameState`, narrow, returning a string, number or boolean | re-renders only when what is shown changes |
| A screen that reads many parts of the state (a shop, a reset page) | `useGameView()` | one read, paced, never late for the player's own press |
| Decoration that need not be exact (a margin's figures, a background's mood) | `useSampled(store, { sample, initial })` | reads a few times a second and re-renders only when the snapshot differs |
| A clock in render (a countdown) | `useClockNow(intervalMs)` | the game clock as state, on one shared timer |

`useSampled` and `useClockNow` come from `watchpot/react` too. The README's React section covers both.

## Calling actions

An action is a function on the store, under its feature's key: Simmer's pot has `tap`, the stove has `buyBurner`.
You call one from an event handler, through the store:

```tsx
onClick={() => game.getState().stove.buyBurner()}
```

`getState()` reads the store as it is at the moment of the click, not as it was at the last render. That is why the
call goes through `useGameStore()` and not through a selector. The action itself checks whether it is allowed (the
stove's `buyBurner` returns `false` without buying when you cannot pay), so a button that is enabled a moment too
long does no harm.

## A worked example: the roll page

VOID IF REMOVED is the game built on watchpot. Its first reset, which the player meets about half an hour in, has a
page of its own. That page shows everything above working together. Here is its component, trimmed:

```tsx
export function RollScreen() {
  const store = useGameStore();
  const st = useGameView();
  const gain = rollGain(st);
  const bar = gate("roll.open");
  // ...
  const now = store.getState().gameNow();
  // ...
  const toBar = logShare(st.wallet.earned, bar);
  const pace = rollPace(st, now);
  const peak = rollPeak(st);
  const lights = chaseOf(can, toBar, pace, peak, ROLL_PACE.past);
  // ...
        <div className={s.lever}>
          <Chase {...lights}>
            <Btn
              tone="signal"
              size="lg"
              block
              disabled={!can}
              hotkey="R"
              onClick={() => store.getState().roll.change()}
            >
              {COPY.roll.change}
            </Btn>
          </Chase>
        </div>
  // ...
      <Plate title={COPY.roll.spindle} code="SP-CORE" flush>
        <Shelf
          shop={spindle}
          ranks={st.spindle.ranks}
          balance={st.wallet.cores}
          state={st}
          onBuy={(id) => store.getState().spindle.buy(id)}
          notes={COPY.tips.notes.spindle}
          ahead={6}
        />
      </Plate>
```

<sub>VOID IF REMOVED, `src/screens/Roll.tsx`</sub>

Read it in three parts.

**It reads once.** `useGameView()` hands it the whole state. The page reads many slices (the wallet, the roll's
history, the shop's ranks), so one paced read beats a dozen selectors.

**It computes in render.** `rollGain`, `rollPace` and `rollPeak` are the game's own rules, plain functions of the
state, and the screen calls them as it draws. The same functions decide the reset in the game's code and in its
simulation, so the screen and the rules cannot disagree. `can` (trimmed above) is whether changing the roll is
allowed right now.

**It calls actions in handlers.** The lever calls `store.getState().roll.change()`, the reset. The shop calls
`store.getState().spindle.buy(id)`. Neither the button nor the shelf knows what the action does.

Notice one line: `store.getState().gameNow()` is read during render. It works because `useGameView` re-renders the
page a few times a second anyway, so the time is never far behind. A screen that is not already paced would want
`useClockNow`, which re-renders on a timer of its own.

The same game's opening page shows the other read. Its big press pad wants its figures on every tick, so it reads
each with a narrow selector, and it calls two actions from a pointer handler:

```tsx
export function Pad({ chute }: { chute: ReactNode }) {
  const store = useGameStore();
  const heatLevel = useGameState((g) => g.heat.level);
  const held = useGameState((g) => g.feed.held);
  // ...
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    store.getState().press.click();
    store.getState().feed.hold(true);
  };
  const up = () => store.getState().feed.hold(false);
```

<sub>VOID IF REMOVED, `src/screens/FeedPad.tsx`</sub>

`heatLevel` is a number and `held` is a boolean, so each selector is safe and each re-renders the pad only when its
value changes.

## Starting the page: the runtime hook

Something has to start the clock, and only once. That is the job of a [runtime hook](../glossary.md#runtime-hook),
called at the top of your app:

<!-- example-code: guide-the-page.tsx -->

```tsx
export function App() {
  const game = useGameStore();
  const { taken } = useGameRuntime(game);
  const [route, go] = useHashRoute();
  return (
    <main>
      <style>{POT_CSS}</style>
      {taken && (
        <p role="alert">Simmer is open in another tab. Play there, or close it and reload this one.</p>
      )}
      <Balance />
      <Pot />
      <Summary />
      <Stove />
      {process.env.NODE_ENV !== "production" && route === "dev" && <DevPanel onClose={() => go("")} />}
    </main>
  );
}
```

<sub>`docs/examples/guide-the-page.tsx`</sub>

`useGameRuntime(store, { motion, scheme, sound })` does five things a page needs once:

- starts the game clock: live ticks, the [catch-up](../glossary.md#catch-up) after time away, and a save when the
  tab is hidden;
- watches for another tab of the same game writing the save, and stops this tab's clock when one does (`taken`
  comes back `true`; tell the player, as above);
- writes the motion the page should use onto `<html>` as `data-motion`, `"reduced"` or `"full"`, so your CSS can
  follow it with one attribute (the pot's CSS below);
- writes the colour scheme onto `<html>` as `data-scheme`;
- with `sound`, unlocks your sound engine on the first gesture and mutes it while sound is off.

It returns `{ reduced, taken }`. Every option may be left out. `motion` is `"system" | "reduced" | "full"` and
`scheme` is `"system" | "light" | "dark"`, both `"system"` by default, which follows the operating system. Simmer has
no settings, so it passes nothing. A real game keeps the player's choice in a settings feature and reads it with a
selector, as the template does.

`useHashRoute()` is the other new line. It returns the part of the address after the `#` (without the `#`) and a
function to change it, and it re-renders when the player edits the address or presses back. The dev panel below
uses it.

### The two halves

`useGameRuntime` is two hooks put together, and you can call them apart:

- `useGameClock(store)` is the clock and the watch on other tabs. It returns `{ taken }`.
- `usePageRuntime({ motion, scheme, sound })` is everything else. It needs no store and returns `{ reduced }`.

Chapter 2's Simmer calls `useGameClock` alone, because it has no settings and no sound. A game with a title screen
calls them apart for a different reason: the motion, scheme and sound should be right while the title is up, but the
clock should not start until the player is actually playing. VOID IF REMOVED does exactly that:

```tsx
export function App() {
  const store = useGameStore();
  const motion = useGameState((st) => st.settings.motion);
  const soundOn = useGameState((st) => st.settings.sound);
  const scheme = useGameState((st) => st.settings.scheme);
  usePageRuntime({ motion, scheme, sound: { engine: sound, on: soundOn } });
  // ...
function Play({ onTitle }: { onTitle: () => void }) {
  const store = useGameStore();
  // ...
  const { taken } = useGameClock(store);
```

<sub>VOID IF REMOVED, `src/app/App.tsx`</sub>

`App` is always mounted and sets up the page. `Play` mounts only once the title is pressed, and starts the clock.

### `watchpot/react` or `watchpot/hooks`

You will find the same hooks under two imports. Here is the real difference.

`watchpot/hooks` is `watchpot/react` with four things left out: `useGameRuntime` and `usePageRuntime`, the
`DevPanel` (with the sound desk and the sample host that go with it), and `SheetOutlet`. Everything it does export
is the very same function as in `watchpot/react`, not a copy.

The reason it exists is what those four things pull in. `usePageRuntime` reaches the kit's motion and scheme code,
and the dev panel has a stylesheet. `watchpot/hooks` is kept free of both (a rule test, `test/rules/hooks.test.ts`,
fails if it ever reaches them), so a build with no CSS-module loader can import it.

So: use `watchpot/react`. Reach for `watchpot/hooks` only when your build cannot load a `.module.css` file or must not
pull in the kit, and then start the clock with `useGameClock` and write motion and scheme yourself. The README's
list of entries and the comment at the top of `src/hooks/index.ts` say the same.

## The headless UI

Every game wants buttons, tabs, sheets, tooltips and progress bars, and every one of those has fiddly behaviour:
focus that moves and comes back, keys that work, screen readers that hear the right thing. None of that is the
game's character, and all of it is easy to get wrong. The look, on the other hand, is all character.

So watchpot splits them. `watchpot/ui` is [headless](../glossary.md#headless): each
[primitive](../glossary.md#primitive) brings behaviour, keyboard, focus and ARIA, and draws nothing. It ships no
stylesheet, no class name, no colour and no English word. It tells you its state through `data-*` attributes
(`data-pressed`, `data-state="open"`, `data-current`), so your CSS can style every state without JavaScript.

### One primitive, start to finish

Simmer's pot becomes a real click target. The primitive is `Pressable`: a button that counts one press per finger,
pen, mouse button or key (Space and Enter), tells you where the press landed, and sets `data-pressed` while it is held.
`FloatingNumbers` is the host for the "+1" that rises from the press:

<!-- example-code: guide-the-page.tsx -->

```tsx
export function Pot() {
  const game = useGameStore();
  const floats = useFloatingNumbers({ max: 16 });
  return (
    <div className="pot">
      <Pressable
        className="pot-press"
        onPress={(press) => {
          game.getState().pot.tap();
          floats.spawn({ x: press.x, y: press.y, node: "+1" });
        }}
      >
        Tap the pot
      </Pressable>
      <FloatingNumbers floats={floats} className="pot-floats" />
    </div>
  );
}
```

<sub>`docs/examples/guide-the-page.tsx`</sub>

- `useFloatingNumbers({ max: 16 })` keeps the list of floats; at most 16 are on screen, the oldest going first.
- `Pressable` takes your `className` and calls `onPress` with a `PressInfo`: `x` and `y` are where the press landed
  inside the button, in pixels. A two-finger tap is two presses, which is what a clicker wants.
- `onPress` calls the action, then spawns a float at the press point. The words, "Tap the pot" and "+1", are yours.
- `FloatingNumbers` draws each float as a `[data-float]` span placed at its point, and removes it when its own CSS
  animation ends.

And the whole look, which the engine leaves entirely to you:

```css
.pot { position: relative; display: inline-grid; }
.pot-press {
  min-width: 160px; min-height: 160px; border-radius: 50%;
  border: 2px solid currentColor; background: transparent; font: inherit;
  cursor: pointer; touch-action: manipulation; user-select: none;
  transition: scale 120ms ease-out;
}
.pot-press[data-pressed] { scale: 0.95; }
.pot-press:focus-visible { outline: 3px solid currentColor; outline-offset: 4px; }
.pot-floats { position: absolute; inset: 0; pointer-events: none; }
.pot-floats > [data-float] {
  translate: -50% -50%; font-weight: 700;
  animation: pot-rise 800ms ease-out forwards;
}
@keyframes pot-rise { to { opacity: 0; transform: translateY(-40px); } }
:root[data-motion="reduced"] .pot-press { transition: none; }
:root[data-motion="reduced"] .pot-floats > [data-float] { animation-duration: 1ms; }
```

<sub>`docs/examples/guide-the-page.tsx` (`POT_CSS`)</sub>

Three things to notice. The pressed state is styled from `[data-pressed]`, which the primitive sets. The float
animation is what removes the float, so it has to end: under reduced motion it is cut to a millisecond, not removed.

And reduced motion is read from one attribute. The runtime hook works out the motion the page should use (the
in-game setting, or the operating system's when the setting is "system") and writes it as `data-motion` before the
first paint, so `:root[data-motion="reduced"]` is all the CSS needs. The template's `theme.css` also carries a
`@media (prefers-reduced-motion: reduce)` block, as a fallback for a page that starts the clock with `useGameClock`
alone and so never writes the attribute. On a page that runs `useGameRuntime` and offers a "full" setting, that
block overrides the player's choice whenever the operating system asks for less motion; delete it there.

Every primitive keeps the same rules: each element takes `className`, `style`, `ref` and its native attributes;
compound parts (`Dialog.Root`, `Dialog.Panel`) where there is structure; an `asChild` prop to hand the behaviour to
your own element; and a hook (`usePress`, `useDialog`) for when you want your own markup entirely. The full list is
in [ui.md](../ui.md).

### The copy-in registry

You will not usually write that wrapper yourself. The game template (chapter 13) comes with a
[registry](../glossary.md#registry): about twenty styled components in your game's `src/ui/` (a button, a panel,
a sheet, a tab bar, a click target and more), each a thin wrapper over a primitive with a CSS module beside it. They are copied into your game when it is made, and from then on they are
yours to change, restyle or delete. Nothing upstream changes them.

The template's click target is the same idea as Simmer's pot, done once for every game:

```tsx
export function ClickTarget({ onPress, label, disabled, className, children }: ClickTargetProps) {
  const floats = useFloatingNumbers();
  return (
    <div className={cx(s.target, className)}>
      <Pressable
        className={s.press}
        aria-label={label}
        disabled={disabled}
        onPress={(press) => {
          const node = onPress(press);
          if (node !== null && node !== undefined) floats.spawn({ x: press.x, y: press.y, node });
        }}
      >
        {children}
      </Pressable>
      <FloatingNumbers floats={floats} className={s.floats} />
    </div>
  );
}
```

<sub>`templates/game/src/ui/ClickTarget.tsx`</sub>

Its CSS module reads colours and shapes from tokens like `--ui-surface`, `--ui-line` and `--ui-accent`, never from a
hard-coded value. The registry's own README, `templates/game/src/ui/README.md`, lists every component, the primitive
under it, and every token it reads.

## Tokens and the theme compiler, in brief

Those `--ui-*` names are the end of a short chain:

1. **`design/tokens.json`** holds your palette, per theme, and your type.
2. **`buildTokens({ tokens, out, fontBase })`**, from `watchpot/kit/theme`, compiles it into `src/tokens.css`. The
   template runs it as `bun run tokens`. The first theme lands on `:root`; each later one is a
   `[data-theme="id"]` block.
3. **`src/ui/theme.css`** maps the compiled [tokens](../glossary.md#token) onto the registry's contract:
   `--ui-accent: var(--signal)`, and so on.
4. **Each component's CSS module** reads only `--ui-*`.

Change the palette in step 1 and every component follows. Point a token somewhere else in step 3 and only the
mapping changes. `data-theme` on `<html>` (or any element) picks a theme; `data-scheme`, written by the runtime hook
from its `scheme` option, picks light or dark. Chapter 11 goes further, and [theme.md](../theme.md) is the reference.

`buildTokens` lives on its own subpath because it is a design-time tool that runs under Bun, not code the page
loads. Its options and the shape of `tokens.json` (`TokensFile`) are in `api/kit/theme/build.d.ts`.

## Feel, in brief

An idle game that feels good does two things that pull against each other. It answers every deliberate press at
once, right where it happened. And it keeps the machine's own work, hundreds of small events a minute later in a
game, from burying the page in celebrations. [feel.md](../feel.md) covers the mechanism in full; here is the shape.

**Answer the press where it happened.** Simmer's pot already does this: the "+1" rises from the point the finger
landed. For changes that land a moment after the press (a buy whose effect shows on the next tick),
`createGestures()` from `watchpot/kit` tells you whether a person's gesture just happened (`recent()`) and where
(`point()`), and `createMarks` leaves a short-lived mark at that point.

**Watch for changes.** The store tells you what is, not what just happened. `watchChanges` compares each state with
the one before and turns the difference into your game's own events:

<!-- example-code: guide-the-page.tsx -->

```tsx
export function watchSimmer(on: (event: SimmerEvent) => void): () => void {
  const watch = watchChanges<State, SimmerEvent>(store, {
    rules: [
      (next, prev, emit) => {
        const at = crossedMark([1, 10, 25], prev.stove.burners, next.stove.burners);
        if (at !== undefined) emit({ kind: "burners", at });
      },
    ],
    on,
  });
  return () => watch.stop();
}
```

<sub>`docs/examples/guide-the-page.tsx`</sub>

Each rule gets the new state, the old one and an `emit`. `crossedMark` returns the highest mark the count passed in
this change, if any. A load or an import is not news: the watch keeps quiet for two seconds after it starts and after
any jump. Note the import: `watchChanges` comes from `watchpot/core`, not from the kit with the rest of the feel tools.

**Ration celebrations.** `createDirector()` from `watchpot/kit` is a queue for those events, by size. Small ones that
arrive together become one batch, medium ones take the stage one at a time, a big one cuts in, and the machine's own
wins are held back and rationed while the player's are never delayed. It decides what plays when and draws nothing.

For a sequence with its own staging (a box opening, cards turning), the kit has `useRevealSequence`; see
[reveal.md](../reveal.md).

## The dev panel

While you build, you want to skip an hour, see what the save holds, or load a save that reproduces a bug. The
`DevPanel` from `watchpot/react` docks over the running game and does all of that: time warp from a minute to a
day, a jump to day N, each feature's saved state as JSON, and the save as text you can export, check, edit and import.

Simmer mounts it at the end of `App`, above:

```tsx
{process.env.NODE_ENV !== "production" && route === "dev" && <DevPanel onClose={() => go("")} />}
```

Open the page with `#dev` on the URL to see it. Its one prop, `onClose`, is called by its close button, which here
clears the hash. Because `useHashRoute` follows the address, typing `#dev` or pressing back opens and closes it too.

Two guards keep it out of the game you ship, and it helps to know which does what. `DevPanel` itself is a gate: in
a production build (Bun's `--production` sets `process.env.NODE_ENV` to "production" at build time) it renders
nothing, and the dynamic import that is the only way to the panel's module becomes dead code, so the panel's script
and styles never reach the bundle. The inline check in your JSX then lets the bundler drop the route test and the
element too. [dev-panel-workflow.md](../dev-panel-workflow.md) presents the inline check as the thing that keeps the
panel out; the gate inside `DevPanel` is what actually does (the README's Dev panel section describes both). Write
the check inline anyway, as shown.

Warping moves the game clock (`gameNow()`) forward through the clock's offset. It never touches the wall clock and
never goes back. [dev-panel-workflow.md](../dev-panel-workflow.md) has the loop step by step.

## Things that bite

- **A selector that builds an object or a Decimal loops forever.** `useGameState` re-renders when the result is not
  the same value as last time, and a new object never is. React stops with "Maximum update depth exceeded" (a
  development build warns first and names the selector). Return a string, number or boolean, or wrap the selector in
  `useShallow` from `watchpot/react`.
- **`useGameView` is up to 200 ms behind while the game runs alone.** That is the point of it, but a figure that
  must move with every tick (the balance) belongs in a narrow `useGameState` selector instead.
- **The paced view keeps the options of its first call.** Every reader of a store shares one paced view, made by the
  first `useGameView` or `usePacedState` to run. Options passed later (to `createRuntimeHooks({ view })` or another
  `usePacedState`) are ignored; a development build warns once when they differ. Set them in one place.
- **A hook rendered outside the provider throws.** The error names the hook that was called and points to
  `mountGame`. Render under `mountGame` (or `IdleStoreProvider` in a test).
- **`data-motion` is written only by the runtime hook.** A page that starts the clock with `useGameClock` alone gets
  no attribute, and has to ask the OS itself with `@media (prefers-reduced-motion: reduce)`.
- **A float that never finishes its animation stays until its lifetime runs out.** `FloatingNumbers` removes a float
  when its CSS animation ends (or after `lifetime`, 1500 ms by default). Give `[data-float]` an animation, and shorten
  it under reduced motion rather than removing it.

## Next

[Chapter 11, Look and sound](11-look-and-sound.md): the look past the tokens, and the sound.

## Reference

- [ui.md](../ui.md): every headless primitive, its parts, hooks and `data-*`.
- [feel.md](../feel.md): gestures, marks, `watchChanges`, `Count` and the director.
- [reveal.md](../reveal.md): `useRevealSequence`, a staged reveal without a look.
- [theme.md](../theme.md): `tokens.json` and `buildTokens`.
- [dev-panel-workflow.md](../dev-panel-workflow.md): the panel and the warp loop.
- `templates/game/src/ui/README.md`: the copy-in registry and its token contract.
- The README's React and Dev panel sections: `useSampled`, `useClockNow`, the paced view in full.
- `api/react/store.d.ts` (`createRuntimeHooks`, `mountGame`), `api/react/paced.d.ts`, `api/react/runtime.d.ts`,
  `api/react/gameClock.d.ts`, `api/react/hashRoute.d.ts`, `api/react/sample.d.ts`, `api/react/clock.d.ts`, `api/react/dev/gate.d.ts`,
  `api/hooks/index.d.ts`, `api/ui/press.d.ts`, `api/ui/feedback.d.ts`, `api/core/watch.d.ts`,
  `api/kit/fx/gesture.d.ts`, `api/kit/fx/marks.d.ts`, `api/kit/fx/director.d.ts`.
