# 11 — Per-Authority Outcome Projection

**What to build:** Derived outcomes are isolated per authority and can lag, fail, disappear, or rebuild without changing task truth or coupling unrelated repositories and filesystem roots.

**Blocked by:** 07 — Detached Filesystem Authority; 10 — Attachment-Aware Criterion and Terminal Certification.

**Status:** ready-for-agent

- [ ] Each Git or filesystem authority publishes only to its own outcome shard and cursor.
- [ ] Authority and outcome resolvers, locks, and module APIs are physically separate; projection cannot create or repair authority.
- [ ] Projection publication occurs after authority locks are released and failure never rolls back a committed event.
- [ ] Deleting or corrupting one shard leaves task decisions and all other shards unchanged.
- [ ] A shard rebuilds only from verified records of its matching authority.
- [ ] Cross-authority queries treat projections as observation caches, not a task catalog or recovery source.
