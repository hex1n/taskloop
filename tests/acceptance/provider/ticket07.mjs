import { spawnSync } from "node:child_process";
import fs from "node:fs";

const files = [
  "tests/authority-transaction.test.mjs",
  "tests/git-main-authority.test.mjs",
  "tests/git-linked-worktree-authority.test.mjs",
  "tests/git-partitioned-multitask-authority.test.mjs",
  "tests/git-exclusive-worktree-authority.test.mjs",
  "tests/filesystem-detached-authority.test.mjs",
  "tests/provider-installer.test.mjs",
];
const required = [
  "lib/git-authority-provider.mjs",
  "lib/filesystem-authority-provider.mjs",
  "lib/authority-state.mjs",
  ".github/workflows/test.yml",
  "tests/filesystem-detached-authority.test.mjs",
];
if (required.some((target) => !fs.existsSync(target))) {
  process.stdout.write("WORKLOOP_CRITERION: ticket07 detached filesystem authority is absent\n");
  process.exit(3);
}
const result = spawnSync(process.execPath, ["--test", ...files], { encoding: "utf8", timeout: 90_000 });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error || result.status === null) {
  process.stderr.write(`ticket07 criterion unavailable: ${result.error?.message ?? result.signal ?? "test process unavailable"}\n`);
  process.stdout.write("WORKLOOP_CRITERION: ticket07 detached filesystem authority is indeterminate\n");
  process.exit(2);
}
const satisfied = result.status === 0;
process.stdout.write(`WORKLOOP_CRITERION: ticket07 detached filesystem authority is ${satisfied ? "satisfied" : "unsatisfied"}\n`);
process.exit(satisfied ? 4 : 3);
