# Prefs and the pace clock

Two small tools for what sits beside the game rather than in it.

**Prefs** are the choices that belong to the device, not to the save: a render quality, a frame cap, a volume. A
player who plays on a laptop and a phone wants the phone's quality low and the laptop's high, whatever their save
says, and wants neither to reset when they start a new profile. So prefs live under their own storage key, outside
the save: they are not in an export, a fresh profile keeps them, and they are read before the save loads, so the very
first frame already knows the quality. Choices that should travel with the save (sound on, reduced motion, the
colour scheme) are [settings](settings.md) instead.

**The pace clock** is real time with a speed dial on it, for slow motion and a held moment. Every animation that
reads it slows together when you turn the dial. It is presentation time only: the economy runs on the store's game
clock and never sees it.

Example: [`examples/prefs.ts`](examples/prefs.ts) (`bun docs/examples/prefs.ts`).

```ts
/** Simmer's device choices: they belong to this browser, not to the save. */
export interface View {
  quality: "low" | "high";
  volume: number;
}

const QUALITIES = ["low", "high"] as const;

/**
 * Cleans whatever storage held. The default (`readPrefs`) keeps the known keys of the right type; this one also drops
 * an unknown quality, clamps the volume, and takes in the bare word an older build stored.
 */
export function readView(raw: unknown, initial: View): View {
  if (raw === "low" || raw === "high") return { ...initial, quality: raw }; // an older build kept just the word
  const v = readPrefs(raw, initial);
  return {
    quality: QUALITIES.includes(v.quality) ? v.quality : initial.quality,
    volume: Math.min(1, Math.max(0, v.volume)),
  };
}

/** `?quality=low` in the address: a value for this load only, never saved. */
export function addressOverride(search = globalThis.location?.search ?? ""): Partial<View> {
  const quality = new URLSearchParams(search).get("quality");
  return quality === "low" || quality === "high" ? { quality } : {};
}

/** The game's prefs, once, at module level: kept in localStorage, read before the save loads. */
export const view = prefs<View>({
  key: "simmer.view",
  initial: { quality: "high", volume: 0.8 },
  read: readView,
  override: addressOverride(),
});
```

On a screen, `usePrefs(view, (v) => v.quality)` reads one choice and re-renders when it changes, and a settings
sheet calls `view.set({ quality: "low" })`. The run in the example loads an older build's bare `"low"`, clamps a
volume of 3, and lays an address override over the stored value:

```
from the old word: {"quality":"low","volume":0.8}
volume 3 is clamped: {"quality":"low","volume":1} | stored: {"quality":"low","volume":1}
override for this load: high | stored: {"quality":"low","volume":1}
the player chose: low
```

## `prefs`

**`prefs({ key, initial, read?, backend?, override? })`** makes one small store, separate from the game's. Make it
once, at module level, beside the game's store.

- **`key`**: its own storage key (`simmer.view`). Keep it apart from the save's key.
- **`initial`**: the value a new device starts with, and what `reset()` goes back to.
- **`read(raw, initial)`**: cleans a value on its way in, from storage and after every `set`. `raw` is whatever
  storage held: parsed JSON, or the text itself when it is not JSON (a bare `low` from an older build arrives as the
  string `"low"`), or `undefined` when nothing is stored. Clamp numbers and drop unknown choices here. The default,
  `readPrefs(raw, initial)`, keeps the keys of `initial` that the stored value holds with the same type (and a finite
  number), over `initial`.
- **`backend`**: where it is kept. Default localStorage; `null` (or no localStorage, as in a test or on a server)
  keeps it in memory for the session.
- **`override`**: values for this load only, laid over the stored ones and never saved (a `?quality=low` link, a
  device the game knows is slow). A key holds until the player sets it or resets.

It returns a `Prefs<T>`:

- **`get()`**: the value now, with the override laid over it. The same object until something changes, so it is safe
  to hand to React's `useSyncExternalStore` directly.
- **`set(patch)`**: merges the patch over the stored value, cleans it through `read`, saves it and tells the
  listeners. A key the patch names is the player's choice from then on: the override lets go of it.
- **`reset()`**: back to `initial`, saved, and every override let go.
- **`subscribe(listener)`**: called after every change; returns the unsubscribe.

**`usePrefs(store, select?)`** (`watchpot/react` and `watchpot/hooks`) is the React read: the whole value, or with
`select` only the part it returns, re-rendering when that part changes.

## The pace clock

```ts
  // The pace clock, over a fake real clock so the numbers are exact.
  let real = 0;
  const pace = createPaceClock(() => real);
  real = 2;
  pace.setScale(0, 1); // slow to a stop over one real second
  real = 3;
```

**`createPaceClock(realSeconds)`** takes your source of real seconds (in a page, `() => performance.now() / 1000`;
the engine reads no clock itself) and returns a `PaceClock`:

- **`now()`**: seconds since it was made, slowed or stopped by the scale. Every animation that should slow together
  reads this instead of its frame's own time.
- **`real()`**: real seconds, unscaled, for easing that must not slow down (the menu that opens during the slow
  motion).
- **`scale`**: the scale now. 1 is real time, 0 is a held moment.
- **`setScale(to, seconds?)`**: ramps the scale to `to` (never below 0) over `seconds` of real time, at once by
  default. The ramp is linear in the scale, and `now()` is its exact integral, so reading it at any frame rate gives
  the same answer.

In the run above, two real seconds pass at full speed, then a one-second ramp to a stop adds half a second of pace
time, and the clock then holds until it is released:

```
pace after 2 s, then a 1 s ramp to a hold: 2.5 | real 3 | scale 0
held: pace still 2.5
released: pace 3.5
```

**`createRamp(value)`** eases one number toward a target: `set(to, now, seconds?)` starts a smoothstep from the value
at `now` (it leaves and arrives at rest), `at(now)` reads it, and `target` is where it is heading. Feed it pace time
to slow with the scene, or real time to ignore it.

```
ramp 0 → 1 over 0.5 s, halfway: 0.5 | target 1
```

## Things that bite

- **Prefs are not in the save.** An export does not carry them and an import does not change them; a fresh profile
  keeps them. That is the point, but it means a choice a player expects on another machine belongs in settings.
- **`usePrefs` with `select` has the selector rule.** It compares by identity, so a `select` that builds a new object
  every call (`(v) => ({ q: v.quality })`) re-renders forever. Select one value, or read the whole object.
- **A write that fails is dropped.** Storage that is full or denied keeps the choice for the session only, with no
  error. Prefs are a convenience; nothing in the game should depend on one having been written.
- **`read` runs on every `set`.** `set` saves what `read` makes of the stored value with the patch merged over it.
  `read` sees only that merge and `initial`, so a patch it refuses (an unknown quality) falls back to whatever `read`
  gives for it, usually the initial value, not the value before. Check a choice before you `set` it.
- **An override is per load.** It is laid over the value each time the prefs store is made, from what you pass, and
  never saved. Read it from the address at module level, as the example does, or it will not be there on the first
  frame.
- **The pace clock is not game time.** Never price, pay or time anything in the economy on it: a held moment would
  pause income on the screen but not in the save, and the two would disagree. Game time is the store's `gameNow()`.
- **Build the pace clock once.** Each clock starts its count at the moment it is made. Make one at module level (or in
  a ref) and pass it down; one made in a render starts over on every render.

## Where the guide teaches it

- [Chapter 10, The page](guide/10-the-page.md): settings, the runtime hook, and what the page owns.
- [Chapter 11, Look and sound](guide/11-look-and-sound.md): the frame-time values a shader reads, where a pace clock
  slows a whole scene.
- API: [`api/core/prefs.d.ts`](../api/core/prefs.d.ts), [`api/core/pace.d.ts`](../api/core/pace.d.ts),
  [`api/react/prefs.d.ts`](../api/react/prefs.d.ts).
