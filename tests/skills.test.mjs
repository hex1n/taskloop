import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { mapExecution } from "../lib/criterion.mjs";

const ROOT = path.resolve(".");
const SKILL_FILES = [
  "skills/workloop/SKILL.md",
  "skills/judgmentloop/SKILL.md",
  "skills/meta-loop/SKILL.md",
];
const SUPPORT_FILES = [
  "skills/workloop/references/REFERENCE.md",
  "skills/workloop/references/ADAPTERS.md",
  "skills/workloop/references/HOSTS.md",
];
const PORTABLE_FILES = [...SKILL_FILES, ...SUPPORT_FILES];

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

function frontmatter(relative) {
  const match = read(relative).match(/^---\n([\s\S]*?)\n---\n/u);
  assert.ok(match, `${relative} must start with YAML frontmatter`);
  const metadata = {};
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    assert.ok(separator > 0, `${relative} has malformed frontmatter: ${line}`);
    metadata[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return metadata;
}

test("invokable Skills expose predictable trigger metadata", () => {
  const topLevelSkills = fs.readdirSync(path.join(ROOT, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(topLevelSkills, ["judgmentloop", "meta-loop", "workloop"]);
  for (const relative of SKILL_FILES) {
    const metadata = frontmatter(relative);
    assert.deepEqual(Object.keys(metadata).sort(), ["description", "name"], relative);
    assert.equal(metadata.name, path.basename(path.dirname(relative)), relative);
    assert.match(metadata.description, /\bUse when\b/u, relative);
    assert.ok(metadata.description.length <= 1024, relative);
  }
});

test("portable Skill closure has no dangling relative links or machine-local paths", () => {
  for (const relative of PORTABLE_FILES) {
    const body = read(relative);
    for (const match of body.matchAll(/\[[^\]]+\]\((?!https?:|#)([^)#]+)(?:#[^)]+)?\)/gu)) {
      const target = path.resolve(ROOT, path.dirname(relative), match[1]);
      assert.ok(fs.existsSync(target), `${relative} -> ${match[1]}`);
    }
    assert.doesNotMatch(body, /\/Users\/|[A-Za-z]:\\/u, relative);
  }
});

test("each Skill workflow has an explicit completion condition for every step", () => {
  for (const relative of SKILL_FILES) {
    const body = read(relative);
    const steps = body.match(/^\d+\. /gmu) ?? [];
    const completions = body.match(/^\s+Completion:/gmu) ?? [];
    assert.ok(steps.length > 0, `${relative} has no workflow steps`);
    assert.equal(completions.length, steps.length, relative);
  }
});

test("Skill commands belong to the current public CLI surface", () => {
  const result = spawnSync(process.execPath, [path.join(ROOT, "bin", "workloop.mjs"), "help"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const commandLine = result.stdout.split(/\r?\n/u).find((line) => line.includes("|"));
  assert.ok(commandLine, result.stdout);
  const publicVerbs = new Set(commandLine.split("|"));
  const joined = SKILL_FILES.map(read).join("\n");

  for (const verb of ["open", "join", "stage", "commit", "certify", "ledger", "audit", "tasks"]) {
    assert.match(joined, new RegExp(`\`${verb}\``, "u"), verb);
    assert.ok(publicVerbs.has(verb), verb);
  }
  for (const retired of ["verify", "achieve", "review", "sync-outcomes"]) {
    assert.doesNotMatch(joined, new RegExp(`\`${retired}\``, "u"), retired);
  }
});

test("criterion documentation matches the tri-state runtime contract", () => {
  const adapter = read("skills/workloop/references/ADAPTERS.md");
  const expected = new Map([
    [4, ["satisfied", null]],
    [3, ["unsatisfied", null]],
    [2, ["indeterminate", "adapter_indeterminate"]],
    [0, ["indeterminate", "adapter_silent"]],
    [9, ["indeterminate", "invalid_adapter_exit"]],
  ]);
  for (const [status, [verdict, error]] of expected) {
    const mapped = mapExecution({ status, duration_ms: 1, stdout: "", stderr: "" }, "tri-state", 10);
    assert.equal(mapped.verdict, verdict, status);
    assert.equal(mapped.execution.execution_error, error, status);
  }
  for (const code of [4, 3, 2, 0]) {
    assert.match(adapter, new RegExp("Exit `" + code + "`", "u"), code);
  }
  assert.match(adapter, /Any other exit is invalid and therefore indeterminate/u);
});

test("portable Skills contain only current Contract material", () => {
  const joined = PORTABLE_FILES.map(read).join("\n");
  assert.equal(fs.existsSync(path.join(ROOT, "skills/meta-loop/REMINDER.md")), false);
  assert.equal(fs.existsSync(path.join(ROOT, "skills/loop-core")), false);
  assert.doesNotMatch(joined, /argument-hint:|workloop ledger --json|--repo\b|steady-satisfied|sync-outcomes/u);
  assert.match(read("skills/workloop/SKILL.md"), /references\/REFERENCE\.md/u);
  assert.match(read("skills/workloop/SKILL.md"), /references\/ADAPTERS\.md/u);
  assert.match(read("skills/workloop/SKILL.md"), /references\/HOSTS\.md/u);
  assert.match(read("skills/judgmentloop/SKILL.md"), /\.\.\/workloop\/references\/REFERENCE\.md/u);
  assert.match(read("skills/judgmentloop/SKILL.md"), /\.\.\/workloop\/references\/ADAPTERS\.md/u);
  assert.match(read("skills/meta-loop/SKILL.md"), /\.\.\/workloop\/references\/REFERENCE\.md/u);
});

test("AGENTS.md names the executable verification and architecture contract", () => {
  const agents = read("AGENTS.md");
  for (const command of [
    "npm test",
    "node tests/verify-provider-tickets.mjs",
    "node bin/workloop.mjs help",
  ]) assert.match(agents, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"), command);
  assert.match(agents, /provider-neutral loop-engineering runtime/u);
  assert.match(agents, /host owns execution approval/u);
  assert.match(agents, /provider authority remains canonical/u);
});

test("default test scripts keep the packaged Skill contract in the gate", () => {
  const scripts = JSON.parse(read("package.json")).scripts;
  assert.match(scripts.test, /\btests\/skills\.test\.mjs\b/u);
  assert.match(scripts["test:matrix"], /\btests\/skills\.test\.mjs\b/u);
});
