# Settings and seen-once

Two features nearly every game writes by hand, so the engine writes them once.

**Settings** are the player's choices that belong to the profile: sound on or off, reduced motion, the colour scheme,
the number notation. They save with the game, travel in an export, and survive every run reset, because a prestige
should not turn the sound back on. Choices that belong to the device instead (a render quality, a volume for this
laptop) are [prefs](prefs.md), outside the save.

**Seen-once** is the saved set of what the player has already been shown: a tip that appears the first time, the
"new" mark on a tab, a tutorial card, a screen that introduces itself once. It also survives every run reset, since
a player who has read a tip does not need it again after a prestige.

Example: [`examples/settings.ts`](examples/settings.ts) (`bun docs/examples/settings.ts`).

```ts
/** The player's choices, saved with the profile: they travel in an export and come back on another machine. */
export interface Choices {
  sound: boolean;
  motion: "system" | "reduced" | "full";
  scheme: "system" | "light" | "dark";
}

export const choices = defineSettings({
  key: "settings",
  initial: (): Choices => ({ sound: true, motion: "system", scheme: "system" }),
});

/** What the player has been shown once: the stove's first tip, the shop's new mark. The ids are the game's. */
export const intro = defineSeenOnce({ key: "intro" });
export const TIPS = { stove: "tip.stove", shop: "tab.shop" } as const;
```

The run turns the sound off, shows the stove's tip once, resets the run, and checks what survived:

```
first stove tip new? true | again? false
a repeat seeAll leaves the state alone: true
after a run reset: bubbles 0 | sound false | seen [ "tip.stove", "tab.shop" ]
forgotten, the tip is new again: true
```

## `settings`

**`defineSettings({ key, initial })`** is a feature that saves `initial()`'s shape under `key`, with `reset: "never"`, so a
run reset leaves it alone; `resetProfile` puts it back with everything else.

- **`change(patch)`**: its one action. It merges the patch into the slice, one level deep, in one change.
- **Reading:** `state.settings.sound`, with a narrow selector on a screen: `useGameState((s) => s.settings.motion)`.

The settings that drive the page go straight into the runtime hook, which writes the motion and the scheme onto
`<html>` and mutes the sound. [React runtime](react-runtime.md) shows a shell that reads `motion` and `scheme` this
way and hands them to `usePageRuntime`.

Type `initial`'s return (`(): Choices => …`) so a union like `"system" | "reduced" | "full"` stays a union. Left to
inference, `"system"` widens to `string`, and the runtime hook refuses it.

## `seenOnce`

**`defineSeenOnce({ key })`** is a feature that saves `{ seen: Record<string, true> }` under `key`, also kept through every
run reset. The ids are yours: name them by what they mark (`"tip.stove"`, `"tab.shop"`), and keep them in one table so
a screen and its test use the same string.

- **`see(id)`**: marks one id and returns whether it was new. Use the answer to show a thing exactly once: show the
  tip when `see` says it was new.
- **`seeAll(ids)`**: marks several in one change (a "mark all read").
- **`forget(id)`**: takes one back out, so it is new again (a "show tips again" button, a test).
- **Reading:** `state.intro.seen[id] === true`. A screen draws a "new" mark while that is false.

An action that would change nothing writes nothing: `see` on an id already seen, `seeAll` when every id is seen,
`forget` on one that is not. So calling them again and again is cheap, and no save is written for it.

## Things that bite

- **Neither action works inside a recipe.** `change`, `see`, `seeAll` and `forget` are actions, and an action called
  inside another recipe (an `api.set`, a step, an `onCatch`) throws. There is no draft helper for these two; inside a
  recipe, write the draft directly: `d.settings.sound = false`, `d.intro.seen["tip.stove"] = true`.
- **Mark from an effect or a handler, not a render.** `see` changes the store, and a store change in the middle of a
  render can re-render other components while React is still rendering, which React warns about. Mark a tip seen in a `useEffect` when it first shows, or in the handler that
  closes it.
- **`change` is a shallow merge.** A nested object in the patch replaces the whole nested object. Keep settings flat,
  or patch the nested object whole.
- **A setting added later needs no migration.** The loader fills a key that `initial` has and the save lacks, one
  level down, so an older save loads with the new setting at its default. A setting renamed or retyped does need one
  (see [Migration](migration.md)).
- **A renamed seen-once id is new again.** The set holds strings; rename `"tip.stove"` and every player sees the tip
  again. Rename the id in a migration, or keep the old string.
- **Settings are in the save, so an import replaces them.** A player who imports a save from another machine gets
  that machine's sound and motion choices. If a choice should stay with this device, it is a pref.

## Where the guide teaches it

- [Chapter 7, The first reset](guide/07-the-first-reset.md#reset-rules): reset rules, and why `"never"` is right for a
  settings feature.
- [Chapter 10, The page](guide/10-the-page.md#starting-the-page-the-runtime-hook): the runtime hook the settings feed.
- [Chapter 13, From the template](guide/13-from-the-template.md): the template's own settings feature and its About
  sheet.
- API: [`api/core/settings.d.ts`](../api/core/settings.d.ts), [`api/core/seen.d.ts`](../api/core/seen.d.ts).
