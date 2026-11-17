// The `watchpot` command, run inside a game: `bunx watchpot <cmd>` or `npx watchpot <cmd>`. `bin/watchpot.mjs` calls
// `main`; the tests call it in-process with their own output and fetch. Node 20+ and Bun; Node built-ins only.
import { doctor, type FetchLike } from "./doctor";
import { skills } from "./skills";

export interface CliIo {
  /** Where a report goes. */
  out: (line: string) => void;
  /** Where a usage error goes. */
  err: (line: string) => void;
  /** The registry fetch `doctor` makes; a test passes a fake so it never reaches the network. */
  fetch: FetchLike;
  /** The environment, for `WATCHPOT_ENGINE_DIR`. */
  env: Record<string, string | undefined>;
}

const USAGE = [
  "usage: watchpot <command>",
  "",
  "  watchpot doctor                             check this game's setup: Bun, the engine, tsconfig, agent skills",
  "  watchpot skills add|update [--to <dir>[,<dir>]]   install the engine's agent skills, or refresh the ones held",
];

const defaults = (): CliIo => ({
  out: (line) => console.log(line),
  err: (line) => console.error(line),
  fetch: (url, init) => fetch(url, init),
  env: process.env,
});

/** Runs `watchpot <argv>` in `cwd`. Returns the exit code: 0 for success and help, 1 for a problem or unknown command. */
export async function main(
  argv: readonly string[],
  cwd: string = process.cwd(),
  io: Partial<CliIo> = {},
): Promise<number> {
  const all = { ...defaults(), ...io };
  const [cmd, ...rest] = argv;
  if (cmd === undefined || cmd === "help" || cmd === "--help" || cmd === "-h") {
    for (const line of USAGE) all.out(line);
    return 0;
  }
  try {
    if (cmd === "doctor") return await doctor(cwd, all.env, all.fetch, all.out);
    if (cmd === "skills") return skills(rest, cwd, all.env, all.out);
    all.err(`watchpot: unknown command "${cmd}"`);
    for (const line of USAGE) all.err(line);
    return 1;
  } catch (err) {
    all.err(`watchpot: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
