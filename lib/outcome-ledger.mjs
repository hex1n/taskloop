import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { LEDGER_DIR, LEDGER_FILE } from "./prims.mjs";

function ledgerPath() {
  const home = path.resolve(process.env.USERPROFILE || process.env.HOME || os.homedir());
  return path.join(home, LEDGER_DIR, LEDGER_FILE);
}

function appendOutcomeRow(row) {
  try {
    const file = ledgerPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(row) + "\n", "utf8");
  } catch {
    /* the ledger is telemetry: degrade, never trap */
  }
}

function readOutcomeText() {
  const file = ledgerPath();
  try {
    return { file, raw: fs.readFileSync(file, "utf8") };
  } catch {
    return { file, raw: null };
  }
}

export { appendOutcomeRow, ledgerPath, readOutcomeText };
