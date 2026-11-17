import { GlobalRegistrator } from "@happy-dom/global-registrator";

const g = globalThis as Record<string, unknown>;
const WEB = ["Response", "Request", "Headers", "fetch", "WebSocket"] as const;
/** Bun's own fetch globals, kept before happy-dom replaces them (`Bun.serve` refuses happy-dom's `Response`). */
const bun = Object.fromEntries(WEB.map((k) => [k, g[k]]));

GlobalRegistrator.register();

/**
 * For a test file that runs a real server: Bun's fetch globals from now until the returned function puts happy-dom's
 * back. Call it in `beforeAll` and the result in `afterAll`. The page stays happy-dom's, so other files are untouched.
 */
export function useBunFetch(): () => void {
  const dom = Object.fromEntries(WEB.map((k) => [k, g[k]]));
  Object.assign(g, bun);
  return () => void Object.assign(g, dom);
}
