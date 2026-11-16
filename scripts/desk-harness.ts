// A page to look at the mix desk's window without a game: `bun scripts/desk-harness.ts`, then open the address it
// prints. It draws `SoundDeskView` inline over the tests' fake desk, played by a script, with a fake sample host.
// HMR is off (Bun's HTML dev server drops CSS-module imports while it is on): refresh to see a change.
//
//   ?real=1     the reference game's own sound behind the window (click to unlock; p, r, k, o play cues)
//   ?host=0     no sample host: takes and samples are shown, not changed
//   ?fail=save  Save's `onSave` rejects        ?fail=commit  the host's commit rejects
//   ?popup=1    a button that opens the desk in its own window (`openSoundDesk`) instead of drawing it inline
import index from "./desk-harness/index.html";

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3210),
  routes: { "/*": index },
  development: { hmr: false, console: true },
});

console.log(`mix desk harness on ${server.url} (HMR off; refresh to see changes)`);
