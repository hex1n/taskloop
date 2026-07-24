#!/usr/bin/env node

import fs from "node:fs";

import { abandonStagedAuthority, appendAuthority, cleanupStagedLocator, ensureAuthority, forkIdentity, publishAttachment, reattachAttachment, recoverStagedLocator, recoverTornAuthority, stageAttachment, withAuthorityLock } from "./adapter.mjs";

const [operation, encoded] = process.argv.slice(2);
const input = encoded ? JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) : {};

function output(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

const lockOptions = { timeoutMs: input.timeoutMs, staleMs: input.staleMs };
const crashOptions = {
  ...lockOptions,
  crashAt: input.crashAt,
  onCrash: () => process.exit(73),
};

if (operation === "recover-torn") {
  output(recoverTornAuthority(input.controlRoot, input, crashOptions));
} else if (operation === "stage") {
  output(stageAttachment(input, crashOptions));
} else if (operation === "recover-stage") {
  output(recoverStagedLocator(input, crashOptions));
} else if (operation === "ensure") {
  output(ensureAuthority(input.controlRoot, { authorityId: input.authorityId }, crashOptions));
} else if (operation === "append" || operation === "append-crash") {
  output(appendAuthority(input.controlRoot, {
    commandId: input.commandId,
    kind: input.kind ?? "probe_appended",
    payload: input.payload ?? {},
  }, operation === "append-crash" ? crashOptions : lockOptions));
} else if (operation === "hold-lock") {
  withAuthorityLock(input.controlRoot, () => {
    fs.writeFileSync(input.signalFile, `${process.pid}\n`);
    const view = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(view, 0, 0, input.holdMs ?? 30_000);
  }, { timeoutMs: input.timeoutMs ?? 2_000, staleMs: input.staleMs ?? 100 });
} else if (operation === "publish") {
  output(publishAttachment(input, crashOptions));
} else if (operation === "reattach") {
  output(reattachAttachment(input, crashOptions));
} else if (operation === "cleanup-staged") {
  output(cleanupStagedLocator(input, crashOptions));
} else if (operation === "abandon-staged") {
  output(abandonStagedAuthority(input, crashOptions));
} else if (operation === "fork-identity") {
  output(forkIdentity(input, crashOptions));
} else {
  process.stderr.write(`unknown worker operation: ${operation}\n`);
  process.exitCode = 2;
}
