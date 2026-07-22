# 10 — Attachment-Aware Criterion and Terminal Certification

**What to build:** Criterion observations and terminal decisions authenticate the selected attachment, artifact checkpoint, task revision, placement availability, and landed Git receipt without holding critical locks during external execution.

**Blocked by:** 08 — Attachment Collision and Explicit Recovery; 09 — Task-Scoped Git Stage and Commit Receipts.

**Status:** ready-for-agent

- [ ] Criterion execution runs under its independent lease and never while the authority or Git operation lock is held.
- [ ] Observation commit rejects concurrent authority, artifact, placement, scope, generation, or landing drift as stale.
- [ ] Pending, collision, reattach-required, and unavailable attachments cannot achieve.
- [ ] Git terminal certification rechecks that the receipt remains landed and task paths were not subsequently reversed.
- [ ] Filesystem tasks use the same freshness and lifecycle rules without requiring a Git receipt.
- [ ] Default Hooks remain release-only/nonblocking and explicit proof verbs perform closure adjudication.
