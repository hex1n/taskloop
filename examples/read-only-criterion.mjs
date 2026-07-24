#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const SATISFIED = 4;
const UNSATISFIED = 3;
const INDETERMINATE = 2;

function say(message) {
  process.stdout.write(`WORKLOOP_CRITERION: ${message}\n`);
}

const suite = spawnSync("npm", ["test"], { encoding: "utf8", timeout: 100_000, maxBuffer: 10 * 1024 * 1024 });
if (suite.error || suite.status === null) {
  say(`npm test could not run: ${suite.error?.code ?? suite.error?.message ?? suite.signal ?? "test process unavailable"}`);
  process.exit(INDETERMINATE);
}
if (suite.status === 0) {
  say("npm test is satisfied");
  process.exit(SATISFIED);
}
say("npm test is unsatisfied");
process.exit(UNSATISFIED);
