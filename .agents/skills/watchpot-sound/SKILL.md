---
name: watchpot-sound
description: >
  Add or change sound in a watchpot idle game: start from the engine's preset voices in one line, write a cue out in
  full when a preset is not right, play recordings from a pack, and balance the mix with the sound desk, explained
  for someone who has never mixed audio. Use when the user wants sounds, a click or buy sound, music, a quieter or
  louder mix, a sound that "sounds wrong", recordings or samples, or asks how `watchpot/sound` works. Not for the
  engine's DSP internals.
---

# watchpot-sound

`watchpot/sound` is the engine's sound: `createSound` takes a table of cues (names you play, and what they sound
like) and returns `sound`, which the game calls as `sound.play("buy")`. The docs are `node_modules/watchpot/docs/`:
`sound.md` first, then `sound-table.md` (cues), `sound-mix.md` (buses, effects, the desk), `sound-music.md`,
`sound-packs.md` (recordings). The getting-started guide's chapter 11 builds a game's sound step by step.

## Where a request goes

| The user wants | Do this |
| --- | --- |
| Sound in a game that has none | The quick path below, one line |
| A preset that is close but not right | Write that one cue out in full (`docs/sound-table.md`), keep the rest as presets |
| A recording (a real door, a coin from a sample library) | A pack (`docs/sound-packs.md`), then the cue `"<pack>/<sample>"` |
| Something louder, quieter, muddier, harsher | The mix, not the cue: the desk guide below |
| Music, a tempo, a beat | `docs/sound-music.md` |
| A volume slider for the player | `sound.mixer.setBusVolume(bus, 0..1)` (`docs/sound-mix.md` › Moving the mix) |

## The quick path

```ts
import { createSound, mixPresets } from "watchpot/sound";

export const sound = createSound({
  cues: { tap: "ui.click", buy: "sfx.buy", coin: "sfx.coin", levelUp: "sfx.levelup" },
  mix: mixPresets.balanced,
});
```

- A cue can be the name of one of the engine's eighteen preset voices (`PRESET_VOICE_NAMES`): `ui.*` are short,
  quiet interface sounds that play the same every time; `sfx.*` are game sounds with a little variation so a sound
  played a hundred times does not drone. They are synthesised, so nothing downloads.
- `mix` is a starting balance: `balanced`, `quietMusic` or `softUi`.
- Sound only starts after the player's first tap or key (browsers require it). `useGameRuntime(store, { sound: {
  engine: sound, on } })` handles that, and mutes while `on` is false. Without it, call `sound.armUnlock()` once.
- Wrap cues in named functions (`export const playBuy = () => sound.play("buy")`) so screens never spell a key.

## When to step up to a full cue

Write a cue out (`{ bus, voices: [...], vary, cooldownMs }`) when a preset does not fit the game's feel: the wrong
pitch, too long, too bright, or the same sound standing in for two different things. Keep to one key for sounds that
can play together, so they do not clash. A sound that can fire many times a second needs `cooldownMs`, or it turns
into a buzz.

## The desk, for someone who is not a sound engineer

A game's sound has **buses**: channels that group sounds (`ui`, `sfx`, `music`, `ambience`, `voice`, plus any the
game adds). Every bus has a **fader**, a volume in dB: 0 is as declared, -6 is about half as loud, -20 is quiet.
The sound desk (`openSoundDesk` from `watchpot/devtools`, development builds only) shows them side by side like a
mixing desk, and what you move is heard at once and saved as a mix file the game loads.

Work in this order, and stop as soon as it sounds right:

1. **Faders first.** Play the game for a minute, and set each bus so nothing jumps out or gets lost. Most mixes are
   fixed here. Interface sounds usually sit well under game sounds; music sits under both.
2. **Mute and solo** to hear one bus alone when you cannot tell what is too loud.
3. **Only then effects.** An effect changes the sound's character, not just its level: a **filter** removes high or
   low frequencies (harsh means too much high; muddy means too much low), a **compressor** evens out loud and quiet
   moments, a **reverb** adds a sense of room, a **delay** adds echoes. Add one at a time and compare with it off.
4. **Ducking**, for a big moment: a compressor keyed to the `sfx` bus can pull the music down briefly while a
   sound plays (`docs/sound-mix.md` › Effects, "The duck").

If a sound is wrong in itself (the wrong pitch or length), change the cue, not the mix.

## Checking it

Tests run without audio. Check sound by ear in the dev server; check the code with `bun run verify`.
