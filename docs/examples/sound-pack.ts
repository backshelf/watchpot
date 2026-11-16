// A game's `scripts/pack.ts`: `bun scripts/pack.ts` turns the folder of downloads into encoded files and a manifest.
import { buildPack } from "watchpot/sound/pack";

await buildPack({
  source: "audio/source", // shots/, loops/, irs/ (and a `<file>.json` sidecar beside any of them)
  out: "src/audio/packs", // writes src/audio/packs/ui/<sample>.opus and src/audio/packs/ui/pack.ts
  name: "ui",
  tempo: 120, // every loop is stretched and cut to this
  key: "Am",
  // codec: "flac", // Opus in Ogg is the default
  // targets: { shots: -18, loops: -20 }, // LUFS; these are the defaults
});

// Then, in the game: `import { pack } from "./audio/packs/ui/pack";` and hand it to `createSound({ packs: { ui: pack } })`.
