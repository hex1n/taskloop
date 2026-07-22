import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { canonicalJson, sha256Hex } from "../../lib/prims.mjs";

const TRUSTED_REPOSITORY = "hex1n/workloop";
const TRUSTED_WORKFLOW_PATH = ".github/workflows/multi-root-authority-spike.yml";

const REQUIRED_CELLS = Object.freeze([
  ["linux", "22"],
  ["linux", "24"],
  ["macos", "22"],
  ["macos", "24"],
  ["windows-2022", "22"],
  ["windows-2022", "24"],
  ["windows-2025", "22"],
  ["windows-2025", "24"],
]);

const SOURCE_PATHS = Object.freeze([
  TRUSTED_WORKFLOW_PATH,
  "acceptance-multi-root-authority-gate.mjs",
  "spikes/multi-root-authority/adapter.mjs",
  "spikes/multi-root-authority/hook-cli.mjs",
  "spikes/multi-root-authority/receipt-cli.mjs",
  "spikes/multi-root-authority/receipt.mjs",
  "spikes/multi-root-authority/worker.mjs",
  "tests/multi-root-authority-adapter.test.mjs",
  "tests/multi-root-authority-receipt.test.mjs",
  "lib/host-hooks.mjs",
  "lib/prims.mjs",
]);

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}

function exactKeys(value, fields) {
  return value && typeof value === "object" && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...fields].sort());
}

function gitHead(root) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) fail("GIT_HEAD_UNAVAILABLE", result.stderr.trim());
  return result.stdout.trim();
}

function sourceManifest(root) {
  const entries = SOURCE_PATHS.map((relative) => {
    const bytes = fs.readFileSync(path.join(root, relative));
    return { path: relative, sha256: sha256Hex(bytes), size: bytes.length };
  });
  return { entries, manifest_digest: sha256Hex(canonicalJson(entries)) };
}

function normalizedPlatform(label) {
  return ({ "ubuntu-latest": "linux", "macos-latest": "macos", "windows-2022": "windows-2022", "windows-2025": "windows-2025" })[label] ?? null;
}

function cellContext(platform) {
  if (platform === "linux") return { job: "spike", runner_label: "ubuntu-latest" };
  if (platform === "macos") return { job: "spike", runner_label: "macos-latest" };
  if (platform === "windows-2022" || platform === "windows-2025") return { job: "spike", runner_label: platform };
  fail("UNSUPPORTED_CELL", "unsupported platform " + platform);
}

function buildReceipt(root, env = process.env) {
  const platform = normalizedPlatform(env.WORKLOOP_SPIKE_PLATFORM);
  const nodeMajor = process.versions.node.split(".")[0];
  if (!platform || !REQUIRED_CELLS.some(([expectedPlatform, expectedNode]) => expectedPlatform === platform && expectedNode === nodeMajor)) fail("UNSUPPORTED_CELL", `unsupported cell ${env.WORKLOOP_SPIKE_PLATFORM}/Node ${nodeMajor}`);
  if (!/^[0-9a-f]{40}$/.test(env.GITHUB_SHA ?? "")) fail("INVALID_GITHUB_SHA", "GITHUB_SHA must be a full commit SHA");
  if (gitHead(root) !== env.GITHUB_SHA) fail("CHECKOUT_SHA_MISMATCH", "checked-out HEAD does not equal GITHUB_SHA");
  for (const key of ["GITHUB_REPOSITORY", "GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT", "GITHUB_WORKFLOW_REF", "GITHUB_JOB"]) {
    if (!String(env[key] ?? "").trim()) fail("MISSING_GITHUB_CONTEXT", `${key} is required`);
  }
  if (env.GITHUB_REPOSITORY !== TRUSTED_REPOSITORY) fail("UNTRUSTED_REPOSITORY", "receipt repository is not the canonical repository");
  if (!env.GITHUB_WORKFLOW_REF.startsWith(TRUSTED_REPOSITORY + "/" + TRUSTED_WORKFLOW_PATH + "@")) fail("UNTRUSTED_WORKFLOW", "receipt workflow is not canonical");
  const manifest = sourceManifest(root);
  return {
    receipt_schema_version: 1,
    status: "passed",
    repository: env.GITHUB_REPOSITORY,
    run_id: env.GITHUB_RUN_ID,
    run_attempt: env.GITHUB_RUN_ATTEMPT,
    workflow_ref: env.GITHUB_WORKFLOW_REF,
    job: env.GITHUB_JOB,
    commit_sha: env.GITHUB_SHA,
    platform,
    runner_label: env.WORKLOOP_SPIKE_PLATFORM,
    node: process.version,
    node_major: nodeMajor,
    source_manifest_digest: manifest.manifest_digest,
  };
}

function receiptFileName(receipt) {
  return `receipt-${receipt.platform}-node-${receipt.node_major}.json`;
}

function writeReceipt(root, outputDirectory, env = process.env) {
  const receipt = buildReceipt(root, env);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const target = path.join(outputDirectory, receiptFileName(receipt));
  fs.writeFileSync(target, `${JSON.stringify(receipt, null, 2)}\n`);
  return { receipt, target };
}

function validateReceipt(receipt, expected, manifestDigest) {
  const fields = ["receipt_schema_version", "status", "repository", "run_id", "run_attempt", "workflow_ref", "job", "commit_sha", "platform", "runner_label", "node", "node_major", "source_manifest_digest"];
  if (!exactKeys(receipt, fields)) fail("INVALID_RECEIPT", "receipt shape mismatch");
  for (const [key, value] of Object.entries(expected)) if (receipt[key] !== value) fail("INVALID_RECEIPT", `${key} mismatch for ${receipt.platform}/Node ${receipt.node_major}`);
  if (receipt.receipt_schema_version !== 1 || receipt.status !== "passed" || receipt.source_manifest_digest !== manifestDigest) fail("INVALID_RECEIPT", `invalid receipt claim for ${receipt.platform}/Node ${receipt.node_major}`);
  if (receipt.node !== `v${receipt.node_major}` && !receipt.node.startsWith(`v${receipt.node_major}.`)) fail("INVALID_RECEIPT", "Node version does not match node_major");
}

function aggregateReceipts(root, inputDirectory, env = process.env) {
  if (env.GITHUB_REPOSITORY !== TRUSTED_REPOSITORY) fail("UNTRUSTED_REPOSITORY", "aggregate repository is not canonical");
  if (!String(env.GITHUB_WORKFLOW_REF).startsWith(TRUSTED_REPOSITORY + "/" + TRUSTED_WORKFLOW_PATH + "@")) fail("UNTRUSTED_WORKFLOW", "aggregate workflow is not canonical");
  const manifest = sourceManifest(root);
  const expectedFiles = REQUIRED_CELLS.map(([platform, node]) => `receipt-${platform}-node-${node}.json`).sort();
  const actualFiles = fs.readdirSync(inputDirectory).filter((name) => name.endsWith(".json")).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) fail("RECEIPT_SET_MISMATCH", `expected ${expectedFiles.join(", ")}; got ${actualFiles.join(", ")}`);
  if (gitHead(root) !== env.GITHUB_SHA) fail("CHECKOUT_SHA_MISMATCH", "aggregate checkout does not equal GITHUB_SHA");
  const cells = [];
  for (const [platform, nodeMajor] of REQUIRED_CELLS) {
    const receipt = JSON.parse(fs.readFileSync(path.join(inputDirectory, `receipt-${platform}-node-${nodeMajor}.json`), "utf8"));
    const context = cellContext(platform);
    validateReceipt(receipt, {
      repository: env.GITHUB_REPOSITORY,
      job: context.job,
      runner_label: context.runner_label,
      run_id: env.GITHUB_RUN_ID,
      run_attempt: env.GITHUB_RUN_ATTEMPT,
      workflow_ref: env.GITHUB_WORKFLOW_REF,
      commit_sha: env.GITHUB_SHA,
      platform,
      node_major: nodeMajor,
    }, manifest.manifest_digest);
    cells.push(receipt);
  }
  const preimage = {
    proof_schema_version: 1,
    status: "passed",
    repository: env.GITHUB_REPOSITORY,
    run_id: env.GITHUB_RUN_ID,
    run_attempt: env.GITHUB_RUN_ATTEMPT,
    workflow_ref: env.GITHUB_WORKFLOW_REF,
    candidate_sha: env.GITHUB_SHA,
    source_manifest: manifest,
    cells,
  };
  return { ...preimage, proof_digest: sha256Hex(canonicalJson(preimage)) };
}

function validateAggregateProof(root, proof) {
  if (!exactKeys(proof, ["proof_schema_version", "status", "repository", "run_id", "run_attempt", "workflow_ref", "candidate_sha", "source_manifest", "cells", "proof_digest"])) fail("INVALID_PROOF", "proof shape mismatch");
  const preimage = { ...proof };
  delete preimage.proof_digest;
  if (proof.proof_digest !== sha256Hex(canonicalJson(preimage))) fail("INVALID_PROOF", "proof digest mismatch");
  if (proof.repository !== TRUSTED_REPOSITORY || !String(proof.workflow_ref).startsWith(TRUSTED_REPOSITORY + "/" + TRUSTED_WORKFLOW_PATH + "@")) fail("UNTRUSTED_PROOF", "proof repository or workflow is not canonical");
  if (proof.proof_schema_version !== 1 || proof.status !== "passed" || !/^[0-9a-f]{40}$/.test(proof.candidate_sha)) fail("INVALID_PROOF", "invalid proof header");
  if (gitHead(root) !== proof.candidate_sha) fail("CHECKOUT_SHA_MISMATCH", "current HEAD does not equal the attested candidate SHA");
  const manifest = sourceManifest(root);
  if (canonicalJson(proof.source_manifest) !== canonicalJson(manifest)) fail("SOURCE_MANIFEST_MISMATCH", "current spike sources differ from attested candidate");
  if (!Array.isArray(proof.cells) || proof.cells.length !== REQUIRED_CELLS.length) fail("INVALID_PROOF", "proof must contain eight cells");
  for (const [platform, nodeMajor] of REQUIRED_CELLS) {
    const matches = proof.cells.filter((cell) => cell.platform === platform && cell.node_major === nodeMajor);
    if (matches.length !== 1) fail("INVALID_PROOF", `missing or duplicate ${platform}/Node ${nodeMajor}`);
    const context = cellContext(platform);
    validateReceipt(matches[0], {
      repository: proof.repository,
      job: context.job,
      runner_label: context.runner_label,
      run_id: proof.run_id,
      run_attempt: proof.run_attempt,
      workflow_ref: proof.workflow_ref,
      commit_sha: proof.candidate_sha,
      platform,
      node_major: nodeMajor,
    }, manifest.manifest_digest);
  }
  return proof;
}

export {
  TRUSTED_REPOSITORY,
  TRUSTED_WORKFLOW_PATH,
  REQUIRED_CELLS,
  SOURCE_PATHS,
  aggregateReceipts,
  buildReceipt,
  receiptFileName,
  sourceManifest,
  validateAggregateProof,
  writeReceipt,
};
