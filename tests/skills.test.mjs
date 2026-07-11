import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { legacySkillCanBeAdopted } from "../install.mjs";

const ROOT = path.resolve(".");
const SKILLS = [
  "loop-core",
  "workloop",
];
const NON_CORE_SKILLS = [
  "converge",
  "first-principles-planner",
  "judgment-loop",
  "meta-loop",
  "project-docs-layer",
];

function walk(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root).sort().flatMap((name) => {
    const file = path.join(root, name);
    return fs.statSync(file).isDirectory() ? walk(file) : [file];
  });
}

test("the loop skill closure is repository-owned and has no dangling local links", () => {
  for (const skill of SKILLS) {
    const root = path.join(ROOT, "skills", skill);
    assert.ok(fs.existsSync(root), `missing skills/${skill}`);
    for (const file of walk(root).filter((candidate) => candidate.endsWith(".md"))) {
      const source = fs.readFileSync(file, "utf8");
      for (const match of source.matchAll(/\]\((?!https?:|#)([^)]+)\)/g)) {
        const target = match[1].split("#", 1)[0];
        if (!target || /[<>{}*]/.test(target)) continue;
        assert.ok(
          fs.existsSync(path.resolve(path.dirname(file), target)),
          `${path.relative(ROOT, file)} has dangling link ${match[1]}`,
        );
      }
    }
  }
  for (const skill of NON_CORE_SKILLS) {
    assert.equal(fs.existsSync(path.join(ROOT, "skills", skill)), false, `non-core skill shipped: ${skill}`);
  }
  assert.equal(walk(path.join(ROOT, "tools")).length, 0, "taskloop must not ship skill-specific tools");
  const coreText = SKILLS.flatMap((skill) => walk(path.join(ROOT, "skills", skill)))
    .filter((file) => file.endsWith(".md"))
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
  for (const fixed of ["e2e-test-executor", "e2e-report-check", ...NON_CORE_SKILLS]) {
    assert.equal(coreText.includes(fixed), false, `core is coupled to ${fixed}`);
  }
});

test("installer distributes only the workloop core to both agent runtimes", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "taskloop-skills-install-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [path.join(ROOT, "install.mjs")], {
    cwd: ROOT,
    env: {
      ...process.env,
      TASKLOOP_INSTALL_REPO: ROOT,
      TASKLOOP_INSTALL_HOME: home,
      HOME: home,
      USERPROFILE: home,
    },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  for (const runtime of [".claude", ".codex"]) {
    for (const skill of SKILLS) {
      assert.ok(
        fs.existsSync(path.join(home, runtime, "skills", skill)),
        `${runtime} is missing ${skill}`,
      );
    }
  }
  for (const skill of NON_CORE_SKILLS) {
    for (const runtime of [".claude", ".codex"]) {
      assert.equal(fs.existsSync(path.join(home, runtime, "skills", skill)), false);
    }
  }
});

test("installer treats aliased Claude and Codex skill roots as one owned tree", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "taskloop-skills-shared-root-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const shared = path.join(home, ".agents", "skills");
  fs.mkdirSync(shared, { recursive: true });
  for (const runtime of [".claude", ".codex"]) {
    const parent = path.join(home, runtime);
    fs.mkdirSync(parent, { recursive: true });
    try {
      fs.symlinkSync(shared, path.join(parent, "skills"), process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (!["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) throw error;
      t.skip("directory symlinks are unavailable");
      return;
    }
  }
  const result = spawnSync(process.execPath, [path.join(ROOT, "install.mjs")], {
    cwd: ROOT,
    env: {
      ...process.env,
      TASKLOOP_INSTALL_REPO: ROOT,
      TASKLOOP_INSTALL_HOME: home,
      HOME: home,
      USERPROFILE: home,
    },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(home, "bin", ".taskloop-managed-skills.json"), "utf8"),
  );
  assert.deepEqual(manifest.runtimes[".claude"], manifest.runtimes[".codex"]);
  for (const skill of SKILLS) assert.ok(fs.existsSync(path.join(shared, skill)));
});

test("installer adopts only byte-exact legacy core trees", (t) => {
  assert.equal(
    legacySkillCanBeAdopted(
      "workloop",
      "3dcb2d46005915b1ccd4aa41d6de8b5fb365e9527e4d6da1930707be5ea46281",
      false,
      "different",
    ),
    true,
  );
  assert.equal(legacySkillCanBeAdopted("workloop", "0".repeat(64), false, "different"), false);

  const home = fs.mkdtempSync(path.join(os.tmpdir(), "taskloop-skills-v1-adopt-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  for (const runtime of [".claude", ".codex"]) {
    for (const skill of SKILLS) {
      fs.cpSync(
        path.join(ROOT, "skills", skill),
        path.join(home, runtime, "skills", skill),
        { recursive: true },
      );
    }
  }
  fs.mkdirSync(path.join(home, "bin"), { recursive: true });
  fs.writeFileSync(
    path.join(home, "bin", ".taskloop-managed-skills.json"),
    JSON.stringify({ version: 1, skills: SKILLS }) + "\n",
  );
  const result = spawnSync(process.execPath, [path.join(ROOT, "install.mjs")], {
    cwd: ROOT,
    env: {
      ...process.env,
      TASKLOOP_INSTALL_REPO: ROOT,
      TASKLOOP_INSTALL_HOME: home,
      HOME: home,
      USERPROFILE: home,
    },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(home, "bin", ".taskloop-managed-skills.json"), "utf8"),
  );
  assert.equal(manifest.version, 2);
  for (const runtime of [".claude", ".codex"]) {
    for (const skill of SKILLS) assert.match(manifest.runtimes[runtime][skill], /^[a-f0-9]{64}$/);
  }
});

test("installer replaces source-linked skills with managed copies", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "taskloop-skills-delink-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  // Keep both ends of the hard link inside the temporary filesystem. Some
  // sandboxes correctly reject linking a workspace inode into the system temp
  // directory even when both paths are writable to the current process.
  const fixture = path.join(home, "repo");
  fs.mkdirSync(fixture, { recursive: true });
  fs.copyFileSync(path.join(ROOT, "install.mjs"), path.join(fixture, "install.mjs"));
  for (const directory of ["bin", "lib", "skills"]) {
    fs.cpSync(path.join(ROOT, directory), path.join(fixture, directory), { recursive: true });
  }
  const source = path.join(fixture, "skills", "workloop");
  const target = path.join(home, ".codex", "skills", "workloop");
  const env = {
    ...process.env,
    TASKLOOP_INSTALL_REPO: fixture,
    TASKLOOP_INSTALL_HOME: home,
    HOME: home,
    USERPROFILE: home,
  };
  const first = spawnSync(process.execPath, [fs.realpathSync(path.join(fixture, "install.mjs"))], {
    cwd: fixture,
    env,
    encoding: "utf8",
  });
  assert.equal(first.status, 0, first.stderr || first.stdout);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target);
  fs.linkSync(path.join(source, "SKILL.md"), path.join(target, "SKILL.md"));

  const result = spawnSync(process.execPath, [fs.realpathSync(path.join(fixture, "install.mjs"))], {
    cwd: fixture,
    env,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const sourceStat = fs.statSync(path.join(source, "SKILL.md"), { bigint: true });
  const targetStat = fs.statSync(path.join(target, "SKILL.md"), { bigint: true });
  assert.notEqual(
    `${sourceStat.dev}:${sourceStat.ino}`,
    `${targetStat.dev}:${targetStat.ino}`,
    result.stdout,
  );
  assert.equal(
    fs.readFileSync(path.join(target, "SKILL.md"), "utf8"),
    fs.readFileSync(path.join(source, "SKILL.md"), "utf8"),
  );
});

test("installer refuses unowned skill trees without following their links", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "taskloop-skills-safe-replace-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const skillTarget = path.join(home, ".codex", "skills", "workloop");
  const externalSkill = path.join(home, "external-skill.md");
  fs.mkdirSync(skillTarget, { recursive: true });
  fs.writeFileSync(path.join(skillTarget, "stale.md"), "must disappear\n");
  fs.writeFileSync(externalSkill, "private skill target\n");
  let linksSupported = true;
  try {
    fs.symlinkSync(externalSkill, path.join(skillTarget, "SKILL.md"));
  } catch (error) {
    if (!["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) throw error;
    linksSupported = false;
    fs.rmSync(path.join(skillTarget, "SKILL.md"), { force: true });
  }

  const result = spawnSync(process.execPath, [path.join(ROOT, "install.mjs")], {
    cwd: ROOT,
    env: {
      ...process.env,
      TASKLOOP_INSTALL_REPO: ROOT,
      TASKLOOP_INSTALL_HOME: home,
      HOME: home,
      USERPROFILE: home,
    },
    encoding: "utf8",
  });
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.equal(fs.existsSync(path.join(skillTarget, "stale.md")), true);
  if (linksSupported) {
    assert.equal(fs.lstatSync(path.join(skillTarget, "SKILL.md")).isSymbolicLink(), true);
    assert.equal(fs.readFileSync(externalSkill, "utf8"), "private skill target\n");
  }
});

test("installer prunes skill directories it previously owned", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskloop-skills-prune-"));
  const home = path.join(root, "home");
  const fixture = path.join(root, "repo");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const directory of ["bin", "lib", "skills"]) {
    fs.cpSync(path.join(ROOT, directory), path.join(fixture, directory), { recursive: true });
  }
  const env = {
    ...process.env,
    TASKLOOP_INSTALL_REPO: fixture,
    TASKLOOP_INSTALL_HOME: home,
    HOME: home,
    USERPROFILE: home,
  };
  const first = spawnSync(process.execPath, [path.join(ROOT, "install.mjs")], {
    cwd: ROOT,
    env,
    encoding: "utf8",
  });
  assert.equal(first.status, 0, first.stderr || first.stdout);
  fs.rmSync(path.join(fixture, "skills", "workloop"), { recursive: true, force: true });
  const second = spawnSync(process.execPath, [path.join(ROOT, "install.mjs")], {
    cwd: ROOT,
    env,
    encoding: "utf8",
  });
  assert.equal(second.status, 0, second.stderr || second.stdout);
  for (const runtime of [".claude", ".codex"]) {
    assert.equal(fs.existsSync(path.join(home, runtime, "skills", "workloop")), false);
  }
  const manifest = JSON.parse(
    fs.readFileSync(path.join(home, "bin", ".taskloop-managed-skills.json"), "utf8"),
  );
  assert.equal(manifest.runtimes[".claude"].workloop, undefined);
  assert.equal(manifest.runtimes[".codex"].workloop, undefined);
});

test("installer preserves and releases a removed skill taken over after installation", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "taskloop-skills-takeover-"));
  const home = path.join(root, "home");
  const fixture = path.join(root, "repo");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const directory of ["bin", "lib", "skills"]) {
    fs.cpSync(path.join(ROOT, directory), path.join(fixture, directory), { recursive: true });
  }
  const env = {
    ...process.env,
    TASKLOOP_INSTALL_REPO: fixture,
    TASKLOOP_INSTALL_HOME: home,
    HOME: home,
    USERPROFILE: home,
  };
  const first = spawnSync(process.execPath, [path.join(ROOT, "install.mjs")], {
    cwd: ROOT,
    env,
    encoding: "utf8",
  });
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const takenOver = path.join(home, ".codex", "skills", "workloop", "SKILL.md");
  fs.appendFileSync(takenOver, "\nuser-owned extension\n");
  fs.rmSync(path.join(fixture, "skills", "workloop"), { recursive: true, force: true });

  const second = spawnSync(process.execPath, [path.join(ROOT, "install.mjs")], {
    cwd: ROOT,
    env,
    encoding: "utf8",
  });
  assert.equal(second.status, 0, second.stderr || second.stdout);
  assert.equal(fs.existsSync(path.join(home, ".claude", "skills", "workloop")), false);
  assert.match(fs.readFileSync(takenOver, "utf8"), /user-owned extension/);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(home, "bin", ".taskloop-managed-skills.json"), "utf8"),
  );
  assert.equal(manifest.runtimes[".codex"].workloop, undefined);
});
