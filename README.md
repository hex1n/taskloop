# workloop

[中文说明](README.zh-CN.md)

workloop is a dependency-free runtime for **loopengineering**: turning an
agent's intent into a small engineering loop that can be resumed, checked, and
handed over. A loop starts with a bounded goal and write scope, records what
happened, runs an explicit criterion, and leaves evidence for the next human or
agent.

The host owns permission prompts and execution approval. Workloop never becomes
another approval layer; it supplies durable context and evidence around the
host's work.

## The engineering loop

1. **Frame** — open a task with a goal, ownership, and bounded write scope.
2. **Work** — let the agent and host tools make the change in the chosen root.
3. **Observe** — retain task-local receipts without deciding whether tools run.
4. **Verify** — run a read-only acceptance criterion and certify its result.
5. **Continue** — query, suspend, resume, recover, or hand the loop to another
   session without rebuilding its context from chat history.

Git receipts, filesystem identity, recovery journals, Hooks, and outcome
projections are mechanisms that make this loop reliable; they are not the
product's primary workflow.

## Where a loop can run

Each task selects one durable provider for its workspace:

- **Git workspace** — main and linked worktrees can share a repository while
  disjoint tasks retain separate write scopes and task-scoped receipts.
- **Any filesystem directory** — an explicit `--filesystem-root` works outside
  Git, rejects overlapping/nested loops, and needs no repository at all.
- **Dedicated worktree** — an exclusive loop uses one explicit linked worktree
  without changing the caller's current worktree or guessing branch cleanup.

The provider journal makes a loop replayable. Paths are attachments rather than
identity: moving a workspace retains identity, while copying one requires an
explicit recovery, reattach, or fork.

## Run a loop

The public CLI contains only these verbs:

```text
open stage commit certify status audit ledger tasks join suspend resume abandon
recover-attachment cleanup-staged-locator reattach abandon-staged-authority
fork-identity archive-incompatible-state hook hooks
```

Frame a Git-backed loop from a file or directory under the selected worktree:

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

For a non-Git directory, frame the same loop explicitly with the filesystem
provider. Git is not required:

```sh
node bin/workloop.mjs open \
  --filesystem-root /absolute/path/to/data \
  --goal "repair external index" \
  --write-path index.json --command-id open-index-1 \
  --granted-by user --reason "requested repair"
```

Use `--authority <authority-id>` for queries and recovery when an attachment is
unavailable. `status`, `audit`, `ledger`, and `tasks` are read-only.

## Hooks observe; the host approves

Recipes require one explicit host profile:

```sh
node bin/workloop.mjs hooks --profile codex --mode nudge
node bin/workloop.mjs hooks --profile claude --mode nudge
```

`observe` and `nudge` are non-blocking instrumentation: PreToolUse records an
operation intent, PostToolUse records a completion receipt, and Stop releases.
If evidence is unavailable, they fail open; the host retains execution
authority. Only an explicitly configured `deny` PreToolUse mode can return a
rejection, and it does not replace the host's approval system.

Only `codex` and `claude` are valid profiles. `codex-safe` is intentionally not
a valid profile.

## Evidence and recovery

The provider journal is the source of truth. A separate, per-loop outcome shard
is written under `WORKLOOP_AUTHORITY_HOME` (default `~/.workloop`). A missing
or corrupt shard never changes the loop and is rebuilt on the next successful
publication.

Earlier repository artifacts are never migrated or interpreted. With explicit
user provenance, this command copies recognized incompatible files byte-for-byte
into `.workloop-incompatible-archive/` and leaves the source untouched:

```sh
node bin/workloop.mjs archive-incompatible-state --target . \
  --granted-by user --reason "retain pre-provider artifacts"
```

## Current runtime and installation

This release is a hard cut to the provider Contract. It accepts no old
`current-*` command aliases, no old Hook profiles, and no compatibility runtime
pins. It never reads or converts an earlier task runtime.

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
