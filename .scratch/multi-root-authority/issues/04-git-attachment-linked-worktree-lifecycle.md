# 04 — Git Attachment and Linked-Worktree Lifecycle

**What to build:** Stable Git attachment identities across main and linked worktrees, so tasks survive worktree movement, disappearance, removal, and pruning without letting path reuse or copied locators inherit old history.

**Blocked by:** 03 — Git Main-Worktree Authority Tracer Bullet.

**Status:** ready-for-agent

- [ ] Each linked worktree receives a generated attachment identity anchored to the common authority and its stable Git administration object.
- [ ] Move updates only path observation when the same attachment anchor remains provable.
- [ ] Remove and prune preserve tasks and report placement unavailable instead of deleting authority.
- [ ] A new worktree at an old path receives a new attachment identity and cannot route an old task.
- [ ] Repository task queries include unavailable attachments without treating Git worktree enumeration as the task catalog.
