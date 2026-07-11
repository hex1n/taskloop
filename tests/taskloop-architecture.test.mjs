import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { transition } from "../lib/task-engine.mjs";

const ROOT = path.resolve(".");
const SOURCE_ENTRY = path.join(ROOT, "bin", "taskloop.mjs");
const EXPECTED_MODULES = [
  "application.mjs",
  "criterion.mjs",
  "outcome-ledger.mjs",
  "prims.mjs",
  "supervision.mjs",
  "task-engine.mjs",
  "task-store.mjs",
  "untracked.mjs",
];

function run(script, args = [], options = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: options.cwd ?? ROOT,
    env: options.env ?? process.env,
    input: options.input ?? "",
    encoding: "utf8",
  });
}

function runAsync(script, args = [], options = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: options.cwd ?? ROOT,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => resolve({ status: null, stdout, stderr, error }));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function relativeImports(file) {
  const source = fs.readFileSync(file, "utf8");
  return [...source.matchAll(/(?:import|export)\s+(?:[^"']+?\s+from\s+)?["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((specifier) => specifier.startsWith("."));
}

test("taskloop source is split behind one stable entry and an acyclic module DAG", () => {
  const lib = path.join(ROOT, "lib");
  for (const name of EXPECTED_MODULES) {
    assert.ok(fs.existsSync(path.join(lib, name)), `missing lib/${name}`);
  }

  assert.deepEqual(relativeImports(SOURCE_ENTRY), ["../lib/application.mjs"]);
  assert.deepEqual(relativeImports(path.join(lib, "prims.mjs")), []);

  const leaves = EXPECTED_MODULES.filter((name) => !["application.mjs", "prims.mjs"].includes(name));
  for (const name of leaves) {
    const imports = relativeImports(path.join(lib, name));
    assert.ok(
      imports.every((specifier) => specifier === "./prims.mjs"),
      `${name} crosses a sibling seam: ${imports.join(", ")}`,
    );
  }

  const application = fs.readFileSync(path.join(lib, "application.mjs"), "utf8");
  const directTaskWrites = application
    .split("\n")
    .map((line) => line.trim())
    .filter((line) =>
      /^(?:if\s*\(.*\)\s*)?(?:delete\s+)?task(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])+\s*(?:=(?!=)|\+=|\.push\()/.test(
        line,
      ),
    );
  assert.deepEqual(directTaskWrites, [
    "if (!isPlainObject(task.transcript_cursors)) task.transcript_cursors = {};",
    "task.transcript_cursors[transcript] = { offset: inheritedOffset };",
  ]);
});

test("info exposes the stable integration handshake", () => {
  const result = run(SOURCE_ENTRY, ["info"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    name: "taskloop",
    runtime_contract: 1,
    distribution_owner: "taskloop",
  });
});

test("task-engine transitions are pure and own lifecycle state", () => {
  const task = {
    state: "open",
    goal: "g",
    budget: { rounds: 8 },
    spent: { rounds: 0 },
    evidence: { writes: 0, touched_files: [] },
    stall: { signature: null, count: 0, history: [] },
    snapshot: { judgment: null },
    episodes: [],
    amendments: [],
    reviews: [],
    grants: [],
    envelope: { files: ["src/**"], git: { allowed_ops: [], reason: "" } },
  };
  const event = {
    type: "suspend",
    outcome: "needs_input",
    source: "user",
    judgment: "remaining; blocked; wait",
    at: "2026-07-10T00:00:00Z",
  };
  const suspended = transition(task, event).task;

  assert.equal(task.suspension, undefined);
  assert.equal(suspended.suspension.outcome, "needs_input");
  assert.equal(suspended.snapshot.judgment, "remaining; blocked; wait");
  assert.deepEqual(transition(task, event).task, suspended);
  assert.throws(() => transition(task, { type: "unknown", at: event.at }), /unknown task transition/);
  assert.throws(() => transition(task, { type: "suspend" }), /requires event\.at/);
});

test("installer activates a pinned import shim only after a complete versioned runtime exists", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskloop-install-"));
  const home = path.join(root, "home");
  const source = path.join(root, "source");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(path.join(ROOT, "bin"), path.join(source, "bin"), { recursive: true });
  fs.cpSync(path.join(ROOT, "lib"), path.join(source, "lib"), { recursive: true });
  fs.cpSync(path.join(ROOT, "skills"), path.join(source, "skills"), { recursive: true });
  const runtimeRoot = path.join(home, "bin", ".taskloop-runtime");
  fs.mkdirSync(path.join(runtimeRoot, "stale"), { recursive: true });
  fs.writeFileSync(path.join(runtimeRoot, "stale", "marker"), "stale\n");

  const installed = run(path.join(ROOT, "install.mjs"), [], {
    env: {
      ...process.env,
      TASKLOOP_INSTALL_REPO: source,
      TASKLOOP_INSTALL_HOME: home,
      HOME: home,
      USERPROFILE: home,
    },
  });
  assert.equal(installed.status, 0, installed.stderr || installed.stdout);

  const wrapperPath = path.join(home, "bin", "taskloop.mjs");
  const wrapper = fs.readFileSync(wrapperPath, "utf8");
  const pinned = wrapper.match(/import\s+["']\.\/\.taskloop-runtime\/([a-f0-9]{12})\/bin\/taskloop\.mjs["']/);
  assert.ok(pinned, wrapper);
  assert.doesNotMatch(wrapper, /spawn|exec|latest/i);
  const activeRuntime = path.join(runtimeRoot, pinned[1]);
  assert.ok(fs.existsSync(path.join(activeRuntime, "bin", "taskloop.mjs")));
  for (const name of EXPECTED_MODULES) assert.ok(fs.existsSync(path.join(activeRuntime, "lib", name)));
  assert.equal(fs.existsSync(path.join(runtimeRoot, "stale")), false);

  const help = run(wrapperPath, ["help"], { env: { ...process.env, HOME: home, USERPROFILE: home } });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /taskloop\.mjs — task-first loop supervisor/);
  const hooks = run(wrapperPath, ["hooks"], { env: { ...process.env, HOME: home, USERPROFILE: home } });
  assert.equal(hooks.status, 0, hooks.stderr);
  assert.match(hooks.stdout, new RegExp(wrapperPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(hooks.stdout, /\.taskloop-runtime/);

  // An incomplete future version is inert until the stable wrapper is switched.
  fs.mkdirSync(path.join(runtimeRoot, "ffffffffffff", "bin"), { recursive: true });
  fs.writeFileSync(path.join(runtimeRoot, "ffffffffffff", "bin", "taskloop.mjs"), "throw new Error('partial');\n");
  const stillPinned = run(wrapperPath, ["help"], { env: { ...process.env, HOME: home, USERPROFILE: home } });
  assert.equal(stillPinned.status, 0, stillPinned.stderr);
});

test("concurrent installers serialize copy, activation, and pruning", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskloop-install-race-"));
  const home = path.join(root, "home");
  const repoA = path.join(root, "repo-a");
  const repoB = path.join(root, "repo-b");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const repo of [repoA, repoB]) {
    fs.cpSync(path.join(ROOT, "bin"), path.join(repo, "bin"), { recursive: true });
    fs.cpSync(path.join(ROOT, "lib"), path.join(repo, "lib"), { recursive: true });
    // Make the copy phase long enough for both processes to contend for the
    // same home while keeping the fixture independent of timing assertions.
    for (let index = 0; index < 80; index += 1) {
      fs.writeFileSync(
        path.join(repo, "lib", `install-race-${index}.txt`),
        `${path.basename(repo)}:${index}:`.padEnd(32 * 1024, "x"),
      );
    }
  }
  fs.appendFileSync(path.join(repoA, "lib", "application.mjs"), "\n// install race A\n");
  fs.appendFileSync(path.join(repoB, "lib", "application.mjs"), "\n// install race B\n");

  const helper = path.join(root, "install-one.mjs");
  fs.writeFileSync(
    helper,
    `import { installTaskloopRuntime } from ${JSON.stringify(pathToFileURL(path.join(ROOT, "install.mjs")).href)};\n` +
      "installTaskloopRuntime(process.argv[2], process.argv[3], false);\n",
  );
  const [installedA, installedB] = await Promise.all([
    runAsync(helper, [repoA, home]),
    runAsync(helper, [repoB, home]),
  ]);
  assert.equal(installedA.status, 0, installedA.stderr || String(installedA.error ?? ""));
  assert.equal(installedB.status, 0, installedB.stderr || String(installedB.error ?? ""));

  const wrapperPath = path.join(home, "bin", "taskloop.mjs");
  const wrapper = fs.readFileSync(wrapperPath, "utf8");
  const pinned = wrapper.match(/\.taskloop-runtime\/([a-f0-9]{12})\/bin\/taskloop\.mjs/);
  assert.ok(pinned, wrapper);
  const runtimeRoot = path.join(home, "bin", ".taskloop-runtime");
  const versions = fs.readdirSync(runtimeRoot).filter((name) => /^[a-f0-9]{12}$/.test(name));
  assert.deepEqual(versions, [pinned[1]]);
  assert.ok(fs.existsSync(path.join(runtimeRoot, pinned[1], "bin", "taskloop.mjs")));
  for (const name of EXPECTED_MODULES) {
    assert.ok(fs.existsSync(path.join(runtimeRoot, pinned[1], "lib", name)));
  }
  assert.equal(fs.existsSync(path.join(home, "bin", ".taskloop-runtime.install-lock")), false);
  const help = run(wrapperPath, ["help"], { env: { ...process.env, HOME: home, USERPROFILE: home } });
  assert.equal(help.status, 0, help.stderr);
});

test("concurrent full installs cannot mix runtime and asset revisions", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskloop-full-install-race-"));
  const home = path.join(root, "home");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repos = ["A", "B"].map((revision) => {
    const repo = path.join(root, `repo-${revision.toLowerCase()}`);
    fs.mkdirSync(path.join(repo, "bin"), { recursive: true });
    fs.mkdirSync(path.join(repo, "skills", "workloop"), { recursive: true });
    fs.writeFileSync(path.join(repo, "bin", "taskloop.mjs"), `// revision:${revision}\n`);
    fs.writeFileSync(path.join(repo, "skills", "workloop", "SKILL.md"), `revision:${revision}\n`);
    return repo;
  });
  const installs = await Promise.all(
    Array.from({ length: 8 }, (_, index) => runAsync(path.join(ROOT, "install.mjs"), [], {
      env: {
        ...process.env,
        TASKLOOP_INSTALL_REPO: repos[index % repos.length],
        TASKLOOP_INSTALL_HOME: home,
        HOME: home,
        USERPROFILE: home,
      },
    })),
  );
  for (const installed of installs) {
    assert.equal(installed.status, 0, installed.stderr || String(installed.error ?? ""));
  }
  const wrapper = fs.readFileSync(path.join(home, "bin", "taskloop.mjs"), "utf8");
  const pinned = wrapper.match(/\.taskloop-runtime\/([a-f0-9]{12})\/bin\/taskloop\.mjs/);
  assert.ok(pinned, wrapper);
  const runtime = fs.readFileSync(
    path.join(home, "bin", ".taskloop-runtime", pinned[1], "bin", "taskloop.mjs"),
    "utf8",
  );
  const revision = runtime.match(/revision:([AB])/)?.[1];
  assert.ok(revision, runtime);
  assert.equal(fs.readFileSync(path.join(home, ".codex", "skills", "workloop", "SKILL.md"), "utf8"), `revision:${revision}\n`);
});

test("installer never steals a stale-looking lock from a live owner", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskloop-install-live-lock-"));
  const home = path.join(root, "home");
  const source = path.join(root, "source");
  const helper = path.join(root, "install-one.mjs");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(path.join(ROOT, "bin"), path.join(source, "bin"), { recursive: true });
  fs.cpSync(path.join(ROOT, "lib"), path.join(source, "lib"), { recursive: true });
  fs.writeFileSync(
    helper,
    `import { installTaskloopRuntime } from ${JSON.stringify(pathToFileURL(path.join(ROOT, "install.mjs")).href)};\n` +
      "installTaskloopRuntime(process.argv[2], process.argv[3], false);\n",
  );
  const lock = path.join(home, "bin", ".taskloop-runtime.install-lock");
  fs.mkdirSync(lock, { recursive: true });
  fs.writeFileSync(
    path.join(lock, "owner.json"),
    JSON.stringify({ pid: process.pid, token: "live-test-owner", at: "2020-01-01T00:00:00Z" }) + "\n",
  );
  const old = new Date(Date.now() - 10 * 60_000);
  fs.utimesSync(lock, old, old);

  const child = spawn(process.execPath, [helper, source, home], { stdio: "ignore" });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(child.exitCode, null, "installer stole a lock whose owner process is alive");
  assert.equal(fs.existsSync(path.join(home, "bin", "taskloop.mjs")), false);
  const closed = new Promise((resolve) => child.once("close", resolve));
  child.kill();
  await closed;
});

test("public hook protocol preserves byte-exact deny, block, and green-close channels", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskloop-golden-"));
  const repo = path.join(root, "repo");
  const home = path.join(root, "home");
  fs.mkdirSync(path.join(repo, "src"), { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(repo, "src", "a.txt"), "a\n");
  fs.writeFileSync(
    path.join(repo, "check.mjs"),
    "import fs from 'node:fs'; process.exit(fs.existsSync('ready') ? 0 : 1);\n",
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = { ...process.env, HOME: home, USERPROFILE: home };

  const opened = run(
    SOURCE_ENTRY,
    [
      "open", "--repo", repo,
      "--goal", "golden protocol",
      "--criterion-file", "check.mjs",
      "--alignment", "green proves the protocol fixture; not covered: unrelated commands",
      "--files", "src/**",
    ],
    { cwd: repo, env },
  );
  assert.equal(opened.status, 0, opened.stderr);

  const payload = (event, extra = {}) => JSON.stringify({ hook_event_name: event, cwd: repo, session_id: "golden", ...extra });
  const denied = run(SOURCE_ENTRY, [], {
    cwd: repo,
    env,
    input: payload("PreToolUse", { tool_name: "Bash", tool_input: { command: "printf hi > outside.txt" } }),
  });
  const denyMessage =
    "taskloop: write outside the envelope: outside.txt. Narrow the call, or if it belongs to the goal:\n" +
    `  node "${SOURCE_ENTRY}" amend --repo "${repo}" --files "<glob>" --reason "<why>"`;
  assert.equal(denied.status, 0);
  assert.equal(
    denied.stdout,
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: denyMessage,
      },
    }) + "\n",
  );
  assert.equal(denied.stderr, denyMessage + "\n");

  const red = run(SOURCE_ENTRY, [], { cwd: repo, env, input: payload("Stop") });
  const redMessage =
    "taskloop: criterion red (round 1/8): criterion-file:check.mjs\n" +
    "Fix and re-verify. If the criterion is wrong: amend --criterion --reason. " +
    "If input is missing: suspend --outcome needs_input --judgment \"<remaining; failure; next>\".";
  assert.equal(red.status, 2);
  assert.equal(red.stdout, JSON.stringify({ decision: "block", reason: redMessage }) + "\n");
  assert.equal(red.stderr, redMessage + "\n");

  fs.writeFileSync(path.join(repo, "ready"), "ready\n");
  const green = run(SOURCE_ENTRY, [], { cwd: repo, env, input: payload("Stop") });
  assert.equal(green.status, 0);
  assert.equal(green.stdout, "");
  assert.equal(green.stderr, "taskloop: criterion green — task done (1 rounds, 1 episodes)\n");
});
