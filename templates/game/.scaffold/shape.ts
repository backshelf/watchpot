/**
 * Writes one shape of the template, as the scaffold would, but with no install, no git and no network: for checking
 * a change to the template against an answers file from inside the engine checkout.
 *
 *   bun templates/game/.scaffold/shape.ts <answers.json> <out-dir>
 *
 * `out-dir` must sit inside the engine checkout (its `.scratch/`, which git ignores): the game's `package.json` is
 * left out, so `watchpot/*` resolves to the checkout's own source and every other import to its `node_modules`. Then
 * `bunx tsc -p <out-dir>`, and `bun test` and `bun sim/run.ts --contract` from inside it, run the shape as it stands.
 */
import { cp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { generate } from "./generate";

const TEMPLATE = resolve(import.meta.dir, "..");

/** Copies the template to `out` (emptied first), generates `answers` into it and drops its `package.json`. */
export async function writeShape(answers: string, out: string, engine = "v0.0.0") {
  const dir = resolve(out);
  await rm(dir, { recursive: true, force: true });
  await cp(TEMPLATE, dir, {
    recursive: true,
    filter: (src) => !/[\\/](node_modules|\.git|\.scaffold)([\\/]|$)/.test(src.slice(TEMPLATE.length)),
  });
  const plan = await generate({ answers: resolve(answers), out: dir, engine, mode: "full" });
  await rm(join(dir, "package.json"), { force: true });
  return plan;
}

if (import.meta.main) {
  const [answers, out] = process.argv.slice(2);
  if (!answers || !out) {
    console.error("usage: bun templates/game/.scaffold/shape.ts <answers.json> <out-dir>");
    process.exit(2);
  }
  const plan = await writeShape(answers, out);
  console.log(`wrote ${plan.name} (${plan.core}${[...plan.features].map((f) => `, ${f}`).join("")}) to ${resolve(out)}`);
}
