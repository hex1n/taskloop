// Provider-only Workloop application assembly.
//
// This is the sole executable runtime Contract.  It never imports the retired
// repository-task event runtime and exposes no compatibility command aliases.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";

import { sha256Hex } from "./prims.mjs";
import { resolveCriterionFile, runCriterionSource } from "./criterion.mjs";
import { evolveAllCurrentAuthority } from "./authority-state.mjs";
import { createLockManager, runAuthorityTransaction } from "./authority-transaction.mjs";
import { publishAuthorityOutcome } from "./authority-outcome-projection.mjs";
import { writeFileTargets } from "./hook-targets.mjs";
import { EXPLICIT_PROFILES, buildHookRecipe, decodeHook, encodeHook } from "./host-hooks.mjs";
import { commitCurrentGitTask, certifyCurrentGitTask, exportCurrentGitAuthority, forkCurrentGitIdentity, mutateCurrentGitTask, openCurrentGitTask, prepareCurrentGitCertification, queryCurrentGit, recordCurrentGitHook, recoverCurrentGitAttachment, recoverCurrentGitAuthorityTail, resolveGitAuthorityTarget, stageCurrentGitTask } from "./git-authority-provider.mjs";
import { abandonStagedFilesystemAuthority, certifyCurrentFilesystemTask, exportCurrentFilesystemAuthority, forkCurrentFilesystemIdentity, mutateCurrentFilesystemTask, openCurrentFilesystemTask, prepareCurrentFilesystemCertification, queryCurrentFilesystem, queryCurrentFilesystemAuthority, recordCurrentFilesystemHook, recoverCurrentFilesystemAttachment, recoverCurrentFilesystemAuthorityTail, resolveFilesystemAuthorityTarget } from "./filesystem-authority-provider.mjs";

const OPTION = { type: "string" };
const OPTIONS = Object.freeze({
  open: { target: OPTION, "filesystem-root": OPTION, placement: OPTION, "worktree-path": OPTION, branch: OPTION, base: OPTION, goal: OPTION, "write-path": { type: "string", multiple: true }, "write-root": { type: "string", multiple: true }, "command-id": OPTION, reason: OPTION, "granted-by": OPTION },
  stage: { target: OPTION, "task-id": OPTION, "command-id": OPTION, reason: OPTION, "granted-by": OPTION },
  commit: { target: OPTION, "task-id": OPTION, message: OPTION, "command-id": OPTION, reason: OPTION, "granted-by": OPTION },
  certify: { target: OPTION, authority: OPTION, "task-id": OPTION, "criterion-file": OPTION, "criterion-timeout-seconds": OPTION, "command-id": OPTION, reason: OPTION, "granted-by": OPTION },
  status: { target: OPTION, authority: OPTION, "task-id": OPTION }, audit: { target: OPTION, authority: OPTION, "task-id": OPTION }, ledger: { target: OPTION, authority: OPTION }, tasks: { target: OPTION, authority: OPTION },
  join: { target: OPTION, authority: OPTION, "task-id": OPTION, "command-id": OPTION, reason: OPTION, "granted-by": OPTION }, suspend: { target: OPTION, authority: OPTION, "task-id": OPTION, "command-id": OPTION, reason: OPTION, "granted-by": OPTION }, resume: { target: OPTION, authority: OPTION, "task-id": OPTION, "command-id": OPTION, reason: OPTION, "granted-by": OPTION }, abandon: { target: OPTION, authority: OPTION, "task-id": OPTION, "command-id": OPTION, reason: OPTION, "granted-by": OPTION },
  "recover-attachment": { target: OPTION, authority: OPTION, attachment: OPTION, "command-id": OPTION, "expect-epoch": OPTION, "expect-locator-digest": OPTION, "expect-pending-digest": OPTION, reason: OPTION, "granted-by": OPTION },
  "cleanup-staged-locator": { target: OPTION, authority: OPTION, attachment: OPTION, "command-id": OPTION, "expect-locator-digest": OPTION, reason: OPTION, "granted-by": OPTION },
  reattach: { target: OPTION, authority: OPTION, attachment: OPTION, "command-id": OPTION, "expect-epoch": OPTION, "expect-locator-digest": OPTION, reason: OPTION, "granted-by": OPTION },
  "abandon-staged-authority": { authority: OPTION, "command-id": OPTION, "expect-genesis-digest": OPTION, reason: OPTION, "granted-by": OPTION },
  "fork-identity": { target: OPTION, attachment: OPTION, "command-id": OPTION, "expect-epoch": OPTION, "expect-locator-digest": OPTION, reason: OPTION, "granted-by": OPTION },
  "recover-torn-tail": { target: OPTION, authority: OPTION, "command-id": OPTION, "expect-valid-end-offset": OPTION, "expect-tail-digest": OPTION, reason: OPTION, "granted-by": OPTION },
  "export-authority": { target: OPTION, authority: OPTION, output: OPTION, reason: OPTION, "granted-by": OPTION },
  "archive-incompatible-state": { target: OPTION, reason: OPTION, "granted-by": OPTION },
  hook: { profile: OPTION, mode: OPTION }, hooks: { profile: OPTION, mode: OPTION, command: OPTION },
});
const RUNTIME = Object.freeze({ createLockManager, runAuthorityTransaction, evolveAllCurrentAuthority });
const INCOMPATIBLE_ARTIFACT_NAMES = Object.freeze(["events.jsonl", "events-v3.jsonl", "task.json", "outcomes-v3.jsonl"]);
const identity = (value) => typeof value === "string" && value.trim() ? value.trim() : null;
const error = (message) => { process.stderr.write(`workloop: ${message}\n`); return 2; };
const sessionId = () => identity(process.env.WORKLOOP_SESSION_ID) ?? identity(process.env.CLAUDE_CODE_SESSION_ID) ?? "cli";
function print(value, { publishOutcome = true } = {}) { process.stdout.write(`${JSON.stringify(publishOutcome ? publish(value) : value, null, 2)}\n`); return 0; }
function publish(value, { silent = false } = {}) {
  if (!value?.authority_id || !new Set(["git_common", "filesystem_detached"]).has(value.provider) || (!Array.isArray(value.repository_tasks) && !Array.isArray(value.filesystem_tasks))) return value;
  try { const outcome = publishAuthorityOutcome(value, RUNTIME); return { ...value, outcome_path: outcome.outcome_path, outcome_cursor_path: outcome.cursor_path, outcome_source_sequence: outcome.source_sequence }; }
  catch (cause) { return silent ? value : { ...value, warnings: [...(value.warnings ?? []), `outcome projection deferred: ${cause.message}`] }; }
}
function isFilesystem(target) { try { resolveFilesystemAuthorityTarget(target); return true; } catch (cause) { if (cause?.code === "FILESYSTEM_AUTHORITY_REQUIRED") return false; throw cause; } }
function incompatibleArtifacts(root) { const source = path.join(root, ".workloop"); return INCOMPATIBLE_ARTIFACT_NAMES.map((name) => path.join(source, name)).filter((file) => fs.existsSync(file) && fs.statSync(file).isFile()); }
function exactArchiveExists(root, files) {
  const archiveRoot = path.join(root, ".workloop-incompatible-archive");
  let entries;
  try { entries = fs.readdirSync(archiveRoot, { withFileTypes: true }); } catch (cause) { if (cause?.code === "ENOENT") return false; throw cause; }
  const expected = files.map((file) => ({ name: path.basename(file), sha256: fileDigest(file), bytes: fs.statSync(file).size }));
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(archiveRoot, entry.name, "manifest.json"), "utf8"));
      if (manifest.archive_schema_version === 1 && path.resolve(manifest.source_root) === path.resolve(root) && JSON.stringify(manifest.artifacts) === JSON.stringify(expected)) return true;
    } catch { /* An incomplete or malformed archive is not proof. */ }
  }
  return false;
}
function assertIncompatibleStateArchived(root) {
  const files = incompatibleArtifacts(root);
  if (files.length && !exactArchiveExists(root, files)) throw new Error("incompatible Workloop state requires archive-incompatible-state with exact current bytes before using the provider Contract");
}
function currentTargetRoot(target) {
  try { return resolveGitAuthorityTarget(target).worktree_root; }
  catch (gitCause) {
    try { return resolveFilesystemAuthorityTarget(target).root_path; }
    catch { throw gitCause; }
  }
}
function assertCurrentTargetState(target, filesystemRoot = null) { assertIncompatibleStateArchived(filesystemRoot ? path.resolve(filesystemRoot) : currentTargetRoot(target)); }
function input(values, action = null) { return { action, target: identity(values.target), authorityId: identity(values.authority), taskId: values["task-id"], commandId: values["command-id"], sessionId: sessionId(), grantedBy: values["granted-by"], reason: values.reason }; }
function cmdOpen(values) { const command = { target: identity(values.target), filesystemRoot: values["filesystem-root"], placement: values.placement, worktreePath: values["worktree-path"], branch: values.branch, base: values.base, goal: values.goal, writePaths: values["write-path"] ?? [], writeRoots: values["write-root"] ?? [], commandId: values["command-id"], sessionId: sessionId(), grantedBy: values["granted-by"], reason: values.reason }; assertCurrentTargetState(command.target, command.filesystemRoot); return print(values["filesystem-root"] ? openCurrentFilesystemTask(command, RUNTIME) : openCurrentGitTask(command, RUNTIME)); }
function cmdReceipt(values, action) { const target = identity(values.target); if (!target) return error(`${action} requires --target`); assertCurrentTargetState(target); if (isFilesystem(target)) return error(`${action} is unavailable for detached filesystem authorities`); const command = { target, taskId: values["task-id"], message: values.message, commandId: values["command-id"], sessionId: sessionId(), grantedBy: values["granted-by"], reason: values.reason }; return print(action === "stage" ? stageCurrentGitTask(command, RUNTIME) : commitCurrentGitTask(command, RUNTIME)); }
function cmdCertify(values) { const command = input(values); if (!command.target && !command.authorityId) return error("certify requires --target or --authority"); if (command.target && command.authorityId) return error("certify accepts exactly one selector"); if (command.target) assertCurrentTargetState(command.target); const filesystem = command.authorityId || isFilesystem(command.target); const prepared = filesystem ? prepareCurrentFilesystemCertification(command, RUNTIME) : prepareCurrentGitCertification(command, RUNTIME); const observation = runCriterionSource({ kind: "file", value: resolveCriterionFile(prepared.criterion_root, values["criterion-file"]) }, prepared.criterion_root, Number(values["criterion-timeout-seconds"] ?? 120), "tri-state"); if (observation.verdict !== "satisfied") return error(`certify criterion ${observation.verdict}: ${observation.execution.output_tail ?? "no criterion receipt"}`); const digest = sha256Hex(JSON.stringify({ verdict: observation.verdict, execution: observation.execution, changed_paths: observation.changed_paths })); return print(filesystem ? certifyCurrentFilesystemTask(command, prepared, digest, RUNTIME) : certifyCurrentGitTask(command, prepared, digest, RUNTIME)); }
function cmdQuery(values, kind) { const command = input(values); if (!command.target && !command.authorityId) return error(`${kind} requires --target or --authority`); if (command.target && command.authorityId) return error(`${kind} accepts exactly one selector`); if (command.target) assertCurrentTargetState(command.target); const selection = { taskId: values["task-id"] ?? null, sessionId: sessionId() === "cli" ? null : sessionId() }; if (command.authorityId) return print(queryCurrentFilesystemAuthority(command.authorityId, kind, RUNTIME, selection), { publishOutcome: false }); return print(isFilesystem(command.target) ? queryCurrentFilesystem(command.target, kind, RUNTIME, selection) : queryCurrentGit(command.target, kind, RUNTIME, selection), { publishOutcome: false }); }
function cmdMutation(values, action) { const command = input(values, action); if (!command.target && !command.authorityId) return error(`${action} requires --target or --authority`); if (command.authorityId) return print(mutateCurrentFilesystemTask(command, RUNTIME)); assertCurrentTargetState(command.target); return print(isFilesystem(command.target) ? mutateCurrentFilesystemTask(command, RUNTIME) : mutateCurrentGitTask(command, RUNTIME)); }
function cmdRecovery(values, action) { const command = { action, target: values.target, authorityId: values.authority, attachmentId: values.attachment, commandId: values["command-id"], expectedEpoch: values["expect-epoch"], expectedLocatorDigest: values["expect-locator-digest"], expectedPendingDigest: values["expect-pending-digest"], grantedBy: values["granted-by"], reason: values.reason }; if (command.target) assertCurrentTargetState(command.target); return print(command.authorityId || isFilesystem(command.target) ? recoverCurrentFilesystemAttachment(command, RUNTIME) : recoverCurrentGitAttachment(command, RUNTIME)); }
function cmdFork(values) { const command = { target: values.target, attachmentId: values.attachment, commandId: values["command-id"], expectedEpoch: values["expect-epoch"], expectedLocatorDigest: values["expect-locator-digest"], grantedBy: values["granted-by"], reason: values.reason }; assertCurrentTargetState(command.target); return print(isFilesystem(command.target) ? forkCurrentFilesystemIdentity(command, RUNTIME) : forkCurrentGitIdentity(command, RUNTIME)); }
function cmdTailRecovery(values) {
  const command = { target: identity(values.target), authorityId: identity(values.authority), commandId: values["command-id"], expectedValidEndOffset: values["expect-valid-end-offset"], expectedTailDigest: values["expect-tail-digest"], grantedBy: values["granted-by"], reason: values.reason };
  if ((!command.target && !command.authorityId) || (command.target && command.authorityId)) return error("recover-torn-tail requires exactly one --target or --authority selector");
  if (command.target) assertCurrentTargetState(command.target);
  return print(command.authorityId || isFilesystem(command.target) ? recoverCurrentFilesystemAuthorityTail(command, RUNTIME) : recoverCurrentGitAuthorityTail(command, RUNTIME));
}
function cmdExport(values) {
  const command = { target: identity(values.target), authorityId: identity(values.authority), destination: identity(values.output), grantedBy: values["granted-by"], reason: values.reason };
  if ((!command.target && !command.authorityId) || (command.target && command.authorityId)) return error("export-authority requires exactly one --target or --authority selector");
  if (command.target) assertCurrentTargetState(command.target);
  return print(command.authorityId || isFilesystem(command.target) ? exportCurrentFilesystemAuthority(command, RUNTIME) : exportCurrentGitAuthority(command, RUNTIME), { publishOutcome: false });
}
function payload() { try { return JSON.parse(fs.readFileSync(0, "utf8")); } catch { return {}; } }
function emit(invocation, disposition) { const encoded = encodeHook({ invocation, disposition }); if (encoded.stdout) process.stdout.write(encoded.stdout); if (encoded.stderr) process.stderr.write(encoded.stderr); return encoded.exitCode; }
function rawHookEvent(hookPayload) { return String(hookPayload?.hook_event_name ?? hookPayload?.event ?? "").replace(/[-_\s]/g, "").toLowerCase(); }
function cmdHook(values) { const mode = values.mode ?? "nudge"; const hookPayload = payload(); const event = rawHookEvent(hookPayload); if (event === "stop") return 0; if (!new Set(["observe", "nudge", "deny"]).has(mode)) return error("--mode must be observe, nudge, or deny"); if (!EXPLICIT_PROFILES.includes(values.profile)) { if (mode === "deny" && event === "pretooluse") return error(`unsupported hook profile; expected ${EXPLICIT_PROFILES.join("|")}`); return 0; } const invocation = { ...decodeHook({ profile: values.profile, payload: hookPayload }), mode }; if (invocation.event === "stop" || invocation.event === "unknown") return 0; const disposition = invocation.event === "pre_tool_use" ? { event: invocation.event, action: "pass" } : { event: invocation.event, action: "record" }; const targets = [...new Set(writeFileTargets(invocation.toolName, invocation.toolInput).map((target) => path.resolve(invocation.repo, target)))]; const failures = []; if (!targets.length) failures.push("TARGET_ROUTING_UNAVAILABLE"); for (const target of targets) { try { publish(isFilesystem(target) ? recordCurrentFilesystemHook({ target, invocation }, RUNTIME) : recordCurrentGitHook({ target, invocation }, RUNTIME), { silent: true }); } catch (cause) { failures.push(String(cause?.code ?? cause?.message ?? cause).split("\n")[0]); } } if (failures.length) { if (mode === "deny" && invocation.event === "pre_tool_use") return emit(invocation, { event: invocation.event, action: "deny", reason: `provider evidence unavailable (${failures.join("; ")})` }); process.stderr.write(`workloop: provider evidence unavailable; host retains execution authority: ${failures.join("; ")}\n`); } return emit(invocation, disposition); }
function fileDigest(file) { return createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function fsyncFile(file) { const descriptor = fs.openSync(file, "r+"); try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); } }
function fsyncDirectory(directory) { if (process.platform !== "win32") { const descriptor = fs.openSync(directory, "r"); try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); } } }
function cmdArchive(values) {
  if (values["granted-by"] !== "user" || !identity(values.reason)) return error("archive-incompatible-state requires --granted-by user and --reason");
  let root; try { root = resolveGitAuthorityTarget(values.target).worktree_root; } catch { root = path.resolve(values.target); }
  const files = incompatibleArtifacts(root);
  if (!files.length) return error("no incompatible repository artifacts found; no bytes were changed");
  const archive = path.join(root, ".workloop-incompatible-archive", `${Date.now()}-${process.pid}`);
  const artifacts = [];
  try {
    fs.mkdirSync(archive, { recursive: true, mode: 0o700 });
    for (const file of files) {
      const destination = path.join(archive, path.basename(file));
      const temporary = `${destination}.${process.pid}.tmp`;
      fs.copyFileSync(file, temporary, fs.constants.COPYFILE_EXCL);
      const digest = fileDigest(file);
      if (digest !== fileDigest(temporary)) throw new Error(`opaque archive digest mismatch for ${path.basename(file)}`);
      fsyncFile(temporary);
      fs.renameSync(temporary, destination);
      artifacts.push({ name: path.basename(file), sha256: digest, bytes: fs.statSync(file).size });
    }
    const manifest = path.join(archive, "manifest.json");
    const temporaryManifest = `${manifest}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryManifest, `${JSON.stringify({ archive_schema_version: 1, source_root: root, granted_by: "user", reason: values.reason, artifacts }, null, 2)}\n`, { mode: 0o600 });
    fsyncFile(temporaryManifest);
    fs.renameSync(temporaryManifest, manifest);
    fsyncDirectory(archive);
  } catch (cause) { return error(`incompatible archive failed before publication: ${cause.message}`); }
  process.stdout.write(`${JSON.stringify({ archived: true, archive_path: archive, granted_by: "user", reason: values.reason, artifacts }, null, 2)}\n`);
  return 0;
}
function cmdHooks(values) { if (!EXPLICIT_PROFILES.includes(values.profile)) return error(`unsupported hooks profile; expected ${EXPLICIT_PROFILES.join("|")}`); process.stdout.write(`${JSON.stringify(buildHookRecipe({ profile: values.profile, command: values.command ?? process.argv[1], mode: values.mode ?? "nudge" }), null, 2)}\n`); return 0; }
function help() { process.stdout.write("workloop — provider authority Contract\n\nopen|stage|commit|certify|status|audit|ledger|tasks|join|suspend|resume|abandon|recover-attachment|recover-torn-tail|cleanup-staged-locator|reattach|abandon-staged-authority|fork-identity|export-authority|archive-incompatible-state|hook|hooks\n\nHooks observe and record by default; the host exclusively decides tool execution approval.\n"); return 0; }
const COMMANDS = Object.freeze({ open: cmdOpen, stage: (v) => cmdReceipt(v, "stage"), commit: (v) => cmdReceipt(v, "commit"), certify: cmdCertify, status: (v) => cmdQuery(v, "status"), audit: (v) => cmdQuery(v, "audit"), ledger: (v) => cmdQuery(v, "ledger"), tasks: (v) => cmdQuery(v, "tasks"), join: (v) => cmdMutation(v, "join"), suspend: (v) => cmdMutation(v, "suspend"), resume: (v) => cmdMutation(v, "resume"), abandon: (v) => cmdMutation(v, "abandon"), "recover-attachment": (v) => cmdRecovery(v, "recover"), "recover-torn-tail": cmdTailRecovery, "cleanup-staged-locator": (v) => cmdRecovery(v, "cleanup"), reattach: (v) => cmdRecovery(v, "reattach"), "abandon-staged-authority": (v) => print(abandonStagedFilesystemAuthority({ authorityId: v.authority, commandId: v["command-id"], expectedGenesisDigest: v["expect-genesis-digest"], grantedBy: v["granted-by"], reason: v.reason }, RUNTIME)), "fork-identity": cmdFork, "export-authority": cmdExport, "archive-incompatible-state": cmdArchive, hook: cmdHook, hooks: cmdHooks });
function main() { const argv = process.argv.slice(2); if (!argv.length || ["help", "--help", "-h"].includes(argv[0])) return help(); const verb = argv[0]; if (!Object.hasOwn(OPTIONS, verb)) return error(`unknown command: ${verb}; this runtime accepts only the provider Contract`); try { const { values } = parseArgs({ args: argv.slice(1), options: OPTIONS[verb], allowPositionals: false }); return COMMANDS[verb](values); } catch (cause) { return error(cause?.message ?? cause); } }

export { main };
