// Internal taskloop module. Its public seam is the export list at the end.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { STATE_DIR, TASK_FILE, isPlainObject } from "./prims.mjs";

function taskPath(repo) {
  return path.join(repo, STATE_DIR, TASK_FILE);
}

function loadTask(repo) {
  const file = taskPath(repo);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (isPlainObject(parsed)) return parsed;
    process.stderr.write(`taskloop: state-unreadable ${file}: root must be a JSON object; releasing supervision\n`);
    return null;
  } catch (err) {
    if (err?.code !== "ENOENT") {
      process.stderr.write(`taskloop: state-unreadable ${file}: ${err?.message ?? err}; releasing supervision\n`);
    }
    return null;
  }
}

function saveTask(repo, task) {
  const dir = path.join(repo, STATE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  // The state dir ignores itself: task state and session-authored checkers
  // must never surface in a target repo's diff (observed live: .taskloop/
  // scripts sitting untracked in a repo whose team had never heard of the
  // loop). Help-text advice did not create the ignore; the dir carries it.
  const ignore = path.join(dir, ".gitignore");
  if (!fs.existsSync(ignore)) {
    try {
      fs.writeFileSync(ignore, "*\n", "utf8");
    } catch {
      /* advisory: a read-only checkout still gets a working task file */
    }
  }
  const target = taskPath(repo);
  const temporary = path.join(
    dir,
    `.${TASK_FILE}.${process.pid}.${process.hrtime.bigint().toString(36)}.tmp`,
  );
  try {
    fs.writeFileSync(temporary, JSON.stringify(task, null, 2) + "\n", "utf8");
    fs.renameSync(temporary, target);
  } catch (err) {
    try {
      fs.rmSync(temporary, { force: true });
    } catch {
      /* preserve the original write failure */
    }
    throw err;
  }
}

function archiveTask(repo, task, at) {
  const archive = path.join(repo, STATE_DIR, "history");
  fs.mkdirSync(archive, { recursive: true });
  fs.writeFileSync(
    path.join(archive, `task-${String(at).replace(/[:]/g, "")}-${task.id ?? "legacy"}.json`),
    JSON.stringify(task, null, 2) + "\n",
    "utf8",
  );
}

export {
  taskPath,
  loadTask,
  saveTask,
  archiveTask,
};
