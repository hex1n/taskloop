# 13 — Cross-Platform Release Gate and Final Review

**What to build:** One exact release candidate proves the entire provider-based authority contract through public behavior on every supported platform and receives the required independent technical GO.

**Blocked by:** 12 — Current-Format Hard Cut and Install Activation.

**Status:** claimed

- [x] Public CLI and Hook behavior, real Git and filesystem lifecycle, crash recovery, routing, placement, Git receipts, criteria, outcomes, hard cut, and installation all pass locally.
- [ ] Portable macOS/Linux and Windows 2022/2025 matrices pass for every supported Node version on the exact candidate SHA.
- [ ] Release evidence contains no duplicate sequence, split authority, simultaneous lock ownership, unsafe recovery, path-based identity reuse, or clean evidence from protected/pending/collided targets.
- [x] Default Hook modes never block host execution because of authority, telemetry, or projection failure.
- [ ] A fresh independent complete review reports zero blocking findings on the exact candidate revision.
- [ ] The final report names any advisory findings, unsupported lifecycle boundary, and deliberately deferred live-host evidence without promoting it to a pass.

## Comments

- 2026-07-23: Claimed. The release gate requires an explicit `--proof` file,
  whose candidate SHA must equal the checked-out source; the catalog itself
  does not certify a candidate. Current provider tests and the fresh exact-SHA
  independent review remain pending after the final candidate is published.
