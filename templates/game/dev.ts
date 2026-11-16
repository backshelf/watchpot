// Dev server. Bun's HTML dev server drops CSS-module imports while HMR is on (oven-sh/bun#18258), so this runs the
// same bundler with HMR off: refresh the page to see a change.
import index from "./index.html";

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  routes: { "/*": index },
  development: { hmr: false, console: true },
});

console.log(`dev server on ${server.url} (HMR off; refresh to see changes)`);
