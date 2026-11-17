/**
 * Writes one shape of the template, as the scaffold would, but with no install, no git and no network: for checking
 * a change to the template against an answers file from inside the engine checkout.
 *
 *   bun templates/game/.scaffold/shape.ts <answers.json> <out-dir>
 *
 * `out-dir` must sit inside the engine checkout (its `.scratch/`, which git ignores): the game's `package.json` is
 * left out, so `watchpot/*` resolves to the checkout's own source and every other import to its `node_modules`. Then
 * `bunx tsc -p <out-dir>`, the production build, and `bun sim/run.ts --contract` from inside it, run the shape as it
 * stands.
 */
import { rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generate } from "./generate";

/** Whether this file is the script being run (see `generate.ts`). */
const isEntry = resolve(process.argv[1] ?? "") === join(dirname(fileURLToPath(import.meta.url)), "shape.ts");

/** Empties `out`, generates `answers` into it (the template copied first) and drops its `package.json`. */
export async function writeShape(answers: string, out: string, engine = "v0.0.0") {
  const dir = resolve(out);
  await rm(dir, { recursive: true, force: true });
  const plan = await generate({ answers: resolve(answers), out: dir, engine, mode: "full" });
  await rm(join(dir, "package.json"), { force: true });
  return plan;
}

if (isEntry) {
  const [answers, out] = process.argv.slice(2);
  if (!answers || !out) {
    console.error("usage: bun templates/game/.scaffold/shape.ts <answers.json> <out-dir>");
    process.exit(2);
  }
  const plan = await writeShape(answers, out);
  console.log(`wrote ${plan.name} (${plan.core}${[...plan.features].map((f) => `, ${f}`).join("")}) to ${resolve(out)}`);
}
