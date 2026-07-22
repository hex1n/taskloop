# 09 — Task-Scoped Git Stage and Commit Receipts

**What to build:** Partitioned and exclusive Git tasks can stage and commit only their declared paths and receive a clean receipt only when immutable commit content and postconditions prove unique attribution.

**Blocked by:** 05 — Partitioned Multi-Task and Target-First Routing; 06 — Exclusive Worktree Placement.

**Status:** ready-for-agent

- [ ] Stage uses task path selection and preserves every staged entry belonging to another task.
- [ ] Commit diff paths are a subset of task scope and bind prior HEAD, parent relation, immutable commit object, index postcondition, and authority sequence.
- [ ] Direct host add, commit, reset, checkout, index mutation, or HEAD movement at every phase prevents a false clean receipt.
- [ ] A successful but non-unique host Git operation remains host-successful and becomes uncertain Workloop evidence.
- [ ] Different linked worktrees do not share the task-level Git operation lock.
