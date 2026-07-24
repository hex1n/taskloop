import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AUTHORITY_EMERGENCY_BYTES,
  AUTHORITY_MAX_FRAME_BYTES,
  AUTHORITY_MAX_BYTES,
  abandonStagedAuthority,
  appendAuthority,
  authorityLockPath,
  authorityPath,
  classifyControlTargets,
  cleanupStagedLocator,
  ensureAuthority,
  forkIdentity,
  locatorPath,
  protectedControlRoots,
  publishAttachment,
  readAuthority,
  readLocator,
  reattachAttachment,
  recoverAttachment,
  recoverStagedLocator,
  recoverTornAuthority,
  resolveTargetProvider,
  routeAttachment,
  runDefaultHook,
  stableDirectoryAnchor,
  stableDirectoryAnchorFromStats,
  stagedLocatorState,
  stageAttachment,
  withAuthorityLock,
  withLockContext,
} from "../spikes/multi-root-authority/adapter.mjs";

const WORKER = path.resolve("spikes/multi-root-authority/worker.mjs");
const HOOK_CLI = path.resolve("spikes/multi-root-authority/hook-cli.mjs");
const CAPABILITY_MATRIX = process.env.WORKLOOP_SPIKE_CAPABILITY_MATRIX === "1";

function temporaryRoot(t, prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function runGit(cwd, args, expected = 0) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, expected, `git ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function replaceExistingFile(target, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const fd = fs.openSync(target, "r+");
  try {
    fs.ftruncateSync(fd, 0);
    let offset = 0;
    while (offset < bytes.length) offset += fs.writeSync(fd, bytes, offset, bytes.length - offset, offset);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function encoded(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function startWorker(operation, input) {
  return spawn(process.execPath, [WORKER, operation, encoded(input)], { stdio: ["ignore", "pipe", "pipe"] });
}

function worker(operation, input) {
  const child = startWorker(operation, input);
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("exit", (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

function waitForExit(child) {
  return new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
}

async function waitForPath(target, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(target)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`timed out waiting for ${target}`);
}

function digest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function recoverAuthorityTail(controlRoot, authorityId, commandId) {
  const state = readAuthority(controlRoot, { allowTorn: true });
  assert.equal(state.torn, true, "expected torn authority at " + controlRoot);
  return recoverTornAuthority(controlRoot, {
    commandId,
    authorityId,
    expectedValidEndOffset: state.validEndOffset,
    expectedTailDigest: digest(state.raw.subarray(state.validEndOffset)),
    userProvenance: { granted_by: "user", reason: "repair an injected fork authority tail" },
  }, { staleMs: 10 });
}

function fillAuthorityToNormalHeadroom(controlRoot, desiredHeadroom) {
  const normalLimit = AUTHORITY_MAX_BYTES - AUTHORITY_EMERGENCY_BYTES;
  let index = 0;
  while (true) {
    const remaining = normalLimit - fs.statSync(authorityPath(controlRoot)).size;
    if (remaining <= desiredHeadroom + 512) return remaining;
    const payloadBytes = Math.min(AUTHORITY_MAX_FRAME_BYTES - 2_048, remaining - desiredHeadroom - 1_024);
    if (payloadBytes <= 0) return remaining;
    appendAuthority(controlRoot, { commandId: `capacity-filler-${index++}`, kind: "probe_appended", payload: { value: "x".repeat(payloadBytes) } });
  }
}

function authorityFixture(t, label = randomUUID()) {
  const root = temporaryRoot(t, `workloop-authority-${label}-`);
  const controlRoot = path.join(root, "control");
  const attachmentRoot = path.join(root, "attachment");
  const authorityId = `authority-${label}`;
  const attachmentId = `attachment-${label}`;
  const claimToken = `secret-${label}`;
  const commandId = `publish-${label}`;
  const stageCommandId = `stage-${label}`;
  const userProvenance = { granted_by: "user", reason: "spike fixture" };
  fs.mkdirSync(attachmentRoot, { recursive: true });
  ensureAuthority(controlRoot, { authorityId });
  stageAttachment({ controlRoot, attachmentRoot, authorityId, attachmentId, claimToken, stageCommandId, userProvenance });
  return { root, controlRoot, attachmentRoot, authorityId, attachmentId, claimToken, commandId, stageCommandId, userProvenance };
}

function routingInput(fx, overrides = {}) {
  return {
    controlRoot: fx.controlRoot,
    attachmentRoots: [fx.attachmentRoot],
    authorityId: fx.authorityId,
    attachmentId: fx.attachmentId,
    claimToken: fx.claimToken,
    commandId: fx.commandId,
    ...overrides,
  };
}

async function prepareCrossVolume(t, root) {
  const sourceDevice = fs.statSync(root, { bigint: true }).dev;
  if (process.platform === "linux") {
    assert.ok(fs.existsSync("/dev/shm"), "Linux hosted runner must expose /dev/shm for a distinct filesystem");
    const target = fs.mkdtempSync(path.join("/dev/shm", "workloop-cross-volume-"));
    t.after(() => fs.rmSync(target, { recursive: true, force: true }));
    assert.notEqual(fs.statSync(target, { bigint: true }).dev, sourceDevice, "/dev/shm must be a distinct device");
    return target;
  }
  if (process.platform === "darwin") {
    const container = fs.mkdtempSync(path.join(os.tmpdir(), "workloop-mounted-volume-"));
    const image = path.join(container, "cross-volume.sparseimage");
    const mount = path.join(container, "mounted-volume");
    fs.mkdirSync(mount);
    const created = spawnSync("hdiutil", ["create", "-size", "32m", "-fs", "HFS+", "-volname", `WL${process.pid}`, image], { encoding: "utf8" });
    assert.equal(created.status, 0, created.stderr || created.stdout);
    const attached = spawnSync("hdiutil", ["attach", image, "-nobrowse", "-mountpoint", mount], { encoding: "utf8" });
    assert.equal(attached.status, 0, attached.stderr || attached.stdout);
    t.after(() => {
      spawnSync("hdiutil", ["detach", mount, "-force"], { encoding: "utf8" });
      fs.rmSync(container, { recursive: true, force: true });
    });
    assert.notEqual(fs.statSync(mount, { bigint: true }).dev, sourceDevice, "mounted image must be a distinct device");
    return mount;
  }
  if (process.platform === "win32") {
    const candidates = [...new Set([process.env.RUNNER_TEMP, process.env.TEMP, "D:\\a\\_temp", "C:\\Windows\\Temp"].filter(Boolean))];
    for (const candidate of candidates) {
      try {
        const target = fs.mkdtempSync(path.join(candidate, "workloop-cross-volume-"));
        if (fs.statSync(target, { bigint: true }).dev !== sourceDevice) {
          t.after(() => fs.rmSync(target, { recursive: true, force: true }));
          return target;
        }
        fs.rmSync(target, { recursive: true, force: true });
      } catch { /* Try another hosted-runner volume. */ }
    }
    assert.fail("Windows hosted runner did not expose a writable distinct volume");
  }
  assert.fail(`unsupported platform: ${process.platform}`);
}

test("[MAR-ADAPTER] framed authority append is cross-process, idempotent, single-genesis, and safely reaped", async (t) => {
  const root = temporaryRoot(t, "workloop-framed-authority-");
  for (const name of ["common", "detached"]) {
    const controlRoot = path.join(root, name);
    const authorityId = `authority-${name}`;
    ensureAuthority(controlRoot, { authorityId });
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) => worker("append", {
      commandId: `${name}-parallel-${index}`,
      controlRoot,
      payload: { index },
      staleMs: 100,
      timeoutMs: 10_000,
    })));
    for (const result of results) assert.equal(result.code, 0, result.stderr);
    const records = readAuthority(controlRoot, { allowTorn: false }).records;
    assert.deepEqual(records.map((record) => record.sequence), Array.from({ length: 9 }, (_, index) => index + 1));
    assert.equal(new Set(records.map((record) => record.command_id)).size, records.length);
    const before = fs.statSync(authorityPath(controlRoot)).size;
    const replay = await worker("append", { commandId: `${name}-parallel-3`, controlRoot, payload: { index: 3 } });
    assert.equal(replay.code, 0, replay.stderr);
    assert.equal(fs.statSync(authorityPath(controlRoot)).size, before, "idempotent replay must not rewrite or append the ledger");

    const signalFile = path.join(root, `${name}-holder.signal`);
    const holder = startWorker("hold-lock", { controlRoot, signalFile, holdMs: 30_000, staleMs: 100 });
    await waitForPath(signalFile);
    const timedOut = await worker("append", { commandId: `${name}-timeout`, controlRoot, payload: {}, staleMs: 100, timeoutMs: 80 });
    assert.notEqual(timedOut.code, 0);
    assert.match(timedOut.stderr, /AUTHORITY_LOCK_TIMEOUT|authority lock unavailable/);
    holder.kill("SIGKILL");
    await waitForExit(holder);
    const reapers = await Promise.all([
      worker("append", { commandId: `${name}-reaper-a`, controlRoot, payload: {}, staleMs: 10, timeoutMs: 5_000 }),
      worker("append", { commandId: `${name}-reaper-b`, controlRoot, payload: {}, staleMs: 10, timeoutMs: 5_000 }),
    ]);
    for (const result of reapers) assert.equal(result.code, 0, result.stderr);
    assert.equal(fs.existsSync(authorityLockPath(controlRoot)), false);
  }

  const conflictRoot = path.join(root, "genesis-conflict");
  const genesis = await Promise.all([
    worker("ensure", { controlRoot: conflictRoot, authorityId: "authority-a", timeoutMs: 5_000 }),
    worker("ensure", { controlRoot: conflictRoot, authorityId: "authority-b", timeoutMs: 5_000 }),
  ]);
  assert.equal(genesis.filter((item) => item.code === 0).length, 1);
  const conflictRecords = readAuthority(conflictRoot, { allowTorn: false }).records;
  assert.equal(conflictRecords.length, 1);
  assert.equal(conflictRecords[0].kind, "authority_genesis");

  const stageRoot = path.join(root, "stage-race");
  const stageControlRoot = path.join(root, "stage-race-control");
  fs.mkdirSync(stageRoot);
  ensureAuthority(stageControlRoot, { authorityId: "stage-authority" });
  const stageInput = { controlRoot: stageControlRoot, stageCommandId: "stage-race-a", attachmentRoot: stageRoot, authorityId: "stage-authority", attachmentId: "stage-attachment", claimToken: "stage-secret", userProvenance: { granted_by: "user", reason: "race stage" } };
  assert.throws(() => stageAttachment({ ...stageInput, attachmentRoot: path.join(root, "agent-stage"), userProvenance: { granted_by: "agent", reason: "self signed" } }), /stage requires/);
  assert.throws(() => stageAttachment({ ...stageInput, attachmentRoot: path.join(root, "bad-epoch"), epoch: "1" }), /positive epoch/);
  const oversizedStageRoot = path.join(root, "oversized-stage");
  fs.mkdirSync(oversizedStageRoot);
  assert.throws(() => stageAttachment({ ...stageInput, attachmentRoot: oversizedStageRoot, claimToken: "x".repeat(70_000) }), /locator lacks reserved capacity/);
  assert.equal(fs.existsSync(locatorPath(oversizedStageRoot)), false);
  const stageRace = await Promise.all([worker("stage", stageInput), worker("stage", { ...stageInput, stageCommandId: "stage-race-b" })]);
  assert.equal(stageRace.filter((item) => item.code === 0).length, 1, "exclusive locator creation has exactly one winner");
  assert.equal(readLocator(stageRoot).records.length, 1);

  const outputLossControl = path.join(root, "stage-output-loss-control");
  const outputLossRoot = path.join(root, "stage-output-loss-root");
  fs.mkdirSync(outputLossRoot);
  ensureAuthority(outputLossControl, { authorityId: "stage-output-loss-authority" });
  const outputLossInput = { controlRoot: outputLossControl, stageCommandId: "stage-output-loss", attachmentRoot: outputLossRoot, authorityId: "stage-output-loss-authority", attachmentId: "stage-output-loss-attachment", claimToken: "stage-output-loss-secret", userProvenance: { granted_by: "user", reason: "stage with durable command receipt" } };
  const lostStageOutput = await worker("stage", { ...outputLossInput, crashAt: "after-stage-fsync", staleMs: 10 });
  assert.equal(lostStageOutput.code, 73, lostStageOutput.stderr);
  assert.equal(stageAttachment(outputLossInput, { staleMs: 10 }).replayed, false);
  assert.equal(stageAttachment(outputLossInput, { staleMs: 10 }).replayed, true);
  assert.throws(() => stageAttachment({ ...outputLossInput, userProvenance: { granted_by: "user", reason: "different provenance" } }), /reused with different input/);
  assert.deepEqual(readAuthority(outputLossControl, { allowTorn: false }).records.map((record) => record.kind), ["authority_genesis", "attachment_stage_intent", "attachment_staged"]);

  const partialControl = path.join(root, "partial-stage-control");
  const partialRoot = path.join(root, "partial-stage-root");
  fs.mkdirSync(partialRoot);
  ensureAuthority(partialControl, { authorityId: "partial-stage-authority" });
  const partialInput = { controlRoot: partialControl, stageCommandId: "partial-stage-command", attachmentRoot: partialRoot, authorityId: "partial-stage-authority", attachmentId: "partial-stage-attachment", claimToken: "partial-stage-secret", userProvenance: { granted_by: "user", reason: "recover a crashed initial stage" } };
  const plannedStage = stagedLocatorState(partialInput);
  const partialStage = await worker("stage", { ...partialInput, crashAt: "during-stage-locator", staleMs: 10 });
  assert.equal(partialStage.code, 73, partialStage.stderr);
  assert.equal(readLocator(partialRoot).error, "LOCATOR_TORN");
  const stageRecovery = { ...partialInput, controlRoot: partialControl, recoveryCommandId: "recover-partial-stage", expectedLocatorDigest: plannedStage.locator.record_digest };
  const interruptedRecovery = await worker("recover-stage", { ...stageRecovery, crashAt: "after-stage-recovery-truncate", staleMs: 10 });
  assert.equal(interruptedRecovery.code, 73, interruptedRecovery.stderr);
  assert.equal(recoverStagedLocator(stageRecovery, { staleMs: 10 }).replayed, false);
  assert.equal(recoverStagedLocator(stageRecovery, { staleMs: 10 }).replayed, true);
  assert.equal(readLocator(partialRoot).value.record_digest, plannedStage.locator.record_digest);
});

test("[MAR-ADAPTER] real partial append and first-create crashes require digest-bound user recovery", async (t) => {
  const root = temporaryRoot(t, "workloop-torn-append-");
  const controlRoot = path.join(root, "control");
  ensureAuthority(controlRoot, { authorityId: "authority-torn" });
  const crashed = await worker("append-crash", { controlRoot, commandId: "partial-command", payload: { value: "partial" }, crashAt: "during-append", staleMs: 10 });
  assert.equal(crashed.code, 73, crashed.stderr);
  const torn = readAuthority(controlRoot, { allowTorn: true });
  assert.equal(torn.torn, true);
  const tailDigest = digest(torn.raw.subarray(torn.validEndOffset));
  assert.throws(() => recoverTornAuthority(controlRoot, { commandId: "recover-without-user", expectedValidEndOffset: torn.validEndOffset, expectedTailDigest: tailDigest }), /user provenance/);
  assert.throws(() => recoverTornAuthority(controlRoot, {
    commandId: "recover-wrong-digest",
    authorityId: "authority-torn",
    expectedValidEndOffset: torn.validEndOffset,
    expectedTailDigest: digest("wrong"),
    userProvenance: { granted_by: "user", reason: "repair fixture" },
  }), /tail changed/);
  const repaired = recoverTornAuthority(controlRoot, {
    commandId: "recover-partial-command",
    authorityId: "authority-torn",
    expectedValidEndOffset: torn.validEndOffset,
    expectedTailDigest: tailDigest,
    userProvenance: { granted_by: "user", reason: "repair fixture" },
  }, { staleMs: 10 });
  assert.equal(repaired.repaired, true);
  assert.equal(repaired.bootstrap_initialized, false);
  assert.equal(readAuthority(controlRoot, { allowTorn: false }).records.at(-1).kind, "authority_tail_recovered");

  const firstCreate = path.join(root, "first-create");
  const bootCrash = await worker("ensure", { controlRoot: firstCreate, authorityId: "authority-bootstrap", crashAt: "during-append", staleMs: 10 });
  assert.equal(bootCrash.code, 73, bootCrash.stderr);
  const bootTorn = readAuthority(firstCreate, { allowTorn: true });
  assert.equal(bootTorn.records.length, 0);
  const bootRepair = recoverTornAuthority(firstCreate, {
    commandId: "reset-torn-bootstrap",
    authorityId: "authority-bootstrap",
    expectedValidEndOffset: 0,
    expectedTailDigest: digest(bootTorn.raw),
    userProvenance: { granted_by: "user", reason: "reset incomplete genesis" },
  }, { staleMs: 10 });
  assert.equal(bootRepair.bootstrap_initialized, true);
  assert.equal(recoverTornAuthority(firstCreate, { commandId: "reset-torn-bootstrap", authorityId: "authority-bootstrap", expectedValidEndOffset: 0, expectedTailDigest: digest(bootTorn.raw), userProvenance: { granted_by: "user", reason: "reset incomplete genesis" } }).replayed, true);
  ensureAuthority(firstCreate, { authorityId: "authority-bootstrap" });
  assert.equal(readAuthority(firstCreate, { allowTorn: false }).records.length, 2);


  const interruptedBootstrap = path.join(root, "bootstrap-during-recovery-genesis");
  const interruptedBootstrapCreate = await worker("ensure", { controlRoot: interruptedBootstrap, authorityId: "authority-bootstrap-interrupted", crashAt: "during-append", staleMs: 10 });
  assert.equal(interruptedBootstrapCreate.code, 73, interruptedBootstrapCreate.stderr);
  const interruptedBootstrapState = readAuthority(interruptedBootstrap, { allowTorn: true });
  const interruptedBootstrapInput = {
    controlRoot: interruptedBootstrap,
    commandId: "recover-bootstrap-interrupted",
    authorityId: "authority-bootstrap-interrupted",
    expectedValidEndOffset: 0,
    expectedTailDigest: digest(interruptedBootstrapState.raw),
    userProvenance: { granted_by: "user", reason: "recover interrupted bootstrap" },
  };
  const interruptedGenesis = await worker("recover-torn", { ...interruptedBootstrapInput, crashAt: "during-recovery-genesis", staleMs: 10 });
  assert.equal(interruptedGenesis.code, 73, interruptedGenesis.stderr);
  const bootstrapBarrier = await worker("ensure", { controlRoot: interruptedBootstrap, authorityId: "authority-bootstrap-interrupted", staleMs: 10 });
  assert.notEqual(bootstrapBarrier.code, 0);
  assert.match(bootstrapBarrier.stderr, /AUTHORITY_TORN|RECOVERY_REQUIRED/);
  const resumedBootstrap = recoverTornAuthority(interruptedBootstrap, interruptedBootstrapInput, { staleMs: 10 });
  assert.equal(resumedBootstrap.bootstrap_initialized, true);
  assert.deepEqual(readAuthority(interruptedBootstrap, { allowTorn: false }).records.map((record) => record.command_id), ["genesis:authority-bootstrap-interrupted", "recover-bootstrap-interrupted"]);
  for (const recoveryBoundary of ["during-recovery-intent", "after-recovery-intent", "after-recovery-truncate", "during-recovery-receipt", "after-recovery-receipt"]) {
    const phaseRoot = path.join(root, recoveryBoundary);
    const phaseAuthority = "authority-" + recoveryBoundary;
    ensureAuthority(phaseRoot, { authorityId: phaseAuthority });
    const partial = await worker("append-crash", { controlRoot: phaseRoot, commandId: "partial-" + recoveryBoundary, payload: { phase: recoveryBoundary }, crashAt: "during-append", staleMs: 10 });
    assert.equal(partial.code, 73, partial.stderr);
    const phaseState = readAuthority(phaseRoot, { allowTorn: true });
    const recoveryInput = { controlRoot: phaseRoot, commandId: "recover-" + recoveryBoundary, authorityId: phaseAuthority, expectedValidEndOffset: phaseState.validEndOffset, expectedTailDigest: digest(phaseState.raw.subarray(phaseState.validEndOffset)), userProvenance: { granted_by: "user", reason: "recover phase" } };
    const interrupted = await worker("recover-torn", { ...recoveryInput, crashAt: recoveryBoundary, staleMs: 10 });
    assert.equal(interrupted.code, 73, recoveryBoundary + ": " + interrupted.stderr);
    if (recoveryBoundary === "after-recovery-truncate") {
      const blocked = await worker("append", { controlRoot: phaseRoot, commandId: "must-not-cross-recovery", payload: {}, staleMs: 10, timeoutMs: 5_000 });
      assert.notEqual(blocked.code, 0);
      assert.match(blocked.stderr, /RECOVERY_REQUIRED|incomplete authority recovery/);
    }
    const resumed = recoverTornAuthority(phaseRoot, recoveryInput, { staleMs: 10 });
    assert.equal(resumed.repaired, true);
    assert.equal(readAuthority(phaseRoot, { allowTorn: false }).records.filter((record) => record.command_id === recoveryInput.commandId).length, 1);
    assert.throws(() => recoverTornAuthority(phaseRoot, { ...recoveryInput, userProvenance: { granted_by: "user", reason: "changed" } }), /reused with different input/);
  }

  const unflushed = await worker("append-crash", { controlRoot, commandId: "complete-before-fsync", payload: { value: 1 }, crashAt: "before-fsync", staleMs: 10 });
  assert.equal(unflushed.code, 73, unflushed.stderr);
  assert.equal(readAuthority(controlRoot, { allowTorn: false }).records.at(-1).command_id, "complete-before-fsync");
  const syncedReplay = await worker("append", { controlRoot, commandId: "complete-before-fsync", payload: { value: 1 }, staleMs: 10, timeoutMs: 5_000 });
  assert.equal(syncedReplay.code, 0, syncedReplay.stderr);
  assert.equal(JSON.parse(syncedReplay.stdout).replayed, true);

  const flushed = await worker("append-crash", { controlRoot, commandId: "flushed-before-output", payload: { value: 1 }, crashAt: "after-fsync", staleMs: 10 });
  assert.equal(flushed.code, 73, flushed.stderr);
  const replay = await worker("append", { controlRoot, commandId: "flushed-before-output", payload: { value: 1 }, staleMs: 10, timeoutMs: 5_000 });
  assert.equal(replay.code, 0, replay.stderr);
  assert.equal(JSON.parse(replay.stdout).replayed, true);

  const capacityRoot = path.join(root, "recovery-capacity");
  ensureAuthority(capacityRoot, { authorityId: "authority-recovery-capacity" });
  fillAuthorityToNormalHeadroom(capacityRoot, 4_096);
  const capacityCrash = await worker("append-crash", { controlRoot: capacityRoot, commandId: "capacity-partial", payload: {}, crashAt: "during-append", staleMs: 10 });
  assert.equal(capacityCrash.code, 73, capacityCrash.stderr);
  const capacityState = readAuthority(capacityRoot, { allowTorn: true });
  const capacityRecovery = { commandId: "capacity-recovery", authorityId: "authority-recovery-capacity", expectedValidEndOffset: capacityState.validEndOffset, expectedTailDigest: digest(capacityState.raw.subarray(capacityState.validEndOffset)), userProvenance: { granted_by: "user", reason: "r".repeat(70_000) } };
  assert.throws(() => recoverTornAuthority(capacityRoot, capacityRecovery, { staleMs: 10 }), /exceeds bounded record size/);
  assert.equal(fs.existsSync(path.join(capacityRoot, "recovery")), false, "capacity refusal must precede durable recovery intent");
  const compactRecovery = recoverTornAuthority(capacityRoot, { ...capacityRecovery, userProvenance: { granted_by: "user", reason: "short recovery receipt" } }, { staleMs: 10 });
  assert.equal(compactRecovery.repaired, true);

  const bounded = authorityFixture(t, "bounded-replay");
  publishAttachment(bounded);
  const boundedBefore = fs.statSync(authorityPath(bounded.controlRoot)).size;
  assert.throws(() => appendAuthority(bounded.controlRoot, { commandId: "must-not-self-wedge", kind: "probe_appended", payload: { value: "x".repeat(AUTHORITY_MAX_BYTES) } }), /exceeds bounded record size|bounded authority replay limits/);
  assert.equal(fs.statSync(authorityPath(bounded.controlRoot)).size, boundedBefore);
  assert.equal(readAuthority(bounded.controlRoot, { allowTorn: false }).torn, false);
  fs.truncateSync(authorityPath(bounded.controlRoot), AUTHORITY_MAX_BYTES + 1);
  const boundedRoute = routeAttachment(routingInput(bounded));
  assert.equal(boundedRoute.state, "uncertain");
  assert.equal(boundedRoute.reason, "JOURNAL_LIMIT_EXCEEDED");
});

test("[MAR-ADAPTER] multi-record mutations reserve their complete authority transaction before external publication", (t) => {
  const root = temporaryRoot(t, "workloop-transaction-capacity-");
  const stageControlRoot = path.join(root, "stage-control");
  const stageAttachmentRoot = path.join(root, "stage-attachment");
  fs.mkdirSync(stageAttachmentRoot);
  ensureAuthority(stageControlRoot, { authorityId: "stage-capacity-authority" });
  fillAuthorityToNormalHeadroom(stageControlRoot, 0);
  const stageBefore = readAuthority(stageControlRoot, { allowTorn: false }).records.length;
  assert.throws(() => stageAttachment({
    controlRoot: stageControlRoot,
    stageCommandId: "stage-capacity-command",
    attachmentRoot: stageAttachmentRoot,
    authorityId: "stage-capacity-authority",
    attachmentId: "stage-capacity-attachment",
    claimToken: "stage-capacity-secret",
    userProvenance: { granted_by: "user", reason: "capacity refusal" },
  }), /recovery reserve/);
  assert.equal(readAuthority(stageControlRoot, { allowTorn: false }).records.length, stageBefore, "stage refusal must precede its intent");
  assert.equal(fs.existsSync(locatorPath(stageAttachmentRoot)), false, "stage refusal must precede locator publication");

  const claim = authorityFixture(t, "claim-capacity");
  fillAuthorityToNormalHeadroom(claim.controlRoot, 0);
  const claimBefore = readAuthority(claim.controlRoot, { allowTorn: false }).records.length;
  const stagedBefore = readLocator(claim.attachmentRoot);
  assert.equal(stagedBefore.records.length, 1);
  assert.throws(() => publishAttachment(claim), /recovery reserve/);
  const claimAfter = readAuthority(claim.controlRoot, { allowTorn: false });
  assert.equal(claimAfter.records.length, claimBefore, "claim refusal must precede pending authority publication");
  assert.equal(claimAfter.records.some((record) => record.command_id === `${claim.commandId}:pending`), false);
  assert.equal(readLocator(claim.attachmentRoot).records.length, 1, "claim refusal must leave the staged locator unchanged");
});

test("[MAR-ADAPTER] claim publication uses strict digest-only semantics and explicit optimistic recovery", async (t) => {
  const deniedPublication = authorityFixture(t, "denied-publication");
  assert.throws(() => publishAttachment({ ...deniedPublication, userProvenance: { granted_by: "agent", reason: "self signed" } }), /publication requires/);
  publishAttachment(deniedPublication);
  const recoverable = new Set(["after-pending", "during-locator-append", "after-locator"]);
  for (const boundary of ["before-pending", "after-pending", "during-locator-append", "after-locator", "after-final", "before-output"]) {
    const fx = authorityFixture(t, boundary);
    const crashed = await worker("publish", { ...fx, crashAt: boundary, staleMs: 10 });
    assert.equal(crashed.code, 73, `${boundary}: ${crashed.stderr}`);
    let receipt;
    if (recoverable.has(boundary)) {
      assert.throws(() => publishAttachment(fx, { staleMs: 10 }), /explicit recovery/);
      const records = readAuthority(fx.controlRoot, { allowTorn: false }).records;
      const pending = records.find((record) => record.command_id === `${fx.commandId}:pending`);
      const locator = readLocator(fx.attachmentRoot, { allowTorn: true });
      const recovery = {
        ...fx,
        recoveryCommandId: `recover-${boundary}`,
        expectedEpoch: 1,
        expectedPendingDigest: pending.record_digest,
        expectedLocatorDigest: locator.records.at(-1).record_digest,
        recoveryProvenance: { granted_by: "user", reason: "recover " + boundary },
      };
      assert.throws(() => recoverAttachment({ ...recovery, expectedEpoch: 2 }, { staleMs: 10 }), /precondition changed/);
      receipt = recoverAttachment(recovery, { staleMs: 10 });
      const replayedRecovery = recoverAttachment(recovery, { staleMs: 10 });
      assert.equal(replayedRecovery.replayed, true);
      assert.equal(readAuthority(fx.controlRoot, { allowTorn: false }).records.at(-1).kind, "attachment_recovery_receipt");
    } else {
      receipt = publishAttachment(fx, { staleMs: 10 });
    }
    assert.ok(receipt);
    assert.equal(routeAttachment(routingInput(fx), { staleMs: 10 }).state, "claimed");
    assert.doesNotMatch(fs.readFileSync(authorityPath(fx.controlRoot), "utf8"), new RegExp(fx.claimToken));
  }

  const movedReplay = authorityFixture(t, "publication-move-replay");
  assert.throws(() => publishAttachment(movedReplay, { crashAt: "before-output" }), /injected crash/);
  const movedReplayRoot = path.join(movedReplay.root, "attachment-moved-before-replay");
  fs.renameSync(movedReplay.attachmentRoot, movedReplayRoot);
  const movedReceipt = publishAttachment({ ...movedReplay, attachmentRoot: movedReplayRoot });
  assert.equal(movedReceipt.replayed, true);
  assert.equal(routeAttachment(routingInput({ ...movedReplay, attachmentRoot: movedReplayRoot })).state, "claimed");

  const finalBoundary = authorityFixture(t, "recovery-final-boundary");
  assert.throws(() => publishAttachment(finalBoundary, { crashAt: "after-pending" }), /injected crash/);
  const finalBoundaryPending = readAuthority(finalBoundary.controlRoot, { allowTorn: false }).records.find((record) => record.command_id === finalBoundary.commandId + ":pending");
  const finalBoundaryInput = { ...finalBoundary, recoveryCommandId: "recover-final-boundary", expectedEpoch: 1, expectedPendingDigest: finalBoundaryPending.record_digest, expectedLocatorDigest: readLocator(finalBoundary.attachmentRoot, { allowTorn: true }).records.at(-1).record_digest, recoveryProvenance: { granted_by: "user", reason: "resume after recovery final append" } };
  assert.throws(() => recoverAttachment(finalBoundaryInput, { crashAt: "after-final" }), /injected crash/);
  let finalBoundaryRecords = readAuthority(finalBoundary.controlRoot, { allowTorn: false }).records;
  assert.ok(finalBoundaryRecords.some((record) => record.command_id === finalBoundary.commandId + ":final"));
  assert.ok(finalBoundaryRecords.some((record) => record.command_id === finalBoundaryInput.recoveryCommandId + ":intent"));
  assert.equal(finalBoundaryRecords.some((record) => record.command_id === finalBoundaryInput.recoveryCommandId), false);
  assert.equal(recoverAttachment(finalBoundaryInput).replayed, false);
  assert.equal(recoverAttachment(finalBoundaryInput).replayed, true);

  const recoveryCrash = authorityFixture(t, "recovery-output-loss");
  assert.throws(() => publishAttachment(recoveryCrash, { crashAt: "after-pending" }), /injected crash/);
  const recoveryState = readAuthority(recoveryCrash.controlRoot, { allowTorn: false }).records;
  const recoveryPending = recoveryState.find((record) => record.command_id === recoveryCrash.commandId + ":pending");
  const recoveryInput = {
    ...recoveryCrash,
    recoveryCommandId: "recover-output-loss",
    expectedEpoch: 1,
    expectedPendingDigest: recoveryPending.record_digest,
    expectedLocatorDigest: readLocator(recoveryCrash.attachmentRoot, { allowTorn: true }).records.at(-1).record_digest,
    recoveryProvenance: { granted_by: "user", reason: "prove recovery replay" },
  };
  assert.throws(() => recoverAttachment(recoveryInput, { crashAt: "after-recovery-receipt" }), /injected crash/);
  assert.equal(recoverAttachment(recoveryInput).replayed, true);
  assert.throws(() => recoverAttachment({ ...recoveryInput, recoveryProvenance: { granted_by: "user", reason: "changed" } }), /reused with different input/);

  const finalized = authorityFixture(t, "finalized-no-recovery");
  publishAttachment(finalized);
  const finalizedRecords = readAuthority(finalized.controlRoot, { allowTorn: false }).records;
  const finalizedPending = finalizedRecords.find((record) => record.command_id === finalized.commandId + ":pending");
  assert.throws(() => recoverAttachment({ ...finalized, recoveryCommandId: "invalid-final-recovery", recoveryProvenance: { granted_by: "user", reason: "should replay original" }, expectedEpoch: 1, expectedPendingDigest: finalizedPending.record_digest, expectedLocatorDigest: readLocator(finalized.attachmentRoot).value.record_digest }), /final publication already exists/);

  const forged = authorityFixture(t, "forged-final");
  publishAttachment(forged);
  const original = readAuthority(forged.controlRoot, { allowTorn: false }).records;
  const payload = original.find((record) => record.command_id === `${forged.commandId}:pending`).payload;
  appendAuthority(forged.controlRoot, { commandId: "forged:pending", kind: "attachment_claim_pending", payload: { ...payload, publication_command_id: "forged" } });
  assert.throws(() => appendAuthority(forged.controlRoot, { commandId: "forged:final", kind: "probe_appended", payload: { pending_record_digest: "fake" } }), /incomplete authority transaction/);
  const rejected = routeAttachment(routingInput(forged, { commandId: "forged" }));
  assert.equal(rejected.state, "pending");
  assert.equal(rejected.clean_evidence, false);

  const mismatched = authorityFixture(t, "mismatched-final");
  publishAttachment(mismatched);
  const mismatchRecords = readAuthority(mismatched.controlRoot, { allowTorn: false }).records;
  const mismatchPayload = mismatchRecords.find((record) => record.command_id === `${mismatched.commandId}:pending`).payload;
  appendAuthority(mismatched.controlRoot, { commandId: "mismatch:pending", kind: "attachment_claim_pending", payload: { ...mismatchPayload, publication_command_id: "different-command" } });
  assert.equal(routeAttachment(routingInput(mismatched, { commandId: "mismatch" })).state, "pending");
});

test("[MAR-ADAPTER] Git common authority survives move/remove/prune and rejects collision, alias, and path reuse", (t) => {
  const root = temporaryRoot(t, "workloop-git-lifecycle-");
  const repo = path.join(root, "repo");
  const worktree = path.join(root, "worktree");
  const moved = path.join(root, "worktree-moved");
  runGit(root, ["init", "--quiet", repo]);
  runGit(repo, ["config", "user.name", "Workloop Spike"]);
  runGit(repo, ["config", "user.email", "workloop@example.invalid"]);
  fs.writeFileSync(path.join(repo, "tracked.txt"), "tracked\n");
  fs.writeFileSync(path.join(repo, ".gitignore"), "ignored/\n");
  runGit(repo, ["add", "tracked.txt", ".gitignore"]);
  runGit(repo, ["commit", "--quiet", "-m", "seed"]);
  runGit(repo, ["worktree", "add", "--quiet", "-b", "lifecycle", worktree]);
  const commonDir = runGit(worktree, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const gitDir = runGit(worktree, ["rev-parse", "--path-format=absolute", "--git-dir"]);
  const controlRoot = path.join(commonDir, "workloop");
  const fx = { controlRoot, attachmentRoot: gitDir, subjectRoot: worktree, attachmentKind: "git", userProvenance: { granted_by: "user", reason: "Git claim fixture" }, authorityId: "git-authority", attachmentId: "git-worktree", claimToken: "git-secret", stageCommandId: "git-stage", commandId: "git-claim" };
  ensureAuthority(controlRoot, { authorityId: fx.authorityId });
  stageAttachment(fx);
  assert.throws(() => publishAttachment({ ...fx, subjectRoot: root }), /subject does not resolve/);
  assert.equal(readAuthority(controlRoot, { allowTorn: false }).records.length, 3, "invalid Git subject must not mutate authority");
  const publicationPointer = path.join(worktree, ".git");
  const publicationPointerBytes = fs.readFileSync(publicationPointer);
  assert.throws(() => publishAttachment(fx, { beforeAuthorityLock: () => replaceExistingFile(publicationPointer, "gitdir: invalid-admin\n") }), /changed before authority publication/);
  replaceExistingFile(publicationPointer, publicationPointerBytes);
  assert.equal(readAuthority(controlRoot, { allowTorn: false }).records.length, 3, "Git pointer race must not mutate authority");
  publishAttachment(fx);
  assert.equal(routeAttachment(routingInput(fx, { subjectRoots: [worktree] })).state, "claimed");
  const gitPointer = path.join(worktree, ".git");
  const pointerBytes = fs.readFileSync(gitPointer);
  const raced = routeAttachment(routingInput(fx, { subjectRoots: [worktree] }), { beforeAuthorityLock: () => replaceExistingFile(gitPointer, "gitdir: invalid-admin\n") });
  assert.equal(raced.state, "reattach_required", "a changed Git admin pointer cannot reuse a pre-lock pairing");
  replaceExistingFile(gitPointer, pointerBytes);
  assert.equal(routeAttachment(routingInput(fx, { subjectRoots: [worktree] })).state, "claimed");

  const alias = path.join(root, "gitdir-alias");
  if (process.platform === "win32") fs.symlinkSync(gitDir, alias, "junction");
  else fs.symlinkSync(gitDir, alias, "dir");
  assert.equal(routeAttachment(routingInput(fx, { attachmentRoots: [gitDir, alias], subjectRoots: [worktree, worktree] })).state, "claimed", "one physical anchor through two paths is not a collision");
  const copiedAdmin = path.join(root, "copied-admin");
  fs.mkdirSync(copiedAdmin);
  assert.equal(routeAttachment(routingInput(fx, { subjectRoots: [copiedAdmin] })).state, "unavailable", "a valid Git admin locator cannot authenticate an arbitrary subject directory");

  runGit(repo, ["worktree", "move", worktree, moved]);
  assert.equal(routeAttachment(routingInput(fx, { attachmentRoots: [gitDir], subjectRoots: [moved] })).state, "claimed");
  const savedLocator = fs.readFileSync(locatorPath(gitDir));
  const originalAnchor = stableDirectoryAnchor(gitDir).id;
  runGit(repo, ["worktree", "remove", "--force", moved]);
  assert.equal(fs.existsSync(authorityPath(controlRoot)), true);
  assert.equal(routeAttachment(routingInput(fx, { attachmentRoots: [gitDir], subjectRoots: [moved] })).state, "unavailable");

  runGit(repo, ["worktree", "add", "--quiet", "-b", "reuse", moved]);
  const reusedGitDir = runGit(moved, ["rev-parse", "--path-format=absolute", "--git-dir"]);
  assert.equal(fs.existsSync(locatorPath(reusedGitDir)), false, "same path must not inherit locator");
  assert.notEqual(stableDirectoryAnchor(reusedGitDir).id, originalAnchor);
  fs.writeFileSync(locatorPath(reusedGitDir), savedLocator);
  assert.equal(routeAttachment(routingInput(fx, { attachmentRoots: [reusedGitDir], subjectRoots: [moved] })).state, "reattach_required");

  const missing = path.join(root, "registered-missing");
  runGit(repo, ["worktree", "add", "--quiet", "-b", "pruned", missing]);
  const prunedGitDir = runGit(missing, ["rev-parse", "--path-format=absolute", "--git-dir"]);
  const prunedAttachment = { controlRoot, attachmentRoot: prunedGitDir, subjectRoot: missing, attachmentKind: "git", userProvenance: { granted_by: "user", reason: "Git claim fixture" }, authorityId: fx.authorityId, attachmentId: "git-pruned", claimToken: "git-pruned-secret", stageCommandId: "git-pruned-stage", commandId: "git-pruned-claim" };
  stageAttachment(prunedAttachment);
  publishAttachment(prunedAttachment);
  assert.equal(routeAttachment(routingInput(prunedAttachment, { subjectRoots: [missing] })).state, "claimed");
  fs.rmSync(missing, { recursive: true, force: true });
  assert.equal(fs.existsSync(prunedGitDir), true, "registration remains before prune");
  assert.equal(routeAttachment(routingInput(prunedAttachment, { subjectRoots: [missing] })).state, "unavailable", "registered-but-missing worktree is not clean");
  runGit(repo, ["worktree", "prune", "--expire", "now"]);
  assert.equal(fs.existsSync(prunedGitDir), false, "prune removes only the worktree locator/admin directory");
  assert.equal(fs.existsSync(authorityPath(controlRoot)), true, "common authority survives prune");

  const collisionA = path.join(root, "collision-a");
  const collisionB = path.join(root, "collision-b");
  runGit(repo, ["worktree", "add", "--quiet", "-b", "collision-a", collisionA]);
  runGit(repo, ["worktree", "add", "--quiet", "-b", "collision-b", collisionB]);
  const collisionGitA = runGit(collisionA, ["rev-parse", "--path-format=absolute", "--git-dir"]);
  const collisionGitB = runGit(collisionB, ["rev-parse", "--path-format=absolute", "--git-dir"]);
  const collisionAttachment = { controlRoot, attachmentRoot: collisionGitA, subjectRoot: collisionA, attachmentKind: "git", userProvenance: { granted_by: "user", reason: "Git claim fixture" }, authorityId: fx.authorityId, attachmentId: "git-collision", claimToken: "git-collision-secret", stageCommandId: "git-collision-stage", commandId: "git-collision-claim" };
  stageAttachment(collisionAttachment);
  publishAttachment(collisionAttachment);
  fs.copyFileSync(locatorPath(collisionGitA), locatorPath(collisionGitB));
  const gitCollision = routeAttachment(routingInput(collisionAttachment, { attachmentRoots: [collisionGitA, collisionGitB], subjectRoots: [collisionA, collisionB] }));
  assert.equal(gitCollision.state, "collision");
  assert.equal(routeAttachment(routingInput(collisionAttachment, { attachmentRoots: [collisionGitA], subjectRoots: [collisionA] })).state, "collision", "detected collision remains ineligible until explicit recovery");
  const gitReattach = {
    ...collisionAttachment,
    attachmentRoot: collisionGitB,
    subjectRoot: collisionB,
    publicationCommandId: collisionAttachment.commandId,
    commandId: "git-collision-reattach",
    expectedEpoch: 1,
    expectedLocatorDigest: readLocator(collisionGitB).value.record_digest,
    newClaimToken: "git-collision-selected-secret",
    userProvenance: { granted_by: "user", reason: "select the second Git worktree collision anchor" },
  };
  assert.equal(reattachAttachment(gitReattach).epoch, 2);
  assert.equal(routeAttachment(routingInput({ ...collisionAttachment, attachmentRoot: collisionGitB, claimToken: gitReattach.newClaimToken }, { attachmentRoots: [collisionGitA, collisionGitB], subjectRoots: [collisionA, collisionB] })).state, "claimed");
});

test("[MAR-ADAPTER] deterministic filesystem identity distinguishes rename, delete, path recreation, copy, and unavailable anchors", (t) => {
  const fx = authorityFixture(t, "filesystem-lifecycle");
  publishAttachment(fx);
  const originalAnchor = stableDirectoryAnchor(fx.attachmentRoot);
  const moved = path.join(fx.root, "same-volume-moved");
  fs.renameSync(fx.attachmentRoot, moved);
  assert.equal(stableDirectoryAnchor(moved).id, originalAnchor.id);
  assert.equal(routeAttachment(routingInput(fx, { attachmentRoots: [moved] })).state, "claimed");
  const saved = fs.readFileSync(locatorPath(moved));
  fs.rmSync(moved, { recursive: true, force: true });
  assert.equal(routeAttachment(routingInput(fx, { attachmentRoots: [moved] })).state, "unavailable");
  fs.mkdirSync(moved);
  fs.writeFileSync(locatorPath(moved), saved);
  assert.equal(routeAttachment(routingInput(fx, { attachmentRoots: [moved] })).state, "reattach_required");
  const collisionFx = authorityFixture(t, "filesystem-collision");
  publishAttachment(collisionFx);
  const collisionCopy = path.join(collisionFx.root, "copy");
  fs.cpSync(collisionFx.attachmentRoot, collisionCopy, { recursive: true });
  assert.equal(routeAttachment(routingInput(collisionFx, { attachmentRoots: [collisionFx.attachmentRoot, collisionCopy] })).state, "collision");
  assert.equal(routeAttachment(routingInput(collisionFx)).state, "collision", "detected collision remains authority state");
  const unprovable = authorityFixture(t, "filesystem-unprovable-anchor");
  publishAttachment(unprovable);
  const unavailableAnchor = () => ({ state: "unavailable", reason: "STABLE_FIELDS_UNAVAILABLE" });
  assert.equal(routeAttachment(routingInput(unprovable), { anchorResolver: unavailableAnchor }).state, "reattach_required");
  const invalid = { dev: 0n, ino: 0n, birthtimeNs: 0n, isDirectory: () => true };
  assert.deepEqual(stableDirectoryAnchorFromStats("invalid", invalid, invalid), { state: "unavailable", reason: "STABLE_FIELDS_UNAVAILABLE" });
});



test("[MAR-ADAPTER] staged cleanup and authority abandonment require attended optimistic receipts", async (t) => {
  const root = temporaryRoot(t, "workloop-attended-cleanup-");
  const controlRoot = path.join(root, "control");
  const attachmentRoot = path.join(root, "attachment");
  fs.mkdirSync(attachmentRoot);
  const authorityId = "cleanup-authority";
  const attachmentId = "cleanup-attachment";
  const userProvenance = { granted_by: "user", reason: "discard unclaimed staged locator" };
  ensureAuthority(controlRoot, { authorityId });
  const staged = stageAttachment({ controlRoot, stageCommandId: "cleanup-stage", attachmentRoot, authorityId, attachmentId, claimToken: "cleanup-secret", userProvenance });
  const input = { controlRoot, attachmentRoot, authorityId, attachmentId, commandId: "cleanup-staged", expectedLocatorDigest: staged.locator_digest, userProvenance };
  assert.throws(() => cleanupStagedLocator({ ...input, expectedLocatorDigest: digest("wrong") }), /exact unclaimed staged locator/);
  assert.throws(() => cleanupStagedLocator({ ...input, userProvenance: { granted_by: "agent", reason: "self signed" } }), /exact user provenance/);
  const interrupted = await worker("cleanup-staged", { ...input, crashAt: "after-cleanup-delete", staleMs: 10 });
  assert.equal(interrupted.code, 73, interrupted.stderr);
  assert.equal(fs.existsSync(locatorPath(attachmentRoot)), false);
  assert.equal(cleanupStagedLocator(input).replayed, false);
  assert.equal(cleanupStagedLocator(input).replayed, true);


  const claimed = authorityFixture(t, "cleanup-claimed-denied");
  publishAttachment(claimed);
  const claimedState = readAuthority(claimed.controlRoot, { allowTorn: false });
  assert.throws(() => cleanupStagedLocator({ controlRoot: claimed.controlRoot, attachmentRoot: claimed.attachmentRoot, authorityId: claimed.authorityId, attachmentId: claimed.attachmentId, commandId: "cleanup-claimed-denied", expectedLocatorDigest: readLocator(claimed.attachmentRoot).value.record_digest, userProvenance }), /committed authority claim/);
  assert.throws(() => abandonStagedAuthority({ controlRoot: claimed.controlRoot, authorityId: claimed.authorityId, commandId: "abandon-claimed-denied", expectedGenesisDigest: claimedState.records[0].record_digest, userProvenance }), /attachment claim or collision|non-staging records/);
  const abandonRoot = path.join(root, "abandon-control");
  const genesis = ensureAuthority(abandonRoot, { authorityId: "abandon-authority" });
  const abandonInput = { controlRoot: abandonRoot, authorityId: "abandon-authority", commandId: "abandon-staging", expectedGenesisDigest: genesis.record_digest, userProvenance: { granted_by: "user", reason: "abandon empty staged shard" } };
  assert.throws(() => abandonStagedAuthority({ ...abandonInput, expectedGenesisDigest: digest("wrong") }), /genesis changed/);
  assert.throws(() => abandonStagedAuthority({ ...abandonInput, userProvenance: { granted_by: "agent", reason: "self signed" } }), /exact user provenance/);
  assert.throws(() => abandonStagedAuthority(abandonInput, { crashAt: "before-abandon-output" }), /injected crash/);
  assert.equal(abandonStagedAuthority(abandonInput).replayed, true);
  assert.equal(readAuthority(abandonRoot, { allowTorn: false }).records.at(-1).kind, "authority_staging_abandoned");
  assert.throws(() => ensureAuthority(abandonRoot, { authorityId: "abandon-authority" }), /terminally abandoned/);
});

test("[MAR-ADAPTER] attended identity fork is a resumable one-authority-at-a-time saga", async (t) => {
  for (const boundary of ["during-fork-locator", "after-fork-new-final", "before-fork-output"]) {
    const fx = authorityFixture(t, "fork-" + boundary);
    publishAttachment(fx);
    const selected = path.join(fx.root, "fork-selected");
    fs.cpSync(fx.attachmentRoot, selected, { recursive: true });
    const collision = routeAttachment(routingInput(fx, { attachmentRoots: [fx.attachmentRoot, selected] }));
    assert.equal(collision.state, "collision");
    const sourceDigest = readLocator(selected).value.record_digest;
    const input = {
      ...fx,
      attachmentRoot: selected,
      publicationCommandId: fx.commandId,
      commandId: "fork-command-" + boundary,
      expectedEpoch: 1,
      expectedLocatorDigest: sourceDigest,
      collisionRecordDigest: collision.collision_record_digest,
      newControlRoot: path.join(fx.root, "new-authority"),
      newAuthorityId: "new-authority-" + boundary,
      newAttachmentId: "new-attachment-" + boundary,
      newClaimToken: "new-secret-" + boundary,
      userProvenance: { granted_by: "user", reason: "selected locator is an independent copy" },
    };
    if (boundary === "during-fork-locator") {
      assert.throws(() => forkIdentity({ ...input, collisionRecordDigest: digest("wrong") }), /exact unresolved collision/);
      assert.throws(() => forkIdentity({ ...input, userProvenance: { granted_by: "agent", reason: "self signed" } }), /exact user provenance/);
    }
    const interrupted = await worker("fork-identity", { ...input, crashAt: boundary, staleMs: 10, timeoutMs: 10_000 });
    assert.equal(interrupted.code, 73, boundary + ": " + interrupted.stderr);
    assert.equal(routeAttachment(routingInput(fx, { attachmentRoots: [fx.attachmentRoot, selected] })).state, boundary === "before-fork-output" ? "claimed" : "collision", "old identity remains collision until old-authority resolution");
    const resumed = forkIdentity(input, { staleMs: 10, timeoutMs: 10_000 });
    assert.equal(resumed.replayed, boundary === "before-fork-output");
    const newRouting = {
      controlRoot: input.newControlRoot,
      attachmentRoots: [selected],
      authorityId: input.newAuthorityId,
      attachmentId: input.newAttachmentId,
      claimToken: input.newClaimToken,
      commandId: input.commandId + ":new",
    };
    assert.equal(routeAttachment(newRouting).state, "claimed");
    assert.equal(routeAttachment(routingInput(fx, { attachmentRoots: [fx.attachmentRoot, selected] })).state, "claimed", "forked selected anchor no longer authenticates the old identity");
    assert.equal(forkIdentity(input, { staleMs: 10 }).replayed, true);
    assert.equal(readAuthority(input.newControlRoot, { allowTorn: false }).records.some((record) => record.payload?.attachment_id === fx.attachmentId), false, "new authority must not copy old attachment history");
  }
  for (const phase of ["during-fork-destination-genesis", "during-fork-destination-intent", "during-fork-source-intent", "during-fork-source-ready", "during-fork-new-pending", "during-fork-new-final", "during-fork-resolution"]) {
    const fx = authorityFixture(t, "fork-tail-" + phase);
    publishAttachment(fx);
    const selected = path.join(fx.root, "fork-tail-selected");
    fs.cpSync(fx.attachmentRoot, selected, { recursive: true });
    const collision = routeAttachment(routingInput(fx, { attachmentRoots: [fx.attachmentRoot, selected] }));
    const input = {
      ...fx,
      attachmentRoot: selected,
      publicationCommandId: fx.commandId,
      commandId: "fork-tail-command-" + phase,
      expectedEpoch: 1,
      expectedLocatorDigest: readLocator(selected).value.record_digest,
      collisionRecordDigest: collision.collision_record_digest,
      newControlRoot: path.join(fx.root, "fork-tail-authority"),
      newAuthorityId: "fork-tail-authority-" + phase,
      newAttachmentId: "fork-tail-attachment-" + phase,
      newClaimToken: "fork-tail-secret-" + phase,
      userProvenance: { granted_by: "user", reason: "prove partial fork authority frames recover" },
    };
    const interrupted = await worker("fork-identity", { ...input, crashAt: phase, staleMs: 10, timeoutMs: 10_000 });
    assert.equal(interrupted.code, 73, phase + ": " + interrupted.stderr);
    const sourcePhase = phase === "during-fork-source-intent" || phase === "during-fork-resolution";
    const recoveredRoot = sourcePhase ? fx.controlRoot : input.newControlRoot;
    const recoveredAuthorityId = sourcePhase ? fx.authorityId : input.newAuthorityId;
    assert.equal(recoverAuthorityTail(recoveredRoot, recoveredAuthorityId, "recover-" + phase).repaired, true);
    assert.equal(forkIdentity(input, { staleMs: 10, timeoutMs: 10_000 }).replayed, false);
    assert.equal(routeAttachment({ controlRoot: input.newControlRoot, attachmentRoots: [selected], authorityId: input.newAuthorityId, attachmentId: input.newAttachmentId, claimToken: input.newClaimToken, commandId: input.commandId + ":new" }).state, "claimed");
  }

  const barrier = authorityFixture(t, "fork-intent-barrier");
  publishAttachment(barrier);
  const barrierSelected = path.join(barrier.root, "fork-intent-selected");
  fs.cpSync(barrier.attachmentRoot, barrierSelected, { recursive: true });
  const barrierCollision = routeAttachment(routingInput(barrier, { attachmentRoots: [barrier.attachmentRoot, barrierSelected] }));
  const barrierBase = {
    ...barrier,
    attachmentRoot: barrierSelected,
    publicationCommandId: barrier.commandId,
    expectedEpoch: 1,
    expectedLocatorDigest: readLocator(barrierSelected).value.record_digest,
    collisionRecordDigest: barrierCollision.collision_record_digest,
    userProvenance: { granted_by: "user", reason: "serialize competing identity forks" },
  };
  const firstFork = { ...barrierBase, commandId: "fork-first", newControlRoot: path.join(barrier.root, "fork-first-authority"), newAuthorityId: "fork-first-authority", newAttachmentId: "fork-first-attachment", newClaimToken: "fork-first-secret" };
  const secondFork = { ...barrierBase, commandId: "fork-second", newControlRoot: path.join(barrier.root, "fork-second-authority"), newAuthorityId: "fork-second-authority", newAttachmentId: "fork-second-attachment", newClaimToken: "fork-second-secret" };
  assert.throws(() => forkIdentity(firstFork, { crashAt: "after-fork-source-ready" }), /injected crash/);
  const firstDestinationRecords = readAuthority(firstFork.newControlRoot, { allowTorn: false }).records;
  const firstDestinationGenesis = firstDestinationRecords[0];
  const firstDestinationIntent = firstDestinationRecords.find((record) => record.kind === "attachment_fork_destination_intent");
  assert.equal(firstDestinationRecords.some((record) => record.kind === "attachment_fork_source_ready"), true);
  assert.throws(() => abandonStagedAuthority({ controlRoot: firstFork.newControlRoot, authorityId: firstFork.newAuthorityId, commandId: "must-not-abandon-source-ready", expectedGenesisDigest: firstDestinationGenesis.record_digest, expectedForkDestinationDigest: firstDestinationIntent.record_digest, userProvenance: { granted_by: "user", reason: "source intent already exists" } }), /already committed to creating the source intent/);
  assert.throws(() => forkIdentity(secondFork), /earlier identity fork.*completed first/);
  assert.throws(() => reattachAttachment({ ...barrier, attachmentRoot: barrierSelected, publicationCommandId: barrier.commandId, commandId: "reattach-during-fork", expectedEpoch: 1, expectedLocatorDigest: barrierBase.expectedLocatorDigest, newClaimToken: "must-not-overtake-fork", userProvenance: { granted_by: "user", reason: "must serialize behind pending fork" } }), /earlier identity fork.*completed first/);
  assert.equal(forkIdentity(firstFork).replayed, false);

  const destinationBarrier = authorityFixture(t, "fork-destination-barrier");
  publishAttachment(destinationBarrier);
  const destinationSelected = path.join(destinationBarrier.root, "fork-destination-selected");
  fs.cpSync(destinationBarrier.attachmentRoot, destinationSelected, { recursive: true });
  const destinationCollision = routeAttachment(routingInput(destinationBarrier, { attachmentRoots: [destinationBarrier.attachmentRoot, destinationSelected] }));
  const destinationInput = {
    ...destinationBarrier,
    attachmentRoot: destinationSelected,
    publicationCommandId: destinationBarrier.commandId,
    commandId: "fork-destination-reservation",
    expectedEpoch: 1,
    expectedLocatorDigest: readLocator(destinationSelected).value.record_digest,
    collisionRecordDigest: destinationCollision.collision_record_digest,
    newControlRoot: path.join(destinationBarrier.root, "fork-destination-authority"),
    newAuthorityId: "fork-destination-authority",
    newAttachmentId: "fork-destination-attachment",
    newClaimToken: "fork-destination-secret",
    userProvenance: { granted_by: "user", reason: "reserve destination before source intent" },
  };
  const pollutedInput = {
    ...destinationInput,
    commandId: "fork-polluted-destination",
    newControlRoot: path.join(destinationBarrier.root, "fork-polluted-authority"),
    newAuthorityId: "fork-polluted-authority",
    newAttachmentId: "fork-polluted-attachment",
    newClaimToken: "fork-polluted-secret",
  };
  ensureAuthority(pollutedInput.newControlRoot, { authorityId: pollutedInput.newAuthorityId });
  appendAuthority(pollutedInput.newControlRoot, { commandId: "preexisting-destination-write", kind: "probe_appended", payload: {} });
  const pollutedSourceBefore = readAuthority(destinationBarrier.controlRoot, { allowTorn: false }).records.length;
  assert.throws(() => forkIdentity(pollutedInput), /not a fresh fork staging shard/);
  assert.equal(readAuthority(destinationBarrier.controlRoot, { allowTorn: false }).records.length, pollutedSourceBefore, "preoccupied destination refusal must precede source intent");
  assert.throws(() => forkIdentity(destinationInput, { crashAt: "after-fork-destination-intent" }), /injected crash/);
  assert.equal(readAuthority(destinationBarrier.controlRoot, { allowTorn: false }).records.some((record) => record.command_id === `${destinationInput.commandId}:intent`), false, "destination interruption must precede the source intent");
  assert.throws(() => appendAuthority(destinationInput.newControlRoot, { commandId: "destination-interference", kind: "probe_appended", payload: {} }), /incomplete authority transaction/);
  const orphanInput = {
    ...destinationInput,
    commandId: "fork-orphan-destination",
    newControlRoot: path.join(destinationBarrier.root, "fork-orphan-authority"),
    newAuthorityId: "fork-orphan-authority",
    newAttachmentId: "fork-orphan-attachment",
    newClaimToken: "fork-orphan-secret",
  };
  assert.throws(() => forkIdentity(orphanInput, { crashAt: "after-fork-destination-intent" }), /injected crash/);
  const orphanRecords = readAuthority(orphanInput.newControlRoot, { allowTorn: false }).records;
  const orphanGenesis = orphanRecords[0];
  const orphanDestination = orphanRecords.find((record) => record.kind === "attachment_fork_destination_intent");
  const abandonOrphan = { controlRoot: orphanInput.newControlRoot, authorityId: orphanInput.newAuthorityId, commandId: "abandon-orphan-destination", expectedGenesisDigest: orphanGenesis.record_digest, expectedForkDestinationDigest: orphanDestination.record_digest, userProvenance: { granted_by: "user", reason: "cancel destination before source intent" } };
  assert.throws(() => abandonStagedAuthority({ ...abandonOrphan, expectedForkDestinationDigest: digest("wrong") }), /reservation changed/);
  assert.equal(abandonStagedAuthority(abandonOrphan).abandoned, true);
  assert.equal(abandonStagedAuthority(abandonOrphan).replayed, true);
  assert.throws(() => ensureAuthority(orphanInput.newControlRoot, { authorityId: orphanInput.newAuthorityId }), /terminally abandoned/);
  assert.equal(forkIdentity(destinationInput).replayed, false);

  const compensating = authorityFixture(t, "fork-compensating-abort");
  publishAttachment(compensating);
  const compensatingSelected = path.join(compensating.root, "fork-compensating-selected");
  fs.cpSync(compensating.attachmentRoot, compensatingSelected, { recursive: true });
  const compensatingCollision = routeAttachment(routingInput(compensating, { attachmentRoots: [compensating.attachmentRoot, compensatingSelected] }));
  const compensatingInput = {
    ...compensating,
    attachmentRoot: compensatingSelected,
    publicationCommandId: compensating.commandId,
    commandId: "fork-compensating",
    expectedEpoch: 1,
    expectedLocatorDigest: readLocator(compensatingSelected).value.record_digest,
    collisionRecordDigest: compensatingCollision.collision_record_digest,
    newControlRoot: path.join(compensating.root, "fork-compensating-authority"),
    newAuthorityId: "fork-compensating-authority",
    newAttachmentId: "fork-compensating-attachment",
    newClaimToken: "fork-compensating-secret",
    userProvenance: { granted_by: "user", reason: "prove destination abandonment compensates the source intent" },
  };
  assert.throws(() => forkIdentity(compensatingInput, { crashAt: "after-fork-intent" }), /injected crash/);
  assert.equal(readAuthority(compensatingInput.newControlRoot, { allowTorn: false }).records.some((record) => record.kind === "attachment_fork_source_ready"), false);
  assert.throws(() => reattachAttachment({ ...compensating, attachmentRoot: compensatingSelected, publicationCommandId: compensating.commandId, commandId: "reattach-before-fork-ready", expectedEpoch: 1, expectedLocatorDigest: compensatingInput.expectedLocatorDigest, newClaimToken: "blocked-before-ready", userProvenance: { granted_by: "user", reason: "source intent must serialize reattach before source-ready" } }), /earlier identity fork.*completed first/);
  const compensatingDestinationRecords = readAuthority(compensatingInput.newControlRoot, { allowTorn: false }).records;
  const compensatingAbandonment = { controlRoot: compensatingInput.newControlRoot, authorityId: compensatingInput.newAuthorityId, commandId: "abandon-before-source-ready", expectedGenesisDigest: compensatingDestinationRecords[0].record_digest, expectedForkDestinationDigest: compensatingDestinationRecords.find((record) => record.kind === "attachment_fork_destination_intent").record_digest, userProvenance: { granted_by: "user", reason: "cancel destination before source-ready" } };
  const partialAbandonment = await worker("abandon-staged", { ...compensatingAbandonment, crashAt: "during-abandon-append", staleMs: 10 });
  assert.equal(partialAbandonment.code, 73, partialAbandonment.stderr);
  assert.equal(recoverAuthorityTail(compensatingInput.newControlRoot, compensatingInput.newAuthorityId, "recover-partial-fork-abandonment").repaired, true);
  assert.equal(abandonStagedAuthority(compensatingAbandonment).abandoned, true);
  const partialAbortResolution = await worker("fork-identity", { ...compensatingInput, crashAt: "during-fork-abort-resolution", staleMs: 10, timeoutMs: 10_000 });
  assert.equal(partialAbortResolution.code, 73, partialAbortResolution.stderr);
  assert.equal(recoverAuthorityTail(compensating.controlRoot, compensating.authorityId, "recover-partial-fork-abort-resolution").repaired, true);
  assert.throws(() => forkIdentity(compensatingInput), /destination was abandoned before source-ready/);
  assert.equal(readAuthority(compensating.controlRoot, { allowTorn: false }).records.find((record) => record.command_id === compensatingInput.commandId + ":resolved")?.kind, "attachment_fork_aborted");
  assert.equal(reattachAttachment({ ...compensating, attachmentRoot: compensatingSelected, publicationCommandId: compensating.commandId, commandId: "reattach-after-fork-abort", expectedEpoch: 1, expectedLocatorDigest: compensatingInput.expectedLocatorDigest, newClaimToken: "reattach-after-abort", userProvenance: { granted_by: "user", reason: "source becomes usable after compensated fork abort" } }).epoch, 2);

  const oversized = authorityFixture(t, "fork-oversized-destination");
  publishAttachment(oversized);
  const oversizedSelected = path.join(oversized.root, "fork-oversized-selected");
  fs.cpSync(oversized.attachmentRoot, oversizedSelected, { recursive: true });
  const oversizedCollision = routeAttachment(routingInput(oversized, { attachmentRoots: [oversized.attachmentRoot, oversizedSelected] }));
  const oversizedInput = {
    ...oversized,
    attachmentRoot: oversizedSelected,
    publicationCommandId: oversized.commandId,
    commandId: "fork-oversized-reservation",
    expectedEpoch: 1,
    expectedLocatorDigest: readLocator(oversizedSelected).value.record_digest,
    collisionRecordDigest: oversizedCollision.collision_record_digest,
    newControlRoot: path.join(oversized.root, "fork-oversized-authority"),
    newAuthorityId: "fork-oversized-authority",
    newAttachmentId: "fork-oversized-attachment",
    newClaimToken: "fork-oversized-secret",
    userProvenance: { granted_by: "user", reason: "x".repeat(64_500) },
  };
  const oversizedSourceBefore = readAuthority(oversized.controlRoot, { allowTorn: false }).records.length;
  assert.throws(() => forkIdentity(oversizedInput), /exceeds bounded record size/);
  assert.equal(readAuthority(oversized.controlRoot, { allowTorn: false }).records.length, oversizedSourceBefore, "destination capacity refusal must leave the source authority unchanged");
  assert.equal(readAuthority(oversizedInput.newControlRoot, { allowTorn: false }).records.length, 0, "destination capacity refusal must precede destination genesis");

  const sourceCapacity = authorityFixture(t, "fork-source-capacity");
  publishAttachment(sourceCapacity);
  const sourceCapacitySelected = path.join(sourceCapacity.root, "fork-source-capacity-selected");
  fs.cpSync(sourceCapacity.attachmentRoot, sourceCapacitySelected, { recursive: true });
  const sourceCapacityCollision = routeAttachment(routingInput(sourceCapacity, { attachmentRoots: [sourceCapacity.attachmentRoot, sourceCapacitySelected] }));
  const sourceCapacityInput = {
    ...sourceCapacity,
    attachmentRoot: sourceCapacitySelected,
    publicationCommandId: sourceCapacity.commandId,
    commandId: "fork-source-capacity",
    expectedEpoch: 1,
    expectedLocatorDigest: readLocator(sourceCapacitySelected).value.record_digest,
    collisionRecordDigest: sourceCapacityCollision.collision_record_digest,
    newControlRoot: path.join(sourceCapacity.root, "fork-source-capacity-authority"),
    newAuthorityId: "fork-source-capacity-authority",
    newAttachmentId: "fork-source-capacity-attachment",
    newClaimToken: "fork-source-capacity-secret",
    userProvenance: { granted_by: "user", reason: "source capacity must be reserved before destination source-ready" },
  };
  fillAuthorityToNormalHeadroom(sourceCapacity.controlRoot, 0);
  const sourceCapacityBefore = readAuthority(sourceCapacity.controlRoot, { allowTorn: false }).records.length;
  assert.throws(() => forkIdentity(sourceCapacityInput), /recovery reserve/);
  assert.equal(readAuthority(sourceCapacity.controlRoot, { allowTorn: false }).records.length, sourceCapacityBefore, "source capacity refusal must precede source intent");
  assert.equal(readAuthority(sourceCapacityInput.newControlRoot, { allowTorn: false }).records.length, 0, "source capacity preflight must precede destination reservation");

  const unavailable = authorityFixture(t, "fork-unavailable-source");
  publishAttachment(unavailable);
  const unavailableSelected = path.join(unavailable.root, "fork-unavailable-selected");
  fs.cpSync(unavailable.attachmentRoot, unavailableSelected, { recursive: true });
  const unavailableInput = {
    ...unavailable,
    attachmentRoot: unavailableSelected,
    publicationCommandId: unavailable.commandId,
    commandId: "fork-unavailable",
    expectedEpoch: 1,
    expectedLocatorDigest: readLocator(unavailableSelected).value.record_digest,
    collisionRecordDigest: null,
    newControlRoot: path.join(unavailable.root, "fork-unavailable-new-authority"),
    newAuthorityId: "fork-unavailable-new-authority",
    newAttachmentId: "fork-unavailable-new-attachment",
    newClaimToken: "fork-unavailable-new-secret",
    userProvenance: { granted_by: "user", reason: "the selected copy starts a new identity" },
  };
  assert.throws(() => forkIdentity(unavailableInput), /old claim anchor unavailable/);
  fs.rmSync(unavailable.attachmentRoot, { recursive: true, force: true });
  assert.equal(forkIdentity(unavailableInput).replayed, false);
  assert.equal(routeAttachment({ controlRoot: unavailableInput.newControlRoot, attachmentRoots: [unavailableSelected], authorityId: unavailableInput.newAuthorityId, attachmentId: unavailableInput.newAttachmentId, claimToken: unavailableInput.newClaimToken, commandId: unavailableInput.commandId + ":new" }).state, "claimed");
});
test("[MAR-ADAPTER] attended reattach increments epoch, recovers locator tears, rejects stale inputs, and invalidates old copies", async (t) => {
  const fx = authorityFixture(t, "attended-reattach");
  publishAttachment(fx);
  const oldLocator = fs.readFileSync(locatorPath(fx.attachmentRoot));
  const oldDigest = readLocator(fx.attachmentRoot).value.record_digest;
  const selected = path.join(fx.root, "selected-copy");
  fs.cpSync(fx.attachmentRoot, selected, { recursive: true });
  fs.rmSync(fx.attachmentRoot, { recursive: true, force: true });
  assert.equal(routeAttachment(routingInput(fx, { attachmentRoots: [selected] })).state, "reattach_required");
  const input = {
    ...fx,
    attachmentRoot: selected,
    publicationCommandId: fx.commandId,
    commandId: "reattach-attended",
    expectedEpoch: 1,
    expectedLocatorDigest: oldDigest,
    newClaimToken: "reattached-secret",
    userProvenance: { granted_by: "user", reason: "selected copy is the intended move" },
  };
  assert.throws(() => reattachAttachment({ ...input, expectedEpoch: 2 }), /optimistic claim changed/);
  assert.throws(() => reattachAttachment({ ...input, userProvenance: { granted_by: "agent", reason: "self signed" } }), /exact user provenance/);
  const torn = await worker("reattach", { ...input, crashAt: "during-reattach-locator", staleMs: 10 });
  assert.equal(torn.code, 73, torn.stderr);
  assert.equal(routeAttachment(routingInput(fx, { attachmentRoots: [selected] })).state, "pending");
  const resumed = reattachAttachment(input, { staleMs: 10 });
  assert.equal(resumed.epoch, 2);
  assert.equal(resumed.replayed, false);
  assert.equal(routeAttachment(routingInput({ ...fx, attachmentRoot: selected, claimToken: input.newClaimToken }, { attachmentRoots: [selected] })).state, "claimed");

  fs.mkdirSync(fx.attachmentRoot);
  fs.writeFileSync(locatorPath(fx.attachmentRoot), oldLocator);
  assert.equal(routeAttachment(routingInput({ ...fx, attachmentRoot: selected, claimToken: input.newClaimToken }, { attachmentRoots: [selected, fx.attachmentRoot] })).state, "claimed", "old epoch copy must be stale after reattach");
  assert.equal(routeAttachment(routingInput(fx, { attachmentRoots: [fx.attachmentRoot] })).state, "uncertain", "old token cannot authenticate the new epoch");


  const collisionFx = authorityFixture(t, "reattach-collision");
  publishAttachment(collisionFx);
  const collisionDigest = readLocator(collisionFx.attachmentRoot).value.record_digest;
  const healthyInput = { ...collisionFx, publicationCommandId: collisionFx.commandId, commandId: "reattach-healthy", expectedEpoch: 1, expectedLocatorDigest: collisionDigest, newClaimToken: "healthy-new", userProvenance: { granted_by: "user", reason: "should not be needed" } };
  assert.throws(() => reattachAttachment(healthyInput), /same stable anchor remains directly routable/);
  const collisionCopy = path.join(collisionFx.root, "reattach-collision-copy");
  fs.cpSync(collisionFx.attachmentRoot, collisionCopy, { recursive: true });
  assert.equal(routeAttachment(routingInput(collisionFx, { attachmentRoots: [collisionFx.attachmentRoot, collisionCopy] })).state, "collision");
  const collisionInput = { ...healthyInput, attachmentRoot: collisionCopy, commandId: "reattach-collision-selected", newClaimToken: "collision-selected-new", userProvenance: { granted_by: "user", reason: "select one collided anchor" } };
  assert.equal(reattachAttachment(collisionInput).epoch, 2);
  assert.equal(routeAttachment(routingInput({ ...collisionFx, attachmentRoot: collisionCopy, claimToken: collisionInput.newClaimToken }, { attachmentRoots: [collisionFx.attachmentRoot, collisionCopy] })).state, "claimed");
  const outputLoss = authorityFixture(t, "reattach-output-loss");
  publishAttachment(outputLoss);
  const outputLossDigest = readLocator(outputLoss.attachmentRoot).value.record_digest;
  const outputLossSelected = path.join(outputLoss.root, "output-loss-selected");
  fs.cpSync(outputLoss.attachmentRoot, outputLossSelected, { recursive: true });
  fs.rmSync(outputLoss.attachmentRoot, { recursive: true, force: true });
  const outputInput = { ...outputLoss, attachmentRoot: outputLossSelected, publicationCommandId: outputLoss.commandId, commandId: "reattach-output-loss", expectedEpoch: 1, expectedLocatorDigest: outputLossDigest, newClaimToken: "output-loss-new", userProvenance: { granted_by: "user", reason: "reattach output loss" } };
  assert.throws(() => reattachAttachment(outputInput, { crashAt: "before-reattach-output" }), /injected crash/);
  assert.equal(reattachAttachment(outputInput).replayed, true);
});
test("[MAR-ADAPTER] capability matrix proves real cross-volume movement", { skip: !CAPABILITY_MATRIX }, async (t) => {
  const fx = authorityFixture(t, "cross-volume");
  publishAttachment(fx);
  const otherVolume = await prepareCrossVolume(t, fx.root);
  const crossVolume = path.join(otherVolume, "attachment-cross-volume");
  fs.cpSync(fx.attachmentRoot, crossVolume, { recursive: true });
  assert.notEqual(stableDirectoryAnchor(fx.attachmentRoot).device, stableDirectoryAnchor(crossVolume).device);
  fs.rmSync(fx.attachmentRoot, { recursive: true, force: true });
  assert.equal(routeAttachment(routingInput(fx, { attachmentRoots: [crossVolume] })).state, "reattach_required");
});

test("[MAR-ADAPTER] provider routing covers Git contents, detached roots, transitions, and the complete control plane", (t) => {
  const root = temporaryRoot(t, "workloop-provider-routing-");
  const homeRoot = path.join(root, "home");
  const repo = path.join(root, "repo");
  runGit(root, ["init", "--quiet", repo]);
  runGit(repo, ["config", "user.name", "Workloop Spike"]);
  runGit(repo, ["config", "user.email", "workloop@example.invalid"]);
  fs.writeFileSync(path.join(repo, ".gitignore"), "ignored/\n");
  fs.writeFileSync(path.join(repo, "tracked"), "tracked\n");
  runGit(repo, ["add", ".gitignore", "tracked"]);
  runGit(repo, ["commit", "--quiet", "-m", "seed"]);
  fs.mkdirSync(path.join(repo, "ignored"));
  fs.mkdirSync(path.join(repo, "untracked"));
  const linked = path.join(root, "provider-linked");
  runGit(repo, ["worktree", "add", "--quiet", "-b", "provider-linked", linked]);
  const gitTargets = [path.join(repo, "tracked"), path.join(repo, "ignored", "future"), path.join(repo, "untracked", "future")];
  const providers = gitTargets.map((target) => resolveTargetProvider({ target, homeRoot }));
  assert.deepEqual(providers.map((item) => item.provider), ["git_common", "git_common", "git_common"]);
  assert.equal(new Set(providers.map((item) => item.authority_root)).size, 1);
  assert.equal(resolveTargetProvider({ target: repo, homeRoot }).provider, "git_common");

  const commonDir = runGit(linked, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const gitDir = runGit(linked, ["rev-parse", "--path-format=absolute", "--git-dir"]);
  const fsRoot = path.join(root, "filesystem-root");
  const nested = path.join(fsRoot, "nested");
  const detached = path.join(homeRoot, ".workloop", "authorities", "fs-authority");
  for (const directory of [fsRoot, nested, detached, path.join(homeRoot, ".workloop", "outcomes"), path.join(homeRoot, ".workloop", "archive"), path.join(homeRoot, ".workloop", "locks")]) fs.mkdirSync(directory, { recursive: true });
  const fsProvider = resolveTargetProvider({ target: path.join(fsRoot, "ordinary.txt"), homeRoot, filesystemAttachments: [{ root: fsRoot, controlRoot: detached }] });
  assert.equal(fsProvider.provider, "filesystem_detached");
  assert.equal(resolveTargetProvider({ target: fsRoot, homeRoot, filesystemAttachments: [{ root: fsRoot, controlRoot: detached }] }).provider, "filesystem_detached");
  assert.equal(resolveTargetProvider({ target: path.join(nested, "file"), homeRoot, filesystemAttachments: [{ root: fsRoot, controlRoot: detached }, { root: nested, controlRoot: path.join(detached, "nested") }] }).state, "uncertain");

  const controls = protectedControlRoots({ gitCommonDir: commonDir, gitDir, worktreeRoot: linked, attachmentRoot: fsRoot, homeRoot });
  const controlTargets = [
    path.join(commonDir, "config"),
    path.join(commonDir, "workloop", "authority.jsonl"),
    path.join(gitDir, "index"),
    path.join(linked, ".git"),
    path.join(linked, ".workloop", "task.json"),
    path.join(fsRoot, ".workloop", "locator.json"),
    path.join(homeRoot, ".workloop"),
    path.join(homeRoot, ".workloop", "authorities", "fs-authority", "authority.jsonl"),
    path.join(homeRoot, ".workloop", "outcomes", "events.jsonl"),
    path.join(homeRoot, ".workloop", "archive", "legacy"),
    path.join(homeRoot, ".workloop", "locks", "global.lock"),
  ];
  assert.deepEqual(classifyControlTargets(controlTargets, controls).map((item) => item.classification), Array(controlTargets.length).fill("control"));
  assert.equal(resolveTargetProvider({ target: path.join(commonDir, "config"), homeRoot }).state, "control");
  assert.equal(resolveTargetProvider({ target: path.join(linked, ".git"), homeRoot }).state, "control");
  assert.equal(resolveTargetProvider({ target: path.join(linked, ".workloop", "task.json"), homeRoot }).state, "control");
  const ordinaryNestedRoot = path.join(repo, "ordinary-nested");
  fs.mkdirSync(path.join(ordinaryNestedRoot, ".workloop"), { recursive: true });
  assert.equal(
    resolveTargetProvider({ target: path.join(ordinaryNestedRoot, ".workloop", "ordinary.txt"), homeRoot }).provider,
    "git_common",
    "a nested ordinary .workloop name is not a worktree-root control directory",
  );
  const worktreeAlias = path.join(root, "worktree-root-alias");
  if (process.platform === "win32") fs.symlinkSync(linked, worktreeAlias, "junction");
  else fs.symlinkSync(linked, worktreeAlias, "dir");
  assert.equal(
    resolveTargetProvider({ target: path.join(worktreeAlias, ".workloop", "task.json"), homeRoot }).state,
    "control",
    "a physical worktree-root alias preserves control classification",
  );
  assert.equal(resolveTargetProvider({ target: path.join(homeRoot, ".workloop", "archive", "legacy"), homeRoot, filesystemAttachments: [{ root: fsRoot, controlRoot: detached }] }).state, "control");

  const alias = path.join(root, "common-alias");
  if (process.platform === "win32") fs.symlinkSync(commonDir, alias, "junction");
  else fs.symlinkSync(commonDir, alias, "dir");
  assert.equal(classifyControlTargets([path.join(alias, "config")], controls)[0].classification, "control");
  const absentCaseTarget = path.join(linked, ".WORKLOOP", "future");
  const linkedVariant = path.join(path.dirname(linked), "Provider-linked");
  let linkedCaseInsensitive = false;
  try {
    const original = fs.statSync(linked, { bigint: true });
    const variant = fs.statSync(linkedVariant, { bigint: true });
    linkedCaseInsensitive = original.dev === variant.dev && original.ino === variant.ino;
  } catch { /* case-sensitive */ }
  assert.equal(classifyControlTargets([absentCaseTarget], controls)[0].classification, linkedCaseInsensitive ? "control" : "clean");
  const lowerControl = path.join(homeRoot, ".workloop");
  const caseVariant = path.join(homeRoot, ".WORKLOOP");
  try {
    const lowerStat = fs.statSync(lowerControl, { bigint: true });
    const upperStat = fs.statSync(caseVariant, { bigint: true });
    if (lowerStat.dev === upperStat.dev && lowerStat.ino === upperStat.ino) assert.equal(classifyControlTargets([path.join(caseVariant, "archive", "legacy")], controls)[0].classification, "control");
  } catch { /* Case-sensitive volume: the differently-cased path is a different object. */ }

  runGit(nested, ["init", "--quiet"]);
  assert.equal(resolveTargetProvider({ target: path.join(nested, ".git", "config"), homeRoot, filesystemAttachments: [{ root: fsRoot, controlRoot: detached }] }).state, "control");
  runGit(fsRoot, ["init", "--quiet"]);
  assert.equal(resolveTargetProvider({ target: path.join(fsRoot, "ordinary.txt"), homeRoot, filesystemAttachments: [{ root: fsRoot, controlRoot: detached }] }).state, "transition_required");
});

test("[MAR-ADAPTER] lock hierarchy permits only Git/criterion to authority and rejects reentrancy or external work", (t) => {
  const root = temporaryRoot(t, "workloop-lock-hierarchy-");
  const first = path.join(root, "first");
  const second = path.join(root, "second");
  ensureAuthority(first, { authorityId: "first" });
  ensureAuthority(second, { authorityId: "second" });
  for (const kind of ["git_operation", "criterion_lease"]) {
    const receipt = withLockContext(kind, () => appendAuthority(first, { commandId: `allowed-${kind}`, kind: "probe_appended", payload: {} }));
    assert.equal(receipt.replayed, false);
  }
  for (const kind of ["outcome", "maintenance"]) assert.throws(() => withLockContext(kind, () => appendAuthority(first, { commandId: `forbidden-${kind}`, kind: "probe_appended", payload: {} })), /cannot nest/);
  assert.throws(() => withAuthorityLock(first, () => withAuthorityLock(first, () => {})), /cannot be nested/);
  assert.throws(() => withAuthorityLock(first, () => withAuthorityLock(second, () => {})), /cannot be nested/);
  assert.throws(() => withLockContext("git_operation", () => withLockContext("criterion_lease", () => {})), /cannot nest/);
  assert.throws(() => withAuthorityLock(first, () => resolveTargetProvider({ target: root, homeRoot: path.join(root, "home") })), /cannot run under authority lock/);
});

test("[MAR-ADAPTER] public Hook process decodes host payload and routes target through provider and claim", (t) => {
  const fx = authorityFixture(t, "public-hook");
  publishAttachment(fx);
  const homeRoot = path.join(fx.root, "home");
  fs.mkdirSync(homeRoot);
  const telemetryPath = path.join(fx.root, "public-hook-telemetry.jsonl");
  const contextFile = path.join(fx.root, "public-hook-context.json");
  fs.writeFileSync(contextFile, JSON.stringify({
    homeRoot,
    filesystemAttachments: [{ root: fx.attachmentRoot, controlRoot: fx.controlRoot }],
    claims: [fx],
    telemetryPath,
  }));
  const invoke = (filePath) => spawnSync(process.execPath, [HOOK_CLI, "--profile", "codex", "--context", contextFile], {
    encoding: "utf8",
    input: JSON.stringify({ hook_event_name: "PreToolUse", cwd: fx.attachmentRoot, tool_name: "apply_patch", tool_input: { file_path: filePath } }),
    timeout: 5_000,
  });
  const ordinary = invoke(path.join(fx.attachmentRoot, "ordinary-target.txt"));
  assert.equal(ordinary.status, 0);
  assert.equal(ordinary.stdout, "");
  assert.equal(ordinary.stderr, "");
  let telemetry = fs.readFileSync(telemetryPath, "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(telemetry.at(-1).routing_state, "claimed");

  const control = invoke(locatorPath(fx.attachmentRoot));
  assert.equal(control.status, 0);
  assert.equal(control.stdout, "");
  assert.equal(control.stderr, "");
  telemetry = fs.readFileSync(telemetryPath, "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(telemetry.at(-1).routing_state, "control");

  fs.appendFileSync(authorityPath(fx.controlRoot), "not-json\n");
  const corrupt = invoke(path.join(fx.attachmentRoot, "ordinary-target.txt"));
  assert.equal(corrupt.status, 0);
  assert.equal(corrupt.stdout, "");
  assert.equal(corrupt.stderr, "");
  telemetry = fs.readFileSync(telemetryPath, "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(telemetry.at(-1).routing_state, "uncertain");
});

test("[MAR-ADAPTER] real Hook failures stay byte-exact nonblocking and never manufacture clean evidence", async (t) => {
  const claimed = authorityFixture(t, "hook-claimed");
  publishAttachment(claimed);
  const pending = authorityFixture(t, "hook-pending");
  assert.throws(() => publishAttachment(pending, { crashAt: "after-pending" }), /injected crash/);
  const collisionFx = authorityFixture(t, "hook-collision");
  publishAttachment(collisionFx);
  const collisionRoot = path.join(collisionFx.root, "hook-copy");
  fs.mkdirSync(collisionRoot);
  fs.copyFileSync(locatorPath(collisionFx.attachmentRoot), locatorPath(collisionRoot));
  const corrupt = authorityFixture(t, "hook-corrupt");
  fs.appendFileSync(authorityPath(corrupt.controlRoot), "not-json\n");
  const corruptLocator = authorityFixture(t, "hook-corrupt-locator");
  publishAttachment(corruptLocator);
  fs.appendFileSync(locatorPath(corruptLocator.attachmentRoot), "not-json\n");
  const locked = authorityFixture(t, "hook-locked");
  publishAttachment(locked);
  const telemetryParent = path.join(claimed.root, "telemetry-parent-file");
  fs.writeFileSync(telemetryParent, "not a directory");
  const signalFile = path.join(claimed.root, "hook-lock.signal");
  const holder = startWorker("hold-lock", { controlRoot: locked.controlRoot, signalFile, holdMs: 30_000, staleMs: 5_000 });
  await waitForPath(signalFile);
  t.after(() => holder.kill("SIGKILL"));

  const recoveryBarrier = authorityFixture(t, "hook-recovery-barrier");
  publishAttachment(recoveryBarrier);
  assert.throws(() => appendAuthority(recoveryBarrier.controlRoot, { commandId: "hook-partial", kind: "probe_appended", payload: {} }, { crashAt: "during-append" }), /injected crash/);
  const recoveryBarrierState = readAuthority(recoveryBarrier.controlRoot, { allowTorn: true });
  const recoveryBarrierInput = {
    commandId: "hook-tail-recovery",
    authorityId: recoveryBarrier.authorityId,
    expectedValidEndOffset: recoveryBarrierState.validEndOffset,
    expectedTailDigest: digest(recoveryBarrierState.raw.subarray(recoveryBarrierState.validEndOffset)),
    userProvenance: { granted_by: "user", reason: "Hook recovery barrier fixture" },
  };
  assert.throws(() => recoverTornAuthority(recoveryBarrier.controlRoot, recoveryBarrierInput, { crashAt: "after-recovery-truncate" }), /injected crash/);
  const contexts = [
    { expected: "uncertain", reason: "CONTROL_CONTEXT_UNAVAILABLE", routingInput: routingInput(claimed), targets: [authorityPath(claimed.controlRoot)] },
    { expected: "uncertain", reason: "RECOVERY_REQUIRED", routingInput: routingInput(recoveryBarrier) },
    { expected: "pending", routingInput: routingInput(pending) },
    { expected: "collision", routingInput: routingInput(collisionFx, { attachmentRoots: [collisionFx.attachmentRoot, collisionRoot] }) },
    { expected: "unavailable", routingInput: routingInput(claimed, { attachmentRoots: [path.join(claimed.root, "missing")] }) },
    { expected: "uncertain", reason: "JOURNAL_CORRUPT", routingInput: routingInput(corrupt) },
    { expected: "uncertain", reason: "LOCATOR_UNREADABLE", routingInput: routingInput(corruptLocator) },
    { expected: "uncertain", reason: "AUTHORITY_LOCK_TIMEOUT", routingInput: routingInput(locked), routingOptions: { timeoutMs: 50, staleMs: 5_000 } },
    { expected: "telemetry_failure", routingInput: routingInput(claimed), telemetryPath: path.join(telemetryParent, "events.jsonl") },
    {
      expected: "control",
      routingInput: routingInput(claimed),
      targets: [authorityPath(claimed.controlRoot)],
      controlContext: { gitCommonDir: claimed.controlRoot, homeRoot: path.join(claimed.root, "home") },
    },
  ];
  for (const profile of ["claude", "codex"]) {
    for (const event of ["pre_tool_use", "post_tool_use", "post_tool_use_failure", "stop"]) {
      for (const context of contexts) {
        const result = runDefaultHook({ profile, event, ...context });
        assert.equal(result.routing_state, context.expected);
        if (context.reason) assert.equal(result.routing_reason, context.reason);
        assert.equal(result.clean_evidence, false);
        assert.deepEqual(result.wire, { stdout: "", stderr: "", exitCode: 0 });
      }
    }
  }
  holder.kill("SIGKILL");
  await waitForExit(holder);
  const clean = runDefaultHook({ profile: "codex", event: "pre_tool_use", routingInput: routingInput(claimed), routingOptions: { staleMs: 10 } });
  assert.equal(clean.routing_state, "claimed");
  assert.equal(clean.clean_evidence, true);
  assert.deepEqual(clean.wire, { stdout: "", stderr: "", exitCode: 0 });
});
