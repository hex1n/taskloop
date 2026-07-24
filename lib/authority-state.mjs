// Pure reducer for the current provider authority Contract.
// This module has no repository-task runtime, host supervision, or I/O.

import {
  CURRENT_AUTHORITY_EVENT_PAYLOAD_FIELDS,
  canonicalJson,
  cloneJson,
  compareCodeUnits,
  hasExactKeys,
  isPlainObject,
  isSha256Digest,
  isUuidV4,
  sha256Hex,
} from "./prims.mjs";

const clone = cloneJson;
function v3NonEmpty(value) { return typeof value === "string" && value.length > 0; }
function v3Integer(value, minimum = 0) { return Number.isSafeInteger(value) && value >= minimum; }
function v3Array(value, predicate, { nonEmpty = false } = {}) { return Array.isArray(value) && (!nonEmpty || value.length > 0) && value.every(predicate); }

function currentAuthorityRequire(condition, label) {
  if (!condition) throw new Error(`invalid current authority ${label}`);
}

function currentAuthorityPayload(record) {
  const fields = CURRENT_AUTHORITY_EVENT_PAYLOAD_FIELDS[record?.kind];
  currentAuthorityRequire(fields && isPlainObject(record.payload) && hasExactKeys(record.payload, fields), `${record?.kind ?? "event"} payload`);
  return record.payload;
}

function currentClaimPath(value, kind) {
  if (value === ".") return kind === "root";
  if (!v3NonEmpty(value) || value.includes("\\") || /[*?[\]{}]/u.test(value) || value.startsWith("/") || /^[A-Za-z]:\//u.test(value)) return false;
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === "..") || new Set([".git", ".workloop", ".workloop-incompatible-archive", ".workloop-filesystem-root.jsonl"]).has(parts[0])) return false;
  return kind === "root" || value !== ".";
}

function currentWriteClaim(value) {
  try {
    currentAuthorityRequire(isPlainObject(value) && hasExactKeys(value, ["kind", "path"]), "write claim fields");
    currentAuthorityRequire(new Set(["path", "root"]).has(value.kind) && currentClaimPath(value.path, value.kind), "write claim");
    return true;
  } catch {
    return false;
  }
}

function currentClaimContains(claim, target) {
  if (new Set([".git", ".workloop", ".workloop-incompatible-archive", ".workloop-filesystem-root.jsonl"]).has(String(target ?? "").split("/")[0])) return false;
  if (claim.kind === "path") return claim.path === target;
  if (claim.path === ".") return true;
  return claim.path === target || target.startsWith(`${claim.path}/`);
}

function currentTargetPath(value) {
  return value === "." || currentClaimPath(value, "path");
}

function currentClaimCompare(left, right) {
  return compareCodeUnits(left.path, right.path) || compareCodeUnits(left.kind, right.kind);
}

function currentClaimsOverlap(left, right) {
  if (left.kind === "path" && right.kind === "path") return left.path === right.path;
  if (left.kind === "root" && right.kind === "root") return currentClaimContains(left, right.path) || currentClaimContains(right, left.path);
  if (left.kind === "root") return currentClaimContains(left, right.path);
  return currentClaimContains(right, left.path);
}

function currentClaimsTarget(claims, target) {
  return claims.some((claim) => currentClaimContains(claim, target));
}

function currentTaskIsLive(task) {
  return task.lifecycle.state !== "terminal";
}

function assertCurrentAuthorityProjection(value) {
  currentAuthorityRequire(isPlainObject(value) && hasExactKeys(value, ["authority_state_schema_version", "authority_id", "provider", "authority_lifecycle", "authority_sequence", "command_ids", "attachments", "placement_intents", "task_intents", "tasks"]), "projection fields");
  currentAuthorityRequire(value.authority_state_schema_version === 1 && isUuidV4(value.authority_id) && new Set(["git_common", "filesystem_detached"]).has(value.provider) && new Set(["active", "abandoned"]).has(value.authority_lifecycle) && v3Integer(value.authority_sequence, 1), "projection identity");
  currentAuthorityRequire(v3Array(value.command_ids, v3NonEmpty, { nonEmpty: true }) && new Set(value.command_ids).size === value.command_ids.length && value.command_ids.length === value.authority_sequence, "projection command ids");
  currentAuthorityRequire(Array.isArray(value.attachments) && Array.isArray(value.placement_intents) && Array.isArray(value.task_intents) && Array.isArray(value.tasks), "projection collections");
  const attachmentIds = value.attachments.map((item) => item.attachment_id);
  const attachmentAnchorIds = value.attachments.filter((item) => !new Set(["cleaned", "forked_away"]).has(item.lifecycle)).map((item) => item.anchor_id);
  const taskIntentIds = value.task_intents.map((item) => item.task_id);
  const taskIds = value.tasks.map((item) => item.task_id);
  currentAuthorityRequire(new Set(attachmentIds).size === attachmentIds.length, "attachment identity uniqueness");
  currentAuthorityRequire(new Set(attachmentAnchorIds).size === attachmentAnchorIds.length, "attachment anchor uniqueness");
  currentAuthorityRequire(new Set(taskIntentIds).size === taskIntentIds.length, "task intent identity uniqueness");
  currentAuthorityRequire(new Set(taskIds).size === taskIds.length, "task identity uniqueness");

  for (const attachment of value.attachments) {
    currentAuthorityRequire(hasExactKeys(attachment, ["attachment_id", "stage_command_id", "lifecycle", "claim_token_digest", "claim_epoch", "anchor_id", "staged_locator_digest", "claimed_locator_digest", "stage_intent_digest", "staged_receipt_digest", "pending_record_digest", "final_record_digest", "root_path", "control_path", "granted_by", "reason"]), "attachment fields");
    currentAuthorityRequire(isUuidV4(attachment.attachment_id) && v3NonEmpty(attachment.stage_command_id) && Number.isSafeInteger(attachment.claim_epoch) && attachment.claim_epoch >= 1 && v3NonEmpty(attachment.anchor_id), "attachment identity");
    currentAuthorityRequire(new Set(["staging", "staged", "pending", "claimed", "cleanup_pending", "cleaned", "collision", "reattach_pending", "forked_away"]).has(attachment.lifecycle), "attachment lifecycle");
    for (const field of ["claim_token_digest", "staged_locator_digest", "claimed_locator_digest", "stage_intent_digest"]) currentAuthorityRequire(isSha256Digest(attachment[field]), `attachment ${field}`);
    for (const field of ["staged_receipt_digest", "pending_record_digest", "final_record_digest"]) currentAuthorityRequire(attachment[field] === null || isSha256Digest(attachment[field]), `attachment ${field}`);
    currentAuthorityRequire(v3NonEmpty(attachment.root_path) && v3NonEmpty(attachment.control_path), "attachment placement");
    currentAuthorityRequire(new Set(["self", "user"]).has(attachment.granted_by) && v3NonEmpty(attachment.reason), "attachment provenance");
  }


  for (const intent of value.placement_intents) {
    currentAuthorityRequire(hasExactKeys(intent, ["command_id", "action", "worktree_path", "branch_intent", "base_oid", "source_anchor_id", "session_id", "request_digest", "granted_by", "reason", "status", "intent_record_digest", "ready_record_digest", "branch_ref", "head_oid", "anchor_id"]), "placement intent fields");
    currentAuthorityRequire(v3NonEmpty(intent.command_id) && v3NonEmpty(intent.worktree_path) && v3NonEmpty(intent.branch_intent) && /^[0-9a-f]{40,64}$/u.test(intent.base_oid), "placement intent identity");
    currentAuthorityRequire(new Set(["create", "select"]).has(intent.action) && v3NonEmpty(intent.source_anchor_id) && v3NonEmpty(intent.session_id) && isSha256Digest(intent.request_digest), "placement request");
    currentAuthorityRequire(new Set(["self", "user"]).has(intent.granted_by) && v3NonEmpty(intent.reason) && isSha256Digest(intent.intent_record_digest), "placement provenance");
    currentAuthorityRequire(new Set(["pending", "ready"]).has(intent.status), "placement intent status");
    if (intent.status === "pending") currentAuthorityRequire(intent.ready_record_digest === null && intent.branch_ref === null && intent.head_oid === null && intent.anchor_id === null, "pending placement facts");
    else currentAuthorityRequire(isSha256Digest(intent.ready_record_digest) && intent.branch_ref === `refs/heads/${intent.branch_intent}` && intent.head_oid === intent.base_oid && v3NonEmpty(intent.anchor_id), "ready placement facts");
  }

  for (const intent of value.task_intents) {
    currentAuthorityRequire(hasExactKeys(intent, ["task_id", "attachment_id", "command_id", "goal", "write_claims", "placement", "branch_intent", "base_oid", "placement_intent_digest", "coordinator_session_id", "participant_session_ids", "granted_by", "reason", "status", "intent_record_digest"]), "task intent fields");
    currentAuthorityRequire(isUuidV4(intent.task_id) && isUuidV4(intent.attachment_id) && v3NonEmpty(intent.command_id) && v3NonEmpty(intent.goal), "task intent identity");
    currentAuthorityRequire(new Set(["partitioned", "exclusive_worktree"]).has(intent.placement) && v3NonEmpty(intent.coordinator_session_id) && isSha256Digest(intent.intent_record_digest), "task intent attachment");
    currentAuthorityRequire(new Set(["self", "user"]).has(intent.granted_by) && v3NonEmpty(intent.reason), "task intent provenance");
    if (intent.placement === "partitioned") currentAuthorityRequire(intent.branch_intent === null && intent.base_oid === null && intent.placement_intent_digest === null, "partitioned task intent placement");
    else {
      const placement = value.placement_intents.find((item) => item.intent_record_digest === intent.placement_intent_digest) ?? null;
      const owningAttachment = value.attachments.find((item) => item.attachment_id === intent.attachment_id) ?? null;
      currentAuthorityRequire(placement?.status === "ready" && placement.branch_intent === intent.branch_intent && placement.base_oid === intent.base_oid && placement.anchor_id === owningAttachment?.anchor_id, "exclusive task intent placement");
    }
    currentAuthorityRequire(v3Array(intent.write_claims, currentWriteClaim, { nonEmpty: true }), "task intent write claims");
    const claimKeys = intent.write_claims.map((claim) => `${claim.kind}:${claim.path}`);
    currentAuthorityRequire(new Set(claimKeys).size === claimKeys.length && JSON.stringify(intent.write_claims) === JSON.stringify([...intent.write_claims].sort(currentClaimCompare)), "task intent write claim order");
    currentAuthorityRequire(Array.isArray(intent.participant_session_ids) && intent.participant_session_ids.length === 1 && intent.participant_session_ids[0] === intent.coordinator_session_id, "task intent participants");
    currentAuthorityRequire(new Set(["pending", "opened"]).has(intent.status), "task intent status");
    const owningAttachment = value.attachments.find((item) => item.attachment_id === intent.attachment_id) ?? null;
    currentAuthorityRequire(owningAttachment !== null, "task intent attachment reference");
  }

  for (const task of value.tasks) {
    currentAuthorityRequire(hasExactKeys(task, ["task_id", "attachment_id", "goal", "write_claims", "placement", "branch_intent", "base_oid", "placement_intent_digest", "coordinator_session_id", "participant_session_ids", "lifecycle", "attachment_final_digest", "operation_intents", "tool_completions", "git_receipts", "certification"]), "task fields");
    currentAuthorityRequire(isUuidV4(task.task_id) && isUuidV4(task.attachment_id) && v3NonEmpty(task.goal), "task identity");
    currentAuthorityRequire(new Set(["partitioned", "exclusive_worktree"]).has(task.placement) && v3NonEmpty(task.coordinator_session_id) && isSha256Digest(task.attachment_final_digest), "task attachment");
    if (task.placement === "partitioned") currentAuthorityRequire(task.branch_intent === null && task.base_oid === null && task.placement_intent_digest === null, "partitioned task placement");
    else currentAuthorityRequire(v3NonEmpty(task.branch_intent) && /^[0-9a-f]{40,64}$/u.test(task.base_oid) && isSha256Digest(task.placement_intent_digest), "exclusive task placement");
    currentAuthorityRequire(v3Array(task.write_claims, currentWriteClaim, { nonEmpty: true }), "task write claims");
    const claimKeys = task.write_claims.map((claim) => `${claim.kind}:${claim.path}`);
    currentAuthorityRequire(new Set(claimKeys).size === claimKeys.length && JSON.stringify(task.write_claims) === JSON.stringify([...task.write_claims].sort(currentClaimCompare)), "task write claim order");
    currentAuthorityRequire(v3Array(task.participant_session_ids, v3NonEmpty, { nonEmpty: true }) && new Set(task.participant_session_ids).size === task.participant_session_ids.length && task.participant_session_ids.includes(task.coordinator_session_id), "task participants");
    currentAuthorityRequire(isPlainObject(task.lifecycle), "task lifecycle");
    if (task.lifecycle.state === "active") currentAuthorityRequire(hasExactKeys(task.lifecycle, ["state"]), "active task lifecycle");
    else if (task.lifecycle.state === "suspended") currentAuthorityRequire(hasExactKeys(task.lifecycle, ["state", "reason"]) && v3NonEmpty(task.lifecycle.reason), "suspended task lifecycle");
    else if (task.lifecycle.state === "terminal") currentAuthorityRequire(hasExactKeys(task.lifecycle, ["state", "outcome", "reason"]) && new Set(["abandoned", "achieved"]).has(task.lifecycle.outcome) && v3NonEmpty(task.lifecycle.reason), "terminal task lifecycle");
    else currentAuthorityRequire(false, "task lifecycle state");
    const owningAttachment = value.attachments.find((item) => item.attachment_id === task.attachment_id) ?? null;
    currentAuthorityRequire(owningAttachment !== null && new Set(["claimed", "collision", "reattach_pending", "forked_away"]).has(owningAttachment.lifecycle), "task attachment reference");
    const openingIntent = value.task_intents.find((item) => item.task_id === task.task_id) ?? null;
    currentAuthorityRequire(openingIntent !== null && openingIntent.status === "opened" && openingIntent.attachment_id === task.attachment_id && openingIntent.goal === task.goal && canonicalJson(openingIntent.write_claims) === canonicalJson(task.write_claims) && openingIntent.placement === task.placement && openingIntent.branch_intent === task.branch_intent && openingIntent.base_oid === task.base_oid && openingIntent.placement_intent_digest === task.placement_intent_digest && openingIntent.coordinator_session_id === task.coordinator_session_id, "task open intent reference");
    currentAuthorityRequire(v3Integer(task.operation_intents) && v3Integer(task.tool_completions) && Array.isArray(task.git_receipts) && (task.certification === null || isPlainObject(task.certification)), "task receipt counters");
  }

  const claimOwners = [...value.tasks.filter(currentTaskIsLive), ...value.task_intents.filter((intent) => intent.status === "pending")];
  const liveByAttachment = new Map();
  for (const owner of claimOwners) {
    const peers = liveByAttachment.get(owner.attachment_id) ?? [];
    for (const peer of peers) {
      currentAuthorityRequire(!owner.participant_session_ids.some((session) => peer.participant_session_ids.includes(session)), "live task session uniqueness");
      currentAuthorityRequire(owner.placement !== "exclusive_worktree" && peer.placement !== "exclusive_worktree", "exclusive worktree live-task uniqueness");
      currentAuthorityRequire(!owner.write_claims.some((claim) => peer.write_claims.some((other) => currentClaimsOverlap(claim, other))), "live task write scope overlap");
    }
    peers.push(owner);
    liveByAttachment.set(owner.attachment_id, peers);
  }
  return value;
}

function evolveCurrentAuthority(state, record) {
  currentAuthorityRequire(isPlainObject(record) && hasExactKeys(record, ["authority_schema_version", "sequence", "previous_digest", "record_id", "command_id", "kind", "payload", "record_digest"]), "record fields");
  currentAuthorityRequire(record.authority_schema_version === 1 && v3Integer(record.sequence, 1) && isUuidV4(record.record_id) && v3NonEmpty(record.command_id) && isSha256Digest(record.record_digest), "record identity");
  const payload = currentAuthorityPayload(record);
  if (record.kind === "authority_genesis") {
    currentAuthorityRequire(state === null && record.sequence === 1 && record.previous_digest === null, "genesis order");
    currentAuthorityRequire(isUuidV4(payload.authority_id) && new Set(["git_common", "filesystem_detached"]).has(payload.provider), "genesis payload");
    return assertCurrentAuthorityProjection({ authority_state_schema_version: 1, authority_id: payload.authority_id, provider: payload.provider, authority_lifecycle: "active", authority_sequence: 1, command_ids: [record.command_id], attachments: [], placement_intents: [], task_intents: [], tasks: [] });
  }
  currentAuthorityRequire(state !== null && record.sequence === state.authority_sequence + 1 && record.previous_digest !== null, "record order");
  const next = clone(state);
  currentAuthorityRequire(!next.command_ids.includes(record.command_id), "command id uniqueness");
  currentAuthorityRequire(next.authority_lifecycle === "active", "authority lifecycle");
  currentAuthorityRequire(!Object.hasOwn(payload, "authority_id") || payload.authority_id === next.authority_id, "authority identity");
  const attachment = Object.hasOwn(payload, "attachment_id") ? next.attachments.find((item) => item.attachment_id === payload.attachment_id) ?? null : null;
  const taskIntent = Object.hasOwn(payload, "task_id") ? next.task_intents.find((item) => item.task_id === payload.task_id) ?? null : null;
  const task = Object.hasOwn(payload, "task_id") ? next.tasks.find((item) => item.task_id === payload.task_id) ?? null : null;

  if (record.kind === "authority_tail_recovered") {
    currentAuthorityRequire(payload.authority_id === next.authority_id && v3Integer(payload.valid_end_offset, 0) && isSha256Digest(payload.discarded_sha256), "authority tail recovery proof");
    currentAuthorityRequire(payload.granted_by === "user" && v3NonEmpty(payload.reason), "authority tail recovery provenance");
  } else if (record.kind === "attachment_stage_intent") {
    currentAuthorityRequire(attachment === null && next.attachments.every((item) => new Set(["claimed", "cleaned", "collision", "forked_away"]).has(item.lifecycle)), "stage exclusivity");
    currentAuthorityRequire(!next.attachments.some((item) => item.anchor_id === payload.anchor_id && !new Set(["cleaned", "forked_away"]).has(item.lifecycle)), "attachment anchor uniqueness");
    currentAuthorityRequire(isUuidV4(payload.attachment_id) && isUuidV4(payload.claim_token) && v3Integer(payload.claim_epoch, 1) && v3NonEmpty(payload.anchor_id), "stage identities");
    currentAuthorityRequire(isSha256Digest(payload.staged_locator_digest) && isSha256Digest(payload.claimed_locator_digest), "stage locator digests");
    currentAuthorityRequire(v3NonEmpty(payload.root_path) && v3NonEmpty(payload.control_path), "stage placement");
    currentAuthorityRequire(new Set(["self", "user"]).has(payload.granted_by) && v3NonEmpty(payload.reason), "stage provenance");
    next.attachments.push({ attachment_id: payload.attachment_id, stage_command_id: record.command_id, lifecycle: "staging", claim_token_digest: sha256Hex(payload.claim_token), claim_epoch: payload.claim_epoch, anchor_id: payload.anchor_id, staged_locator_digest: payload.staged_locator_digest, claimed_locator_digest: payload.claimed_locator_digest, stage_intent_digest: record.record_digest, staged_receipt_digest: null, pending_record_digest: null, final_record_digest: null, root_path: payload.root_path, control_path: payload.control_path, granted_by: payload.granted_by, reason: payload.reason });
  } else if (record.kind === "attachment_staged") {
    currentAuthorityRequire(attachment?.lifecycle === "staging" && payload.stage_intent_digest === attachment.stage_intent_digest && payload.staged_locator_digest === attachment.staged_locator_digest, "staged receipt chain");
    currentAuthorityRequire(payload.granted_by === attachment.granted_by && payload.reason === attachment.reason, "staged receipt provenance");
    attachment.lifecycle = "staged";
    attachment.staged_receipt_digest = record.record_digest;
  } else if (record.kind === "attachment_claim_pending") {
    currentAuthorityRequire(attachment?.lifecycle === "staged" && payload.staged_receipt_digest === attachment.staged_receipt_digest && payload.claimed_locator_digest === attachment.claimed_locator_digest, "pending claim chain");
    attachment.lifecycle = "pending";
    attachment.pending_record_digest = record.record_digest;
  } else if (record.kind === "attachment_claimed") {
    currentAuthorityRequire(attachment?.lifecycle === "pending" && payload.pending_record_digest === attachment.pending_record_digest && payload.locator_digest === attachment.claimed_locator_digest, "final claim chain");
    attachment.lifecycle = "claimed";
    attachment.final_record_digest = record.record_digest;
  } else if (record.kind === "attachment_recovery_intent") {
    currentAuthorityRequire(attachment?.lifecycle === "pending" && payload.claim_epoch === attachment.claim_epoch && payload.pending_record_digest === attachment.pending_record_digest && payload.expected_locator_digest === attachment.claimed_locator_digest && payload.claim_token_digest === attachment.claim_token_digest, "recovery intent chain");
    currentAuthorityRequire(new Set(["self", "user"]).has(payload.granted_by) && v3NonEmpty(payload.reason), "recovery provenance");
  } else if (record.kind === "attachment_recovery_completed") {
    currentAuthorityRequire(attachment?.lifecycle === "claimed" && isSha256Digest(payload.recovery_intent_digest) && payload.attachment_final_digest === attachment.final_record_digest, "recovery completion chain");
  } else if (record.kind === "attachment_staged_locator_cleanup_pending") {
    currentAuthorityRequire(attachment?.lifecycle === "staging" || attachment?.lifecycle === "staged", "staged cleanup state");
    currentAuthorityRequire(payload.locator_digest === attachment.staged_locator_digest && new Set(["self", "user"]).has(payload.granted_by) && v3NonEmpty(payload.reason), "staged cleanup input");
    attachment.lifecycle = "cleanup_pending";
  } else if (record.kind === "attachment_staged_locator_cleaned") {
    currentAuthorityRequire(attachment?.lifecycle === "cleanup_pending" && payload.pending_record_digest !== null && isSha256Digest(payload.pending_record_digest), "staged cleanup completion");
    attachment.lifecycle = "cleaned";
  } else if (record.kind === "authority_staging_abandoned") {
    currentAuthorityRequire(next.provider === "filesystem_detached" && next.tasks.length === 0 && next.task_intents.length === 0 && next.attachments.every((item) => new Set(["staging", "staged", "cleanup_pending", "cleaned"]).has(item.lifecycle)), "staged authority abandonment");
    currentAuthorityRequire(isSha256Digest(payload.genesis_digest) && new Set(["self", "user"]).has(payload.granted_by) && v3NonEmpty(payload.reason), "staged authority abandonment provenance");
    next.authority_lifecycle = "abandoned";
  } else if (record.kind === "attachment_collision_detected") {
    currentAuthorityRequire(attachment?.lifecycle === "claimed" && payload.claim_epoch === attachment.claim_epoch && payload.locator_digest === attachment.claimed_locator_digest && v3NonEmpty(payload.observed_anchor_id) && payload.observed_anchor_id !== attachment.anchor_id, "attachment collision");
    attachment.lifecycle = "collision";
  } else if (record.kind === "attachment_reattach_pending") {
    currentAuthorityRequire(attachment && new Set(["claimed", "collision"]).has(attachment.lifecycle) && payload.previous_final_digest === attachment.final_record_digest && payload.previous_epoch === attachment.claim_epoch && payload.previous_claim_token_digest === attachment.claim_token_digest && payload.claim_epoch === attachment.claim_epoch + 1, "reattach predecessor");
    currentAuthorityRequire(isUuidV4(payload.claim_token) && v3NonEmpty(payload.anchor_id) && payload.prior_locator_digest === attachment.claimed_locator_digest && isSha256Digest(payload.claimed_locator_digest) && v3NonEmpty(payload.root_path) && v3NonEmpty(payload.control_path), "reattach identity");
    currentAuthorityRequire(new Set(["self", "user"]).has(payload.granted_by) && v3NonEmpty(payload.reason), "reattach provenance");
    attachment.lifecycle = "reattach_pending"; attachment.claim_token_digest = sha256Hex(payload.claim_token); attachment.claim_epoch = payload.claim_epoch; attachment.anchor_id = payload.anchor_id; attachment.staged_locator_digest = payload.prior_locator_digest; attachment.claimed_locator_digest = payload.claimed_locator_digest; attachment.pending_record_digest = record.record_digest; attachment.root_path = payload.root_path; attachment.control_path = payload.control_path; attachment.granted_by = payload.granted_by; attachment.reason = payload.reason;
  } else if (record.kind === "attachment_reattached") {
    currentAuthorityRequire(attachment?.lifecycle === "reattach_pending" && payload.pending_record_digest === attachment.pending_record_digest && payload.locator_digest === attachment.claimed_locator_digest, "reattach completion");
    attachment.lifecycle = "claimed"; attachment.final_record_digest = record.record_digest;
  } else if (record.kind === "attachment_fork_intent") {
    currentAuthorityRequire(attachment?.lifecycle === "collision" && payload.expected_epoch === attachment.claim_epoch && payload.expected_locator_digest === attachment.claimed_locator_digest && isUuidV4(payload.new_authority_id) && isUuidV4(payload.new_attachment_id) && isUuidV4(payload.new_claim_token) && v3NonEmpty(payload.selected_anchor_id) && new Set(["self", "user"]).has(payload.granted_by) && v3NonEmpty(payload.reason), "identity fork intent");
  } else if (record.kind === "attachment_forked") {
    currentAuthorityRequire(attachment === null && isUuidV4(payload.attachment_id) && isUuidV4(payload.source_authority_id) && isUuidV4(payload.source_attachment_id) && isUuidV4(payload.claim_token) && payload.claim_epoch === 1 && v3NonEmpty(payload.anchor_id), "forked attachment identity");
    currentAuthorityRequire(isSha256Digest(payload.source_locator_digest) && isSha256Digest(payload.claimed_locator_digest) && v3NonEmpty(payload.root_path) && v3NonEmpty(payload.control_path) && new Set(["self", "user"]).has(payload.granted_by) && v3NonEmpty(payload.reason), "forked attachment input");
    currentAuthorityRequire(!next.attachments.some((item) => item.anchor_id === payload.anchor_id && !new Set(["cleaned", "forked_away"]).has(item.lifecycle)), "forked attachment anchor");
    next.attachments.push({ attachment_id: payload.attachment_id, stage_command_id: record.command_id, lifecycle: "claimed", claim_token_digest: sha256Hex(payload.claim_token), claim_epoch: 1, anchor_id: payload.anchor_id, staged_locator_digest: payload.source_locator_digest, claimed_locator_digest: payload.claimed_locator_digest, stage_intent_digest: record.record_digest, staged_receipt_digest: record.record_digest, pending_record_digest: record.record_digest, final_record_digest: record.record_digest, root_path: payload.root_path, control_path: payload.control_path, granted_by: payload.granted_by, reason: payload.reason });
  } else if (record.kind === "attachment_identity_forked") {
    currentAuthorityRequire(attachment?.lifecycle === "collision" && isUuidV4(payload.forked_attachment_id) && isUuidV4(payload.forked_authority_id) && payload.source_locator_digest === attachment.claimed_locator_digest && new Set(["self", "user"]).has(payload.granted_by) && v3NonEmpty(payload.reason), "identity fork resolution");
    attachment.lifecycle = "forked_away";
  } else if (record.kind === "exclusive_worktree_intent") {
    currentAuthorityRequire(isUuidV4(payload.authority_id) && new Set(["create", "select"]).has(payload.action) && v3NonEmpty(payload.worktree_path) && v3NonEmpty(payload.branch_intent) && /^[0-9a-f]{40,64}$/u.test(payload.base_oid), "exclusive placement intent");
    currentAuthorityRequire(v3NonEmpty(payload.source_anchor_id) && v3NonEmpty(payload.session_id) && isSha256Digest(payload.request_digest), "exclusive placement source");
    currentAuthorityRequire(new Set(["self", "user"]).has(payload.granted_by) && v3NonEmpty(payload.reason), "exclusive placement provenance");
    currentAuthorityRequire(!next.placement_intents.some((item) => item.status === "pending"), "exclusive placement pending uniqueness");
    next.placement_intents.push({ command_id: record.command_id, action: payload.action, worktree_path: payload.worktree_path, branch_intent: payload.branch_intent, base_oid: payload.base_oid, source_anchor_id: payload.source_anchor_id, session_id: payload.session_id, request_digest: payload.request_digest, granted_by: payload.granted_by, reason: payload.reason, status: "pending", intent_record_digest: record.record_digest, ready_record_digest: null, branch_ref: null, head_oid: null, anchor_id: null });
  } else if (record.kind === "exclusive_worktree_ready") {
    const placement = next.placement_intents.find((item) => item.intent_record_digest === payload.intent_record_digest) ?? null;
    currentAuthorityRequire(placement?.status === "pending" && payload.worktree_path === placement.worktree_path && payload.branch_ref === `refs/heads/${placement.branch_intent}` && payload.head_oid === placement.base_oid && v3NonEmpty(payload.anchor_id), "exclusive placement ready");
    placement.status = "ready"; placement.ready_record_digest = record.record_digest; placement.branch_ref = payload.branch_ref; placement.head_oid = payload.head_oid; placement.anchor_id = payload.anchor_id;
  } else if (record.kind === "task_open_intent") {
    currentAuthorityRequire(taskIntent === null && task === null && attachment !== null, "task open intent identity");
    currentAuthorityRequire(isUuidV4(payload.task_id) && v3NonEmpty(payload.goal) && new Set(["partitioned", "exclusive_worktree"]).has(payload.placement), "task open intent input");
    if (payload.placement === "partitioned") currentAuthorityRequire(payload.branch_intent === null && payload.base_oid === null && payload.placement_intent_digest === null, "partitioned open placement");
    else {
      const placement = next.placement_intents.find((item) => item.intent_record_digest === payload.placement_intent_digest) ?? null;
      currentAuthorityRequire(placement?.status === "ready" && placement.branch_intent === payload.branch_intent && placement.base_oid === payload.base_oid && placement.anchor_id === attachment.anchor_id, "exclusive open placement");
    }
    currentAuthorityRequire(v3Array(payload.write_claims, currentWriteClaim, { nonEmpty: true }) && v3NonEmpty(payload.coordinator_session_id), "task open intent claims");
    currentAuthorityRequire(new Set(["self", "user"]).has(payload.granted_by) && v3NonEmpty(payload.reason), "task open intent provenance");
    currentAuthorityRequire(Array.isArray(payload.participant_session_ids) && payload.participant_session_ids.length === 1 && payload.participant_session_ids[0] === payload.coordinator_session_id, "task open intent participants");
    next.task_intents.push({ ...clone(payload), command_id: record.command_id, status: "pending", intent_record_digest: record.record_digest });
  } else if (record.kind === "task_opened") {
    currentAuthorityRequire(task === null && taskIntent?.status === "pending" && attachment?.lifecycle === "claimed", "task attachment chain");
    currentAuthorityRequire(taskIntent.attachment_id === payload.attachment_id && payload.open_intent_digest === taskIntent.intent_record_digest && payload.attachment_final_digest === attachment.final_record_digest, "task open intent chain");
    next.tasks.push({ task_id: taskIntent.task_id, attachment_id: taskIntent.attachment_id, goal: taskIntent.goal, write_claims: clone(taskIntent.write_claims), placement: taskIntent.placement, branch_intent: taskIntent.branch_intent, base_oid: taskIntent.base_oid, placement_intent_digest: taskIntent.placement_intent_digest, coordinator_session_id: taskIntent.coordinator_session_id, participant_session_ids: clone(taskIntent.participant_session_ids), lifecycle: { state: "active" }, attachment_final_digest: payload.attachment_final_digest, operation_intents: 0, tool_completions: 0, git_receipts: [], certification: null });
    taskIntent.status = "opened";
  } else if (record.kind === "task_joined") {
    currentAuthorityRequire(task && currentTaskIsLive(task) && v3NonEmpty(payload.session_id) && !task.participant_session_ids.includes(payload.session_id), "task join");
    currentAuthorityRequire(new Set(["self", "user"]).has(payload.granted_by) && v3NonEmpty(payload.reason), "task join provenance");
    task.participant_session_ids.push(payload.session_id);
  } else if (record.kind === "task_suspended") {
    currentAuthorityRequire(task?.lifecycle.state === "active" && v3NonEmpty(payload.reason), "task suspend");
    currentAuthorityRequire(task.participant_session_ids.includes(payload.session_id) && new Set(["self", "user"]).has(payload.granted_by), "task suspend provenance");
    task.lifecycle = { state: "suspended", reason: payload.reason };
  } else if (record.kind === "task_resumed") {
    currentAuthorityRequire(task?.lifecycle.state === "suspended" && v3NonEmpty(payload.reason), "task resume");
    currentAuthorityRequire(task.participant_session_ids.includes(payload.session_id) && new Set(["self", "user"]).has(payload.granted_by), "task resume provenance");
    task.lifecycle = { state: "active" };
  } else if (record.kind === "task_terminal") {
    currentAuthorityRequire(task && currentTaskIsLive(task) && payload.outcome === "abandoned" && v3NonEmpty(payload.reason), "task terminal");
    currentAuthorityRequire(task.participant_session_ids.includes(payload.session_id) && new Set(["self", "user"]).has(payload.granted_by), "task terminal provenance");
    task.lifecycle = { state: "terminal", outcome: payload.outcome, reason: payload.reason };
  } else if (record.kind === "task_certified") { currentAuthorityRequire(task?.lifecycle.state === "active" && task.attachment_id === payload.attachment_id && task.participant_session_ids.includes(payload.session_id) && payload.prepared_sequence === record.sequence - 1 && payload.attachment_final_digest === task.attachment_final_digest && new Set(["self", "user"]).has(payload.granted_by) && v3NonEmpty(payload.reason) && isSha256Digest(payload.attachment_final_digest) && isSha256Digest(payload.criterion_digest) && v3Integer(payload.prepared_sequence, 1) && (next.provider === "filesystem_detached" ? payload.commit_oid === null : v3NonEmpty(payload.commit_oid) && [40, 64].includes(payload.commit_oid.length) && !/[^0-9a-f]/u.test(payload.commit_oid) && task.git_receipts.some((receipt) => receipt.kind === "git_commit_receipted" && receipt.clean === true && receipt.commit_oid === payload.commit_oid)), "task certification"); task.lifecycle = { state: "terminal", outcome: "achieved", reason: payload.reason }; task.certification = clone(payload);
  } else if (record.kind === "git_stage_receipted" || record.kind === "git_commit_receipted") { currentAuthorityRequire(next.provider === "git_common" && task?.lifecycle.state === "active" && task.attachment_id === payload.attachment_id && new Set(["clean", "uncertain"]).has(payload.status) && payload.clean === (payload.status === "clean") && new Set(["self", "user"]).has(payload.granted_by) && v3NonEmpty(payload.reason), "Git receipt identity"); const paths = record.kind === "git_stage_receipted" ? payload.paths : payload.diff_paths; currentAuthorityRequire(Array.isArray(paths) && paths.every((item) => currentTargetPath(item)) && (!payload.clean || paths.every((item) => currentClaimsTarget(task.write_claims, item))), "Git receipt scope"); if (record.kind === "git_stage_receipted") currentAuthorityRequire(v3NonEmpty(payload.head_oid) && [40, 64].includes(payload.head_oid.length) && !/[^0-9a-f]/u.test(payload.head_oid) && isSha256Digest(payload.index_before) && isSha256Digest(payload.index_after), "Git stage receipt index"); else currentAuthorityRequire(v3NonEmpty(payload.prior_head) && [40, 64].includes(payload.prior_head.length) && !/[^0-9a-f]/u.test(payload.prior_head) && v3NonEmpty(payload.commit_oid) && [40, 64].includes(payload.commit_oid.length) && !/[^0-9a-f]/u.test(payload.commit_oid) && v3NonEmpty(payload.parent_oid) && [40, 64].includes(payload.parent_oid.length) && !/[^0-9a-f]/u.test(payload.parent_oid) && (!payload.clean || payload.parent_oid === payload.prior_head) && isSha256Digest(payload.index_after), "Git commit receipt object"); task.git_receipts.push({ kind: record.kind, command_id: record.command_id, sequence: record.sequence, clean: payload.clean, status: payload.status, paths: clone(paths), ...(record.kind === "git_stage_receipted" ? { index_after: payload.index_after, head_oid: payload.head_oid } : { commit_oid: payload.commit_oid, prior_head: payload.prior_head }) });
  } else if (record.kind === "operation_intent_recorded" || record.kind === "tool_completed") {
    currentAuthorityRequire(task?.lifecycle.state === "active" && v3NonEmpty(payload.operation_id) && currentTargetPath(payload.target) && currentClaimsTarget(task.write_claims, payload.target), "tool receipt route");
    currentAuthorityRequire(task.participant_session_ids.includes(payload.session_id) && v3NonEmpty(payload.tool) && (payload.permission_mode === null || typeof payload.permission_mode === "string"), "tool receipt host fields");
    if (record.kind === "tool_completed") currentAuthorityRequire(typeof payload.outcome === "string" && typeof payload.receipt_quality === "string", "tool completion fields");
    if (record.kind === "operation_intent_recorded") task.operation_intents += 1;
    else task.tool_completions += 1;
  } else {
    currentAuthorityRequire(false, `event kind ${record.kind}`);
  }
  next.authority_sequence = record.sequence;
  next.command_ids.push(record.command_id);
  return assertCurrentAuthorityProjection(next);
}

function evolveAllCurrentAuthority(state, records) {
  currentAuthorityRequire(Array.isArray(records), "replay input");
  let next = state === null ? null : clone(state);
  for (const record of records) next = evolveCurrentAuthority(next, record);
  return next;
}
export { evolveAllCurrentAuthority };
