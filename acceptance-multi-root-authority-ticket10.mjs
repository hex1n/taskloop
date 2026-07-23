import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["--test", "tests/git-task-receipts.test.mjs", "tests/filesystem-detached-authority.test.mjs"], { encoding: "utf8", timeout: 120_000 });
if (result.error || result.status === null || /Could not find|ERR_MODULE_NOT_FOUND/u.test(result.stderr ?? "")) {
  process.stdout.write("WORKLOOP_CRITERION: ticket10 terminal-certification evidence is indeterminate\n");
  process.exit(2);
}
if (result.status === 0) {
  process.stdout.write("WORKLOOP_CRITERION: ticket10 attachment-aware terminal certification is satisfied\n");
  process.exit(4);
}
process.stdout.write("WORKLOOP_CRITERION: ticket10 terminal-certification requirement remains unsatisfied\n");
process.exit(3);
