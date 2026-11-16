# Captures of VOID IF REMOVED

Where these files came from, so nobody has to guess and anybody can take them again.

- **What:** the game's opening only. A new game's first ten minutes: its title, its first page, its second page, a
  phone's composition of the same profile, and a thirteen-second clip of the first press. Nothing a player meets
  later is shown, on purpose: the game is being played blind.
- **How:** the game's own dev server on a port of its own (`PORT=3417 bun run dev` in the game's repository), driven
  by `site/tools/capture-game.ts` through headless Microsoft Edge in a throwaway browser profile. A different port is
  a different origin and a throwaway profile is a different browser: no existing save was read or written, and no
  file in the game's repository was changed.
- **When:** 2026-11-16, the game at its `0.1.0 beta`, on watchpot `0.17.0`.
- **Sizes:** stills at 1440 × 900 CSS pixels and a device pixel ratio of 2 (`@2x`), the phone at 390 × 844 and a ratio
  of 3 (`@3x`), each with a half-size copy; the clip at 1440 × 900, 30 frames a second, H.264, no audio track.
  Encoded with ffmpeg (WebP quality 84 to 86).
- **One thing a player would see differently:** the game prints its own measured frame rate in a few small marks,
  and under the headless browser that figure read `000`.

To take them again: start the game on another port, then `bun site/tools/capture-game.ts <port> <minutes> <out dir>`.
