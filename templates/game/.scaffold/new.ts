/**
 * Makes a new game from an answers file, start to finish: the whole scaffold, with nothing outside this repository.
 *
 *   bun templates/game/.scaffold/new.ts <answers.json> <out-dir> [--engine <tag>] [--no-install]
 *
 * From a checkout of the engine, or from an install of it (`bun node_modules/watchpot/templates/game/.scaffold/new.ts`).
 * `answers.md` beside this file is the answers' reference; `fixtures/smallest-clicker.json` is the least one says.
 *
 * Steps: copy the template into `<out-dir>` (missing or empty), write the game from the answers (`generate.ts`: the
 * content, the gating, the `*.tmpl` files, `src/tokens.css`), then `bun install` (the engine at `--engine`, by default
 * this engine's own version) and `bun run lint:fix`. Stops at the first failing step and says which. `--no-install`
 * stops after the files are written.
 */
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { engineTag, generate, lookWarnings } from "./generate";

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const [, value] = argv.splice(i, 2);
  return value;
};
const has = (name: string): boolean => {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0) argv.splice(i, 1);
  return i >= 0;
};

const engine = flag("engine") ?? (await engineTag());
const install = !has("no-install");
const [answersArg, outArg] = argv;
if (!answersArg || !outArg) {
  console.error("usage: bun .scaffold/new.ts <answers.json> <out-dir> [--engine <tag>] [--no-install]");
  process.exit(2);
}
const answers = resolve(answersArg);
const out = resolve(outArg);

if (!(await Bun.file(answers).exists())) {
  console.error(`new: no answers file at ${answers}`);
  process.exit(2);
}
const held = await readdir(out).catch(() => []);
if (held.length) {
  console.error(`new: ${out} exists and is not empty`);
  process.exit(2);
}

/** Runs a command in the game's folder, its output streamed; exits naming the step when it fails. */
function run(cmd: string[]) {
  console.log(`$ ${cmd.join(" ")}`);
  const p = Bun.spawnSync(cmd, { cwd: out, stdout: "inherit", stderr: "inherit" });
  if (p.exitCode !== 0) {
    console.error(`\nnew: "${cmd.join(" ")}" failed (exit ${p.exitCode}) in ${out}`);
    process.exit(1);
  }
}

console.log(`== generate (watchpot ${engine})`);
const plan = await generate({ answers, out, engine, mode: "full" });
for (const w of lookWarnings(plan)) console.warn(`look: ${w}`);

if (install) {
  console.log("\n== install");
  run([process.execPath, "install"]);
  console.log("\n== format");
  run([process.execPath, "run", "lint:fix"]);
}

console.log(`\nnew: ${plan.name} is at ${out}.`);
console.log(
  [
    "Next:",
    `  cd ${outArg}`,
    ...(install ? [] : ["  bun install && bun run lint:fix"]),
    "  git init -b main && git add -A && git commit -m \"feat: scaffold the game\"",
    "  bun run verify     # typecheck, lint, tests",
    "  bun run dev        # http://localhost:3000, and play it",
  ].join("\n"),
);
