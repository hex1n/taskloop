import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(".");
const INSTALLER = path.join(ROOT, "install.mjs");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workloop-provider-installer-"));
  const home = path.join(root, "home");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, home };
}

function install(home, source = ROOT) {
  return spawnSync(process.execPath, [INSTALLER], {
    cwd: ROOT,
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      WORKLOOP_INSTALL_HOME: home,
      WORKLOOP_INSTALL_REPO: source,
      WORKLOOP_INSTALL_ISOLATED: "1",
    },
    encoding: "utf8",
  });
}

function codexHooks(profile) {
  const command = `node \"/owned/workloop.mjs\" hook --profile ${profile} --mode nudge`;
  return JSON.stringify({ hooks: {
    PreToolUse: [{ matcher: "apply_patch|Write|Edit|MultiEdit|Bash|PowerShell|mcp__.*", hooks: [{ type: "command", command, timeout: 20 }] }],
    PostToolUse: [{ matcher: "apply_patch|Write|Edit|MultiEdit|Bash|PowerShell|mcp__.*", hooks: [{ type: "command", command, timeout: 30 }] }],
    Stop: [{ matcher: "*", hooks: [{ type: "command", command, timeout: 45 }] }],
  } }, null, 2) + "\n";
}

test("provider installer activates an exact current release without mutating valid host Hooks", (t) => {
  const { home } = fixture(t);
  const hooks = path.join(home, ".codex", "hooks.json");
  const original = Buffer.from(codexHooks("codex"));
  fs.mkdirSync(path.dirname(hooks), { recursive: true });
  fs.writeFileSync(hooks, original);

  const result = install(home);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(fs.readFileSync(hooks), original);
  const shim = path.join(home, "bin", "workloop.mjs");
  assert.ok(fs.existsSync(shim));
  const help = spawnSync(process.execPath, [shim, "help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /provider authority Contract/);
  assert.doesNotMatch(help.stdout, /current-open|verify|achieve/);
  const manifest = JSON.parse(fs.readFileSync(path.join(home, "bin", ".workloop-active-release.json"), "utf8"));
  assert.equal(manifest.release_manifest_version, 3);
  assert.equal(Object.hasOwn(manifest, "compatibility_runtimes"), false);
  const installedLib = path.join(home, "bin", ".workloop-runtime", manifest.runtime_digest, "lib");
  assert.equal(fs.existsSync(path.join(installedLib, "task-engine.mjs")), false);
  assert.equal(fs.existsSync(path.join(installedLib, "supervision.mjs")), false);
});

test("provider installation never rewrites the source repository Git hook configuration", (t) => {
  const { root, home } = fixture(t);
  const source = path.join(root, "source");
  fs.mkdirSync(source);
  for (const entry of ["bin", "lib", "skills", "hooks"]) fs.cpSync(path.join(ROOT, entry), path.join(source, entry), { recursive: true });
  execFileSync("git", ["init", "-q", source]);
  assert.equal(spawnSync("git", ["-C", source, "config", "--get", "core.hooksPath"], { encoding: "utf8" }).status, 1);

  const result = install(home, source);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(spawnSync("git", ["-C", source, "config", "--get", "core.hooksPath"], { encoding: "utf8" }).status, 1);
});

test("provider installer refuses stale or ambiguous Hook profiles before staging skills or activating a shim", (t) => {
  const { home } = fixture(t);
  const hooks = path.join(home, ".codex", "hooks.json");
  const sentinel = path.join(home, "bin", "workloop.mjs");
  fs.mkdirSync(path.dirname(hooks), { recursive: true });
  fs.mkdirSync(path.dirname(sentinel), { recursive: true });
  for (const profile of ["codex-safe", "codex-safe --profile codex"]) {
    const original = Buffer.from(codexHooks(profile));
    fs.writeFileSync(hooks, original);
    fs.writeFileSync(sentinel, "sentinel shim\n");
    const result = install(home);
    assert.notEqual(result.status, 0, profile);
    assert.match(result.stderr, /cannot activate provider Contract.*--profile codex/, profile);
    assert.deepEqual(fs.readFileSync(hooks), original, profile);
    assert.equal(fs.readFileSync(sentinel, "utf8"), "sentinel shim\n", profile);
    assert.equal(fs.existsSync(path.join(home, "bin", ".workloop-active-release.json")), false, profile);
    assert.equal(fs.existsSync(path.join(home, ".codex", "skills", "workloop")), false, profile);
  }
});

test("installer source contains no compatibility runtime pins or legacy skill adoption", () => {
  const source = fs.readFileSync(INSTALLER, "utf8");
  assert.doesNotMatch(source, /compatibilityRuntimePins|compatibility_runtimes|legacySkillCanBeAdopted|LEGACY_CORE_DIGESTS/);
  assert.match(source, /assertCodexHookActivationReady/);
  const hookSource = fs.readFileSync(path.join(ROOT, "lib", "host-hooks.mjs"), "utf8");
  assert.doesNotMatch(hookSource, /codex-safe|ALL_PROFILES|unknown:\s*Object\.freeze|profile === "unknown"/);
});

test("npm package contains only the current provider runtime module closure", (t) => {
  const { root } = fixture(t);
  const packed = spawnSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, npm_config_cache: path.join(root, "npm-cache") },
  });
  assert.equal(packed.status, 0, packed.stderr || packed.stdout);
  const files = JSON.parse(packed.stdout)[0].files.map((entry) => entry.path);
  assert.equal(files.includes("lib/provider-application.mjs"), true);
  assert.equal(files.includes("lib/authority-state.mjs"), true);
  assert.equal(files.includes("examples/read-only-criterion.mjs"), true);
  assert.equal(files.includes("lib/task-engine.mjs"), false);
  assert.equal(files.includes("lib/supervision.mjs"), false);
});

test("source distribution contains no retired task engine or supervision runtime", () => {
  for (const retired of ["task-engine.mjs", "supervision.mjs"]) {
    assert.equal(fs.existsSync(path.join(ROOT, "lib", retired)), false, retired);
  }
});

test("acceptance implementations are owned by tests or spikes, not the repository root", () => {
  const rootAcceptanceFiles = fs.readdirSync(ROOT).filter((entry) => /^acceptance.*\.mjs$/u.test(entry));
  assert.deepEqual(rootAcceptanceFiles, []);
  for (let number = 2; number <= 10; number += 1) {
    assert.equal(fs.existsSync(path.join(ROOT, "tests", "acceptance", "provider", `ticket${String(number).padStart(2, "0")}.mjs`)), true);
  }
  assert.equal(fs.existsSync(path.join(ROOT, "spikes", "multi-root-authority", "acceptance-gate.mjs")), true);
  assert.equal(fs.existsSync(path.join(ROOT, "examples", "read-only-criterion.mjs")), true);
});

test("only explicit deny PreToolUse rejects an unsupported Hook profile", () => {
  const released = spawnSync(process.execPath, [path.join(ROOT, "bin", "workloop.mjs"), "hook", "--profile", "codex-safe", "--mode", "nudge"], { encoding: "utf8", input: JSON.stringify({ hook_event_name: "Stop" }) });
  assert.equal(released.status, 0, released.stderr);
  assert.equal(released.stderr, "");
  assert.equal(released.stdout, "");
  const staleStop = spawnSync(process.execPath, [path.join(ROOT, "bin", "workloop.mjs"), "hook", "--profile", "codex-safe", "--mode", "deny"], { encoding: "utf8", input: JSON.stringify({ hook_event_name: "Stop" }) });
  assert.equal(staleStop.status, 0, staleStop.stderr);
  assert.equal(staleStop.stderr, "");
  assert.equal(staleStop.stdout, "");
  const noEvent = spawnSync(process.execPath, [path.join(ROOT, "bin", "workloop.mjs"), "hook", "--profile", "codex-safe", "--mode", "deny"], { encoding: "utf8" });
  assert.equal(noEvent.status, 0, noEvent.stderr);
  assert.equal(noEvent.stderr, "");
  assert.equal(noEvent.stdout, "");
  const nullPayload = spawnSync(process.execPath, [path.join(ROOT, "bin", "workloop.mjs"), "hook", "--profile", "codex-safe", "--mode", "nudge"], { encoding: "utf8", input: "null" });
  assert.equal(nullPayload.status, 0, nullPayload.stderr);
  assert.equal(nullPayload.stderr, "");
  assert.equal(nullPayload.stdout, "");
  for (const mode of ["nudge", "deny"]) for (const input of ["null", JSON.stringify({ hook_event_name: "Unknown" })]) {
    const validMalformedPayload = spawnSync(process.execPath, [path.join(ROOT, "bin", "workloop.mjs"), "hook", "--profile", "codex", "--mode", mode], { encoding: "utf8", input });
    assert.equal(validMalformedPayload.status, 0, `${mode}: ${validMalformedPayload.stderr}`);
    assert.equal(validMalformedPayload.stderr, "", mode);
    assert.equal(validMalformedPayload.stdout, "", mode);
  }
  const denied = spawnSync(process.execPath, [path.join(ROOT, "bin", "workloop.mjs"), "hook", "--profile", "codex-safe", "--mode", "deny"], { encoding: "utf8", input: JSON.stringify({ hook_event_name: "PreToolUse" }) });
  assert.equal(denied.status, 2);
  assert.match(denied.stderr, /unsupported hook profile; expected claude\|codex/);
});

test("Stop releases before validating stale Hook mode or profile configuration", () => {
  for (const [profile, mode] of [["codex", "invalid"], ["codex-safe", "invalid"]]) {
    const result = spawnSync(process.execPath, [path.join(ROOT, "bin", "workloop.mjs"), "hook", "--profile", profile, "--mode", mode], {
      encoding: "utf8",
      input: JSON.stringify({ hook_event_name: "Stop" }),
    });
    assert.equal(result.status, 0, `${profile}/${mode}: ${result.stderr}`);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, "");
  }
});
