// Usage: bun design/build-tokens.ts [out.css]. Compiles design/tokens.json into src/tokens.css (committed).
// The fonts are Google-hosted: index.html links them, so tokens.json lists families and no font files.
import { join } from "node:path";
import { buildTokens } from "watchpot/kit/theme";

const here = import.meta.dir;
await buildTokens({ tokens: join(here, "tokens.json"), out: process.argv[2] ?? join(here, "..", "src", "tokens.css") });
