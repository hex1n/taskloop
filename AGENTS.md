# workloop repository

## Start and verify

This repository ships the provider-authority Workloop runtime. Run `npm test`
before handoff, and `node bin/workloop.mjs help` to inspect the public Contract.

## Current Contract

- `bin/workloop.mjs` is only the process entry.
- `lib/provider-application.mjs` is the only public application assembly.
- Public verbs are listed by `help`; do not add command aliases or legacy
  runtime routes.
- Git and detached-filesystem providers own replayable authority journals;
  locators are attachments, never authority.
- Task-scoped Git receipt operations stage and commit only the selected task's
  paths. Concurrent disjoint tasks may share an attachment; overlapping claims
  are rejected.
- Every filesystem root is explicit. It may be outside Git and must not overlap
  another detached authority.

## Hooks and installation

- The host exclusively decides whether a tool executes. Default `observe` and
  `nudge` Hooks only observe/record and must fail open.
- Only explicit `deny` PreToolUse may return a rejection. Codex Stop always
  releases.
- Only `claude` and `codex` Hook profiles exist. Do not add `codex-safe`,
  profile aliases, or a compatibility fallback.
- A stale or unsupported `observe`/`nudge` invocation is released with a
  diagnostic and no recording; it is not an accepted profile. `deny` rejects
  it. This preserves the default non-blocking host contract during manual
  configuration repair.
- Host Hook files are owner-managed. The installer must never rewrite them.
  It must refuse activation before replacing a shim when it detects a Workloop
  Codex Hook that is not `--profile codex`.
- The installer does not adopt legacy runtime pins or unproven skill trees.

## State and recovery

- Provider authority is canonical; outcome shards in `WORKLOOP_AUTHORITY_HOME`
  are best-effort caches and never an input to adjudication.
- Earlier `.workloop` task artifacts are opaque. Never parse or migrate them.
  `archive-incompatible-state` may only copy recognized files with both explicit
  user provenance and a reason; it never replaces or deletes the source.
- Attachment move, copy/collision, reattach, cleanup, and identity fork paths
  must preserve durable truth and use idempotent command provenance.

## Scope discipline

- Preserve untracked user files and unrelated working-tree changes.
- Keep provider modules independent of the retired event/task runtime. Tests
  should exercise behavior, not source-text wording, unless the public Contract
  itself is being asserted.
- When a new invariant is added, add a focused acceptance test and include it
  in `npm test`.
