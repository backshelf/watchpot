import { failing, p10p90, type Tally, tally, type Verdict } from "./contract";

/**
 * The gate runner: checks over sim jobs, every job run once however many checks read it, all at once (a process
 * each with `spawnJob`, so the gate takes as long as its slowest run). A check fails the gate when a majority of its
 * runs miss it (`tally`); a check marked `todo` is printed but never fails.
 */
export interface GateCheck<J, Res> {
  id: string;
  jobs: readonly J[];
  /** The verdicts, one list per run to tally: a run per seed, or one for a comparison. */
  judge: (results: readonly Res[]) => Verdict[][];
}

/** One check's tallies over the seeded runs of a gate, and those that fail on a majority. */
export interface GateResult {
  id: string;
  tallies: Tally[];
  failing: Tally[];
}

/** How a gate runs its jobs: the `key` that names a job and the `run` that plays it. */
export interface GateRunner<J, Res> {
  /** A job's identity: two checks naming the same job share one run. */
  key(job: J): string;
  run(job: J): Promise<Res>;
}

/** Runs every job the checks name once, all at once, and tallies each check over the results. */
export async function runGate<J, Res>(
  checks: readonly GateCheck<J, Res>[],
  { key, run }: GateRunner<J, Res>,
): Promise<GateResult[]> {
  const jobs = new Map(checks.flatMap((c) => c.jobs).map((j) => [key(j), j] as const));
  const done = new Map(await Promise.all([...jobs].map(async ([k, j]) => [k, await run(j)] as const)));
  return checks.map((c) => {
    const tallies = tally(c.judge(c.jobs.map((j) => done.get(key(j)) as Res)));
    return { id: c.id, tallies, failing: failing(tallies) };
  });
}

/** Runs a script in its own Bun process and parses what it prints as JSON; a non-zero exit throws with its stderr. */
export async function spawnJob<Res>(script: string, args: readonly string[]): Promise<Res> {
  const proc = Bun.spawn([process.execPath, script, ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`gate job ${[script, ...args].join(" ")} exited ${code}: ${err}`);
  return JSON.parse(out) as Res;
}

/** Each check's count of checks held by a majority, then every check's runs, values and spread. */
export function formatGate(results: readonly GateResult[]): string {
  return results
    .map((r) => {
      const held = r.tallies.filter((t) => !t.todo).length - r.failing.length;
      const todo = r.tallies.filter((t) => t.todo).length;
      const head = `${r.id}: ${held} of ${r.tallies.length - todo} checks held by a majority of runs${todo ? `, ${todo} todo` : ""}`;
      const rows = r.tallies.map((t) => {
        const out = t.out * 2 > t.of;
        const mark = t.todo ? (out ? "TODO" : "todo") : out ? "OUT " : "in  ";
        const [lo, hi] = p10p90(t.values);
        const spread = t.values.length >= 5 ? ` p10-p90 ${+lo.toFixed(2)}-${+hi.toFixed(2)}` : "";
        return `  ${mark} ${t.out} of ${t.of} out: ${t.name} (${t.values.map((v) => +v.toFixed(2)).join(", ")})${spread}`;
      });
      return [head, ...rows].join("\n");
    })
    .join("\n");
}
