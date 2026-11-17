// A tiny sim job for the gate tests: prints `{"seed": N}` after a seed-dependent sleep.
// Flags: --sleep=<ms> (default 0), --reverse (sleep scales with 5 - seed, so later seeds finish first),
// --fail=<seed> (exit 1 for that seed).
const flag = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const seed = Number(flag("seed"));
if (flag("fail") === String(seed)) {
  console.error(`seed ${seed} failed on purpose`);
  process.exit(1);
}
const base = Number(flag("sleep") ?? 0);
const ms = process.argv.includes("--reverse") ? base * (5 - seed) : base;
await new Promise((resolve) => setTimeout(resolve, ms));
console.log(JSON.stringify({ seed }));

export {};
