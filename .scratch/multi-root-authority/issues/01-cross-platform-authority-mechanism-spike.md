# 01 — Cross-Platform Authority Mechanism Spike

**What to build:** A disposable, public-test-seam spike that proves the selected Git common authority and detached filesystem authority can provide durable locking, locator publication, stable attachment anchors, crash recovery, and control-plane exclusion on every supported platform before product implementation starts.

**Blocked by:** None — can start immediately.

**Status:** claimed

- [ ] One bounded spike exercises common and detached authority genesis/append, lock owner and reaper behavior, torn tails, staged/pending/final locator publication, and crash recovery.
- [ ] The spike distinguishes move, copy, path reuse, remove, prune, unavailable anchor, and collision without treating a path or locator alone as identity.
- [ ] Direct Git and Workloop control-plane targets never become clean task evidence, while default Hook semantics remain nonblocking.
- [ ] macOS, Linux, Windows 2022, and Windows 2025 receipts are bound to one exact candidate SHA and all report passed.
- [ ] Any failed platform guarantee blocks Ticket 02 and records which fallback provider decision must be reopened.


## Comments

- 2026-07-22: Claimed for the decision-blocking mechanism spike. The local Node 26/macOS run passes all mechanism assertions; this is diagnostic only, not a supported-matrix receipt. Eight exact-SHA GitHub Actions receipts for Node 22/24 across macOS, Linux, Windows 2022, and Windows 2025 remain pending, so Ticket 02 stays blocked.
- 2026-07-22: The CI workflow now runs the spike in all eight supported matrix cells and uploads one machine-readable receipt per cell containing platform, Node major, status, and exact `GITHUB_SHA`. `evidence.json` remains pending until those artifacts exist and agree; no local or synthetic receipt is promoted.

- 2026-07-22: Fresh-context two-axis implementation review rejected the first test-only spike with 8 blocking findings (Windows durability, proof provenance, public seam, real cross-volume/collision, cross-process locking, recovery boundaries, real control targets, and Hook failure chains). The obsolete criterion/test/manual evidence JSON were moved recoverably to `/private/tmp/workloop-obsolete-ticket01/`; none can unlock the gate.
- 2026-07-22: A replacement public adapter, worker, real cross-volume/concurrency/recovery suite, dedicated eight-cell workflow, aggregate proof builder, and GitHub artifact-attestation verifier are now under local validation. Checklist items remain open until fresh-context re-review and remote proof succeed.
