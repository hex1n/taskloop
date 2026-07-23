# Provider authority reference

Workloop's current Contract supervises a task through a provider authority. It
does not grant tool permission: the host alone approves or rejects execution.

## Authority and task identity

Git tasks are recorded in a Git-common authority and selected through an
attachment in the main or a linked worktree. Detached filesystem tasks are
recorded under an explicit filesystem root. An attachment is not authority;
moving it preserves identity, while copying it creates a collision.

Every mutating command has replayable `--command-id`, `--granted-by`, and
`--reason` provenance. A task has a declared write claim. Concurrent tasks may
share an attachment only when their claims are disjoint.

## Lifecycle

Provider tasks are `active`, `suspended`, or `terminal`. Terminal outcomes are
`achieved` and `abandoned`. Use `join`, `suspend`, `resume`, and `abandon` with
the selected `--target` or `--authority`; never hand-write an authority journal.

For Git, `stage` and `commit` create task-scoped receipts. `certify` runs a
read-only tri-state criterion and requires the matching clean receipt to remain
landed. For filesystem tasks, `certify` has no Git receipt requirement.

## Criteria

A criterion file is executed only by `certify` and must be read-only:

- exit `4`: satisfied;
- exit `3`: unsatisfied;
- exit `2`: indeterminate.

Use an explicit `--criterion-file` relative to the selected target's root.
Do not infer completion from a Hook, a task intent, or an outcome shard.

## Hooks

Only `claude` and `codex` profiles exist. Generated `observe` and `nudge`
recipes record evidence and release; the host keeps execution approval.
Unsupported profiles in these non-enforcing modes release without recording so
a stale host configuration cannot deadlock the session. They are not accepted
profiles and must be manually corrected before the next installation.

`deny` is an explicit PreToolUse policy mode. Codex Stop always releases.

## Installation and incompatible artifacts

Host Hook files are owner-managed. Installation never rewrites them and refuses
to activate a new runtime when a detected Codex Workloop Hook is not exactly
`hook --profile codex`. Update the configuration manually, then reinstall.

Earlier `.workloop` task artifacts are opaque. The only supported preservation
operation is `archive-incompatible-state --granted-by user --reason ...`; it
copies recognized source files byte-for-byte and never migrates, parses,
replaces, or deletes them.
