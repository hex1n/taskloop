# 10 — Attachment-Aware Criterion and Terminal Certification

**What to build:** Criterion observations and terminal decisions authenticate the selected attachment, artifact checkpoint, task revision, placement availability, and landed Git receipt without holding critical locks during external execution.

**Blocked by:** 08 — Attachment Collision and Explicit Recovery; 09 — Task-Scoped Git Stage and Commit Receipts.

**Status:** resolved

- [x] Criterion execution runs under its independent lease and never while the authority or Git operation lock is held.
- [x] Observation commit rejects concurrent authority, artifact, placement, scope, generation, or landing drift as stale.
- [x] Pending, collision, reattach-required, and unavailable attachments cannot achieve.
- [x] Git terminal certification rechecks that the receipt remains landed and task paths were not subsequently reversed.
- [x] Filesystem tasks use the same freshness and lifecycle rules without requiring a Git receipt.
- [x] Default Hooks remain release-only/nonblocking and explicit proof verbs perform closure adjudication.

## Comments

- 2026-07-23: Resolved in `3ccec0d`; Ticket 10 criterion emitted satisfied.
