// `bun run test:changed`: the tests a change since `main` touches, or every test when `main` does not resolve yet
// (outside git, before the first commit, or on another default branch name).
const main = Bun.spawnSync(["git", "rev-parse", "--verify", "--quiet", "main"], { stdout: "ignore", stderr: "ignore" });
const args = main.exitCode === 0 ? ["--changed=main", "--pass-with-no-tests"] : [];
if (!args.length) console.log("test:changed: no main branch to compare with, so every test runs");
const run = Bun.spawnSync([process.execPath, "test", ...args, ...process.argv.slice(2)], {
  stdout: "inherit",
  stderr: "inherit",
});
process.exit(run.exitCode ?? 1);
