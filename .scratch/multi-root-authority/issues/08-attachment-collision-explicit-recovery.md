# 08 — Attachment Collision and Explicit Recovery

**What to build:** Attended, idempotent recovery paths for interrupted locator publication, staged artifacts, copied identities, unavailable anchors, and collisions across both authority providers.

**Blocked by:** 04 — Git Attachment and Linked-Worktree Lifecycle; 07 — Detached Filesystem Authority.

**Status:** ready-for-agent

- [ ] Pending locator recovery validates authority, attachment, token, epoch, staged/final digests, and stable anchor before publishing the unique final event.
- [ ] Staged locator cleanup and staged authority abandonment require explicit user provenance and cannot delete committed task history.
- [ ] Two live anchors carrying one claim enter collision and neither receives clean task evidence.
- [ ] Reattach increments claim epoch, binds one selected anchor, and makes every old locator stale.
- [ ] Identity fork creates a new attachment or detached authority without copying task history or creating dual routing.
- [ ] Every command is crash-idempotent by command identity and cannot be invoked automatically by Hooks, reconciliation, or installation.
