# Moss Garden

The game's concept as `/watchpot` took it down. The answers themselves are in `answers.json` beside this file.

## Fiction

You keep a terrarium on a windowsill. Moss spreads, ferns unfurl, and somewhere under the gravel a spore bank waits.

**Voice.** Quiet, botanical, a little smug about patience. Short sentences. Latin names when it can get away with it.

**Who plays.** Someone who checks a tab between other things and likes watching a number grow green.

## Loop

- **Garden.** 5 generators make spores: Cushion moss, Sheet moss, Maidenhair fern, Pitcher plant, Strangler fig.
- **The glass.** Tap it for spores: a share of the income a press, a crit now and then, a combo for presses close together.
- **Trellis.** An upgrade tree (The trellis) of 6 nodes, bought with spores.
- **Spore bank.** Seed packet pulls for dewdrops, a ladder of Common < Rare < Heirloom, 6 things to find; every copy owned adds its bonus.
- **Repot.** Repot resets the run for Roots, each one raising growth for good.
- **Herbarium.** A wall of 12 (The herbarium), eight to a row; each earned raises growth, a full row more.
- **A woodlouse.** Turns up every few minutes and stays a few seconds; caught, it starts Turned soil: growth ×3 for 60 seconds.

Stats: Growth (output), Mist (offline share), Rootstock (prestige gain).

## Session

Built for short sessions: a handful a day, about ten minutes each. The pacing contract is `src/content/pacing.ts`.

## Look

- Palette: ground `#eef0e6`, ink `#16201a`, signal `#3f8f4e`, rarities `#8a9488` `#3c8fbf` `#c9902a`.
- Type: Fraunces (display), Work Sans (interface), JetBrains Mono (numbers), from Google Fonts.
- **The surface.** Breath on the glass: condensation drifting over green, thickening and beading as the garden grows. (scaffolded on the `weather` starter in `src/shaders/`, to be replaced.)
- **The moment.** The first heirloom pull: the glass fogs over, then clears on a ghost orchid lit gold from below.
