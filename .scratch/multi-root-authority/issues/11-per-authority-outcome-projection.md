# 11 — Per-Authority Outcome Projection

**What to build:** Derived outcomes are isolated per authority and can lag, fail, disappear, or rebuild without changing task truth or coupling unrelated repositories and filesystem roots.

**Blocked by:** 07 — Detached Filesystem Authority; 10 — Attachment-Aware Criterion and Terminal Certification.

**Status:** resolved

- [x] Each Git or filesystem authority publishes only to its own outcome shard and cursor.
- [x] Authority and outcome resolvers, locks, and module APIs are physically separate; projection cannot create or repair authority.
- [x] Projection publication occurs after authority locks are released and failure never rolls back a committed event.
- [x] Deleting or corrupting one shard leaves task decisions and all other shards unchanged.
- [x] A shard rebuilds only from verified records of its matching authority.
- [x] Cross-authority queries treat projections as observation caches, not a task catalog or recovery source.

## Comments

- 2026-07-23: Resolved in `a50d047`; provider tests prove independent Git and
  filesystem shards.
