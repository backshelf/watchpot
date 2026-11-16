// Plays VOID IF REMOVED from an untouched state and captures its opening, for the site's "a game made on it" sheet.
//   bun site/tools/capture-game.ts <port> [minutes] [out dir]
// Start the game's own dev server on <port> first, and never on the port its owner plays on: a port of its own is an
// origin of its own, and the browser here runs in a throwaway profile, so no existing save is read or written. It
// captures the opening minutes only; keep `minutes` small. Stills are PNG; the clip is JPEG frames with their times
// (`frames/stamps.json`), for ffmpeg to assemble. See site/assets/game/README.md.
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launch, open, type Page, sleep } from "./cdp";

const port = Number(process.argv[2]);
const minutes = Math.min(15, Number(process.argv[3] ?? 10));
const out = process.argv[4] ?? join(tmpdir(), "watchpot-site-captures");
if (!port || port === 3000) {
  console.error(
    "give the port of a dev server started for this capture (never 3000, where the game is played)",
  );
  process.exit(1);
}
const url = `http://localhost:${port}/`;
const frames = join(out, "frames");
mkdirSync(frames, { recursive: true });

/** The middle of whatever can be bought now, and of a page's "got it". */
const pressable = `(() => [...document.querySelectorAll('button[data-tone="signal"]:not(:disabled), button[data-tone="ink"]:not(:disabled)')]
  .filter((b) => b.dataset.tone === "signal" || /^got it$/i.test((b.textContent || "").trim()))
  .map((b) => { const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width }; })
  .filter((p) => p.w > 0 && p.y > 0 && p.y < innerHeight))()`;

const middleOf = (selector: string) =>
  `(() => { const b = document.querySelector(${JSON.stringify(selector)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`;

async function feed(page: Page, presses: number, gapMs: number) {
  for (let i = 0; i < presses; i++) {
    await page.key(" ", "Space", 32);
    await sleep(gapMs);
  }
}

async function buy(page: Page) {
  const points = await page.evaluate<{ x: number; y: number }[]>(pressable);
  for (const p of points.slice(0, 6)) {
    await page.click(p.x, p.y);
    await sleep(60);
  }
  await page.move(720, 880);
}

const debugPort = 9300 + Math.floor(Math.random() * 90);
const { proc, ws } = await launch(debugPort, join(tmpdir(), `watchpot-site-capture-${Date.now()}`));
try {
  const page = await open(ws);
  await page.viewport(1440, 900, 2);
  await page.goto(url);
  const saved = await page.evaluate<string[]>("Object.keys(localStorage)");
  if (saved.length > 0)
    throw new Error(`this origin already holds a save (${saved.join(", ")}): use another port`);
  await sleep(9000);
  await page.shot(join(out, "title.png"));

  // The first press and the minute after it, recorded.
  await page.viewport(1280, 800, 1.5);
  await sleep(1500);
  const stamps: number[] = [];
  page.on("Page.screencastFrame", (frame) => {
    void Bun.write(
      join(frames, `f${String(stamps.length).padStart(5, "0")}.jpg`),
      Buffer.from(frame.data, "base64"),
    );
    stamps.push(frame.metadata.timestamp);
    void page.send("Page.screencastFrameAck", { sessionId: frame.sessionId });
  });
  // One frame in six: recording every frame starves the game's own clock.
  await page.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 6 });
  await sleep(1200);
  await page.key(" ", "Space", 32);
  await sleep(5000);
  for (let round = 0; round < 12; round++) {
    await feed(page, 14, 110);
    await buy(page);
  }
  await sleep(800);
  await page.send("Page.stopScreencast");
  await Bun.write(join(frames, "stamps.json"), JSON.stringify(stamps));

  await page.viewport(1440, 900, 2);
  const started = Date.now();
  while (Date.now() - started < minutes * 60_000) {
    await feed(page, 20, 90);
    await buy(page);
  }
  await sleep(1200);
  await page.shot(join(out, "first-page.png"));

  // The second page, then a phone's composition of the same profile.
  const tab = await page.evaluate<{ x: number; y: number } | null>(middleOf('button[data-page="stamps"]'));
  if (tab) {
    await page.click(tab.x, tab.y);
    await sleep(4000);
    await page.shot(join(out, "second-page.png"));
    const back = await page.evaluate<{ x: number; y: number } | null>(middleOf('button[data-page="feed"]'));
    if (back) await page.click(back.x, back.y);
    await sleep(1500);
  }
  await page.viewport(390, 844, 3, true);
  await page.goto(url);
  await sleep(5000);
  await page.shot(join(out, "phone.png"));
  console.log(`captures in ${out} (${stamps.length} frames for the clip)`);
  await page.close();
} finally {
  proc.kill();
}
