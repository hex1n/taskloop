#!/usr/bin/env node

import fs from "node:fs";

import { runPublicHook } from "./adapter.mjs";

const args = process.argv.slice(2);
const valueAfter = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};

const profile = valueAfter("--profile");
const contextFile = valueAfter("--context");
const empty = { stdout: "", stderr: "", exitCode: 0 };
let wire = empty;

try {
  if (!profile || !contextFile) throw new Error("profile and context are required");
  const stdin = fs.readFileSync(0);
  if (stdin.length > 1024 * 1024) throw new Error("Hook payload exceeds one MiB");
  const contextBytes = fs.readFileSync(contextFile);
  if (contextBytes.length > 1024 * 1024) throw new Error("Hook context exceeds one MiB");
  const payload = JSON.parse(stdin.toString("utf8"));
  const context = JSON.parse(contextBytes.toString("utf8"));
  wire = runPublicHook({ profile, payload, ...context }).wire;
} catch {
  wire = empty;
}

process.stdout.write(wire.stdout);
process.stderr.write(wire.stderr);
process.exitCode = 0;
