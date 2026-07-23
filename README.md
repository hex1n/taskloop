# workloop

[中文说明](README.zh-CN.md)

workloop is a dependency-free Node.js runtime for auditable, multi-root agent
work. The host owns permission prompts and execution approval. Workloop owns
only durable task authority, task-scoped Git receipts, attachment recovery,
criterion certification, and best-effort outcome projection.

This release is a hard cut to the provider authority Contract. It accepts no
old `current-*` command aliases, no old Hook profiles, and no compatibility
runtime pins. It never reads or converts an earlier task runtime.

## Authority model

Each task belongs to exactly one provider authority:

- A Git common directory authority can have main and linked-worktree
  attachments. Multiple tasks may share an attachment when their write claims
  are disjoint; task-scoped `stage` and `commit` receipts preserve that
  separation.
- A detached filesystem authority is rooted at an explicit `--filesystem-root`.
  It works for directories outside Git and rejects overlapping/nested claims.
- An exclusive worktree task creates or uses one explicit linked worktree. It
  never changes the caller's current worktree or guesses branch cleanup.

Authority records are replayable provider journals. Locators are attachments,
not authority. Moving an attachment retains its identity; copying one creates a
collision that must be recovered, reattached, or explicitly forked.

## Commands

The public CLI contains only these verbs:

```text
open stage commit certify status audit ledger tasks join suspend resume abandon
recover-attachment cleanup-staged-locator reattach abandon-staged-authority
fork-identity archive-incompatible-state hook hooks
```

Open a Git-backed task from a file or directory under the selected worktree:

```sh
node bin/workloop.mjs open \
  --target src/widget.mjs \
  --goal "make the widget deterministic" \
  --write-path src/widget.mjs \
  --write-path tests/widget.test.mjs \
  --command-id open-widget-1 --granted-by user --reason "requested change"

node bin/workloop.mjs stage --target src/widget.mjs --task-id <task-id> \
  --command-id stage-widget-1 --granted-by user --reason "stage only this task"
node bin/workloop.mjs commit --target src/widget.mjs --task-id <task-id> \
  --message "fix: deterministic widget" --command-id commit-widget-1 \
  --granted-by user --reason "commit only this task"
node bin/workloop.mjs certify --target src/widget.mjs --task-id <task-id> \
  --criterion-file acceptance.mjs --command-id certify-widget-1 \
  --granted-by user --reason "criterion passed"
```

The certification adapter is read-only and uses tri-state exit codes: `4`
means satisfied, `3` unsatisfied, and `2` indeterminate. Certification also
requires the task's matching clean Git receipt to remain landed.

For a non-Git directory, select the filesystem provider explicitly:

```sh
node bin/workloop.mjs open \
  --filesystem-root /absolute/path/to/data \
  --goal "repair external index" \
  --write-path index.json --command-id open-index-1 \
  --granted-by user --reason "requested repair"
```

Use `--authority <authority-id>` for queries and recovery when an attachment is
unavailable. `status`, `audit`, `ledger`, and `tasks` are read-only.

## Hooks and approval

Recipes require one explicit host profile:

```sh
node bin/workloop.mjs hooks --profile codex --mode nudge
node bin/workloop.mjs hooks --profile claude --mode nudge
```

`observe` and `nudge` are non-blocking. PreToolUse records an operation intent,
PostToolUse records a completion receipt, and Stop releases. If provider
evidence is unavailable, these modes fail open and report that the host still
owns execution authority. Only an explicitly configured `deny` PreToolUse mode
can return a rejection; it does not replace the host's approval system.

Only `codex` and `claude` are valid profiles. `codex-safe` is intentionally not
a valid profile.

## Outcome projection and incompatible state

Provider authority is the source of truth. A separate, per-authority outcome
shard is written under `WORKLOOP_AUTHORITY_HOME` (default `~/.workloop`). A
missing or corrupt shard never changes provider adjudication and is rebuilt on
the next successful publication.

Earlier repository artifacts are never migrated or interpreted. With explicit
user provenance, this command copies recognized incompatible files byte-for-byte
into `.workloop-incompatible-archive/` and leaves the source untouched:

```sh
node bin/workloop.mjs archive-incompatible-state --target . \
  --granted-by user --reason "retain pre-provider artifacts"
```

## Installation

```sh
node install.mjs
npm test
node bin/workloop.mjs help
```

Installation stages one runtime digest and activates its shims only after
managed skills succeed. Hook configuration remains host-owned: the installer
does not rewrite it. If an existing Codex workloop Hook does not use
`--profile codex`, installation refuses activation before it stages skills or
replaces a shim. Update the Hook configuration manually, then rerun install.

Use `WORKLOOP_INSTALL_HOME` for isolated install tests. The installer preserves
unowned or locally modified skill trees instead of adopting them.

## Verification

`npm test` covers the provider transaction seam, installer activation gate,
Git main/linked/exclusive-worktree authorities, task-scoped Git receipts,
detached filesystem authorities, attachment recovery, and independent outcome
shards.
