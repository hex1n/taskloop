#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { aggregateReceipts, validateAggregateProof, writeReceipt } from "./receipt.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [command, ...args] = process.argv.slice(2);

function option(name) {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`${name} is required`);
  return path.resolve(args[index + 1]);
}

if (command === "write") {
  const { receipt, target } = writeReceipt(root, option("--output"));
  process.stdout.write(`${JSON.stringify({ receipt, target })}\n`);
} else if (command === "aggregate") {
  const output = option("--output");
  const proof = aggregateReceipts(root, option("--input"));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(proof, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ output, proof_digest: proof.proof_digest })}\n`);
} else if (command === "validate") {
  const proof = validateAggregateProof(root, JSON.parse(fs.readFileSync(option("--proof"), "utf8")));
  process.stdout.write(`${JSON.stringify({ candidate_sha: proof.candidate_sha, proof_digest: proof.proof_digest, status: "passed" })}\n`);
} else {
  process.stderr.write("usage: receipt-cli.mjs write --output DIR | aggregate --input DIR --output FILE | validate --proof FILE\n");
  process.exitCode = 2;
}
