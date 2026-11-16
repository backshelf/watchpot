// Looks at a page at a real size, in a real browser:
//   bun site/tools/shot.ts <url> <out.png> [width] [height] [dpr] [dark] [reduced] [full] [sel=<css>] [y=<px>] [<waitMs>]
// It prints the page's horizontal overflow and everything its console said ("console clean" when nothing).
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launch, open, sleep } from "./cdp";

const [url, out, w = "1440", h = "900", dpr = "1", ...flags] = process.argv.slice(2);
if (!url || !out) {
  console.error("usage: bun site/tools/shot.ts <url> <out.png> [width] [height] [dpr] [flags]");
  process.exit(1);
}
const waitMs = Number(flags.find((f) => /^\d+$/.test(f)) ?? 2600);
const scrollTo = flags.find((f) => f.startsWith("y="))?.slice(2);
const selector = flags.find((f) => f.startsWith("sel="))?.slice(4);
const port = 9400 + Math.floor(Math.random() * 400);
const { proc, ws } = await launch(port, join(tmpdir(), `watchpot-site-shot-${port}`));
try {
  const page = await open(ws);
  await page.viewport(Number(w), Number(h), Number(dpr), Number(w) < 700);
  await page.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: flags.includes("dark") ? "dark" : "light" },
      { name: "prefers-reduced-motion", value: flags.includes("reduced") ? "reduce" : "no-preference" },
    ],
  });
  await page.goto(url);
  await sleep(waitMs);
  if (selector) {
    await page.evaluate(
      `document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ block: "start" })`,
    );
  }
  if (scrollTo) await page.evaluate(`window.scrollTo(0, ${Number(scrollTo)})`);
  if (selector || scrollTo) await sleep(900);
  if (flags.includes("full")) {
    const size = await page.evaluate<{ w: number; h: number }>(
      "({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight })",
    );
    await page.shot(out, { x: 0, y: 0, width: size.w, height: size.h });
  } else await page.shot(out);
  const overflow = await page.evaluate<number>(
    "document.documentElement.scrollWidth - document.documentElement.clientWidth",
  );
  console.log("overflow-x:", overflow);
  const logs = page.logs.filter((line) => !line.includes("DevTools"));
  console.log(logs.length > 0 ? logs.join("\n") : "console clean");
  await page.close();
} finally {
  proc.kill();
}
