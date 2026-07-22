import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalJson, sha256Hex } from "../lib/prims.mjs";
import {
  REQUIRED_CELLS,
  aggregateReceipts,
  sourceManifest,
  validateAggregateProof,
} from "../spikes/multi-root-authority/receipt.mjs";

const ROOT = path.resolve(".");

function temporaryRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workloop-receipts-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function headSha() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function context(platform) {
  if (platform === "linux") return { job: "spike", runner_label: "ubuntu-latest" };
  if (platform === "macos") return { job: "spike", runner_label: "macos-latest" };
  return { job: "spike", runner_label: platform };
}

function writeSyntheticReceipts(directory, env) {
  const manifest = sourceManifest(ROOT);
  for (const [platform, nodeMajor] of REQUIRED_CELLS) {
    const cell = context(platform);
    const receipt = {
      receipt_schema_version: 1,
      status: "passed",
      repository: env.GITHUB_REPOSITORY,
      run_id: env.GITHUB_RUN_ID,
      run_attempt: env.GITHUB_RUN_ATTEMPT,
      workflow_ref: env.GITHUB_WORKFLOW_REF,
      job: cell.job,
      commit_sha: env.GITHUB_SHA,
      platform,
      runner_label: cell.runner_label,
      node: `v${nodeMajor}.99.0`,
      node_major: nodeMajor,
      source_manifest_digest: manifest.manifest_digest,
    };
    fs.writeFileSync(path.join(directory, `receipt-${platform}-node-${nodeMajor}.json`), `${JSON.stringify(receipt)}\n`);
  }
}

test("[MAR-RECEIPT] aggregate proof requires one exact tuple from one run, attempt, SHA, repository, workflow, and source manifest", (t) => {
  const directory = temporaryRoot(t);
  const env = {
    GITHUB_REPOSITORY: "hex1n/workloop",
    GITHUB_RUN_ID: "123456789",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_WORKFLOW_REF: "hex1n/workloop/.github/workflows/multi-root-authority-spike.yml@refs/heads/probe",
    GITHUB_SHA: headSha(),
  };
  writeSyntheticReceipts(directory, env);
  assert.throws(() => aggregateReceipts(ROOT, directory, { ...env, GITHUB_REPOSITORY: "fork/workloop" }), { code: "UNTRUSTED_REPOSITORY" });
  assert.throws(() => aggregateReceipts(ROOT, directory, { ...env, GITHUB_WORKFLOW_REF: "hex1n/workloop/.github/workflows/other.yml/heads/probe" }), { code: "UNTRUSTED_WORKFLOW" });
  const proof = aggregateReceipts(ROOT, directory, env);
  assert.equal(proof.cells.length, 8);
  assert.equal(new Set(proof.cells.map((receipt) => `${receipt.platform}/node-${receipt.node_major}`)).size, 8);
  assert.equal(new Set(proof.cells.map((receipt) => receipt.commit_sha)).size, 1);
  assert.equal(validateAggregateProof(ROOT, proof), proof);

  const tampered = structuredClone(proof);
  tampered.cells[0].run_attempt = "2";
  assert.throws(() => validateAggregateProof(ROOT, tampered), { code: "INVALID_PROOF" });

  const staleCheckout = structuredClone(proof);
  staleCheckout.candidate_sha = "0".repeat(40);
  for (const cell of staleCheckout.cells) cell.commit_sha = staleCheckout.candidate_sha;
  const stalePreimage = { ...staleCheckout };
  delete stalePreimage.proof_digest;
  staleCheckout.proof_digest = sha256Hex(canonicalJson(stalePreimage));
  assert.throws(() => validateAggregateProof(ROOT, staleCheckout), { code: "CHECKOUT_SHA_MISMATCH" });
});

test("[MAR-RECEIPT] copied, stale, missing, extra, and wrong-run receipts fail aggregation", (t) => {
  const directory = temporaryRoot(t);
  const env = {
    GITHUB_REPOSITORY: "hex1n/workloop",
    GITHUB_RUN_ID: "123456789",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_WORKFLOW_REF: "hex1n/workloop/.github/workflows/multi-root-authority-spike.yml@refs/heads/probe",
    GITHUB_SHA: headSha(),
  };
  writeSyntheticReceipts(directory, env);

  const mac22 = path.join(directory, "receipt-macos-node-22.json");
  const original = fs.readFileSync(mac22, "utf8");
  fs.copyFileSync(path.join(directory, "receipt-linux-node-22.json"), mac22);
  assert.throws(() => aggregateReceipts(ROOT, directory, env), { code: "INVALID_RECEIPT" });
  fs.writeFileSync(mac22, original);

  const stale = JSON.parse(original);
  stale.commit_sha = "0".repeat(40);
  fs.writeFileSync(mac22, `${JSON.stringify(stale)}\n`);
  assert.throws(() => aggregateReceipts(ROOT, directory, env), { code: "INVALID_RECEIPT" });
  fs.writeFileSync(mac22, original);

  fs.writeFileSync(path.join(directory, "receipt-extra.json"), "{}\n");
  assert.throws(() => aggregateReceipts(ROOT, directory, env), { code: "RECEIPT_SET_MISMATCH" });
  fs.rmSync(path.join(directory, "receipt-extra.json"));

  fs.rmSync(path.join(directory, "receipt-windows-2025-node-24.json"));
  assert.throws(() => aggregateReceipts(ROOT, directory, env), { code: "RECEIPT_SET_MISMATCH" });
});
