import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { CURRENT_AUTHORITY_EVENT_PAYLOAD_FIELDS, canonicalJson, hasExactKeys, isPlainObject, sha256Hex } from "./prims.mjs";

const AUTHORITY_SCHEMA_VERSION = 1;
const MAX_AUTHORITY_BYTES = 4 * 1024 * 1024;
const MAX_RECORD_BYTES = 64 * 1024;

function fail(code, message, cause = undefined) {
  throw Object.assign(new Error(message, cause === undefined ? undefined : { cause }), { code });
}
function nonempty(value) { return typeof value === "string" && value.trim().length > 0; }
function recordDigest(record) { const { record_digest: ignored, ...unsigned } = record; return sha256Hex(canonicalJson(unsigned)); }
function syncDirectory(directory) {
  if (process.platform === "win32") return;
  const descriptor = fs.openSync(directory, "r");
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}
function ensureParent(target) {
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  syncDirectory(path.dirname(target));
}
function writeAll(descriptor, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const written = fs.writeSync(descriptor, bytes, offset, bytes.length - offset, null);
    if (!Number.isSafeInteger(written) || written <= 0) fail("SHORT_WRITE", "recovery write made no progress");
    offset += written;
  }
}
function appendFrame(target, frame, { exclusive = false } = {}) {
  if (!Buffer.isBuffer(frame) || !frame.length || frame.at(-1) !== 0x0a || frame.length > MAX_RECORD_BYTES) fail("INVALID_FRAME", "recovery frame is invalid or too large");
  ensureParent(target);
  const descriptor = fs.openSync(target, exclusive ? "ax" : "a", 0o600);
  try { writeAll(descriptor, frame); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
  syncDirectory(path.dirname(target));
}
function truncateDurably(target, length) {
  const descriptor = fs.openSync(target, "r+");
  try { fs.ftruncateSync(descriptor, length); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
  syncDirectory(path.dirname(target));
}
function readFramed(target, { missing = false, maxBytes = MAX_AUTHORITY_BYTES } = {}) {
  let raw;
  try {
    const stat = fs.statSync(target);
    if (stat.size > maxBytes) fail("JOURNAL_LIMIT_EXCEEDED", "journal exceeds bounded replay size");
    raw = fs.readFileSync(target);
  } catch (cause) {
    if (missing && cause?.code === "ENOENT") return { raw: Buffer.alloc(0), records: [], validEndOffset: 0, torn: false };
    throw cause;
  }
  const lastNewline = raw.lastIndexOf(0x0a);
  const validEndOffset = lastNewline < 0 ? 0 : lastNewline + 1;
  const torn = validEndOffset !== raw.length;
  let records;
  try { records = raw.subarray(0, validEndOffset).toString("utf8").split("\n").filter(Boolean).map(JSON.parse); }
  catch (cause) { fail("AUTHORITY_CORRUPT", "authority contains invalid complete JSON", cause); }
  return { raw, records, validEndOffset, torn };
}
function validateRecords(records, evolve) {
  let previous = null;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const fields = CURRENT_AUTHORITY_EVENT_PAYLOAD_FIELDS[record?.kind];
    if (!isPlainObject(record) || !hasExactKeys(record, ["authority_schema_version", "sequence", "previous_digest", "record_id", "command_id", "kind", "payload", "record_digest"]) ||
      !fields || !isPlainObject(record.payload) || !hasExactKeys(record.payload, fields) ||
      record.authority_schema_version !== AUTHORITY_SCHEMA_VERSION || record.sequence !== index + 1 ||
      record.previous_digest !== previous || record.record_digest !== recordDigest(record)) {
      fail("AUTHORITY_CORRUPT", `authority record ${index + 1} violates the persisted-record contract`);
    }
    previous = record.record_digest;
  }
  evolve(null, records);
  return records;
}
function recoveryIntentPath(authorityRoot, commandId) {
  return path.join(authorityRoot, "recovery", createHash("sha256").update(commandId).digest("hex") + ".jsonl");
}
function recoveryPayload({ authorityId, expectedValidEndOffset, expectedTailDigest, grantedBy, reason }) {
  return {
    authority_id: authorityId,
    valid_end_offset: expectedValidEndOffset,
    discarded_sha256: expectedTailDigest,
    granted_by: grantedBy,
    reason,
  };
}
function deterministicUuid(commandId, payload) {
  const hex = createHash("sha256").update(`${commandId}\0${canonicalJson(payload)}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function recoveryRecord(records, commandId, payload) {
  const unsigned = {
    authority_schema_version: AUTHORITY_SCHEMA_VERSION,
    sequence: records.length + 1,
    previous_digest: records.at(-1)?.record_digest ?? null,
    record_id: deterministicUuid(commandId, payload),
    command_id: commandId,
    kind: "authority_tail_recovered",
    payload,
  };
  return Object.freeze({ ...unsigned, record_digest: recordDigest(unsigned) });
}
function expectedIntent(input, authorityId) {
  return {
    recovery_schema_version: 1,
    command_id: input.commandId,
    authority_id: authorityId,
    expected_valid_end_offset: input.expectedValidEndOffset,
    expected_tail_digest: input.expectedTailDigest,
    granted_by: input.grantedBy,
    reason: input.reason,
  };
}
function exactIntent(value, expected) {
  return isPlainObject(value) && canonicalJson(value) === canonicalJson(expected);
}
function isNonemptyPrefix(candidate, expected) {
  return candidate.length > 0 && candidate.length < expected.length && expected.subarray(0, candidate.length).equals(candidate);
}
function removeIntent(target) {
  try { fs.unlinkSync(target); syncDirectory(path.dirname(target)); }
  catch (cause) { if (cause?.code !== "ENOENT") throw cause; }
}

function pathInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
function canonicalFuturePath(target) {
  const requested = path.resolve(target);
  let cursor = requested;
  for (;;) {
    try { return path.resolve(fs.realpathSync.native(cursor), path.relative(cursor, requested)); }
    catch (cause) {
      if (cause?.code !== "ENOENT" && cause?.code !== "ENOTDIR") throw cause;
      const parent = path.dirname(cursor);
      if (parent === cursor) return requested;
      cursor = parent;
    }
  }
}
function writeDurably(target, bytes) {
  ensureParent(target);
  const descriptor = fs.openSync(target, "wx", 0o600);
  try { writeAll(descriptor, bytes); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}
function exportAuthorityArtifact(input) {
  if (!nonempty(input.destination) || input.grantedBy !== "user" || !nonempty(input.reason)) {
    fail("EXPORT_AUTHORIZATION_REQUIRED", "authority export requires a new output path, user provenance, and reason");
  }
  const destination = canonicalFuturePath(input.destination);
  if ((input.forbiddenRoots ?? []).some((root) => nonempty(root) && pathInside(root, destination))) {
    fail("INVALID_EXPORT_DESTINATION", "authority export destination must be outside the live authority and claimed data roots");
  }
  return input.lockManager.withLock("maintenance", input.authorityRoot, () => {
    const state = readFramed(input.journalPath);
    if (state.torn) fail("AUTHORITY_TORN", "authority has a torn tail");
    validateRecords(state.records, input.evolve);
    const genesis = state.records[0];
    if (!genesis || genesis.kind !== "authority_genesis") fail("AUTHORITY_UNAVAILABLE", "authority export requires a verified genesis");
    if (fs.existsSync(destination)) fail("EXPORT_DESTINATION_EXISTS", "authority export destination already exists");
    const parent = path.dirname(destination);
    fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
    const temporary = `${destination}.tmp.${process.pid}.${randomUUID()}`;
    try {
      fs.mkdirSync(temporary, { mode: 0o700 });
      const authorityTarget = path.join(temporary, "authority.jsonl");
      writeDurably(authorityTarget, state.raw);
      const manifestValue = {
        export_schema_version: 1,
        authority_id: genesis.payload.authority_id,
        provider: genesis.payload.provider,
        authority_sequence: state.records.length,
        source_authority_root: path.resolve(input.authorityRoot),
        authority_sha256: sha256Hex(state.raw),
        authority_bytes: state.raw.length,
        granted_by: "user",
        reason: input.reason.trim(),
      };
      writeDurably(path.join(temporary, "manifest.json"), Buffer.from(`${JSON.stringify(manifestValue, null, 2)}\n`));
      syncDirectory(temporary);
      fs.renameSync(temporary, destination);
      syncDirectory(parent);
      return { exported: true, export_path: destination, ...manifestValue };
    } catch (cause) {
      try { fs.rmSync(temporary, { recursive: true, force: true }); } catch { /* owned unpublished staging is disposable */ }
      throw cause;
    }
  });
}

function recoverAuthorityTail(input) {
  const { authorityRoot, journalPath, lockManager, evolve } = input;
  if (!nonempty(input.commandId) || input.grantedBy !== "user" || !nonempty(input.reason) ||
    !Number.isSafeInteger(input.expectedValidEndOffset) || input.expectedValidEndOffset < 0 ||
    !/^sha256:[0-9a-f]{64}$/u.test(String(input.expectedTailDigest ?? ""))) {
    fail("RECOVERY_AUTHORIZATION_REQUIRED", "torn-tail recovery requires command identity, exact tail proof, user provenance, and reason");
  }
  return lockManager.withLock("authority", authorityRoot, () => {
    let state = readFramed(journalPath);
    validateRecords(state.records, evolve);
    const genesis = state.records[0];
    if (!genesis || genesis.kind !== "authority_genesis") fail("RECOVERY_PRECONDITION_FAILED", "torn-tail recovery requires an intact authority genesis");
    const authorityId = genesis.payload.authority_id;
    if (nonempty(input.expectedAuthorityId) && input.expectedAuthorityId !== authorityId) fail("AUTHORITY_ID_MISMATCH", "torn-tail recovery selector does not match the intact authority genesis");
    const payload = recoveryPayload({ ...input, authorityId });
    const record = recoveryRecord(state.records, input.commandId, payload);
    const frame = Buffer.from(`${canonicalJson(record)}\n`);
    const prior = state.records.find((item) => item.command_id === input.commandId) ?? null;
    const intent = expectedIntent(input, authorityId);
    const intentTarget = recoveryIntentPath(authorityRoot, input.commandId);
    const intentFrame = Buffer.from(`${canonicalJson(intent)}\n`);
    if (prior) {
      if (prior.kind !== record.kind || canonicalJson(prior.payload) !== canonicalJson(payload)) fail("COMMAND_CONFLICT", "torn-tail recovery command conflicts with authority history");
      removeIntent(intentTarget);
      return { command_id: input.commandId, authority_id: authorityId, repaired: true, replayed: true, receipt_digest: prior.record_digest, authority_sequence: prior.sequence };
    }

    let persistedIntent = readFramed(intentTarget, { missing: true, maxBytes: MAX_RECORD_BYTES });
    if (persistedIntent.torn) {
      if (persistedIntent.records.length || !isNonemptyPrefix(persistedIntent.raw, intentFrame)) fail("RECOVERY_INTENT_CORRUPT", "partial recovery intent does not match this command");
      truncateDurably(intentTarget, 0);
      appendFrame(intentTarget, intentFrame);
      persistedIntent = readFramed(intentTarget, { maxBytes: MAX_RECORD_BYTES });
    } else if (!persistedIntent.records.length) {
      const discarded = state.raw.subarray(state.validEndOffset);
      if (!state.torn || state.validEndOffset !== input.expectedValidEndOffset || sha256Hex(discarded) !== input.expectedTailDigest) fail("RECOVERY_PRECONDITION_FAILED", "authority tail changed since inspection");
      appendFrame(intentTarget, intentFrame, { exclusive: true });
    } else if (persistedIntent.records.length !== 1 || !exactIntent(persistedIntent.records[0], intent)) {
      fail("COMMAND_CONFLICT", "torn-tail recovery command conflicts with its durable intent");
    }

    state = readFramed(journalPath);
    validateRecords(state.records, evolve);
    const tail = state.raw.subarray(state.validEndOffset);
    const originalTail = state.torn && state.validEndOffset === input.expectedValidEndOffset && sha256Hex(tail) === input.expectedTailDigest;
    const partialRecovery = state.torn && state.validEndOffset === input.expectedValidEndOffset && isNonemptyPrefix(tail, frame);
    if (originalTail || partialRecovery) {
      truncateDurably(journalPath, input.expectedValidEndOffset);
      state = readFramed(journalPath);
    } else if (state.torn || state.raw.length !== input.expectedValidEndOffset) {
      fail("RECOVERY_PRECONDITION_FAILED", "authority is neither the authorized torn tail nor its deterministic recovery continuation");
    }

    validateRecords(state.records, evolve);
    const completed = recoveryRecord(state.records, input.commandId, payload);
    const completedFrame = Buffer.from(`${canonicalJson(completed)}\n`);
    if (state.raw.length + completedFrame.length > MAX_AUTHORITY_BYTES) fail("JOURNAL_LIMIT_EXCEEDED", "authority lacks capacity for its recovery receipt");
    appendFrame(journalPath, completedFrame);
    const verified = readFramed(journalPath);
    validateRecords(verified.records, evolve);
    const receipt = verified.records.at(-1);
    if (receipt.record_digest !== completed.record_digest) fail("RECOVERY_PUBLICATION_FAILED", "torn-tail recovery receipt did not verify after publication");
    removeIntent(intentTarget);
    return { command_id: input.commandId, authority_id: authorityId, repaired: true, replayed: false, receipt_digest: receipt.record_digest, authority_sequence: receipt.sequence };
  });
}

export { exportAuthorityArtifact, recoverAuthorityTail };
