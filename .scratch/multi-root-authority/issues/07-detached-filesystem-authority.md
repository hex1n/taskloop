# 07 — Detached Filesystem Authority

**What to build:** A non-Git filesystem root can participate in Workloop through a detached authority and protected locator, preserving task truth when the root is moved or deleted without inventing Git behavior.

**Blocked by:** 03 — Git Main-Worktree Authority Tracer Bullet; 05 — Partitioned Multi-Task and Target-First Routing.

**Status:** resolved

- [x] Explicit filesystem-root open creates one detached authority and one final locator claim; the root contains no task authority.
- [x] Filesystem tasks support partitioned scopes, sessions, artifacts, criteria, lifecycle, status, audit, and replay.
- [x] A stable same-object move updates path observation; an unprovable or cross-volume move becomes reattach required.
- [x] Root deletion preserves an unavailable authority, while same-path recreation receives a new identity.
- [x] Filesystem tasks expose no Git stage or commit operations.
- [x] Git initialization inside a claimed filesystem root produces an explicit authority-kind conflict rather than automatic migration or dual authority.

## Comments

- 2026-07-23: Resolved. The provider suite covers detached authority identity,
  move/delete/recreate behavior, collision recovery, Git-kind conflicts, and
  nonblocking Hooks. Ticket criterion emitted satisfied.
