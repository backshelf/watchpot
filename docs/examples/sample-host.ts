// A game's `dev.ts` with the mix desk's sample host mounted: a recording dropped on a sample in the desk is processed
// here, heard in the running game, and written into the pack on Save. Development only: never in a production server.
import { sampleHost } from "watchpot/sound/pack";

const samples = sampleHost({
  out: "src/audio/packs", // where each `<pack>/pack.ts` is (`buildPack`'s `out`)
  source: "audio/source", // each pack's kept sources go in `audio/source/<pack>/`, staging in `audio/source/.staged/`
  packs: { ui: { tempo: 120, key: "Am" }, music: {} }, // the packs the desk may write, and nothing else
  // format: (file) => Bun.spawnSync(["bunx", "biome", "format", "--write", file]), // when generated files are formatted
});

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  routes: {
    "/__samples/*": (req) => samples.fetch(req),
    // "/*": index, // the game's page, as the template's dev.ts serves it
  },
  development: { hmr: false, console: true },
});
console.log(`dev server on ${server.url}`);

// In the page: `openSoundDesk({ sound, samples: fetchSampleHost("/__samples") })` (`watchpot/devtools`).
