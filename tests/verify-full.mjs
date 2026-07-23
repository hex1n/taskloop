import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const result = spawnSync(
  process.execPath,
  ["--test", "tests/authority-transaction.test.mjs", "tests/provider-installer.test.mjs", "tests/git-main-authority.test.mjs", "tests/git-task-receipts.test.mjs", "tests/git-linked-worktree-authority.test.mjs", "tests/git-partitioned-multitask-authority.test.mjs", "tests/git-exclusive-worktree-authority.test.mjs", "tests/filesystem-detached-authority.test.mjs", "tests/attachment-recovery-authority.test.mjs"],
  { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
);
process.stdout.write(String(result.stdout ?? ""));
process.stderr.write(String(result.stderr ?? ""));
process.exit(Number.isInteger(result.status) ? result.status : 1);
