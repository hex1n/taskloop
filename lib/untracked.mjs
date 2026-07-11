import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { STATE_DIR, isPlainObject, repoRelative } from "./prims.mjs";

const UNTRACKED_FILE = "untracked-writes.json";
const UNTRACKED_TTL_MS = 24 * 60 * 60 * 1000;
const foldCase =
  process.platform === "win32" || process.platform === "darwin" ? (value) => value.toLowerCase() : (value) => value;

function untrackedPath(repo) {
  return path.join(repo, STATE_DIR, UNTRACKED_FILE);
}

function clearUntracked(repo) {
  try {
    fs.rmSync(untrackedPath(repo), { force: true });
  } catch {
    /* best-effort: a stale slate only re-nudges */
  }
}

function loadUntracked(repo) {
  try {
    const parsed = JSON.parse(fs.readFileSync(untrackedPath(repo), "utf8"));
    if (isPlainObject(parsed) && isPlainObject(parsed.sessions)) return parsed;
  } catch {
    /* missing or corrupt scratch is an empty slate */
  }
  return { sessions: {} };
}

function repoInsideRelative(repo, raw) {
  const rel = repoRelative(repo, raw);
  if (!rel) return null;
  const root = path.resolve(String(repo));
  const abs = path.resolve(root, String(raw).replace(/\\/g, "/"));
  return abs.startsWith(root + path.sep) ? rel : null;
}

function observeUntracked({ payload, repo, writeShaped, writeTargets, scriptPath, now = Date.now() }) {
  if (!writeShaped) return { kind: "allow" };
  const sessionRaw = payload.session_id;
  const session = typeof sessionRaw === "string" && sessionRaw.trim() ? sessionRaw : null;
  const state = loadUntracked(repo);
  for (const [sid, bucket] of Object.entries(state.sessions)) {
    if (!isPlainObject(bucket) || !(now - Date.parse(bucket.ts ?? "") < UNTRACKED_TTL_MS)) {
      delete state.sessions[sid];
    }
  }
  const known = new Set(session ? (state.sessions[session]?.files ?? []) : []);
  for (const raw of writeTargets) {
    const rel = repoInsideRelative(repo, raw);
    if (rel) known.add(foldCase(rel));
  }
  const files = [...known].sort();
  if (session) {
    state.sessions[session] = { files, ts: new Date(now).toISOString() };
    try {
      fs.mkdirSync(path.join(repo, STATE_DIR), { recursive: true });
      fs.writeFileSync(untrackedPath(repo), JSON.stringify(state, null, 2) + "\n", "utf8");
    } catch {
      /* the nudge must never break the tool call */
    }
  }
  const openTemplate =
    `  node "${scriptPath}" open --repo "${repo}" --goal "<one line>" ` +
    '--criterion "<executable check, red until done>" ' +
    '--alignment "green => goal because <...>; not covered: <...>" --files "<glob>"';
  if (session && files.length >= 2) {
    return {
      kind: "deny",
      message:
        `taskloop: untracked multi-file work this session (${files.join(", ")}). ` +
        "The lightweight default covers a single-file tweak; wider work opens a task first:\n" +
        openTemplate,
    };
  }
  return {
    kind: "notice",
    message:
      "taskloop: no open task — single-file so far; if this is landing wider work, open a task before the next file:\n" +
      openTemplate,
  };
}

export { clearUntracked, observeUntracked };
