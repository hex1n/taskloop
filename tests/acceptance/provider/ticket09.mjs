import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["--test", "tests/git-task-receipts.test.mjs"], { encoding: "utf8", timeout: 120_000 });
if (result.error || result.status === null) {
  process.stdout.write("WORKLOOP_CRITERION: ticket09 receipt evidence is indeterminate\n");
  process.exit(2);
}
if (result.status === 0) {
  process.stdout.write("WORKLOOP_CRITERION: ticket09 task-scoped Git receipts are satisfied\n");
  process.exit(4);
}
process.stdout.write("WORKLOOP_CRITERION: ticket09 task-scoped Git receipt requirement remains unsatisfied\n");
process.exit(3);
