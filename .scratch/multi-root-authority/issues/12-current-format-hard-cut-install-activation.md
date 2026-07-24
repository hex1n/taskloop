# 12 — Current-Format Hard Cut and Install Activation

**What to build:** Activate the completed provider-based runtime as the only current format, preserve incompatible bytes through explicit opaque archive operations, and remove every temporary or legacy execution path without modifying host-owned configuration implicitly.

**Blocked by:** 08 — Attachment Collision and Explicit Recovery; 10 — Attachment-Aware Criterion and Terminal Certification; 11 — Per-Authority Outcome Projection.

**Status:** resolved

- [x] Current commands detect but never read, migrate, dual-read, dual-write, or continue older task authorities and Contract 5/6 task state.
- [x] Explicit archive operations copy, fsync, digest-verify, and publish opaque legacy bytes before any replacement; failure preserves the source.
- [x] Repository-scoped activation cannot alter unrelated user-level shards or old monolithic outcomes.
- [x] Installation activates only the current runtime and never converts repository, filesystem-root, outcome, or host Hook state automatically.
- [x] Temporary expand-side dispatch and all obsolete compatibility branches are deleted in the contract step.
- [x] CLI, Hook recipes, portable skills, help, reports, and operating documentation describe one provider-based model and preserve host-authoritative defaults.

## Comments

- 2026-07-23: Resolved in `00ffaa5`. Installer preflight protects a stale
  host-owned profile without mutating it; default stale Hooks release while
  explicit deny rejects; public runtime and skills expose only the provider
  Contract.
