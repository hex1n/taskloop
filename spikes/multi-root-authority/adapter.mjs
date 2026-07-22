import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { decodeHook, encodeHook } from "../../lib/host-hooks.mjs";
import { canonicalJson, sha256Hex, withOwnedDirectoryLock } from "../../lib/prims.mjs";

const AUTHORITY_FILE = "authority.jsonl";
const LOCATOR_FILE = ".workloop-root.jsonl";
const AUTHORITY_MAX_BYTES = 4 * 1024 * 1024;
const AUTHORITY_MAX_RECORDS = 16_384;
const AUTHORITY_MAX_FRAME_BYTES = 64 * 1024;
const AUTHORITY_EMERGENCY_BYTES = 256 * 1024;
const AUTHORITY_EMERGENCY_RECORDS = 8;
const LOCATOR_MAX_BYTES = 64 * 1024;
const LOCATOR_MAX_RECORDS = 64;
const activeLocks = [];

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}

function exactKeys(value, fields) {
  return value && typeof value === "object" && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...fields].sort());
}

function nonemptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validDigest(value) {
  return typeof value === "string" && value.length === 71 && value.startsWith("sha256:") && !/[^0-9a-f]/.test(value.slice(7));
}

function validProvenance(value) {
  return exactKeys(value, ["granted_by", "reason"]) && value.granted_by === "user" && nonemptyString(value.reason);
}

function validEpoch(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function writeAll(fd, bytes, limit = bytes.length) {
  let offset = 0;
  while (offset < limit) {
    const written = fs.writeSync(fd, bytes, offset, limit - offset, null);
    if (!Number.isSafeInteger(written) || written <= 0) fail("SHORT_WRITE", "durable append made no progress");
    offset += written;
  }
}

function syncDirectory(directory) {
  const fd = fs.openSync(directory, "r");
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  return "supported";
}

function ensureParentDirectories(target) {
  const missing = [];
  let cursor = path.dirname(target);
  while (!fs.existsSync(cursor)) {
    missing.push(cursor);
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  return missing.reverse();
}

function syncCreatedParent(target, platform = process.platform, createdDirectories = []) {
  if (platform === "win32") return "win32-file-flush";
  const directories = new Set([path.dirname(target)]);
  for (const directory of createdDirectories) { directories.add(directory); directories.add(path.dirname(directory)); }
  for (const directory of directories) {
    const capability = syncDirectory(directory);
    if (capability !== "supported") fail("DIRECTORY_FSYNC_UNAVAILABLE", "directory fsync unavailable: " + capability);
  }
  return "posix-file-and-directory-fsync";
}

function appendFrame(target, frame, { crashAt = null, onCrash = null, platform = process.platform, exclusiveCreate = false } = {}) {
  const bytes = Buffer.isBuffer(frame) ? frame : Buffer.from(frame);
  if (!bytes.length || bytes.at(-1) !== 0x0a) fail("INVALID_FRAME", "journal frames must end with newline");
  const createdDirectories = ensureParentDirectories(target);
  const created = exclusiveCreate || !fs.existsSync(target);
  const fd = fs.openSync(target, exclusiveCreate ? "ax" : "a", 0o600);
  try {
    if (crashAt === "during-append") {
      writeAll(fd, bytes, Math.max(1, Math.floor(bytes.length / 2)));
      onCrash?.(crashAt);
      fail("INJECTED_CRASH", "injected crash during append");
    }
    writeAll(fd, bytes);
    if (crashAt === "before-fsync") {
      onCrash?.(crashAt);
      fail("INJECTED_CRASH", "injected crash before fsync");
    }
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  const durability = created ? syncCreatedParent(target, platform, createdDirectories) : (platform === "win32" ? "win32-file-flush" : "posix-file-fsync");
  if (crashAt === "after-fsync") {
    onCrash?.(crashAt);
    fail("INJECTED_CRASH", "injected crash after fsync");
  }
  return durability;
}

function appendLocatorFrame(target, frame, options = {}) {
  const bytes = Buffer.isBuffer(frame) ? frame : Buffer.from(frame);
  if (bytes.length > LOCATOR_MAX_BYTES) fail("JOURNAL_LIMIT_EXCEEDED", "locator frame exceeds bounded replay bytes");
  if (!options.exclusiveCreate) {
    const state = readFramedJson(target, { maxBytes: LOCATOR_MAX_BYTES, maxRecords: LOCATOR_MAX_RECORDS });
    if (state.torn) fail("LOCATOR_TORN", "locator has a torn tail");
    if (state.records.length + 1 > LOCATOR_MAX_RECORDS || state.raw.length + bytes.length > LOCATOR_MAX_BYTES) fail("JOURNAL_LIMIT_EXCEEDED", "locator append would exceed bounded replay limits");
  }
  return appendFrame(target, bytes, options);
}

function assertLocatorAppendCapacity(state, record) {
  if (state.records?.at(-1)?.record_digest === record.record_digest) return;
  const frame = recordFrame(record);
  if (state.records.length + 1 > LOCATOR_MAX_RECORDS || state.validEndOffset + frame.length > LOCATOR_MAX_BYTES) fail("JOURNAL_LIMIT_EXCEEDED", "locator lacks reserved capacity for the next durable frame");
}

function syncFile(target) {
  const fd = fs.openSync(target, "r+");
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function truncateDurably(target, length, platform = process.platform) {
  const fd = fs.openSync(target, "r+");
  try {
    fs.ftruncateSync(fd, length);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (platform !== "win32") syncCreatedParent(target, platform);
}

function authorityPath(controlRoot) {
  return path.join(controlRoot, AUTHORITY_FILE);
}

function authorityLockPath(controlRoot) {
  return path.join(controlRoot, "locks", "authority.lock");
}

function lockOptions(options = {}) {
  return {
    timeoutMs: options.timeoutMs ?? 2_000,
    staleMs: options.staleMs ?? 200,
    timeoutError: (timeoutMs) => Object.assign(new Error(`authority lock unavailable after ${timeoutMs}ms`), { code: "AUTHORITY_LOCK_TIMEOUT" }),
  };
}

function withLockContext(kind, action) {
  const allowed = new Set(["git_operation", "criterion_lease", "outcome", "maintenance"]);
  if (!allowed.has(kind)) fail("UNKNOWN_LOCK_CONTEXT", `unknown lock context: ${kind}`);
  if (activeLocks.length) fail("LOCK_ORDER_VIOLATION", `${kind} cannot nest under ${activeLocks.at(-1)}`);
  activeLocks.push(kind);
  try { return action(); } finally { activeLocks.pop(); }
}

function withAuthorityLock(controlRoot, action, options = {}) {
  const parent = activeLocks.at(-1) ?? null;
  if (parent === "authority") fail("AUTHORITY_LOCK_NON_REENTRANT", "authority locks cannot be nested");
  if (parent && !["git_operation", "criterion_lease"].includes(parent)) fail("LOCK_ORDER_VIOLATION", `authority cannot nest under ${parent}`);
  const lock = authorityLockPath(controlRoot);
  const initializingAuthority = !fs.existsSync(authorityPath(controlRoot));
  const createdDirectories = ensureParentDirectories(lock);
  if (initializingAuthority && process.platform !== "win32") {
    syncCreatedParent(lock, process.platform, createdDirectories);
    syncDirectory(controlRoot);
    syncDirectory(path.dirname(controlRoot));
  }
  return withOwnedDirectoryLock(lock, () => {
    activeLocks.push("authority");
    try { return action(); } finally { activeLocks.pop(); }
  }, lockOptions(options));
}

function assertOutsideAuthority(operation) {
  if (activeLocks.includes("authority")) fail("LOCK_ORDER_VIOLATION", `${operation} cannot run under authority lock`);
}

function recordPreimage({ sequence, previousDigest, commandId, kind, payload }) {
  return { sequence, previous_digest: previousDigest, command_id: commandId, kind, payload };
}

function makeRecord({ sequence, previousDigest, commandId, kind, payload }) {
  const preimage = recordPreimage({ sequence, previousDigest, commandId, kind, payload });
  return { ...preimage, record_digest: sha256Hex(canonicalJson(preimage)) };
}

function validateRecords(records) {
  let previousDigest = null;
  const commands = new Set();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const fields = ["command_id", "kind", "payload", "previous_digest", "record_digest", "sequence"];
    if (!exactKeys(record, fields)) fail("AUTHORITY_CORRUPT", `invalid record shape at ${index + 1}`);
    if (record.sequence !== index + 1 || record.previous_digest !== previousDigest) fail("AUTHORITY_CORRUPT", `invalid chain at ${index + 1}`);
    const expected = sha256Hex(canonicalJson(recordPreimage({ sequence: record.sequence, previousDigest: record.previous_digest, commandId: record.command_id, kind: record.kind, payload: record.payload })));
    if (record.record_digest !== expected) fail("AUTHORITY_CORRUPT", `invalid digest at ${index + 1}`);
    if (commands.has(record.command_id)) fail("AUTHORITY_CORRUPT", `duplicate command id: ${record.command_id}`);
    if (index === 0 && record.kind !== "authority_genesis") fail("AUTHORITY_CORRUPT", "first record must be authority genesis");
    if (index > 0 && record.kind === "authority_genesis") fail("AUTHORITY_CORRUPT", "authority may contain only one genesis");
    commands.add(record.command_id);
    previousDigest = record.record_digest;
  }
  return records;
}

function readFramedJson(target, { missing = [], maxBytes = AUTHORITY_MAX_BYTES, maxRecords = AUTHORITY_MAX_RECORDS } = {}) {
  let raw;
  try {
    const stat = fs.statSync(target);
    if (stat.size > maxBytes) fail("JOURNAL_LIMIT_EXCEEDED", "journal exceeds bounded replay bytes");
    raw = fs.readFileSync(target);
    if (raw.length > maxBytes) fail("JOURNAL_LIMIT_EXCEEDED", "journal grew beyond bounded replay bytes");
  }
  catch (error) {
    if (error?.code === "ENOENT") return { records: missing, raw: Buffer.alloc(0), torn: false, validEndOffset: 0 };
    throw error;
  }
  const lastNewline = raw.lastIndexOf(0x0a);
  const validEndOffset = lastNewline < 0 ? 0 : lastNewline + 1;
  const torn = validEndOffset !== raw.length;
  const lines = raw.subarray(0, validEndOffset).toString("utf8").split("\n").filter(Boolean);
  let records;
  if (lines.length > maxRecords) fail("JOURNAL_LIMIT_EXCEEDED", "journal exceeds bounded replay records");
  try { records = lines.map((line) => JSON.parse(line)); }
  catch { fail("JOURNAL_CORRUPT", "journal contains invalid complete JSON"); }
  return { records, raw, torn, validEndOffset };
}

function readAuthority(controlRoot, { allowTorn = true } = {}) {
  const state = readFramedJson(authorityPath(controlRoot));
  if (state.torn && !allowTorn) fail("AUTHORITY_TORN", "authority has a torn tail");
  try { validateRecords(state.records); }
  catch (error) {
    if (error.code === "AUTHORITY_CORRUPT") throw error;
    fail("AUTHORITY_CORRUPT", error.message);
  }
  return state;
}

function findCommand(records, commandId) {
  return records.find((record) => record.command_id === commandId) ?? null;
}

function incompleteAuthorityTransactions(records) {
  const pending = [];
  for (const record of records) {
    let owner = null;
    let completion = null;
    if (record.kind === "attachment_stage_intent" || record.kind === "attachment_recovery_intent") { owner = record.command_id.slice(0, -":intent".length); completion = owner; }
    else if (["attachment_claim_pending", "attachment_reattach_pending", "staged_locator_cleanup_pending"].includes(record.kind)) { owner = record.command_id.slice(0, -":pending".length); completion = owner + ":final"; }
    else if (record.kind === "attachment_fork_intent") { owner = record.command_id.slice(0, -":intent".length); completion = owner + ":resolved"; }
    else if (record.kind === "attachment_fork_destination_intent") { owner = record.command_id.slice(0, -":intent".length); completion = owner + ":final"; }
    if (owner && !findCommand(records, completion)) pending.push({ kind: record.kind, owner });
  }
  return pending;
}

function assertNoIncompleteAuthorityTransaction(records, allowedOwners = []) {
  const allowed = new Set(allowedOwners.filter(nonemptyString));
  const pending = incompleteAuthorityTransactions(records).find((entry) => !allowed.has(entry.owner));
  if (pending) fail("RECOVERY_REQUIRED", `incomplete authority transaction must finish first: ${pending.kind}`);
}

function receiptFor(record, replayed) {
  return { command_id: record.command_id, record_digest: record.record_digest, sequence: record.sequence, replayed };
}

function assertAuthoritySequenceCapacity(controlRoot, records, steps, { allowEmergency = false } = {}) {
  const projected = [...records];
  let projectedBytes = 0;
  try { projectedBytes = fs.statSync(authorityPath(controlRoot)).size; }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  for (const step of steps) {
    const spec = typeof step === "function" ? step(projected) : step;
    const prior = findCommand(projected, spec.commandId);
    if (prior) {
      if (prior.kind !== spec.kind || canonicalJson(prior.payload) !== canonicalJson(spec.payload)) fail("COMMAND_CONFLICT", "reserved transaction step conflicts with authority history");
      continue;
    }
    const record = makeRecord({ sequence: projected.length + 1, previousDigest: projected.at(-1)?.record_digest ?? null, commandId: spec.commandId, kind: spec.kind, payload: spec.payload });
    const frame = recordFrame(record);
    if (frame.length > AUTHORITY_MAX_FRAME_BYTES) fail("JOURNAL_LIMIT_EXCEEDED", "authority frame exceeds bounded record size");
    projected.push(record);
    projectedBytes += frame.length;
  }
  const byteLimit = AUTHORITY_MAX_BYTES - (allowEmergency ? 0 : AUTHORITY_EMERGENCY_BYTES);
  const recordLimit = AUTHORITY_MAX_RECORDS - (allowEmergency ? 0 : AUTHORITY_EMERGENCY_RECORDS);
  if (projected.length > recordLimit || projectedBytes > byteLimit) fail("JOURNAL_LIMIT_EXCEEDED", allowEmergency ? "transaction exceeds bounded authority replay limits" : "transaction would consume the authority recovery reserve");
  return projected;
}

function appendRecordUnlocked(controlRoot, records, { commandId, kind, payload, crashAt = null, onCrash = null, allowEmergency = false }) {
  const prior = findCommand(records, commandId);
  if (prior) {
    if (prior.kind !== kind || canonicalJson(prior.payload) !== canonicalJson(payload)) fail("COMMAND_CONFLICT", "command id reused with different input: " + commandId);
    syncFile(authorityPath(controlRoot));
    return { record: prior, replayed: true };
  }
  const record = makeRecord({ sequence: records.length + 1, previousDigest: records.at(-1)?.record_digest ?? null, commandId, kind, payload });
  const frame = Buffer.from(canonicalJson(record) + "\n");
  let currentBytes = 0;
  try { currentBytes = fs.statSync(authorityPath(controlRoot)).size; }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  if (frame.length > AUTHORITY_MAX_FRAME_BYTES) fail("JOURNAL_LIMIT_EXCEEDED", "authority frame exceeds bounded record size");
  const byteLimit = AUTHORITY_MAX_BYTES - (allowEmergency ? 0 : AUTHORITY_EMERGENCY_BYTES);
  const recordLimit = AUTHORITY_MAX_RECORDS - (allowEmergency ? 0 : AUTHORITY_EMERGENCY_RECORDS);
  if (records.length + 1 > recordLimit || currentBytes + frame.length > byteLimit) fail("JOURNAL_LIMIT_EXCEEDED", allowEmergency ? "append would exceed bounded authority replay limits" : "append would consume the authority recovery reserve");
  appendFrame(authorityPath(controlRoot), frame, { crashAt, onCrash });
  records.push(record);
  return { record, replayed: false };
}

function appendAuthority(controlRoot, input, options = {}) {
  return withAuthorityLock(controlRoot, () => {
    const state = readAuthority(controlRoot, { allowTorn: false });
    assertNoPendingRecoveryIntent(controlRoot, state.records);
    assertAuthorityActive(state.records);
    assertNoIncompleteAuthorityTransaction(state.records);
    if (!state.records.length) fail("AUTHORITY_UNINITIALIZED", "authority genesis is required");
    const result = appendRecordUnlocked(controlRoot, state.records, { ...input, crashAt: options.crashAt, onCrash: options.onCrash });
    return receiptFor(result.record, result.replayed);
  }, options);
}

function ensureAuthority(controlRoot, { authorityId, commandId = `genesis:${authorityId}` }, options = {}) {
  return withAuthorityLock(controlRoot, () => {
    const state = readAuthority(controlRoot, { allowTorn: false });
    assertNoPendingRecoveryIntent(controlRoot, state.records);
    assertAuthorityActive(state.records);
    if (state.records.length) {
      const genesis = state.records[0];
      if (genesis.payload?.authority_id !== authorityId || genesis.command_id !== commandId) fail("AUTHORITY_ID_MISMATCH", "authority genesis does not match");
      syncFile(authorityPath(controlRoot));
      return receiptFor(genesis, true);
    }
    const result = appendRecordUnlocked(controlRoot, state.records, {
      commandId,
      kind: "authority_genesis",
      payload: { authority_id: authorityId },
      crashAt: options.crashAt,
      onCrash: options.onCrash,
    });
    return receiptFor(result.record, false);
  }, options);
}

function recoveryIntentPath(controlRoot, commandId) {
  return path.join(controlRoot, "recovery", sha256Hex(commandId).slice(7) + ".jsonl");
}

function recoveryIntent(input) {
  return {
    recovery_schema_version: 1,
    command_id: input.commandId,
    authority_id: input.authorityId,
    expected_tail_digest: input.expectedTailDigest,
    expected_valid_end_offset: input.expectedValidEndOffset,
    user_provenance: input.userProvenance,
  };
}

const RECOVERY_INTENT_FIELDS = ["recovery_schema_version", "command_id", "authority_id", "expected_tail_digest", "expected_valid_end_offset", "user_provenance"];

function validateRecoveryIntent(intent) {
  if (!exactKeys(intent, RECOVERY_INTENT_FIELDS) || intent.recovery_schema_version !== 1 || !nonemptyString(intent.command_id) || !nonemptyString(intent.authority_id) || !validDigest(intent.expected_tail_digest) || !Number.isSafeInteger(intent.expected_valid_end_offset) || intent.expected_valid_end_offset < 0 || !validProvenance(intent.user_provenance)) fail("RECOVERY_INTENT_CORRUPT", "recovery intent is corrupt");
  return intent;
}

function readRecoveryIntent(controlRoot, commandId) {
  const state = readFramedJson(recoveryIntentPath(controlRoot, commandId), { maxBytes: LOCATOR_MAX_BYTES, maxRecords: 1 });
  if (state.records.length > 1 || (state.torn && state.records.length)) fail("RECOVERY_INTENT_CORRUPT", "recovery intent has an invalid frame sequence");
  const value = state.records[0] ? validateRecoveryIntent(state.records[0]) : null;
  return { ...state, value };
}

function recoveryReceiptPayload(intent) {
  return {
    authority_id: intent.authority_id,
    discarded_sha256: intent.expected_tail_digest,
    user_provenance: intent.user_provenance,
    valid_end_offset: intent.expected_valid_end_offset,
  };
}

const RECOVERY_RECEIPT_FIELDS = ["authority_id", "discarded_sha256", "user_provenance", "valid_end_offset"];

function validateAuthorityRecoveryRecord(record, authorityId) {
  if (record?.kind !== "authority_tail_recovered" || !exactKeys(record.payload, RECOVERY_RECEIPT_FIELDS) || record.payload.authority_id !== authorityId || !validDigest(record.payload.discarded_sha256) || !validProvenance(record.payload.user_provenance) || !Number.isSafeInteger(record.payload.valid_end_offset) || record.payload.valid_end_offset < 0) fail("AUTHORITY_CORRUPT", "authority tail recovery receipt is invalid");
  return record;
}

function recoveredContinuationAfter(records, record, authorityId) {
  if (!record) return false;
  return records.some((candidate) => candidate.sequence > record.sequence && candidate.kind === "authority_tail_recovered" && validateAuthorityRecoveryRecord(candidate, authorityId));
}

function forkStagingRecordAllowed(record, allowedCommands, authorityId) {
  if (record.kind === "authority_tail_recovered") {
    validateAuthorityRecoveryRecord(record, authorityId);
    return true;
  }
  return allowedCommands.has(record.command_id);
}

function recordFrame(record) {
  return Buffer.from(canonicalJson(record) + "\n");
}

function genesisRecord(authorityId) {
  return makeRecord({ sequence: 1, previousDigest: null, commandId: "genesis:" + authorityId, kind: "authority_genesis", payload: { authority_id: authorityId } });
}

function nextRecoveryRecord(records, commandId, payload) {
  return makeRecord({ sequence: records.length + 1, previousDigest: records.at(-1)?.record_digest ?? null, commandId, kind: "authority_tail_recovered", payload });
}

function isNonemptyPrefix(candidate, expected) {
  return candidate.length > 0 && candidate.length < expected.length && expected.subarray(0, candidate.length).equals(candidate);
}

function completedRecoveryMatches(record, intent) {
  return record?.kind === "authority_tail_recovered" && canonicalJson(record.payload) === canonicalJson(recoveryReceiptPayload(intent));
}

function assertNoPendingRecoveryIntent(controlRoot, records) {
  const directory = path.join(controlRoot, "recovery");
  let names;
  try { names = fs.readdirSync(directory).filter((name) => name.endsWith(".jsonl")); }
  catch (error) { if (error?.code === "ENOENT") return; throw error; }
  let totalBytes = 0;
  for (const name of names) {
    const target = path.join(directory, name);
    const stat = fs.statSync(target);
    totalBytes += stat.size;
    if (totalBytes > AUTHORITY_MAX_BYTES) fail("JOURNAL_LIMIT_EXCEEDED", "recovery intents exceed bounded replay bytes");
    const state = readFramedJson(target, { maxBytes: LOCATOR_MAX_BYTES, maxRecords: 1 });
    if (state.torn || state.records.length !== 1) fail("RECOVERY_REQUIRED", "an incomplete authority recovery intent blocks authority use");
    const intent = validateRecoveryIntent(state.records[0]);
    if (name !== sha256Hex(intent.command_id).slice(7) + ".jsonl") fail("RECOVERY_INTENT_CORRUPT", "recovery intent filename does not match its command");
    const prior = findCommand(records, intent.command_id);
    if (!prior) fail("RECOVERY_REQUIRED", "an incomplete authority recovery intent blocks authority use");
    if (!completedRecoveryMatches(prior, intent)) fail("RECOVERY_INTENT_CORRUPT", "recovery intent conflicts with authority history");
  }
}

function assertAuthorityActive(records) {
  if (records.some((record) => record.kind === "authority_staging_abandoned")) fail("AUTHORITY_ABANDONED", "authority staging shard is terminally abandoned");
}

function removeRecoveryIntent(controlRoot, commandId) {
  const target = recoveryIntentPath(controlRoot, commandId);
  try { fs.unlinkSync(target); }
  catch (error) { if (error?.code !== "ENOENT") throw error; return; }
  if (process.platform !== "win32") syncDirectory(path.dirname(target));
}

function bootstrapBaseMatches(state, authorityId) {
  if (!state.records.length) return state.raw.length === 0;
  const expected = genesisRecord(authorityId);
  return state.records.length === 1 && canonicalJson(state.records[0]) === canonicalJson(expected) && state.raw.equals(recordFrame(expected));
}

function recoveryBaseMatches(state, authorityId, expectedValidEndOffset) {
  if (expectedValidEndOffset === 0) return bootstrapBaseMatches(state, authorityId);
  return state.raw.length === expectedValidEndOffset && state.validEndOffset === expectedValidEndOffset;
}

function tornRecoveryStepMatches(state, authorityId, commandId, expectedPayload, expectedValidEndOffset) {
  const baseMatches = expectedValidEndOffset === 0
    ? (!state.records.length && state.validEndOffset === 0) || (state.records.length === 1 && canonicalJson(state.records[0]) === canonicalJson(genesisRecord(authorityId)))
    : state.validEndOffset === expectedValidEndOffset;
  if (!baseMatches) return false;
  const expected = state.records.length ? nextRecoveryRecord(state.records, commandId, expectedPayload) : genesisRecord(authorityId);
  return isNonemptyPrefix(state.raw.subarray(state.validEndOffset), recordFrame(expected));
}

function assertTornRecoveryCapacity(state, authorityId, commandId, payload) {
  const projected = [...state.records];
  let projectedBytes = state.validEndOffset;
  if (!projected.length) {
    const genesis = genesisRecord(authorityId);
    if (recordFrame(genesis).length > AUTHORITY_MAX_FRAME_BYTES) fail("JOURNAL_LIMIT_EXCEEDED", "authority recovery genesis exceeds bounded record size");
    projected.push(genesis);
    projectedBytes += recordFrame(genesis).length;
  }
  const recovery = nextRecoveryRecord(projected, commandId, payload);
  const recoveryFrame = recordFrame(recovery);
  if (recoveryFrame.length > AUTHORITY_MAX_FRAME_BYTES) fail("JOURNAL_LIMIT_EXCEEDED", "authority recovery receipt exceeds bounded record size");
  projectedBytes += recoveryFrame.length;
  if (projected.length + 1 > AUTHORITY_MAX_RECORDS || projectedBytes > AUTHORITY_MAX_BYTES) fail("JOURNAL_LIMIT_EXCEEDED", "authority lacks reserved capacity for a complete recovery receipt");
}

function recoverTornAuthority(controlRoot, input, options = {}) {
  const { commandId, authorityId, userProvenance, expectedValidEndOffset, expectedTailDigest } = input;
  if (!nonemptyString(commandId) || !nonemptyString(authorityId) || !validProvenance(userProvenance) || !Number.isSafeInteger(expectedValidEndOffset) || expectedValidEndOffset < 0 || !validDigest(expectedTailDigest)) fail("RECOVERY_AUTHORIZATION_REQUIRED", "recovery requires authority identity, optimistic digest, and exact user provenance");
  return withAuthorityLock(controlRoot, () => {
    let state = readAuthority(controlRoot, { allowTorn: true });
    const existingGenesis = state.records[0];
    if (existingGenesis && existingGenesis.payload?.authority_id !== authorityId) fail("AUTHORITY_ID_MISMATCH", "recovery authority identity mismatch");
    const expectedIntent = recoveryIntent(input);
    const expectedPayload = recoveryReceiptPayload(expectedIntent);
    const prior = findCommand(state.records, commandId);
    if (prior) {
      if (!completedRecoveryMatches(prior, expectedIntent)) fail("COMMAND_CONFLICT", "recovery command id reused with different input");
      syncFile(authorityPath(controlRoot));
      removeRecoveryIntent(controlRoot, commandId);
      return { ...receiptFor(prior, true), repaired: true, bootstrap_initialized: expectedValidEndOffset === 0 };
    }

    assertTornRecoveryCapacity(state, authorityId, commandId, expectedPayload);
    const intentTarget = recoveryIntentPath(controlRoot, commandId);
    const expectedIntentFrame = Buffer.from(canonicalJson(expectedIntent) + "\n");
    let intentState = readRecoveryIntent(controlRoot, commandId);
    let intent = intentState.value;
    if (intentState.torn) {
      const discarded = state.raw.subarray(state.validEndOffset);
      if (!state.torn || state.validEndOffset !== expectedValidEndOffset || sha256Hex(discarded) !== expectedTailDigest || !isNonemptyPrefix(intentState.raw, expectedIntentFrame)) fail("RECOVERY_INTENT_CORRUPT", "partial recovery intent cannot be tied to the unchanged authority tail");
      truncateDurably(intentTarget, 0);
      appendFrame(intentTarget, expectedIntentFrame, { crashAt: options.crashAt === "during-recovery-intent" ? "during-append" : null, onCrash: options.onCrash });
      intent = expectedIntent;
    } else if (!intent) {
      if (!state.torn) return { command_id: commandId, repaired: false, replayed: false };
      const discarded = state.raw.subarray(state.validEndOffset);
      if (state.validEndOffset !== expectedValidEndOffset || sha256Hex(discarded) !== expectedTailDigest) fail("RECOVERY_PRECONDITION_FAILED", "authority tail changed since inspection");
      appendFrame(intentTarget, expectedIntentFrame, { exclusiveCreate: true, crashAt: options.crashAt === "during-recovery-intent" ? "during-append" : null, onCrash: options.onCrash });
      intent = expectedIntent;
    }
    if (canonicalJson(intent) !== canonicalJson(expectedIntent)) fail("COMMAND_CONFLICT", "recovery command id reused with different input");
    crashIf("after-recovery-intent", options.crashAt, options.onCrash);

    if (state.torn) {
      const discarded = state.raw.subarray(state.validEndOffset);
      const originalTail = state.validEndOffset === expectedValidEndOffset && sha256Hex(discarded) === expectedTailDigest;
      if (!originalTail && !tornRecoveryStepMatches(state, authorityId, commandId, expectedPayload, expectedValidEndOffset)) fail("RECOVERY_PRECONDITION_FAILED", "authority tail is neither the authorized tail nor a deterministic recovery frame");
      truncateDurably(authorityPath(controlRoot), state.validEndOffset);
      state = readAuthority(controlRoot, { allowTorn: false });
    } else if (!recoveryBaseMatches(state, authorityId, expectedValidEndOffset)) fail("RECOVERY_PRECONDITION_FAILED", "authority changed while recovery was incomplete");
    crashIf("after-recovery-truncate", options.crashAt, options.onCrash);

    if (!state.records.length) {
      appendRecordUnlocked(controlRoot, state.records, { commandId: "genesis:" + authorityId, kind: "authority_genesis", payload: { authority_id: authorityId }, crashAt: options.crashAt === "during-recovery-genesis" ? "during-append" : null, onCrash: options.onCrash, allowEmergency: true });
      state = readAuthority(controlRoot, { allowTorn: false });
    }
    const recovery = appendRecordUnlocked(controlRoot, state.records, { commandId, kind: "authority_tail_recovered", payload: expectedPayload, crashAt: options.crashAt === "during-recovery-receipt" ? "during-append" : null, onCrash: options.onCrash, allowEmergency: true }).record;
    crashIf("after-recovery-receipt", options.crashAt, options.onCrash);
    removeRecoveryIntent(controlRoot, commandId);
    return { ...receiptFor(recovery, false), repaired: true, bootstrap_initialized: expectedValidEndOffset === 0 };
  }, options);
}

function stableDirectoryAnchorFromStats(real, first, second, platform = process.platform) {
  if (!first?.isDirectory?.() || !second?.isDirectory?.()) return { state: "unavailable", reason: "NOT_DIRECTORY" };
  const fields = [first.dev, first.ino, first.birthtimeNs, second.dev, second.ino, second.birthtimeNs];
  if (fields.some((value) => typeof value !== "bigint" || value <= 0n)) return { state: "unavailable", reason: "STABLE_FIELDS_UNAVAILABLE" };
  const id = `${first.dev}:${first.ino}:${first.birthtimeNs}`;
  const secondId = `${second.dev}:${second.ino}:${second.birthtimeNs}`;
  if (id !== secondId) return { state: "unavailable", reason: "UNSTABLE_STAT" };
  return { state: "available", id, real_path: real, device: String(first.dev), provider: `${platform}:dev-ino-birthtime-ns` };
}

function stableDirectoryAnchor(directory) {
  let real;
  try { real = fs.realpathSync(directory); }
  catch (error) { return { state: "unavailable", reason: error?.code ?? "REALPATH_FAILED" }; }
  try {
    return stableDirectoryAnchorFromStats(real, fs.statSync(real, { bigint: true }), fs.statSync(real, { bigint: true }));
  } catch (error) {
    return { state: "unavailable", reason: error?.code ?? "STAT_FAILED" };
  }
}

function locatorPath(attachmentRoot) {
  return path.join(attachmentRoot, LOCATOR_FILE);
}

function locatorPreimage({ sequence, previousDigest, state, authorityId, attachmentId, claimToken, epoch, anchorId }) {
  return {
    locator_schema_version: 1,
    sequence,
    previous_digest: previousDigest,
    state,
    authority_id: authorityId,
    attachment_id: attachmentId,
    claim_token: claimToken,
    epoch,
    anchor_id: anchorId,
  };
}

function makeLocatorRecord(input) {
  const preimage = locatorPreimage(input);
  return { ...preimage, record_digest: sha256Hex(canonicalJson(preimage)) };
}

function validateLocatorRecords(records) {
  const fields = ["locator_schema_version", "sequence", "previous_digest", "state", "authority_id", "attachment_id", "claim_token", "epoch", "anchor_id", "record_digest"];
  if (records.length > LOCATOR_MAX_RECORDS) fail("LOCATOR_CORRUPT", "locator has too many records");
  let previousDigest = null;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!exactKeys(record, fields) || record.locator_schema_version !== 1 || record.sequence !== index + 1 || record.previous_digest !== previousDigest) fail("LOCATOR_CORRUPT", "invalid locator frame");
    if (![record.authority_id, record.attachment_id, record.claim_token, record.anchor_id].every(nonemptyString) || !validEpoch(record.epoch) || !["staged", "claimed"].includes(record.state) || !validDigest(record.record_digest)) fail("LOCATOR_CORRUPT", "invalid locator field semantics");
    const expected = makeLocatorRecord({ sequence: record.sequence, previousDigest: record.previous_digest, state: record.state, authorityId: record.authority_id, attachmentId: record.attachment_id, claimToken: record.claim_token, epoch: record.epoch, anchorId: record.anchor_id });
    if (expected.record_digest !== record.record_digest) fail("LOCATOR_CORRUPT", "invalid locator digest");
    if (index === 0 && record.state !== "staged") fail("LOCATOR_CORRUPT", "locator must begin staged");
    if (index === 1) {
      const first = records[0];
      if (record.state !== "claimed") fail("LOCATOR_CORRUPT", "staged locator must transition to claimed");
      for (const key of ["authority_id", "attachment_id", "claim_token", "epoch", "anchor_id"]) if (record[key] !== first[key]) fail("LOCATOR_CORRUPT", "locator identity changed during initial claim");
    }
    if (index > 1) {
      const prior = records[index - 1];
      if (record.state !== "claimed" || prior.state !== "claimed") fail("LOCATOR_CORRUPT", "only finalized claims may follow the initial claim");
      const reattach = record.authority_id === prior.authority_id && record.attachment_id === prior.attachment_id && record.epoch === prior.epoch + 1;
      const fork = (record.authority_id !== prior.authority_id || record.attachment_id !== prior.attachment_id) && record.epoch === 1;
      if (!reattach && !fork) fail("LOCATOR_CORRUPT", "locator claim transition is neither a monotonic reattach nor a new identity fork");
    }
    previousDigest = record.record_digest;
  }
  return records;
}

function readLocator(root, { allowTorn = false } = {}) {
  try {
    const state = readFramedJson(locatorPath(root), { maxBytes: LOCATOR_MAX_BYTES, maxRecords: LOCATOR_MAX_RECORDS });
    if (state.torn && !allowTorn) fail("LOCATOR_TORN", "locator has a torn tail");
    validateLocatorRecords(state.records);
    return { ...state, value: state.records.at(-1) ?? null };
  } catch (error) {
    return { error: error?.code ?? "LOCATOR_INVALID" };
  }
}

function stagedLocatorState({ attachmentRoot, authorityId, attachmentId, claimToken, userProvenance, epoch = 1 }) {
  if (![attachmentRoot, authorityId, attachmentId, claimToken].every(nonemptyString) || !validEpoch(epoch) || !validProvenance(userProvenance)) fail("INVALID_ATTACHMENT_INPUT", "stage requires nonempty identity, positive epoch, and exact user provenance");
  const anchor = stableDirectoryAnchor(attachmentRoot);
  if (anchor.state !== "available") fail("ANCHOR_UNAVAILABLE", anchor.reason);
  const locator = makeLocatorRecord({ sequence: 1, previousDigest: null, state: "staged", authorityId, attachmentId, claimToken, epoch, anchorId: anchor.id });
  return { anchor, locator, frame: recordFrame(locator) };
}

const STAGE_INTENT_FIELDS = ["anchor_id", "attachment_id", "authority_id", "claim_token_digest", "epoch", "locator_digest", "locator_path", "user_provenance"];
const STAGE_FINAL_FIELDS = [...STAGE_INTENT_FIELDS, "intent_record_digest"];

function stageIntentPayload(input, expected) {
  return {
    anchor_id: expected.anchor.id,
    attachment_id: input.attachmentId,
    authority_id: input.authorityId,
    claim_token_digest: sha256Hex(input.claimToken),
    epoch: input.epoch ?? 1,
    locator_digest: expected.locator.record_digest,
    locator_path: path.resolve(locatorPath(input.attachmentRoot)),
    user_provenance: input.userProvenance,
  };
}

function validateStageIntent(record, payload, stageCommandId) {
  if (!record || record.kind !== "attachment_stage_intent" || record.command_id !== stageCommandId + ":intent" || !exactKeys(record.payload, STAGE_INTENT_FIELDS) || !samePayloadExceptPaths(record.payload, payload, ["locator_path"])) fail("COMMAND_CONFLICT", "stage command id reused with different input");
  return record;
}

function validateStageReceipt(record, intent, stageCommandId) {
  const expected = { ...intent.payload, intent_record_digest: intent.record_digest };
  if (!record || record.kind !== "attachment_staged" || record.command_id !== stageCommandId || !exactKeys(record.payload, STAGE_FINAL_FIELDS) || canonicalJson(record.payload) !== canonicalJson(expected)) fail("PUBLICATION_CORRUPT", "staged attachment receipt does not link to intent");
  return record;
}

function readLocatorBytesForStage(target) {
  try {
    const stat = fs.statSync(target);
    if (stat.size > LOCATOR_MAX_BYTES) fail("JOURNAL_LIMIT_EXCEEDED", "staged locator exceeds bounded replay bytes");
    return fs.readFileSync(target);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function continueStageLocatorUnlocked(input, expected, raw, options = {}) {
  const target = locatorPath(input.attachmentRoot);
  if (raw === null) {
    appendLocatorFrame(target, expected.frame, {
      exclusiveCreate: true,
      crashAt: options.crashAt === "during-stage-locator" ? "during-append" : options.crashAt === "before-stage-fsync" ? "before-fsync" : options.crashAt === "after-stage-fsync" ? "after-fsync" : null,
      onCrash: options.onCrash,
    });
    return;
  }
  if (raw.equals(expected.frame)) {
    syncFile(target);
    return;
  }
  if (!(raw.length === 0 || isNonemptyPrefix(raw, expected.frame))) fail("PUBLICATION_CONFLICT", "existing locator is not the staged frame for this command");
  truncateDurably(target, 0);
  crashIf("after-stage-recovery-truncate", options.crashAt, options.onCrash);
  appendLocatorFrame(target, expected.frame, { crashAt: options.crashAt === "during-stage-recovery-locator" ? "during-append" : null, onCrash: options.onCrash });
}

function stageAttachment(input, options = {}) {
  if (![input.controlRoot, input.stageCommandId].every(nonemptyString)) fail("INVALID_ATTACHMENT_INPUT", "stage requires a control root and command id");
  const expected = stagedLocatorState(input);
  const initialClaimFrame = recordFrame(claimedLocator(expected.locator));
  if (expected.frame.length + initialClaimFrame.length > LOCATOR_MAX_BYTES || LOCATOR_MAX_RECORDS < 2) fail("JOURNAL_LIMIT_EXCEEDED", "locator lacks reserved capacity for staged and claimed frames");
  const proposedPayload = stageIntentPayload(input, expected);
  return withAuthorityLock(input.controlRoot, () => {
    const state = readAuthority(input.controlRoot, { allowTorn: false });
    assertNoPendingRecoveryIntent(input.controlRoot, state.records);
    assertAuthorityActive(state.records);
    if (state.records[0]?.payload?.authority_id !== input.authorityId) fail("AUTHORITY_ID_MISMATCH", "stage authority mismatch");
    assertNoIncompleteAuthorityTransaction(state.records, [input.stageCommandId]);
    let intent = findCommand(state.records, input.stageCommandId + ":intent");
    const receipt = findCommand(state.records, input.stageCommandId);
    if (intent) intent = validateStageIntent(intent, proposedPayload, input.stageCommandId);
    if (receipt) {
      validateStageReceipt(receipt, intent, input.stageCommandId);
      const raw = readLocatorBytesForStage(locatorPath(input.attachmentRoot));
      if (!raw?.equals(expected.frame)) fail("PUBLICATION_CONFLICT", "staged locator no longer matches its receipt");
      syncFile(locatorPath(input.attachmentRoot));
      return { anchor: expected.anchor, locator: expected.locator, locator_digest: expected.locator.record_digest, ...receiptFor(receipt, true) };
    }
    const otherIntent = state.records.find((record) => record.kind === "attachment_stage_intent" && record.payload?.authority_id === input.authorityId && record.payload?.attachment_id === input.attachmentId && record.command_id !== input.stageCommandId + ":intent" && !findCommand(state.records, record.command_id.slice(0, -":intent".length)));
    if (otherIntent) fail("RECOVERY_REQUIRED", "another staged locator command must be completed first");
    let raw = readLocatorBytesForStage(locatorPath(input.attachmentRoot));
    if (!intent && raw !== null) fail("LOCATOR_ALREADY_EXISTS", "locator already exists");
    if (!intent) {
      assertAuthoritySequenceCapacity(input.controlRoot, state.records, [
        { commandId: input.stageCommandId + ":intent", kind: "attachment_stage_intent", payload: proposedPayload },
        (projected) => { const reservedIntent = findCommand(projected, input.stageCommandId + ":intent"); return { commandId: input.stageCommandId, kind: "attachment_staged", payload: { ...proposedPayload, intent_record_digest: reservedIntent.record_digest } }; },
      ]);
      intent = appendRecordUnlocked(input.controlRoot, state.records, { commandId: input.stageCommandId + ":intent", kind: "attachment_stage_intent", payload: proposedPayload }).record;
    }
    crashIf("after-stage-intent", options.crashAt, options.onCrash);
    continueStageLocatorUnlocked(input, expected, raw, options);
    const finalPayload = { ...intent.payload, intent_record_digest: intent.record_digest };
    const final = appendRecordUnlocked(input.controlRoot, state.records, { commandId: input.stageCommandId, kind: "attachment_staged", payload: finalPayload }).record;
    crashIf("before-stage-output", options.crashAt, options.onCrash);
    return { anchor: expected.anchor, locator: expected.locator, locator_digest: expected.locator.record_digest, ...receiptFor(final, false) };
  }, options);
}

const STAGED_RECOVERY_FIELDS = ["attachment_id", "authority_id", "locator_digest", "locator_path", "stage_receipt_digest", "user_provenance"];

function recoverStagedLocator(input, options = {}) {
  if (![input.controlRoot, input.stageCommandId, input.recoveryCommandId].every(nonemptyString) || !validDigest(input.expectedLocatorDigest)) fail("RECOVERY_AUTHORIZATION_REQUIRED", "staged locator recovery requires stage/recovery commands, digest, and exact user provenance");
  const expected = stagedLocatorState(input);
  if (expected.locator.record_digest !== input.expectedLocatorDigest) fail("RECOVERY_PRECONDITION_FAILED", "expected staged locator digest does not match recovery identity");
  const proposedIntent = stageIntentPayload(input, expected);
  return withAuthorityLock(input.controlRoot, () => {
    const state = readAuthority(input.controlRoot, { allowTorn: false });
    assertNoPendingRecoveryIntent(input.controlRoot, state.records);
    assertAuthorityActive(state.records);
    if (state.records[0]?.payload?.authority_id !== input.authorityId) fail("AUTHORITY_ID_MISMATCH", "staged locator recovery authority mismatch");
    assertNoIncompleteAuthorityTransaction(state.records, [input.stageCommandId, input.recoveryCommandId]);
    const intent = validateStageIntent(findCommand(state.records, input.stageCommandId + ":intent"), proposedIntent, input.stageCommandId);
    let stageReceipt = findCommand(state.records, input.stageCommandId);
    const prior = findCommand(state.records, input.recoveryCommandId);
    const receiptPayload = () => ({ attachment_id: input.attachmentId, authority_id: input.authorityId, locator_digest: input.expectedLocatorDigest, locator_path: intent.payload.locator_path, stage_receipt_digest: stageReceipt.record_digest, user_provenance: input.userProvenance });
    const raw = readLocatorBytesForStage(locatorPath(input.attachmentRoot));
    if (prior) {
      if (!stageReceipt || prior.kind !== "staged_locator_recovered" || !exactKeys(prior.payload, STAGED_RECOVERY_FIELDS) || canonicalJson(prior.payload) !== canonicalJson(receiptPayload()) || !raw?.equals(expected.frame)) fail("COMMAND_CONFLICT", "staged locator recovery command conflicts with prior input");
      syncFile(locatorPath(input.attachmentRoot));
      return { ...receiptFor(prior, true), locator_digest: input.expectedLocatorDigest };
    }
    if (stageReceipt) fail("RECOVERY_NOT_REQUIRED", "staged locator command is already complete");
    if (raw === null) fail("RECOVERY_PRECONDITION_FAILED", "staged locator recovery requires an existing partial locator");
    assertAuthoritySequenceCapacity(input.controlRoot, state.records, [
      { commandId: input.stageCommandId, kind: "attachment_staged", payload: { ...intent.payload, intent_record_digest: intent.record_digest } },
      (projected) => { const reservedStage = findCommand(projected, input.stageCommandId); return { commandId: input.recoveryCommandId, kind: "staged_locator_recovered", payload: { attachment_id: input.attachmentId, authority_id: input.authorityId, locator_digest: input.expectedLocatorDigest, locator_path: intent.payload.locator_path, stage_receipt_digest: reservedStage.record_digest, user_provenance: input.userProvenance } }; },
    ], { allowEmergency: true });
    continueStageLocatorUnlocked(input, expected, raw, options);
    const finalPayload = { ...intent.payload, intent_record_digest: intent.record_digest };
    stageReceipt = appendRecordUnlocked(input.controlRoot, state.records, { commandId: input.stageCommandId, kind: "attachment_staged", payload: finalPayload, allowEmergency: true }).record;
    const recovery = appendRecordUnlocked(input.controlRoot, state.records, { commandId: input.recoveryCommandId, kind: "staged_locator_recovered", payload: receiptPayload(), allowEmergency: true }).record;
    crashIf("before-stage-recovery-output", options.crashAt, options.onCrash);
    return { ...receiptFor(recovery, false), locator_digest: input.expectedLocatorDigest };
  }, options);
}


function claimedLocator(staged) {
  return makeLocatorRecord({
    sequence: 2,
    previousDigest: staged.record_digest,
    state: "claimed",
    authorityId: staged.authority_id,
    attachmentId: staged.attachment_id,
    claimToken: staged.claim_token,
    epoch: staged.epoch,
    anchorId: staged.anchor_id,
  });
}

const PUBLICATION_FIELDS = ["user_provenance", "attachment_kind", "anchor_id", "attachment_id", "attachment_path", "subject_path", "authority_id", "claim_token_digest", "claimed_locator_digest", "epoch", "publication_command_id", "staged_locator_digest"];
const FINAL_PUBLICATION_FIELDS = [...PUBLICATION_FIELDS, "pending_record_digest"];

function publicationPayload({ userProvenance, attachmentKind, authorityId, attachmentId, claimToken, epoch, anchorId, attachmentRoot, subjectRoot, stagedDigest, claimedDigest, publicationCommandId }) {
  return {
    user_provenance: userProvenance,
    attachment_kind: attachmentKind ?? "filesystem",
    anchor_id: anchorId,
    attachment_id: attachmentId,
    attachment_path: path.resolve(attachmentRoot),
    subject_path: path.resolve(subjectRoot ?? attachmentRoot),
    authority_id: authorityId,
    claim_token_digest: sha256Hex(claimToken),
    claimed_locator_digest: claimedDigest,
    epoch,
    publication_command_id: publicationCommandId,
    staged_locator_digest: stagedDigest,
  };
}

function validPublicationPayload(payload, final) {
  const strings = [payload.anchor_id, payload.attachment_id, payload.attachment_path, payload.subject_path, payload.authority_id, payload.publication_command_id];
  const digests = [payload.claim_token_digest, payload.claimed_locator_digest, payload.staged_locator_digest, ...(final ? [payload.pending_record_digest] : [])];
  return strings.every(nonemptyString) && path.isAbsolute(payload.attachment_path) && path.isAbsolute(payload.subject_path)
    && digests.every(validDigest) && validEpoch(payload.epoch) && validProvenance(payload.user_provenance);
}

function samePayloadExceptPaths(first, second, extraIgnored = []) {
  const ignored = new Set(["attachment_path", "subject_path", ...extraIgnored]);
  const without = (value) => Object.fromEntries(Object.entries(value).filter(([key]) => !ignored.has(key)));
  return canonicalJson(without(first)) === canonicalJson(without(second));
}

function validatePublicationPair(pending, final = null) {
  if (!pending || !["git", "filesystem"].includes(pending.payload?.attachment_kind) || pending.kind !== "attachment_claim_pending" || !exactKeys(pending.payload, PUBLICATION_FIELDS) || !validPublicationPayload(pending.payload, false) || pending.command_id !== pending.payload.publication_command_id + ":pending") fail("PUBLICATION_CORRUPT", "invalid pending publication");
  if (final) {
    if (final.kind !== "attachment_claimed" || !exactKeys(final.payload, FINAL_PUBLICATION_FIELDS) || !validPublicationPayload(final.payload, true) || final.command_id !== pending.payload.publication_command_id + ":final") fail("PUBLICATION_CORRUPT", "invalid final publication");
    const expected = { ...pending.payload, pending_record_digest: pending.record_digest };
    if (canonicalJson(final.payload) !== canonicalJson(expected)) fail("PUBLICATION_CORRUPT", "final publication does not link exactly to pending");
  }
  return pending.payload;
}

function crashIf(point, crashAt, onCrash) {
  if (point === crashAt) {
    onCrash?.(point);
    fail("INJECTED_CRASH", `injected crash at ${point}`);
  }
}

function publicationStateUnlocked(input, state) {
  const { attachmentRoot, authorityId, attachmentId, claimToken, commandId, epoch = 1 } = input;
  const genesis = state.records[0];
  if (genesis?.kind !== "authority_genesis" || genesis.payload.authority_id !== authorityId) fail("AUTHORITY_ID_MISMATCH", "publication authority mismatch");
  const anchor = stableDirectoryAnchor(attachmentRoot);
  if (anchor.state !== "available") fail("ANCHOR_UNAVAILABLE", anchor.reason);
  if ((input.attachmentKind ?? "filesystem") === "git") {
    const subjectAnchor = stableDirectoryAnchor(input.subjectRoot);
    if (input.attachment_anchor_observation?.id !== anchor.id || input.subject_anchor_observation?.id !== subjectAnchor.id || canonicalJson(input.git_link_observation) !== canonicalJson(observeGitAdminLink(input.subjectRoot))) fail("GIT_ATTACHMENT_MISMATCH", "Git attachment changed before authority publication");
  }
  const locator = readLocator(attachmentRoot, { allowTorn: true });
  if (locator.error || !locator.records.length) fail("LOCATOR_UNAVAILABLE", locator.error ?? "LOCATOR_EMPTY");
  const staged = locator.records[0];
  if (staged.authority_id !== authorityId || staged.attachment_id !== attachmentId || staged.claim_token !== claimToken || staged.epoch !== epoch || staged.anchor_id !== anchor.id) fail("PUBLICATION_CONFLICT", "staged locator identity mismatch");
  if (!nonemptyString(input.stageCommandId)) fail("RECOVERY_PRECONDITION_FAILED", "publication requires the staged command receipt");
  const stageIntent = findCommand(state.records, input.stageCommandId + ":intent");
  const stageReceipt = validateStageReceipt(findCommand(state.records, input.stageCommandId), stageIntent, input.stageCommandId);
  if (stageReceipt.payload.authority_id !== authorityId || stageReceipt.payload.attachment_id !== attachmentId || stageReceipt.payload.locator_digest !== staged.record_digest || stageReceipt.payload.anchor_id !== anchor.id || stageReceipt.payload.claim_token_digest !== sha256Hex(claimToken)) fail("PUBLICATION_CONFLICT", "staged receipt does not authenticate locator identity");
  const claimed = claimedLocator(staged);
  let payload = publicationPayload({ userProvenance: input.userProvenance, attachmentKind: input.attachmentKind, authorityId, attachmentId, claimToken, epoch, anchorId: anchor.id, attachmentRoot, subjectRoot: input.subjectRoot ?? attachmentRoot, stagedDigest: staged.record_digest, claimedDigest: claimed.record_digest, publicationCommandId: commandId });
  const pending = findCommand(state.records, `${commandId}:pending`);
  const final = findCommand(state.records, `${commandId}:final`);
  if (pending) {
    const prior = validatePublicationPair(pending, final);
    if (!samePayloadExceptPaths(prior, payload)) fail("PUBLICATION_CONFLICT", "publication retry input mismatch");
    payload = prior;
  } else if (final) fail("PUBLICATION_CORRUPT", "final publication exists without pending");
  return { anchor, claimed, final, locator, payload, pending, staged };
}

function continuePublicationUnlocked(input, state, options = {}) {
  const current = publicationStateUnlocked(input, state);
  if (current.final) {
    if (current.locator.torn || current.locator.value?.record_digest !== current.payload.claimed_locator_digest) fail("PUBLICATION_CONFLICT", "final locator no longer matches authority");
    return { command_id: input.commandId, final_record_digest: current.final.record_digest, replayed: true };
  }
  assertLocatorAppendCapacity(current.locator, current.claimed);
  if (!current.pending) assertAuthoritySequenceCapacity(input.controlRoot, state.records, [
    { commandId: input.commandId + ":pending", kind: "attachment_claim_pending", payload: current.payload },
    (projected) => { const reservedPending = findCommand(projected, input.commandId + ":pending"); return { commandId: input.commandId + ":final", kind: "attachment_claimed", payload: { ...current.payload, pending_record_digest: reservedPending.record_digest } }; },
  ]);
  crashIf("before-pending", options.crashAt, options.onCrash);
  let pending = current.pending;
  if (!pending) pending = appendRecordUnlocked(input.controlRoot, state.records, { commandId: `${input.commandId}:pending`, kind: "attachment_claim_pending", payload: current.payload }).record;
  crashIf("after-pending", options.crashAt, options.onCrash);
  if (current.locator.torn) fail("LOCATOR_TORN", "explicit recovery is required for a torn locator");
  if (current.locator.value.record_digest === current.staged.record_digest) {
    appendLocatorFrame(locatorPath(input.attachmentRoot), Buffer.from(canonicalJson(current.claimed) + "\n"), {
      crashAt: options.crashAt === "during-locator-append" ? "during-append" : null,
      onCrash: options.onCrash,
    });
  } else if (current.locator.value.record_digest !== current.claimed.record_digest) fail("PUBLICATION_CONFLICT", "locator changed after pending claim");
  crashIf("after-locator", options.crashAt, options.onCrash);
  const finalPayload = { ...current.payload, pending_record_digest: pending.record_digest };
  const final = appendRecordUnlocked(input.controlRoot, state.records, { commandId: `${input.commandId}:final`, kind: "attachment_claimed", payload: finalPayload, allowEmergency: options.allowEmergency === true }).record;
  crashIf("after-final", options.crashAt, options.onCrash);
  const receipt = { command_id: input.commandId, final_record_digest: final.record_digest, replayed: false };
  crashIf("before-output", options.crashAt, options.onCrash);
  return receipt;
}

function preparePublicationInput(input) {
  if ((input.attachmentKind ?? "filesystem") !== "git") return input;
  const subjectRoot = input.subjectRoot;
  if (!nonemptyString(subjectRoot)) fail("GIT_ATTACHMENT_MISMATCH", "Git publication requires a subject root");
  const actualGitDir = gitQuery(subjectRoot, "--git-dir");
  const expected = canonicalCandidate(input.attachmentRoot);
  const actual = actualGitDir ? canonicalCandidate(actualGitDir) : { state: "unavailable" };
  if (expected.state !== "resolved" || actual.state !== "resolved" || normalizedPath(expected.value) !== normalizedPath(actual.value)) fail("GIT_ATTACHMENT_MISMATCH", "subject does not resolve to the claimed Git admin directory");
  return { ...input, git_link_observation: observeGitAdminLink(subjectRoot), subject_anchor_observation: stableDirectoryAnchor(subjectRoot), attachment_anchor_observation: stableDirectoryAnchor(input.attachmentRoot) };
}

function publishAttachment(input, options = {}) {
  if (!validProvenance(input.userProvenance)) fail("RECOVERY_AUTHORIZATION_REQUIRED", "publication requires exact user provenance");
  const prepared = preparePublicationInput(input);
  options.beforeAuthorityLock?.();
  return withAuthorityLock(prepared.controlRoot, () => {
    const state = readAuthority(prepared.controlRoot, { allowTorn: false });
    assertNoPendingRecoveryIntent(prepared.controlRoot, state.records);
    assertAuthorityActive(state.records);
    assertNoIncompleteAuthorityTransaction(state.records, [input.commandId]);
    const pending = findCommand(state.records, `${input.commandId}:pending`);
    const final = findCommand(state.records, `${input.commandId}:final`);
    if (pending && !final) fail("RECOVERY_REQUIRED", "pending publication requires explicit recovery");
    return continuePublicationUnlocked(prepared, state, options);
  }, options);
}

const ATTACHMENT_RECOVERY_INTENT_FIELDS = ["claim_token_digest", "expected_epoch", "expected_locator_digest", "pending_record_digest", "recovered_command_id", "user_provenance"];

function recoverAttachment(input, options = {}) {
  input = preparePublicationInput(input);
  const { commandId, recoveryCommandId, recoveryProvenance, expectedEpoch, expectedPendingDigest, expectedLocatorDigest } = input;
  if (!recoveryCommandId || !validProvenance(recoveryProvenance)) fail("RECOVERY_AUTHORIZATION_REQUIRED", "explicit user provenance is required");
  return withAuthorityLock(input.controlRoot, () => {
    const state = readAuthority(input.controlRoot, { allowTorn: false });
    assertNoPendingRecoveryIntent(input.controlRoot, state.records);
    assertAuthorityActive(state.records);
    assertNoIncompleteAuthorityTransaction(state.records, [commandId, recoveryCommandId]);
    const pending = findCommand(state.records, commandId + ":pending");
    const final = findCommand(state.records, commandId + ":final");
    if (!pending) fail("RECOVERY_PRECONDITION_FAILED", "pending publication is missing");
    validatePublicationPair(pending, final);
    if (pending.payload.authority_id !== input.authorityId || pending.payload.attachment_id !== input.attachmentId || canonicalJson(pending.payload.user_provenance) !== canonicalJson(input.userProvenance) || pending.payload.anchor_id !== stableDirectoryAnchor(input.attachmentRoot).id) fail("RECOVERY_PRECONDITION_FAILED", "recovery identity or anchor does not match pending publication");
    if (pending.payload.epoch !== expectedEpoch || pending.record_digest !== expectedPendingDigest) fail("RECOVERY_PRECONDITION_FAILED", "attachment recovery precondition changed");
    if (![pending.payload.staged_locator_digest, pending.payload.claimed_locator_digest].includes(expectedLocatorDigest)) fail("RECOVERY_PRECONDITION_FAILED", "expected locator digest is not part of this publication");
    if (sha256Hex(input.claimToken) !== pending.payload.claim_token_digest) fail("RECOVERY_PRECONDITION_FAILED", "claim token does not match digest");

    const intentCommandId = recoveryCommandId + ":intent";
    const intentPayload = {
      claim_token_digest: pending.payload.claim_token_digest,
      expected_epoch: expectedEpoch,
      expected_locator_digest: expectedLocatorDigest,
      pending_record_digest: expectedPendingDigest,
      recovered_command_id: commandId,
      user_provenance: recoveryProvenance,
    };
    let recoveryIntent = findCommand(state.records, intentCommandId);
    const priorReceipt = findCommand(state.records, recoveryCommandId);
    if (recoveryIntent && (recoveryIntent.kind !== "attachment_recovery_intent" || !exactKeys(recoveryIntent.payload, ATTACHMENT_RECOVERY_INTENT_FIELDS) || canonicalJson(recoveryIntent.payload) !== canonicalJson(intentPayload))) fail("COMMAND_CONFLICT", "attachment recovery command id reused with different input");
    if (priorReceipt) {
      const expectedPayload = { ...intentPayload, publication_final_digest: final?.record_digest ?? null };
      if (!recoveryIntent || !final || priorReceipt.kind !== "attachment_recovery_receipt" || canonicalJson(priorReceipt.payload) !== canonicalJson(expectedPayload)) fail("COMMAND_CONFLICT", "recovery command id reused with different input");
      return { ...receiptFor(priorReceipt, true), recovered_command_id: commandId };
    }
    if (final && !recoveryIntent) fail("RECOVERY_NOT_REQUIRED", "final publication already exists; replay the original command");
    if (!recoveryIntent) {
      const recoverySteps = [{ commandId: intentCommandId, kind: "attachment_recovery_intent", payload: intentPayload }];
      if (!final) recoverySteps.push({ commandId: commandId + ":final", kind: "attachment_claimed", payload: { ...pending.payload, pending_record_digest: pending.record_digest } });
      recoverySteps.push((projected) => { const reservedFinal = findCommand(projected, commandId + ":final"); return { commandId: recoveryCommandId, kind: "attachment_recovery_receipt", payload: { ...intentPayload, publication_final_digest: reservedFinal.record_digest } }; });
      assertAuthoritySequenceCapacity(input.controlRoot, state.records, recoverySteps, { allowEmergency: true });
    }
    if (!recoveryIntent) recoveryIntent = appendRecordUnlocked(input.controlRoot, state.records, { commandId: intentCommandId, kind: "attachment_recovery_intent", payload: intentPayload, allowEmergency: true }).record;
    crashIf("after-recovery-intent", options.crashAt, options.onCrash);

    const locator = readLocator(input.attachmentRoot, { allowTorn: true });
    const observedDigest = locator.records?.at(-1)?.record_digest ?? null;
    if (locator.error || ![expectedLocatorDigest, pending.payload.claimed_locator_digest].includes(observedDigest)) fail("RECOVERY_PRECONDITION_FAILED", "attachment locator changed outside this recovery");
    if (locator.torn) truncateDurably(locatorPath(input.attachmentRoot), locator.validEndOffset);
    const publication = final ? { command_id: commandId, final_record_digest: final.record_digest, replayed: true } : continuePublicationUnlocked(input, state, { ...options, allowEmergency: true });
    const payload = { ...intentPayload, publication_final_digest: publication.final_record_digest };
    const recovery = appendRecordUnlocked(input.controlRoot, state.records, { commandId: recoveryCommandId, kind: "attachment_recovery_receipt", payload, allowEmergency: true }).record;
    crashIf("after-recovery-receipt", options.crashAt, options.onCrash);
    const receipt = { ...receiptFor(recovery, false), recovered_command_id: commandId };
    crashIf("before-recovery-output", options.crashAt, options.onCrash);
    return receipt;
  }, options);
}


const REATTACH_FIELDS = [...PUBLICATION_FIELDS, "previous_epoch", "previous_final_digest"];
const FINAL_REATTACH_FIELDS = [...REATTACH_FIELDS, "pending_record_digest"];

function validateReattachPair(pending, final = null) {
  if (!pending || pending.kind !== "attachment_reattach_pending" || !exactKeys(pending.payload, REATTACH_FIELDS) || !validPublicationPayload(pending.payload, false) || pending.command_id !== pending.payload.publication_command_id + ":pending" || !validEpoch(pending.payload.previous_epoch) || pending.payload.epoch !== pending.payload.previous_epoch + 1 || !validDigest(pending.payload.previous_final_digest)) fail("PUBLICATION_CORRUPT", "invalid reattach pending record");
  if (final) {
    if (final.kind !== "attachment_reattached" || !exactKeys(final.payload, FINAL_REATTACH_FIELDS) || !validPublicationPayload(final.payload, true) || final.command_id !== pending.payload.publication_command_id + ":final") fail("PUBLICATION_CORRUPT", "invalid reattach final record");
    const expected = { ...pending.payload, pending_record_digest: pending.record_digest };
    if (canonicalJson(final.payload) !== canonicalJson(expected)) fail("PUBLICATION_CORRUPT", "reattach final does not link exactly to pending");
  }
  return pending.payload;
}

function latestClaimState(records, publicationCommandId, authorityId, attachmentId) {
  const initialPending = findCommand(records, publicationCommandId + ":pending");
  const initialFinal = findCommand(records, publicationCommandId + ":final");
  if (!initialPending || !initialFinal) return { state: "pending", pending: initialPending, final: initialFinal };
  let payload = validatePublicationPair(initialPending, initialFinal);
  if (payload.authority_id !== authorityId || payload.attachment_id !== attachmentId) fail("AUTHORITY_MISMATCH", "initial attachment claim identity mismatch");
  let final = initialFinal;
  for (const pending of records.filter((record) => record.kind === "attachment_reattach_pending" && record.payload?.authority_id === authorityId && record.payload?.attachment_id === attachmentId)) {
    if (pending.payload.previous_final_digest !== final.record_digest || pending.payload.previous_epoch !== payload.epoch || pending.payload.staged_locator_digest !== payload.claimed_locator_digest) fail("PUBLICATION_CORRUPT", "reattach claim chain diverged");
    const candidateFinal = findCommand(records, pending.payload.publication_command_id + ":final");
    validateReattachPair(pending, candidateFinal);
    if (!candidateFinal) return { state: "pending", payload, final, pending };
    payload = candidateFinal.payload;
    final = candidateFinal;
  }
  return { state: "claimed", payload, final };
}

function assertNoUnresolvedForkIntent(records, { authorityId, attachmentId, expectedEpoch, exceptCommandId = null }) {
  const pending = records.find((record) => {
    if (record.kind !== "attachment_fork_intent" || record.command_id === exceptCommandId + ":intent") return false;
    const payload = record.payload ?? {};
    if (payload.authority_id !== authorityId || payload.attachment_id !== attachmentId || payload.expected_epoch !== expectedEpoch) return false;
    const baseCommand = record.command_id.slice(0, -":intent".length);
    return !findCommand(records, baseCommand + ":resolved");
  });
  if (pending) fail("RECOVERY_REQUIRED", "an earlier identity fork for this source claim must be completed first");
}

function verifyPreparedGitObservation(input, anchor) {
  if ((input.attachmentKind ?? "filesystem") !== "git") return;
  const subjectAnchor = stableDirectoryAnchor(input.subjectRoot);
  if (input.attachment_anchor_observation?.id !== anchor.id || input.subject_anchor_observation?.id !== subjectAnchor.id || canonicalJson(input.git_link_observation) !== canonicalJson(observeGitAdminLink(input.subjectRoot))) fail("GIT_ATTACHMENT_MISMATCH", "Git attachment changed before authority mutation");
}

function reattachAttachment(input, options = {}) {
  if (!validProvenance(input.userProvenance) || !nonemptyString(input.commandId) || !nonemptyString(input.publicationCommandId) || !nonemptyString(input.claimToken) || !nonemptyString(input.newClaimToken) || !validEpoch(input.expectedEpoch) || !validDigest(input.expectedLocatorDigest)) fail("RECOVERY_AUTHORIZATION_REQUIRED", "reattach requires exact user provenance and optimistic claim inputs");
  input = preparePublicationInput(input);
  options.beforeAuthorityLock?.();
  return withAuthorityLock(input.controlRoot, () => {
    const state = readAuthority(input.controlRoot, { allowTorn: false });
    assertNoPendingRecoveryIntent(input.controlRoot, state.records);
    assertAuthorityActive(state.records);
    assertNoUnresolvedForkIntent(state.records, { authorityId: input.authorityId, attachmentId: input.attachmentId, expectedEpoch: input.expectedEpoch });
    assertNoIncompleteAuthorityTransaction(state.records, [input.commandId]);
    const anchor = stableDirectoryAnchor(input.attachmentRoot);
    if (anchor.state !== "available") fail("ANCHOR_UNAVAILABLE", anchor.reason);
    verifyPreparedGitObservation(input, anchor);

    const ownPending = findCommand(state.records, input.commandId + ":pending");
    const ownFinal = findCommand(state.records, input.commandId + ":final");
    if (ownFinal) {
      const payload = validateReattachPair(ownPending, ownFinal);
      if (payload.authority_id !== input.authorityId || payload.attachment_id !== input.attachmentId || payload.epoch !== input.expectedEpoch + 1 || payload.claim_token_digest !== sha256Hex(input.newClaimToken) || payload.staged_locator_digest !== input.expectedLocatorDigest || canonicalJson(payload.user_provenance) !== canonicalJson(input.userProvenance)) fail("COMMAND_CONFLICT", "reattach command id reused with different input");
      const locator = readLocator(input.attachmentRoot);
      if (locator.error || locator.value?.record_digest !== payload.claimed_locator_digest) fail("PUBLICATION_CONFLICT", "reattached locator no longer matches authority");
      return { command_id: input.commandId, final_record_digest: ownFinal.record_digest, epoch: payload.epoch, replayed: true };
    }

    const current = latestClaimState(state.records, input.publicationCommandId, input.authorityId, input.attachmentId);
    if (current.state === "pending" && current.pending?.command_id !== input.commandId + ":pending") fail("RECOVERY_REQUIRED", "another attachment publication is pending");
    if (!current.payload || !current.final) fail("RECOVERY_PRECONDITION_FAILED", "a finalized attachment claim is required");
    if (current.payload.epoch !== input.expectedEpoch || current.payload.claimed_locator_digest !== input.expectedLocatorDigest || current.payload.claim_token_digest !== sha256Hex(input.claimToken)) fail("RECOVERY_PRECONDITION_FAILED", "reattach optimistic claim changed");

    const matchingCollision = state.records.find((record) => record.kind === "attachment_collision" && record.payload?.authority_id === input.authorityId && record.payload?.attachment_id === input.attachmentId && record.payload?.epoch === current.payload.epoch && record.payload?.publication_final_digest === current.final.record_digest && record.payload?.anchor_ids?.includes(anchor.id));
    const oldAnchor = stableDirectoryAnchor(current.payload.attachment_path);
    const oldClaimStillReachable = oldAnchor.state === "available" && oldAnchor.id === current.payload.anchor_id;
    if (anchor.id === current.payload.anchor_id && !matchingCollision) fail("RECOVERY_NOT_REQUIRED", "same stable anchor remains directly routable");
    if (oldClaimStillReachable && !matchingCollision) fail("RECOVERY_PRECONDITION_FAILED", "reattach requires an unavailable old anchor or an exact committed collision");
    const locator = readLocator(input.attachmentRoot, { allowTorn: true });
    if (locator.error || !locator.records.length) fail("LOCATOR_UNAVAILABLE", locator.error ?? "LOCATOR_EMPTY");
    const priorIndex = locator.records.findIndex((record) => record.record_digest === input.expectedLocatorDigest);
    if (priorIndex < 0 || priorIndex < locator.records.length - 2) fail("RECOVERY_PRECONDITION_FAILED", "selected locator does not carry the expected current claim");
    const priorLocator = locator.records[priorIndex];
    if (priorLocator.authority_id !== input.authorityId || priorLocator.attachment_id !== input.attachmentId || priorLocator.epoch !== input.expectedEpoch || sha256Hex(priorLocator.claim_token) !== current.payload.claim_token_digest) fail("RECOVERY_PRECONDITION_FAILED", "selected locator identity does not match authority");
    const nextLocator = makeLocatorRecord({ sequence: priorLocator.sequence + 1, previousDigest: priorLocator.record_digest, state: "claimed", authorityId: input.authorityId, attachmentId: input.attachmentId, claimToken: input.newClaimToken, epoch: input.expectedEpoch + 1, anchorId: anchor.id });
    let payload = {
      ...publicationPayload({ userProvenance: input.userProvenance, attachmentKind: input.attachmentKind, authorityId: input.authorityId, attachmentId: input.attachmentId, claimToken: input.newClaimToken, epoch: input.expectedEpoch + 1, anchorId: anchor.id, attachmentRoot: input.attachmentRoot, subjectRoot: input.subjectRoot ?? input.attachmentRoot, stagedDigest: priorLocator.record_digest, claimedDigest: nextLocator.record_digest, publicationCommandId: input.commandId }),
      previous_epoch: input.expectedEpoch,
      previous_final_digest: current.final.record_digest,
    };
    assertLocatorAppendCapacity(locator, nextLocator);
    if (!ownPending) assertAuthoritySequenceCapacity(input.controlRoot, state.records, [
      { commandId: input.commandId + ":pending", kind: "attachment_reattach_pending", payload },
      (projected) => { const reservedPending = findCommand(projected, input.commandId + ":pending"); return { commandId: input.commandId + ":final", kind: "attachment_reattached", payload: { ...payload, pending_record_digest: reservedPending.record_digest } }; },
    ]);
    if (ownPending) {
      const priorPayload = validateReattachPair(ownPending);
      if (!samePayloadExceptPaths(priorPayload, payload)) fail("COMMAND_CONFLICT", "reattach command id reused with different input");
      payload = priorPayload;
    } else {
      crashIf("before-reattach-pending", options.crashAt, options.onCrash);
      appendRecordUnlocked(input.controlRoot, state.records, { commandId: input.commandId + ":pending", kind: "attachment_reattach_pending", payload });
    }
    const pending = findCommand(state.records, input.commandId + ":pending");
    crashIf("after-reattach-pending", options.crashAt, options.onCrash);

    if (locator.torn) {
      const tail = locator.raw.subarray(locator.validEndOffset);
      if (!isNonemptyPrefix(tail, recordFrame(nextLocator))) fail("LOCATOR_TORN", "torn locator tail is not the expected reattach frame");
      truncateDurably(locatorPath(input.attachmentRoot), locator.validEndOffset);
    }
    const latestDigest = locator.records.at(-1)?.record_digest;
    if (latestDigest === priorLocator.record_digest) appendLocatorFrame(locatorPath(input.attachmentRoot), recordFrame(nextLocator), { crashAt: options.crashAt === "during-reattach-locator" ? "during-append" : null, onCrash: options.onCrash });
    else if (latestDigest !== nextLocator.record_digest) fail("PUBLICATION_CONFLICT", "locator changed during reattach");
    crashIf("after-reattach-locator", options.crashAt, options.onCrash);

    const finalPayload = { ...payload, pending_record_digest: pending.record_digest };
    const final = appendRecordUnlocked(input.controlRoot, state.records, { commandId: input.commandId + ":final", kind: "attachment_reattached", payload: finalPayload }).record;
    crashIf("after-reattach-final", options.crashAt, options.onCrash);
    const receipt = { command_id: input.commandId, final_record_digest: final.record_digest, epoch: payload.epoch, replayed: false };
    crashIf("before-reattach-output", options.crashAt, options.onCrash);
    return receipt;
  }, options);
}

const STAGED_CLEANUP_FIELDS = ["attachment_id", "authority_id", "locator_digest", "locator_path", "user_provenance"];
const FINAL_STAGED_CLEANUP_FIELDS = [...STAGED_CLEANUP_FIELDS, "pending_record_digest"];

function validateStagedCleanupPair(pending, final = null) {
  if (!pending || pending.kind !== "staged_locator_cleanup_pending" || !exactKeys(pending.payload, STAGED_CLEANUP_FIELDS) || pending.command_id.slice(-8) !== ":pending" || !nonemptyString(pending.payload.attachment_id) || !nonemptyString(pending.payload.authority_id) || !validDigest(pending.payload.locator_digest) || !path.isAbsolute(pending.payload.locator_path) || !validProvenance(pending.payload.user_provenance)) fail("PUBLICATION_CORRUPT", "invalid staged locator cleanup pending record");
  if (final) {
    if (final.kind !== "staged_locator_cleaned" || !exactKeys(final.payload, FINAL_STAGED_CLEANUP_FIELDS) || final.command_id !== pending.command_id.slice(0, -8) + ":final") fail("PUBLICATION_CORRUPT", "invalid staged locator cleanup final record");
    const expected = { ...pending.payload, pending_record_digest: pending.record_digest };
    if (canonicalJson(final.payload) !== canonicalJson(expected)) fail("PUBLICATION_CORRUPT", "staged locator cleanup final does not link to pending");
  }
  return pending.payload;
}

function cleanupStagedLocator(input, options = {}) {
  if (!validProvenance(input.userProvenance) || !nonemptyString(input.commandId) || !nonemptyString(input.authorityId) || !nonemptyString(input.attachmentId) || !validDigest(input.expectedLocatorDigest)) fail("RECOVERY_AUTHORIZATION_REQUIRED", "staged locator cleanup requires exact user provenance and digest");
  return withAuthorityLock(input.controlRoot, () => {
    const state = readAuthority(input.controlRoot, { allowTorn: false });
    assertNoPendingRecoveryIntent(input.controlRoot, state.records);
    assertAuthorityActive(state.records);
    assertNoIncompleteAuthorityTransaction(state.records, [input.commandId]);
    const genesis = state.records[0];
    if (genesis?.payload?.authority_id !== input.authorityId) fail("AUTHORITY_ID_MISMATCH", "cleanup authority identity mismatch");
    const pending = findCommand(state.records, input.commandId + ":pending");
    const final = findCommand(state.records, input.commandId + ":final");
    const payload = { attachment_id: input.attachmentId, authority_id: input.authorityId, locator_digest: input.expectedLocatorDigest, locator_path: path.resolve(locatorPath(input.attachmentRoot)), user_provenance: input.userProvenance };
    if (pending && canonicalJson(validateStagedCleanupPair(pending, final)) !== canonicalJson(payload)) fail("COMMAND_CONFLICT", "cleanup command id reused with different input");
    if (final) {
      if (fs.existsSync(locatorPath(input.attachmentRoot))) fail("PUBLICATION_CONFLICT", "cleaned staged locator reappeared");
      return { command_id: input.commandId, final_record_digest: final.record_digest, locator_digest: input.expectedLocatorDigest, replayed: true };
    }
    const committedClaim = state.records.some((record) => ["attachment_claim_pending", "attachment_claimed", "attachment_reattach_pending", "attachment_reattached"].includes(record.kind) && record.payload?.attachment_id === input.attachmentId);
    if (committedClaim) fail("RECOVERY_PRECONDITION_FAILED", "staged locator already has a committed authority claim");
    let locator = readLocator(input.attachmentRoot, { allowTorn: true });
    if (!pending) {
      if (locator.error || locator.torn || locator.records.length !== 1 || locator.value.state !== "staged" || locator.value.authority_id !== input.authorityId || locator.value.attachment_id !== input.attachmentId || locator.value.record_digest !== input.expectedLocatorDigest) fail("RECOVERY_PRECONDITION_FAILED", "locator is not the exact unclaimed staged locator");
      assertAuthoritySequenceCapacity(input.controlRoot, state.records, [
        { commandId: input.commandId + ":pending", kind: "staged_locator_cleanup_pending", payload },
        (projected) => { const reservedPending = findCommand(projected, input.commandId + ":pending"); return { commandId: input.commandId + ":final", kind: "staged_locator_cleaned", payload: { ...payload, pending_record_digest: reservedPending.record_digest } }; },
      ]);
      appendRecordUnlocked(input.controlRoot, state.records, { commandId: input.commandId + ":pending", kind: "staged_locator_cleanup_pending", payload });
    }
    const committedPending = findCommand(state.records, input.commandId + ":pending");
    crashIf("after-cleanup-pending", options.crashAt, options.onCrash);
    const locatorTarget = locatorPath(input.attachmentRoot);
    if (fs.existsSync(locatorTarget)) {
      locator = readLocator(input.attachmentRoot, { allowTorn: true });
      if (locator.error || locator.torn || locator.records.length !== 1 || locator.value.record_digest !== input.expectedLocatorDigest) fail("RECOVERY_PRECONDITION_FAILED", "staged locator changed before cleanup");
      fs.unlinkSync(locatorTarget);
      if (process.platform !== "win32") syncDirectory(input.attachmentRoot);
    }
    crashIf("after-cleanup-delete", options.crashAt, options.onCrash);
    const finalPayload = { ...payload, pending_record_digest: committedPending.record_digest };
    const receipt = appendRecordUnlocked(input.controlRoot, state.records, { commandId: input.commandId + ":final", kind: "staged_locator_cleaned", payload: finalPayload }).record;
    crashIf("before-cleanup-output", options.crashAt, options.onCrash);
    return { command_id: input.commandId, final_record_digest: receipt.record_digest, locator_digest: input.expectedLocatorDigest, replayed: false };
  }, options);
}

function abandonStagedAuthority(input, options = {}) {
  if (!validProvenance(input.userProvenance) || !nonemptyString(input.commandId) || !nonemptyString(input.authorityId) || !validDigest(input.expectedGenesisDigest) || !(input.expectedForkDestinationDigest == null || validDigest(input.expectedForkDestinationDigest))) fail("RECOVERY_AUTHORIZATION_REQUIRED", "staged authority abandonment requires exact user provenance and genesis/destination digests");
  return withAuthorityLock(input.controlRoot, () => {
    const state = readAuthority(input.controlRoot, { allowTorn: false });
    assertNoPendingRecoveryIntent(input.controlRoot, state.records);
    const destinationIntents = state.records.filter((record) => record.kind === "attachment_fork_destination_intent");
    let destinationIntent = null;
    if (input.expectedForkDestinationDigest != null) {
      if (destinationIntents.length !== 1 || destinationIntents[0].record_digest !== input.expectedForkDestinationDigest) fail("RECOVERY_PRECONDITION_FAILED", "fork destination reservation changed");
      destinationIntent = destinationIntents[0];
    }
    const destinationOwner = destinationIntent?.command_id.slice(0, -":intent".length);
    if (destinationOwner && findCommand(state.records, destinationOwner + ":source-ready")) fail("RECOVERY_PRECONDITION_FAILED", "fork destination is already committed to creating the source intent");
    assertNoIncompleteAuthorityTransaction(state.records, destinationOwner ? [destinationOwner] : []);
    const genesis = state.records[0];
    if (genesis?.kind !== "authority_genesis" || genesis.payload?.authority_id !== input.authorityId || genesis.record_digest !== input.expectedGenesisDigest) fail("RECOVERY_PRECONDITION_FAILED", "staged authority genesis changed");
    const payload = { authority_id: input.authorityId, genesis_digest: input.expectedGenesisDigest, ...(destinationIntent ? { fork_destination_digest: destinationIntent.record_digest } : {}), user_provenance: input.userProvenance };
    const prior = findCommand(state.records, input.commandId);
    if (prior) {
      if (prior.kind !== "authority_staging_abandoned" || canonicalJson(prior.payload) !== canonicalJson(payload)) fail("COMMAND_CONFLICT", "abandon command id reused with different input");
      syncFile(authorityPath(input.controlRoot));
      return { ...receiptFor(prior, true), abandoned: true };
    }
    const stagingKinds = new Set(["authority_genesis", "attachment_stage_intent", "attachment_staged", "attachment_fork_destination_intent"]);
    const forbidden = state.records.some((record) => {
      if (record.kind === "authority_tail_recovered") {
        validateAuthorityRecoveryRecord(record, input.authorityId);
        return false;
      }
      return !stagingKinds.has(record.kind);
    });
    if (forbidden) fail("RECOVERY_PRECONDITION_FAILED", "authority has non-staging records");
    assertAuthoritySequenceCapacity(input.controlRoot, state.records, [{ commandId: input.commandId, kind: "authority_staging_abandoned", payload }], { allowEmergency: true });
    const receipt = appendRecordUnlocked(input.controlRoot, state.records, { commandId: input.commandId, kind: "authority_staging_abandoned", payload, crashAt: options.crashAt === "during-abandon-append" ? "during-append" : null, onCrash: options.onCrash, allowEmergency: true }).record;
    crashIf("before-abandon-output", options.crashAt, options.onCrash);
    return { ...receiptFor(receipt, false), abandoned: true };
  }, options);
}

const FORK_INTENT_FIELDS = ["attachment_id", "authority_id", "collision_record_digest", "expected_epoch", "expected_locator_digest", "new_attachment_id", "new_authority_id", "new_claim_token_digest", "new_control_root", "selected_path", "user_provenance"];
const FORK_RESOLUTION_FIELDS = ["collision_record_digest", "fork_intent_digest", "new_attachment_id", "new_authority_id", "new_final_digest", "new_locator_digest", "selected_anchor_id", "user_provenance"];
const FORK_ABORT_FIELDS = ["destination_abandonment_digest", "destination_intent_digest", "fork_intent_digest", "new_authority_id", "user_provenance"];

function forkIntentPayload(input) {
  return {
    attachment_id: input.attachmentId,
    authority_id: input.authorityId,
    collision_record_digest: input.collisionRecordDigest,
    expected_epoch: input.expectedEpoch,
    expected_locator_digest: input.expectedLocatorDigest,
    new_attachment_id: input.newAttachmentId,
    new_authority_id: input.newAuthorityId,
    new_claim_token_digest: sha256Hex(input.newClaimToken),
    new_control_root: path.resolve(input.newControlRoot),
    selected_path: path.resolve(input.attachmentRoot),
    user_provenance: input.userProvenance,
  };
}

function validateForkIntent(record, payload, commandId) {
  if (!record || record.kind !== "attachment_fork_intent" || record.command_id !== commandId + ":intent" || !exactKeys(record.payload, FORK_INTENT_FIELDS) || !samePayloadExceptPaths(record.payload, payload, ["selected_path"])) fail("COMMAND_CONFLICT", "fork intent conflicts with command input");
  return record;
}

const FORK_DESTINATION_FIELDS = ["fork_command_id", "new_attachment_id", "new_authority_id", "new_claim_token_digest", "new_locator_digest", "publication_command_id", "selected_anchor_id", "source_attachment_id", "source_authority_id", "source_locator_digest", "user_provenance"];

function forkDestinationPayload(input, publicationCommandId, selectedAnchor, newLocator) {
  return {
    fork_command_id: input.commandId,
    new_attachment_id: input.newAttachmentId,
    new_authority_id: input.newAuthorityId,
    new_claim_token_digest: sha256Hex(input.newClaimToken),
    new_locator_digest: newLocator.record_digest,
    publication_command_id: publicationCommandId,
    selected_anchor_id: selectedAnchor.id,
    source_attachment_id: input.attachmentId,
    source_authority_id: input.authorityId,
    source_locator_digest: input.expectedLocatorDigest,
    user_provenance: input.userProvenance,
  };
}

function validateForkDestinationIntent(record, payload, publicationCommandId) {
  if (!record || record.kind !== "attachment_fork_destination_intent" || record.command_id !== publicationCommandId + ":intent" || !exactKeys(record.payload, FORK_DESTINATION_FIELDS) || canonicalJson(record.payload) !== canonicalJson(payload)) fail("COMMAND_CONFLICT", "fork destination reservation conflicts with command input");
  return record;
}

const FORK_SOURCE_READY_FIELDS = ["destination_intent_digest", "fork_command_id", "user_provenance"];

function forkSourceReadyPayload(input, destinationIntent) {
  return { destination_intent_digest: destinationIntent.record_digest, fork_command_id: input.commandId, user_provenance: input.userProvenance };
}

function validateForkSourceReady(record, payload, publicationCommandId) {
  if (!record || record.kind !== "attachment_fork_source_ready" || record.command_id !== publicationCommandId + ":source-ready" || !exactKeys(record.payload, FORK_SOURCE_READY_FIELDS) || canonicalJson(record.payload) !== canonicalJson(payload)) fail("COMMAND_CONFLICT", "fork source-ready barrier conflicts with command input");
  return record;
}

function validateForkDestinationAbandonment(records, input, destinationIntent) {
  const genesis = records[0];
  const abandonment = records.find((record) => record.kind === "authority_staging_abandoned");
  if (!abandonment || genesis?.kind !== "authority_genesis" || genesis.payload?.authority_id !== input.newAuthorityId) return null;
  const expected = {
    authority_id: input.newAuthorityId,
    genesis_digest: genesis.record_digest,
    fork_destination_digest: destinationIntent.record_digest,
    user_provenance: abandonment.payload?.user_provenance,
  };
  if (!validProvenance(abandonment.payload?.user_provenance) || canonicalJson(abandonment.payload) !== canonicalJson(expected)) fail("PUBLICATION_CORRUPT", "fork destination abandonment does not match its reservation");
  return abandonment;
}

function forkAbortPayload(input, intentRecord, destinationIntent, abandonment) {
  return {
    destination_abandonment_digest: abandonment.record_digest,
    destination_intent_digest: destinationIntent.record_digest,
    fork_intent_digest: intentRecord.record_digest,
    new_authority_id: input.newAuthorityId,
    user_provenance: input.userProvenance,
  };
}

function validateForkAbort(record, payload, commandId) {
  if (!record || record.kind !== "attachment_fork_aborted" || record.command_id !== commandId + ":resolved" || !exactKeys(record.payload, FORK_ABORT_FIELDS) || canonicalJson(record.payload) !== canonicalJson(payload)) fail("COMMAND_CONFLICT", "fork abort resolution conflicts with command input");
  return record;
}

function prepareForkDestination(input, publicationCommandId) {
  const selectedAnchor = stableDirectoryAnchor(input.attachmentRoot);
  if (selectedAnchor.state !== "available") fail("ANCHOR_UNAVAILABLE", selectedAnchor.reason);
  const locator = readLocator(input.attachmentRoot, { allowTorn: true });
  if (locator.error || !locator.records.length) fail("LOCATOR_UNAVAILABLE", locator.error ?? "LOCATOR_EMPTY");
  const sourceIndex = locator.records.findIndex((record) => record.record_digest === input.expectedLocatorDigest);
  if (sourceIndex < 0 || sourceIndex < locator.records.length - 2) fail("RECOVERY_PRECONDITION_FAILED", "fork locator no longer contains the selected source claim");
  const source = locator.records[sourceIndex];
  const newLocator = makeLocatorRecord({ sequence: source.sequence + 1, previousDigest: source.record_digest, state: "claimed", authorityId: input.newAuthorityId, attachmentId: input.newAttachmentId, claimToken: input.newClaimToken, epoch: 1, anchorId: selectedAnchor.id });
  const payload = publicationPayload({ userProvenance: input.userProvenance, attachmentKind: "filesystem", authorityId: input.newAuthorityId, attachmentId: input.newAttachmentId, claimToken: input.newClaimToken, epoch: 1, anchorId: selectedAnchor.id, attachmentRoot: input.attachmentRoot, subjectRoot: input.attachmentRoot, stagedDigest: source.record_digest, claimedDigest: newLocator.record_digest, publicationCommandId });
  assertLocatorAppendCapacity(locator, newLocator);
  return { destinationPayload: forkDestinationPayload(input, publicationCommandId, selectedAnchor, newLocator), locator, newLocator, payload, selectedAnchor, source };
}

function forkIdentity(input, options = {}) {
  if (!validProvenance(input.userProvenance) || ![input.commandId, input.publicationCommandId, input.authorityId, input.attachmentId, input.claimToken, input.newControlRoot, input.newAuthorityId, input.newAttachmentId, input.newClaimToken].every(nonemptyString) || !validEpoch(input.expectedEpoch) || !validDigest(input.expectedLocatorDigest) || !(input.collisionRecordDigest === null || validDigest(input.collisionRecordDigest))) fail("RECOVERY_AUTHORIZATION_REQUIRED", "fork requires exact user provenance and optimistic old/new identity inputs");
  if ((input.attachmentKind ?? "filesystem") !== "filesystem") fail("UNSUPPORTED_FORK_PROVIDER", "the spike fork seam proves detached filesystem authorities");
  if (normalizedPath(path.resolve(input.controlRoot)) === normalizedPath(path.resolve(input.newControlRoot))) fail("LOCK_ORDER_VIOLATION", "filesystem fork requires a distinct new authority root");
  const intentPayload = forkIntentPayload(input);
  const publicationCommandId = input.commandId + ":new";
  let intentRecord;
  let destinationIntentRecord = null;
  let sourceReadyRecord = null;
  let destinationAbandonmentRecord = null;
  let newFinal;
  let newLocator;
  let selectedAnchor;

  const reserveSourceIntent = (commit) => withAuthorityLock(input.controlRoot, () => {
    const state = readAuthority(input.controlRoot, { allowTorn: false });
    assertNoPendingRecoveryIntent(input.controlRoot, state.records);
    assertAuthorityActive(state.records);
    const existingResolution = findCommand(state.records, input.commandId + ":resolved");
    const priorIntent = findCommand(state.records, input.commandId + ":intent");
    assertNoUnresolvedForkIntent(state.records, { authorityId: input.authorityId, attachmentId: input.attachmentId, expectedEpoch: input.expectedEpoch, exceptCommandId: input.commandId });
    assertNoIncompleteAuthorityTransaction(state.records, [input.commandId]);
    if (existingResolution) {
      intentRecord = validateForkIntent(priorIntent, intentPayload, input.commandId);
      if (existingResolution.kind === "attachment_fork_aborted") fail("FORK_DESTINATION_ABANDONED", "fork destination was abandoned before source-ready");
      return;
    }
    if (priorIntent) {
      intentRecord = validateForkIntent(priorIntent, intentPayload, input.commandId);
      return;
    }
    const current = latestClaimState(state.records, input.publicationCommandId, input.authorityId, input.attachmentId);
    if (current.state !== "claimed" || current.payload.epoch !== input.expectedEpoch || current.payload.claimed_locator_digest !== input.expectedLocatorDigest || current.payload.claim_token_digest !== sha256Hex(input.claimToken)) fail("RECOVERY_PRECONDITION_FAILED", "fork source claim changed");
    const collision = input.collisionRecordDigest
      ? state.records.find((record) => record.record_digest === input.collisionRecordDigest && record.kind === "attachment_collision" && record.payload?.authority_id === input.authorityId && record.payload?.attachment_id === input.attachmentId && record.payload?.epoch === input.expectedEpoch && record.payload?.publication_final_digest === current.final.record_digest)
      : null;
    if (input.collisionRecordDigest && !collision) fail("RECOVERY_PRECONDITION_FAILED", "fork requires the exact unresolved collision record");
    const locator = readLocator(input.attachmentRoot);
    if (locator.error || locator.value?.record_digest !== input.expectedLocatorDigest) fail("RECOVERY_PRECONDITION_FAILED", "selected fork locator is not the source claim");
    const anchor = stableDirectoryAnchor(input.attachmentRoot);
    if (anchor.state !== "available") fail("RECOVERY_PRECONDITION_FAILED", "selected fork anchor is unavailable");
    if (collision) {
      if (!collision.payload.anchor_ids.includes(anchor.id)) fail("RECOVERY_PRECONDITION_FAILED", "selected fork anchor is not part of the committed collision");
    } else {
      const oldAnchor = stableDirectoryAnchor(current.payload.attachment_path);
      const oldClaimStillReachable = oldAnchor.state === "available" && oldAnchor.id === current.payload.anchor_id;
      if (anchor.id === current.payload.anchor_id || oldClaimStillReachable) fail("RECOVERY_PRECONDITION_FAILED", "fork without collision requires an unprovable copy with the old claim anchor unavailable");
    }
    const reservedForkLocator = makeLocatorRecord({ sequence: locator.value.sequence + 1, previousDigest: locator.value.record_digest, state: "claimed", authorityId: input.newAuthorityId, attachmentId: input.newAttachmentId, claimToken: input.newClaimToken, epoch: 1, anchorId: anchor.id });
    const reservedResolutionKind = input.collisionRecordDigest ? "attachment_collision_resolved_by_fork" : "attachment_identity_forked";
    assertAuthoritySequenceCapacity(input.controlRoot, state.records, [
      { commandId: input.commandId + ":intent", kind: "attachment_fork_intent", payload: intentPayload },
      (projected) => { const reservedIntent = findCommand(projected, input.commandId + ":intent"); return { commandId: input.commandId + ":resolved", kind: reservedResolutionKind, payload: { collision_record_digest: input.collisionRecordDigest, fork_intent_digest: reservedIntent.record_digest, new_attachment_id: input.newAttachmentId, new_authority_id: input.newAuthorityId, new_final_digest: sha256Hex("reserved-fork-final"), new_locator_digest: reservedForkLocator.record_digest, selected_anchor_id: anchor.id, user_provenance: input.userProvenance } }; },
    ]);
    assertAuthoritySequenceCapacity(input.controlRoot, state.records, [
      { commandId: input.commandId + ":intent", kind: "attachment_fork_intent", payload: intentPayload },
      (projected) => { const reservedIntent = findCommand(projected, input.commandId + ":intent"); return { commandId: input.commandId + ":resolved", kind: "attachment_fork_aborted", payload: { destination_abandonment_digest: sha256Hex("reserved-destination-abandonment"), destination_intent_digest: sha256Hex("reserved-destination-intent"), fork_intent_digest: reservedIntent.record_digest, new_authority_id: input.newAuthorityId, user_provenance: input.userProvenance } }; },
    ]);
    if (!commit) return;
    intentRecord = appendRecordUnlocked(input.controlRoot, state.records, { commandId: input.commandId + ":intent", kind: "attachment_fork_intent", payload: intentPayload, crashAt: options.crashAt === "during-fork-source-intent" ? "during-append" : null, onCrash: options.onCrash }).record;
    crashIf("after-fork-intent", options.crashAt, options.onCrash);
  }, options);

  const abortSourceIntent = () => withAuthorityLock(input.controlRoot, () => {
    const state = readAuthority(input.controlRoot, { allowTorn: false });
    assertNoPendingRecoveryIntent(input.controlRoot, state.records);
    assertAuthorityActive(state.records);
    assertNoIncompleteAuthorityTransaction(state.records, [input.commandId]);
    const persistedIntent = validateForkIntent(findCommand(state.records, input.commandId + ":intent"), intentPayload, input.commandId);
    const payload = forkAbortPayload(input, persistedIntent, destinationIntentRecord, destinationAbandonmentRecord);
    const prior = findCommand(state.records, input.commandId + ":resolved");
    const allowEmergency = recoveredContinuationAfter(state.records, persistedIntent, input.authorityId);
    if (prior) validateForkAbort(prior, payload, input.commandId);
    else appendRecordUnlocked(input.controlRoot, state.records, { commandId: input.commandId + ":resolved", kind: "attachment_fork_aborted", payload, crashAt: options.crashAt === "during-fork-abort-resolution" ? "during-append" : null, onCrash: options.onCrash, allowEmergency });
  }, options);

  const stopIfDestinationAbandoned = () => {
    if (!destinationAbandonmentRecord) return;
    if (intentRecord) abortSourceIntent();
    fail("FORK_DESTINATION_ABANDONED", "fork destination was abandoned before source-ready");
  };

  reserveSourceIntent(false);

  withAuthorityLock(input.newControlRoot, () => {
    const state = readAuthority(input.newControlRoot, { allowTorn: false });
    assertNoPendingRecoveryIntent(input.newControlRoot, state.records);
    assertNoIncompleteAuthorityTransaction(state.records, [publicationCommandId]);
    const prepared = prepareForkDestination(input, publicationCommandId);
    selectedAnchor = prepared.selectedAnchor;
    newLocator = prepared.newLocator;
    const genesis = findCommand(state.records, "genesis:" + input.newAuthorityId);
    if (genesis && (genesis.kind !== "authority_genesis" || genesis.payload?.authority_id !== input.newAuthorityId || state.records[0] !== genesis)) fail("AUTHORITY_ID_MISMATCH", "fork destination authority genesis mismatch");
    let destinationIntent = findCommand(state.records, publicationCommandId + ":intent");
    if (destinationIntent) {
      destinationIntentRecord = validateForkDestinationIntent(destinationIntent, prepared.destinationPayload, publicationCommandId);
      destinationAbandonmentRecord = validateForkDestinationAbandonment(state.records, input, destinationIntentRecord);
      if (destinationAbandonmentRecord) return;
    }
    assertAuthorityActive(state.records);
    const allowedCommands = new Set(["genesis:" + input.newAuthorityId, publicationCommandId + ":intent", publicationCommandId + ":source-ready", publicationCommandId + ":pending", publicationCommandId + ":final"]);
    if (state.records.some((record) => !forkStagingRecordAllowed(record, allowedCommands, input.newAuthorityId))) fail("RECOVERY_PRECONDITION_FAILED", "new filesystem authority is not a fresh fork staging shard");
    if (!destinationIntent) {
      const steps = [
        { commandId: "genesis:" + input.newAuthorityId, kind: "authority_genesis", payload: { authority_id: input.newAuthorityId } },
        { commandId: publicationCommandId + ":intent", kind: "attachment_fork_destination_intent", payload: prepared.destinationPayload },
        (projected) => { const reservedDestination = findCommand(projected, publicationCommandId + ":intent"); return { commandId: publicationCommandId + ":source-ready", kind: "attachment_fork_source_ready", payload: forkSourceReadyPayload(input, reservedDestination) }; },
        { commandId: publicationCommandId + ":pending", kind: "attachment_claim_pending", payload: prepared.payload },
        (projected) => { const reservedPending = findCommand(projected, publicationCommandId + ":pending"); return { commandId: publicationCommandId + ":final", kind: "attachment_claimed", payload: { ...prepared.payload, pending_record_digest: reservedPending.record_digest } }; },
      ];
      if (genesis) steps.shift();
      assertAuthoritySequenceCapacity(input.newControlRoot, state.records, steps);
      if (!genesis) appendRecordUnlocked(input.newControlRoot, state.records, { commandId: "genesis:" + input.newAuthorityId, kind: "authority_genesis", payload: { authority_id: input.newAuthorityId }, crashAt: options.crashAt === "during-fork-destination-genesis" ? "during-append" : null, onCrash: options.onCrash });
      destinationIntent = appendRecordUnlocked(input.newControlRoot, state.records, { commandId: publicationCommandId + ":intent", kind: "attachment_fork_destination_intent", payload: prepared.destinationPayload, crashAt: options.crashAt === "during-fork-destination-intent" ? "during-append" : null, onCrash: options.onCrash }).record;
    }
    destinationIntentRecord = validateForkDestinationIntent(destinationIntent, prepared.destinationPayload, publicationCommandId);
  }, options);
  stopIfDestinationAbandoned();
  crashIf("after-fork-destination-intent", options.crashAt, options.onCrash);
  reserveSourceIntent(true);
  withAuthorityLock(input.newControlRoot, () => {
    const state = readAuthority(input.newControlRoot, { allowTorn: false });
    assertNoPendingRecoveryIntent(input.newControlRoot, state.records);
    assertNoIncompleteAuthorityTransaction(state.records, [publicationCommandId]);
    const prepared = prepareForkDestination(input, publicationCommandId);
    destinationIntentRecord = validateForkDestinationIntent(findCommand(state.records, publicationCommandId + ":intent"), prepared.destinationPayload, publicationCommandId);
    destinationAbandonmentRecord = validateForkDestinationAbandonment(state.records, input, destinationIntentRecord);
    if (destinationAbandonmentRecord) return;
    assertAuthorityActive(state.records);
    const readyPayload = forkSourceReadyPayload(input, destinationIntentRecord);
    const allowEmergency = recoveredContinuationAfter(state.records, destinationIntentRecord, input.newAuthorityId);
    let ready = findCommand(state.records, publicationCommandId + ":source-ready");
    if (!ready) ready = appendRecordUnlocked(input.newControlRoot, state.records, { commandId: publicationCommandId + ":source-ready", kind: "attachment_fork_source_ready", payload: readyPayload, crashAt: options.crashAt === "during-fork-source-ready" ? "during-append" : null, onCrash: options.onCrash, allowEmergency }).record;
    sourceReadyRecord = validateForkSourceReady(ready, readyPayload, publicationCommandId);
  }, options);
  stopIfDestinationAbandoned();
  crashIf("after-fork-source-ready", options.crashAt, options.onCrash);

  withAuthorityLock(input.newControlRoot, () => {
    const state = readAuthority(input.newControlRoot, { allowTorn: false });
    assertNoPendingRecoveryIntent(input.newControlRoot, state.records);
    assertAuthorityActive(state.records);
    assertNoIncompleteAuthorityTransaction(state.records, [publicationCommandId]);
    const allowedCommands = new Set(["genesis:" + input.newAuthorityId, publicationCommandId + ":intent", publicationCommandId + ":source-ready", publicationCommandId + ":pending", publicationCommandId + ":final"]);
    if (state.records.some((record) => !forkStagingRecordAllowed(record, allowedCommands, input.newAuthorityId))) fail("RECOVERY_PRECONDITION_FAILED", "new filesystem authority is not a fresh fork staging shard");
    const prepared = prepareForkDestination(input, publicationCommandId);
    selectedAnchor = prepared.selectedAnchor;
    newLocator = prepared.newLocator;
    const { locator, source } = prepared;
    let payload = prepared.payload;
    destinationIntentRecord = validateForkDestinationIntent(findCommand(state.records, publicationCommandId + ":intent"), prepared.destinationPayload, publicationCommandId);
    const readyPayload = forkSourceReadyPayload(input, destinationIntentRecord);
    sourceReadyRecord = validateForkSourceReady(findCommand(state.records, publicationCommandId + ":source-ready"), readyPayload, publicationCommandId);
    const allowEmergency = recoveredContinuationAfter(state.records, destinationIntentRecord, input.newAuthorityId);
    let pending = findCommand(state.records, publicationCommandId + ":pending");
    newFinal = findCommand(state.records, publicationCommandId + ":final");
    if (pending) {
      const priorPayload = validatePublicationPair(pending, newFinal);
      if (!samePayloadExceptPaths(priorPayload, payload)) fail("COMMAND_CONFLICT", "fork publication command conflicts with existing input");
      payload = priorPayload;
    }
    if (newFinal && (locator.torn || locator.value?.record_digest !== newLocator.record_digest)) fail("PUBLICATION_CONFLICT", "forked locator no longer matches finalized new authority");
    if (!pending) pending = appendRecordUnlocked(input.newControlRoot, state.records, { commandId: publicationCommandId + ":pending", kind: "attachment_claim_pending", payload, crashAt: options.crashAt === "during-fork-new-pending" ? "during-append" : null, onCrash: options.onCrash, allowEmergency }).record;
    crashIf("after-fork-new-pending", options.crashAt, options.onCrash);
    if (!newFinal) {
      if (locator.torn) {
        const tail = locator.raw.subarray(locator.validEndOffset);
        if (!isNonemptyPrefix(tail, recordFrame(newLocator))) fail("LOCATOR_TORN", "torn locator tail is not the expected fork frame");
        truncateDurably(locatorPath(input.attachmentRoot), locator.validEndOffset);
      }
      const latestDigest = locator.records.at(-1)?.record_digest;
      if (latestDigest === source.record_digest) appendLocatorFrame(locatorPath(input.attachmentRoot), recordFrame(newLocator), { crashAt: options.crashAt === "during-fork-locator" ? "during-append" : null, onCrash: options.onCrash });
      else if (latestDigest !== newLocator.record_digest) fail("PUBLICATION_CONFLICT", "locator changed during identity fork");
      const finalPayload = { ...payload, pending_record_digest: pending.record_digest };
      newFinal = appendRecordUnlocked(input.newControlRoot, state.records, { commandId: publicationCommandId + ":final", kind: "attachment_claimed", payload: finalPayload, crashAt: options.crashAt === "during-fork-new-final" ? "during-append" : null, onCrash: options.onCrash, allowEmergency }).record;
    }
    crashIf("after-fork-new-final", options.crashAt, options.onCrash);
  }, options);

  let resolution;
  let replayed = false;
  withAuthorityLock(input.controlRoot, () => {
    const state = readAuthority(input.controlRoot, { allowTorn: false });
    assertNoPendingRecoveryIntent(input.controlRoot, state.records);
    assertAuthorityActive(state.records);
    assertNoIncompleteAuthorityTransaction(state.records, [input.commandId]);
    const persistedIntent = validateForkIntent(findCommand(state.records, input.commandId + ":intent"), intentPayload, input.commandId);
    const payload = { collision_record_digest: input.collisionRecordDigest, fork_intent_digest: persistedIntent.record_digest, new_attachment_id: input.newAttachmentId, new_authority_id: input.newAuthorityId, new_final_digest: newFinal.record_digest, new_locator_digest: newLocator.record_digest, selected_anchor_id: selectedAnchor.id, user_provenance: input.userProvenance };
    const resolutionKind = input.collisionRecordDigest ? "attachment_collision_resolved_by_fork" : "attachment_identity_forked";
    const prior = findCommand(state.records, input.commandId + ":resolved");
    const allowEmergency = recoveredContinuationAfter(state.records, persistedIntent, input.authorityId);
    if (prior) {
      if (prior.kind !== resolutionKind || !exactKeys(prior.payload, FORK_RESOLUTION_FIELDS) || canonicalJson(prior.payload) !== canonicalJson(payload)) fail("COMMAND_CONFLICT", "fork resolution conflicts with command input");
      resolution = prior;
      replayed = true;
    } else resolution = appendRecordUnlocked(input.controlRoot, state.records, { commandId: input.commandId + ":resolved", kind: resolutionKind, payload, crashAt: options.crashAt === "during-fork-resolution" ? "during-append" : null, onCrash: options.onCrash, allowEmergency }).record;
    crashIf("before-fork-output", options.crashAt, options.onCrash);
  }, options);
  return { command_id: input.commandId, fork_intent_digest: intentRecord.record_digest, new_final_digest: newFinal.record_digest, resolution_digest: resolution.record_digest, new_locator_digest: newLocator.record_digest, replayed };
}
function observeGitAdminLink(subjectRoot) {
  const link = path.join(subjectRoot, ".git");
  try {
    const stat = fs.lstatSync(link, { bigint: true });
    if (stat.isDirectory()) {
      const anchor = stableDirectoryAnchor(link);
      return anchor.state === "available" ? { state: "available", kind: "directory", anchor_id: anchor.id } : { state: "unavailable", reason: anchor.reason };
    }
    if (!stat.isFile() || stat.size > 4096n) return { state: "unavailable", reason: "GIT_LINK_UNSUPPORTED" };
    const bytes = fs.readFileSync(link);
    return { state: "available", kind: "file", bytes: bytes.length, digest: sha256Hex(bytes), device: String(stat.dev), inode: String(stat.ino), birthtime_ns: String(stat.birthtimeNs) };
  } catch (error) { return { state: "unavailable", reason: error?.code ?? "GIT_LINK_UNREADABLE" }; }
}

function routeAttachmentUnlocked({ controlRoot, attachmentRoots, subjectRoots = attachmentRoots, gitPairMatches = [], gitLinkObservations = [], anchorObservations = [], authorityId, attachmentId, claimToken, commandId }) {
  const state = readAuthority(controlRoot, { allowTorn: false });
  assertNoPendingRecoveryIntent(controlRoot, state.records);
  assertAuthorityActive(state.records);
  let claim;
  try { claim = latestClaimState(state.records, commandId, authorityId, attachmentId); }
  catch (error) { return { state: "uncertain", reason: error.code ?? "PUBLICATION_CORRUPT", clean_evidence: false }; }
  if (claim.state !== "claimed") return { state: "pending", clean_evidence: false };
  const { payload, final } = claim;
  if (payload.claim_token_digest !== sha256Hex(claimToken)) return { state: "uncertain", reason: "AUTHORITY_MISMATCH", clean_evidence: false };
  const unresolvedCollision = state.records
    .filter((record) => record.kind === "attachment_collision" && record.payload?.attachment_id === attachmentId && record.payload?.authority_id === authorityId && record.payload?.epoch === payload.epoch && record.payload?.publication_final_digest === final.record_digest)
    .find((collision) => !state.records.some((record) => record.kind === "attachment_collision_resolved_by_fork" && record.payload?.collision_record_digest === collision.record_digest));
  if (unresolvedCollision) return { state: "collision", anchors: unresolvedCollision.payload.anchor_ids, collision_record_digest: unresolvedCollision.record_digest, clean_evidence: false };
  const observed = new Map();
  let anchorUnprovable = false;
  let locatorUncertain = false;
  for (const [index, root] of attachmentRoots.entries()) {
    const subjectRoot = subjectRoots[index] ?? root;
    const preSubject = anchorObservations[index]?.subject ?? { state: "unavailable" };
    if (preSubject.state !== "available") { if (fs.existsSync(subjectRoot)) anchorUnprovable = true; continue; }
    const liveSubject = stableDirectoryAnchor(subjectRoot);
    if (liveSubject.state !== "available" || liveSubject.id !== preSubject.id) { if (fs.existsSync(subjectRoot)) anchorUnprovable = true; continue; }
    if (payload.attachment_kind === "git") {
      if (gitPairMatches[index] !== true || gitLinkObservations[index]?.state !== "available") continue;
      if (canonicalJson(observeGitAdminLink(subjectRoot)) !== canonicalJson(gitLinkObservations[index])) { anchorUnprovable = true; continue; }
    }
    const locator = readLocator(root);
    if (locator.error) { locatorUncertain = true; continue; }
    if (locator.value?.state !== "claimed") continue;
    const value = locator.value;
    if (value.authority_id !== authorityId || value.attachment_id !== attachmentId || sha256Hex(value.claim_token) !== payload.claim_token_digest || value.epoch !== payload.epoch || value.record_digest !== payload.claimed_locator_digest) continue;
    const preAnchor = anchorObservations[index]?.attachment ?? { state: "unavailable" };
    if (preAnchor.state !== "available") { if (fs.existsSync(root)) anchorUnprovable = true; continue; }
    const anchor = stableDirectoryAnchor(root);
    if (anchor.state === "available" && anchor.id === preAnchor.id) observed.set(anchor.id, { anchor, root });
    else if (fs.existsSync(root)) anchorUnprovable = true;
  }
  if (locatorUncertain) return { state: "uncertain", reason: "LOCATOR_UNREADABLE", clean_evidence: false };
  if (observed.size > 1) {
    const anchors = [...observed.keys()].sort();
    const collisionPayload = { anchor_ids: anchors, attachment_id: attachmentId, authority_id: authorityId, epoch: payload.epoch, publication_final_digest: final.record_digest };
    const collisionCommand = "collision:" + attachmentId + ":" + payload.epoch + ":" + sha256Hex(canonicalJson(anchors));
    assertNoIncompleteAuthorityTransaction(state.records);
    const collision = appendRecordUnlocked(controlRoot, state.records, { commandId: collisionCommand, kind: "attachment_collision", payload: collisionPayload }).record;
    return { state: "collision", anchors, collision_record_digest: collision.record_digest, clean_evidence: false };
  }
  if (observed.size === 0) return anchorUnprovable ? { state: "reattach_required", reason: "ANCHOR_UNAVAILABLE", clean_evidence: false } : { state: "unavailable", clean_evidence: false };
  const only = [...observed.values()][0];
  if (only.anchor.id !== payload.anchor_id) return { state: "reattach_required", clean_evidence: false };
  return { state: "claimed", anchor_id: only.anchor.id, clean_evidence: true };
}

function routeAttachment(input, options = {}) {
  try {
    const subjectRoots = input.subjectRoots ?? input.attachmentRoots;
    const resolver = options.anchorResolver ?? stableDirectoryAnchor;
    const anchorObservations = input.attachmentRoots.map((attachmentRoot, index) => ({
      attachment: { ...resolver(attachmentRoot) },
      subject: { ...resolver(subjectRoots[index] ?? attachmentRoot) },
    }));
    const gitLinkObservations = subjectRoots.map((subjectRoot) => ({ ...observeGitAdminLink(subjectRoot) }));
    const gitPairMatches = input.attachmentRoots.map((attachmentRoot, index) => {
      const subjectRoot = subjectRoots[index] ?? attachmentRoot;
      if (anchorObservations[index].subject.state !== "available") return false;
      const actualGitDir = gitQuery(subjectRoot, "--git-dir");
      if (!actualGitDir) return false;
      const expected = canonicalCandidate(attachmentRoot);
      const actual = canonicalCandidate(actualGitDir);
      return expected.state === "resolved" && actual.state === "resolved" && normalizedPath(expected.value) === normalizedPath(actual.value);
    });
    options.beforeAuthorityLock?.();
    return withAuthorityLock(input.controlRoot, () => routeAttachmentUnlocked({ ...input, subjectRoots, gitPairMatches, gitLinkObservations, anchorObservations }), options);
  } catch (error) { return { state: "uncertain", reason: error.code ?? "AUTHORITY_UNREADABLE", clean_evidence: false }; }
}

function canonicalCandidate(target) {
  const absolute = path.resolve(target);
  let cursor = absolute;
  const tail = [];
  for (;;) {
    try {
      const stat = fs.lstatSync(cursor);
      if (stat.isSymbolicLink()) {
        try { return { state: "resolved", value: path.join(fs.realpathSync(cursor), ...tail.reverse()) }; }
        catch { return { state: "uncertain", reason: "BROKEN_SYMLINK" }; }
      }
      return { state: "resolved", value: path.join(fs.realpathSync(cursor), ...tail.reverse()) };
    } catch (error) {
      if (error?.code !== "ENOENT") return { state: "uncertain", reason: error?.code ?? "CANONICALIZE_FAILED" };
      const parent = path.dirname(cursor);
      if (parent === cursor) return { state: "uncertain", reason: "NO_EXISTING_ANCESTOR" };
      tail.push(path.basename(cursor));
      cursor = parent;
    }
  }
}

function caseInsensitiveFilesystem(target) {
  let cursor = nearestExisting(target);
  while (cursor) {
    const base = path.basename(cursor);
    const index = [...base].findIndex((character) => character.toLowerCase() !== character.toUpperCase());
    if (index >= 0) {
      const character = base[index];
      const toggled = base.slice(0, index) + (character === character.toUpperCase() ? character.toLowerCase() : character.toUpperCase()) + base.slice(index + 1);
      const variant = path.join(path.dirname(cursor), toggled);
      const originalId = filesystemObjectId(cursor);
      const variantId = filesystemObjectId(variant);
      return Boolean(originalId && variantId && originalId === variantId);
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) return false;
    cursor = parent;
  }
  return false;
}

function normalizedPath(value, platform = process.platform) {
  const normalized = path.normalize(value);
  return platform === "win32" || caseInsensitiveFilesystem(value) ? normalized.toLowerCase() : normalized;
}

function filesystemObjectId(target) {
  try {
    const stat = fs.statSync(target, { bigint: true });
    return String(stat.dev) + ":" + String(stat.ino) + ":" + String(stat.birthtimeNs);
  } catch { return null; }
}

function nearestExisting(target) {
  let cursor = path.resolve(target);
  for (;;) {
    if (filesystemObjectId(cursor)) return cursor;
    const parent = path.dirname(cursor);
    if (parent === cursor) return null;
    cursor = parent;
  }
}

function containsByFilesystemIdentity(container, candidate) {
  const containerId = filesystemObjectId(container);
  let cursor = nearestExisting(candidate);
  if (!containerId || !cursor) return false;
  for (;;) {
    if (filesystemObjectId(cursor) === containerId) return true;
    const parent = path.dirname(cursor);
    if (parent === cursor) return false;
    cursor = parent;
  }
}

function intersects(first, second) {
  const left = normalizedPath(first);
  const right = normalizedPath(second);
  const relative = path.relative(left, right);
  const reverse = path.relative(right, left);
  const inside = (value) => value === "" || (!value.startsWith(".." + path.sep) && value !== ".." && !path.isAbsolute(value));
  return inside(relative) || inside(reverse) || containsByFilesystemIdentity(first, second) || containsByFilesystemIdentity(second, first);
}

function targetInsideControl(candidate, control) {
  const requested = normalizedPath(candidate);
  const protectedPath = normalizedPath(control);
  const relative = path.relative(protectedPath, requested);
  const inside = relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative));
  return inside || containsByFilesystemIdentity(control, candidate);
}

function classifyControlTargets(targets, controlRoots) {
  const roots = [...new Set(controlRoots)].map(canonicalCandidate);
  return targets.map((target) => {
    const candidate = canonicalCandidate(target);
    if (candidate.state !== "resolved" || roots.some((root) => root.state !== "resolved")) return { target, classification: "uncertain" };
    return { target, classification: roots.some((root) => targetInsideControl(candidate.value, root.value)) ? "control" : "clean" };
  });
}

function protectedControlRoots({ gitCommonDir = null, gitDir = null, worktreeRoot = null, attachmentRoot = null, homeRoot }) {
  const roots = [];
  if (gitCommonDir) roots.push(gitCommonDir);
  if (gitDir) roots.push(gitDir);
  if (worktreeRoot) roots.push(path.join(worktreeRoot, ".git"), path.join(worktreeRoot, ".workloop"));
  if (attachmentRoot) roots.push(path.join(attachmentRoot, ".workloop"), locatorPath(attachmentRoot));
  if (homeRoot) {
    const base = path.join(homeRoot, ".workloop");
    roots.push(base);
    for (const name of ["authorities", "outcomes", "archive", "locks"]) roots.push(path.join(base, name));
  }
  return roots;
}

function existingDirectory(target) {
  let cursor = path.resolve(target);
  for (;;) {
    try {
      const stat = fs.statSync(cursor);
      if (stat.isDirectory()) return cursor;
      return path.dirname(cursor);
    } catch {
      const parent = path.dirname(cursor);
      if (parent === cursor) return null;
      cursor = parent;
    }
  }
}

function gitQuery(cwd, argument) {
  assertOutsideAuthority("Git discovery");
  const result = spawnSync("git", ["-C", cwd, "rev-parse", "--path-format=absolute", argument], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function resolveTargetProvider({ target, homeRoot, filesystemAttachments = [] }) {
  const cwd = existingDirectory(target);
  if (!cwd) return { state: "unavailable" };
  const discoveredGitDir = gitQuery(cwd, "--absolute-git-dir");
  if (discoveredGitDir && classifyControlTargets([target], [discoveredGitDir])[0].classification !== "clean") return { state: "control" };
  const worktreeRoot = gitQuery(cwd, "--show-toplevel");
  if (worktreeRoot) {
    const gitCommonDir = gitQuery(cwd, "--git-common-dir");
    const gitDir = gitQuery(cwd, "--git-dir");
    const controls = protectedControlRoots({ gitCommonDir, gitDir, worktreeRoot, homeRoot });
    const classification = classifyControlTargets([target], controls)[0].classification;
    if (classification !== "clean") return { state: classification };
    const overlapsFilesystem = filesystemAttachments.some((entry) => {
      const candidate = canonicalCandidate(entry.root);
      const requested = canonicalCandidate(target);
      return candidate.state === "resolved" && requested.state === "resolved" && intersects(candidate.value, requested.value);
    });
    if (overlapsFilesystem) return { state: "transition_required", reason: "FILESYSTEM_ROOT_BECAME_GIT" };
    return { state: "resolved", provider: "git_common", authority_root: path.join(gitCommonDir, "workloop"), attachment_root: gitDir, worktree_root: worktreeRoot };
  }
  const homeControls = protectedControlRoots({ homeRoot });
  const homeClassification = classifyControlTargets([target], homeControls)[0].classification;
  if (homeClassification !== "clean") return { state: homeClassification };
  const matches = filesystemAttachments.filter((entry) => {
    const root = canonicalCandidate(entry.root);
    const requested = canonicalCandidate(target);
    if (root.state !== "resolved" || requested.state !== "resolved") return false;
    const relative = path.relative(normalizedPath(root.value), normalizedPath(requested.value));
    return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
  });
  if (matches.length !== 1) return { state: matches.length ? "uncertain" : "unavailable", reason: matches.length ? "OVERLAPPING_FILESYSTEM_AUTHORITIES" : undefined };
  const controls = protectedControlRoots({ attachmentRoot: matches[0].root, homeRoot });
  const classification = classifyControlTargets([target], controls)[0].classification;
  if (classification !== "clean") return { state: classification };
  return { state: "resolved", provider: "filesystem_detached", authority_root: matches[0].controlRoot, attachment_root: matches[0].root };
}

function appendTelemetry(target, payload) {
  assertOutsideAuthority("telemetry publication");
  appendFrame(target, Buffer.from(canonicalJson(payload) + "\n"));
}

function hookTargets(invocation) {
  const values = [];
  const input = invocation.toolInput ?? {};
  for (const key of ["file_path", "path", "target", "target_path"]) if (nonemptyString(input[key])) values.push(input[key]);
  for (const key of ["files", "paths", "targets"]) if (Array.isArray(input[key])) for (const value of input[key]) if (nonemptyString(value)) values.push(value);
  return [...new Set(values.map((value) => path.resolve(invocation.repo, value)))];
}

function runPublicHook({ profile, payload, homeRoot, filesystemAttachments = [], claims = [], telemetryPath = null }) {
  const invocation = decodeHook({ profile, payload });
  if (!["pre_tool_use", "post_tool_use", "post_tool_use_failure", "stop"].includes(invocation.event)) {
    return { clean_evidence: false, routing_state: "uncertain", routing_reason: "UNSUPPORTED_HOOK_EVENT", wire: { stdout: "", stderr: "", exitCode: 0 } };
  }
  const targets = hookTargets(invocation);
  let routingInput;
  let routingOverride = null;
  if (targets.length !== 1) routingOverride = { state: "uncertain", reason: targets.length ? "MULTI_TARGET_ROUTING_UNPROVEN" : "TARGET_UNAVAILABLE", clean_evidence: false };
  else {
    const provider = resolveTargetProvider({ target: targets[0], homeRoot, filesystemAttachments });
    if (provider.state !== "resolved") routingOverride = { state: provider.state === "control" ? "control" : "uncertain", reason: provider.reason ?? ("PROVIDER_" + String(provider.state).toUpperCase()), clean_evidence: false };
    else {
      const claim = claims.find((entry) => normalizedPath(path.resolve(entry.controlRoot)) === normalizedPath(path.resolve(provider.authority_root)) && normalizedPath(path.resolve(entry.attachmentRoot)) === normalizedPath(path.resolve(provider.attachment_root)));
      if (!claim) routingOverride = { state: "uncertain", reason: "CLAIM_CONTEXT_UNAVAILABLE", clean_evidence: false };
      else routingInput = { ...claim, controlRoot: provider.authority_root, attachmentRoots: [provider.attachment_root], subjectRoots: [provider.worktree_root ?? provider.attachment_root] };
    }
  }
  return runDefaultHook({ profile, event: invocation.event, routingInput, routingOptions: {}, telemetryPath, routingOverride });
}

function runDefaultHook({ profile, event, routingInput, routingOptions = {}, targets = [], controlContext = null, telemetryPath = null, routingOverride = null }) {
  let routing = routingOverride;
  try {
    if (!routing && targets.length && !controlContext) routing = { state: "uncertain", reason: "CONTROL_CONTEXT_UNAVAILABLE", clean_evidence: false };
    else if (!routing && controlContext && targets.length) {
      const roots = protectedControlRoots(controlContext);
      const classified = classifyControlTargets(targets, roots);
      if (classified.some((item) => item.classification !== "clean")) routing = { state: classified.some((item) => item.classification === "control") ? "control" : "uncertain", clean_evidence: false };
    }
    if (!routing) routing = routeAttachment(routingInput, routingOptions);
    if (telemetryPath) {
      try { appendTelemetry(telemetryPath, { event, routing_state: routing.state }); }
      catch { routing = { state: "telemetry_failure", clean_evidence: false }; }
    }
  } catch (error) {
    routing = { state: "uncertain", reason: error.code ?? "HOOK_FAILURE", clean_evidence: false };
  }
  let disposition;
  if (event === "pre_tool_use") disposition = { event, action: "pass" };
  else if (event === "stop") disposition = { event, action: "release" };
  else if (["post_tool_use", "post_tool_use_failure"].includes(event)) disposition = { event, action: "record" };
  else fail("UNSUPPORTED_HOOK_EVENT", "unsupported Hook event: " + event);
  return {
    clean_evidence: routing.state === "claimed" && routing.clean_evidence === true,
    routing_state: routing.state,
    routing_reason: routing.reason ?? null,
    wire: encodeHook({ invocation: { profile, mode: "nudge", event }, disposition }),
  };
}

export {
  AUTHORITY_EMERGENCY_BYTES,
  AUTHORITY_MAX_FRAME_BYTES,
  AUTHORITY_MAX_BYTES,
  AUTHORITY_MAX_RECORDS,
  AUTHORITY_FILE,
  LOCATOR_FILE,
  appendAuthority,
  abandonStagedAuthority,
  appendFrame,
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
  recoverAttachment,
  recoverStagedLocator,
  reattachAttachment,
  recoverTornAuthority,
  resolveTargetProvider,
  routeAttachment,
  runDefaultHook,
  runPublicHook,
  stableDirectoryAnchor,
  stableDirectoryAnchorFromStats,
  stagedLocatorState,
  stageAttachment,
  validatePublicationPair,
  withAuthorityLock,
  withLockContext,
};
