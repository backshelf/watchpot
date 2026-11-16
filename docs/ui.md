# Headless UI

`watchpot/ui` is behaviour without a look: state, keyboard, focus, ARIA, structure and data attributes come from the
engine; every pixel and every word come from the game. No primitive ships a stylesheet or a class name, and it peers
on `react` and `react-dom` alone (`test/rules/headless.test.ts` checks both: the walk from its entry reaches no kit and
no `.css`). No font, no colour and no English default either, though that part is a convention the test does not check.

Example: [`examples/ui.tsx`](examples/ui.tsx).

You rarely style these from nothing. The template's copy-in registry, `templates/game/src/ui/`, is a styled component
over each primitive that a new game owns and restyles; its [README](../templates/game/src/ui/README.md) lists what is
there, and its [token contract](../templates/game/src/ui/README.md#the-token-contract) is the set of `--ui-*`
variables every one of them reads, so one `theme.css` restyles them all ([a theme](theme.md)).

## The rules every primitive keeps

- Every rendered element takes `className`, `style`, `ref` and its native attributes. State is on `data-*`
  (`data-state="open"`, `data-current`, `data-armed`, `data-earned`...), so a game styles from CSS alone.
- Compound parts where there is structure (`Dialog.Root`, `Dialog.Panel`, `Dialog.Title`...). A part with `asChild`
  hands its behaviour to the game's own element (a `motion.div`, a link) through `Slot`.
- Each has its hook (`useDialog`, `useTabs`, `useTooltip`, `usePress`...) for a game that wants its own markup
  entirely, and the small hooks underneath are exported too: `useRovingFocus`, `useControllable`, `useOpenerFocus`,
  `useFocusTrap`, `useInert`, `useEscape` (the topmost open layer takes Escape).
- Two hooks read what the page already says, for the few things CSS cannot switch alone.
  `useClosestAttribute(ref, name)` is the value of `name` on the nearest ancestor that carries it (the element
  itself included), null when none does, read before paint and again when that attribute changes: a leaf follows a
  theme, a mode or a tier its container writes, with no prop drilled down. `useMediaQuery(query)` is whether a CSS
  media query matches, kept current (false where there is no `matchMedia`): a surface not mounted at all on a phone.
- `useArrived(shown, ms = 700)` is true for `ms` after `shown` turns true on a component that mounted with it
  false, and never for what was already there at the mount (a loaded save is not an arrival). It is set in a layout
  effect, so the first frame the thing is painted in is already its arriving one: put it on a `data-*` and play the
  entrance from your keyframes, with no flash of the finished thing.
- Words are props: a count's meaning, a lock, a hidden achievement's name. Reduced motion is the game's CSS; nothing
  here animates.

## The primitives

**Dialog**: a modal (or `modal={false}` side panel). Focus moves to the first control (or `initialFocus`), Tab wraps,
Escape and the scrim close, focus returns to the opener, `inertTarget` (the page root) goes inert while it is open.

```tsx
<Dialog.Root open={open} onOpenChange={setOpen} inertTarget={pageRef}>
  <Portal>
    <Dialog.Scrim className={s.scrim} />           {/* [data-state="open"] */}
    <Dialog.Panel className={s.sheet}>             {/* role="dialog" aria-modal */}
      <Dialog.Title>Gems</Dialog.Title>
      <Dialog.Close>Done</Dialog.Close>
    </Dialog.Panel>
  </Portal>
</Dialog.Root>
```

The dialog is named by its `Dialog.Title` once one is mounted; a dialog without one takes an `aria-label` on the
panel. The scrim closes on a press that lands on the scrim itself, so it can sit behind the panel as a sibling (above)
or wrap it to centre it:

```tsx
<Dialog.Scrim className={s.scrim}>               {/* display: grid; place-items: center */}
  <Dialog.Panel className={s.sheet}>…</Dialog.Panel>
</Dialog.Scrim>
```

With the hook, `useDialog()` hands back typed props that spread onto native elements as they are
(`<div {...dialog.panelProps}>`, `<h2 {...dialog.titleProps}>`, `<button {...dialog.closeProps}>`). The panel's
`ref` is a callback ref that also holds the node: a game keeping its own ref on the panel takes `ref` out of the
spread and sets `ref.current = node` from its own ref's callback. Biome's `useAriaPropsSupportedByRole` cannot see a
role that arrives in a spread: a panel that also takes an `aria-label` writes `role="dialog"` on the element too.

**ConfirmPress**: arms on the first press, fires on the second; blur, Escape and `timeout` disarm; a held Enter's
repeats press nothing. Style `[data-armed]`; the words change through `children(armed)`.

**Tabs** (tablist, one tab stop, arrows, Home/End, `activation="manual"` to wait for Enter) and **NavTabs** (a `nav` of
buttons for pages, each a tab stop, `aria-current="page"`, a lock that still presses, a count said through `words`).
Style `[data-state="active"]`, `[data-current]`, `[data-locked]`, `[data-count]`.

**Progress** and **Meter**: exact `aria-valuenow`, the drawn share as `--value` (0..1). With `steps`, one
`[data-step]` child per step, the lit ones `[data-lit]`; a bar short of full never draws full. `stepProps(index,
lit)` gives a step its own props (a class for the last quarter of a gauge, say).

```css
.bar { display: grid; grid-template-columns: repeat(var(--steps), 1fr); gap: 2px; }
.bar > [data-lit] { background: var(--ink); }
```

**Countdown**: a `<time dateTime>` from the caller's `secondsLeft` (it owns no clock). `onEnd` once at zero,
`[data-warn]` under `warnUnder`, `[data-ended]`, text by `format` (`formatCountdown` by default).

**Tooltip** (hover after `delay`, focus at once, Escape, `aria-describedby` even while closed, hold or tap on touch)
and **Popover** (press to open, a non-modal dialog that takes focus; Escape returns to the trigger). Both are placed by
`place()`, which flips and shifts inside the viewport. Style `[data-side="top"]`; wrap in `Portal` to escape clipping.

**HoverTips**: one tooltip for the whole page, by event delegation. Mounted once; anything that carries `data-tip`
has a tip, its value the key, and `content(key)` says what the key says (null for nothing) only when the tip is asked
for. A page with hundreds of tipped words (a glossary term wherever it turns up, every figure's name) pays for one
set of listeners and one floating box, where a `Tooltip` each would mount hundreds. The box is `role="tooltip"`,
`hidden` while closed, and describes its anchor while open; style `[data-state="open"]`, `[data-side]`, `[data-align]`
and `[data-by="hover" | "focus" | "touch"]`.

```tsx
<p>Spend <span data-tip="gold">gold</span> on <span data-tip="ore" data-tip-side="right">ore</span>.</p>
<HoverTips className={s.tip} content={(key) => GLOSSARY[key] ?? null} />
```

- **Pointer**: hover opens after `delay` (450 ms), sooner when a tip is already open or has just closed; leaving
  closes after `closeDelay` (120 ms); a press on the thing closes it; a page scrolling under the pointer closes it.
  A box that takes the pointer stays open while the pointer is on it; give it `pointer-events: none` to let the page
  under it be read instead.
- **Keyboard**: focus the keyboard put on a tipped control opens its tip at once; blur and Escape close. Words are
  not tab stops, so mark a row `data-tip-scope`: focus resting on any control inside it shows the tips of everything
  in the row together (after `scopeDelay`, 700 ms; at most `scopeMost`, 5), the control's own first.
- **Touch**: a tap on a tipped word toggles its tip, and is not a press on the button the word sits in. A tipped
  control (a button, a link, a tab) shows its tip on a held press (`holdDelay`, 500 ms), which then is not a press;
  a tap on it is still a press. `data-tip-touch="tap" | "hold"` says otherwise for one element.
- `attr` and `scopeAttr` rename the attributes (`<attr>-side` and `<attr>-touch` follow); `place` is the
  `PlaceOptions`; `disabled` opens nothing (the game's "tips off" setting); `children(parts)` draws the open tip from
  its parts (`{ key, node }` each: one for a hover, several for a scope).
- `useTipSlot(node)` returns a key for a tip whose content is the caller's own node, not a key the page knows: put
  it in the attribute. The node is read as the tip opens.

```tsx
function Tip({ content, children }: { content: ReactNode; children: ReactElement }) {
  return cloneElement(children, { "data-tip": useTipSlot(content) });
}
```

A glossary whose terms are marked wherever they turn up in running text is `annotate` (`watchpot/core`) under one
`HoverTips`. `lexicon` takes each term's spellings once; `annotate(lex, text, allow)` hands a content string back
in segments, each plain or one term's word (whole words, any case, the longest phrase wins, each term once where it
first turns up, and `allow` keeps back what the player has not met); the page draws a marked segment as a span that
carries the term's id in `data-tip`, and `content` says what the id means now. Nothing is mounted per term.

```tsx
const terms = lexicon(GLOSSARY.map((t) => ({ id: t.id, words: [t.name, ...t.alsoSaid] })));
const mark = annotator(terms); // remembers a text's segments per scope

function Marked({ text, met }: { text: string; met: ReadonlySet<string> }) {
  const segments = mark(text, [...met].join(), (id) => met.has(id));
  return segments.map((seg, i) =>
    seg.id ? <span key={`${seg.id}:${i}`} data-tip={seg.id}>{seg.text}</span> : seg.text,
  );
}
```

**TileGrid**: a WAI-ARIA grid with one tab stop over any list in `columns` (or ragged `rows`): arrows, Home/End (Ctrl
for the grid's ends), PageUp/PageDown, Enter to activate. **AchievementGrid** is it plus one shared detail tooltip:
each tile `[data-earned]`, `[data-hidden]`, rows `[data-complete]`, the detail's `[data-name]`, `[data-line]`,
`[data-reward]`. `renderRowAside({ index, row, earned, total })` draws a rail beside each row (its number, how full it
is, what a full one pays): inside the row, before its tiles, as a `role="rowheader"` marked `[data-row-aside]`, so it
lines up with the row and names it for a screen reader, and the arrows pass it by. Put it on either side with CSS
(`order`, or a grid column of its own on `[role="row"]`); return null for a row that has none. `TileGrid` takes the
same as `renderRowAside(row, items)`.

**TreeGraph**: nodes at `--col`/`--row` (root `--cols`/`--rows`), `treeEdges()` returns each elbow's segments and a
default `<svg data-edges>` draws them as `<line data-lit>`; one tab stop, arrows move the choice, the chosen node's
button controls the detail region. Style `[data-node][data-state="locked"]`, `[data-chosen]`, `[data-lit]`.

**Pressable** (one press per pointer, per finger, per key; `onPress` says where) and **HoldButton** /
`useHoldRepeat` (buy while held, faster the longer; return `false` from the action to stop). `[data-pressed]`,
`[data-holding]`.

**FloatingNumbers**: `useFloatingNumbers().spawn({ x, y, node })` places a `[data-float]` span at the point
(`--x`/`--y`); your keyframes animate it, and it goes on `animationend` or after `lifetime`.

```css
.floats > [data-float] { animation: rise 900ms ease-out forwards; }
:root[data-motion="reduced"] .floats > [data-float] { animation-duration: 1ms; }
```

**Near** and **Marquee**: anticipation as state. `useNear(value, { at?, names?, hysteresis? })` names the band a 0..1
nearness is in (`data-near="near"` past 0.8, `"close"` past 0.95 by default) and puts the value on `--near`; a
falling value leaves its band only `hysteresis` (0.02) under the threshold, so a figure wobbling on it never
flickers (`nearLevel` is the rule). `<Near value>` is a span carrying both. `<Marquee fill>` rings what it wraps with
bulbs placed round its measured box (`rimBulbs`, at most `max`, 120): `fill` lights them clockwise, each
`<i data-bulb>` with `data-lit`, `data-next` on the first unlit and `--k` its index, `--n` the count on the root
`[data-marquee]`. Pass the moment as your own `data-state`; the chase and the flash are your keyframes.

```css
.ring [data-bulb] { width: 4px; height: 4px; translate: -50% -50%; border-radius: 50%; opacity: 0.2; }
.ring [data-lit] { opacity: 1; }
.ring[data-state="ready"] [data-bulb] { animation: chase 900ms steps(3) infinite; animation-delay: calc(var(--k) * -300ms); }
.lean[data-near="close"] { animation: breathe 520ms ease-in-out infinite; }
```

**Printed figures**: small live read-outs drawn as SVG in `currentColor`, sized by your CSS, every count capped so
no figure from the game sizes a loop. `Barcode({ value, label? })` is a real Code 128 (set B) of `value` that scans
(`code128` gives the bars; a role of `img` named by `label`, or `aria-hidden` decoration without one, for a labelled
wrapper). `Ruler({ ticks, major, at })` is a tick ruler as wide as its box with an `<i data-caret>` at `--at`
(`tickPath`); the caret is placed with an inline `left`, so nudge it with a margin or a transform, not `left`. `LevelBars({ values, bars })` is a strip of 0..1 readings,
the newest at the right (`levelBarsPath`). `Sparkline({ values, label, width, height, min?, max?, zones?, rules?, area?,
dot? })` is a series as `[data-line]` over named bands `[data-zone]` (a buy zone and a sell zone; an end at `min` or
`max` runs to the frame's edge, through `pad`) and rules
`[data-rule]` (a cost basis), with `[data-dot]` on the newest point (`seriesPoints`, `seriesY`). `Checker({ bits })`
is a clock track over a data track (`bitsOf(n, width)`). `SplitFlap({ text })` puts each character in its own
`[data-flap]` cell keyed by place and character, so only a changed cell remounts and runs your flip; `data-prev` is the
character it replaced, `data-gap` a separator; a screen reader hears the whole text once.

```css
.chart [data-zone="buy"] { fill: var(--good-tint); }
.chart [data-line] { stroke: var(--ink); stroke-width: 1.5; }
.board [data-flap] { animation: flip 240ms ease-out; }
```

**useClearUnder**: decoration that steps aside. `useClearUnder(decorRef, stageRef, { marks?, solids?, attr?,
margin?, everyMs?, key? })` sets `data-covered` on every `[data-clear]` inside the decoration's root that a
`[data-solid]` inside the stage sits over (within `margin`, 4px, and only the part of it inside the stage's box), and
takes it off when the panels move away; your CSS fades the covered ones out whole, so nothing reads half-hidden. It
measures at mount, on the stage's scroll, on a resize of the stage or its first child and every `everyMs` (1000), at
most once a frame, reading every box before writing any attribute; `key` (the open page) measures from scratch.
`coveredBy(marks, solids, { margin, view })` is the rule.

```css
.liner [data-clear] { transition: opacity 240ms; }
.liner [data-clear][data-covered] { opacity: 0; }
```

**Toasts**: `createToasts()` is a store outside React (push from anywhere), `<Toaster>` its live region; time pauses on
hover, focus and a hidden tab. `[data-toast]`, `[data-tone]`.

**BuyAmount**: a radio group of buy modes the caller lists, and `buyCount(mode, { affordable, untilNext })`.

**Toggle**, **Switch**, **Slider** (`--value` on the native range), **Disclosure**, **VisuallyHidden**, **Slot**.
A `Slider` inside a `<label>` is labelled by it, but Biome's `noLabelWithoutControl` cannot see the input inside a
component: list it in the rule's options (`"inputComponents": ["Slider"]` in `biome.json`), or give the slider an
`id` and the label `htmlFor`.

**PageShell**: the game page without its look. Header, the open tab's screen in a `<main>` keyed by tab, a page stacked
over it (focus to its bar, back to the opener, Escape closes), a `nav` slot handed `reselect`, overlays, a sheets
outlet over a registry whose mapped type fails the typecheck on a missing kind. The root carries `data-tab`,
`data-page`, `data-wide`; `usePageLayout()` reads the width inside.

**CrashBoundary**: what the page shows when a render gives up. `useGameClock` throws from its render when the clock
stops at its failure limit, and any screen can throw; without a boundary React unmounts the page and the player sees
nothing. Wrap the app under the store's provider, and give it the game's own fallback: its words, the save as text
(`store.getState().exportProfile()` inside a `try`), a reload.

```tsx
mountGame(store, <CrashBoundary fallback={({ error, retry }) => <Crashed error={error} onRetry={retry} />}><App /></CrashBoundary>);
```

## Styling recipe

Keep the look in the game, beside a thin wrapper in its own `src/ui/`:

```tsx
// src/ui/Sheet.tsx (the game's)
import { Dialog, Portal } from "watchpot/ui";
import s from "./Sheet.module.css";

export function Sheet({ title, children, ...root }: SheetProps) {
  return (
    <Dialog.Root {...root}>
      <Portal container={document.getElementById("page")}>
        <Dialog.Scrim className={s.scrim} />
        <Dialog.Panel className={s.sheet}>
          <Dialog.Title className={s.title}>{title}</Dialog.Title>
          {children}
        </Dialog.Panel>
      </Portal>
    </Dialog.Root>
  );
}
<!-- example-output: ui.tsx -->

```

```css
/* src/ui/Sheet.module.css */
.scrim { position: fixed; inset: 0; background: var(--scrim); }
.sheet { position: fixed; inset: auto 0 0; background: var(--paper); }
.sheet[data-state="open"] { animation: rise 200ms ease-out; }
```

The wrapper sets the game's words and classes once; screens use `<Sheet>` and never touch the primitive.
