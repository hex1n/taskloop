# Local fix queue

| Issue | Disposition | Type | Severity | Affected scenarios | Suspected area | Post-fix E2E rerun |
|---|---|---|---|---|---|---|
| [ISSUE-001](ISSUE-001-hook-stdin-eagain.md) | OPEN | product/concurrency | P0 | W05, E2E-009, Oracle 7/8 | `lib/application.mjs` Hook stdin boundary | exact `test` workflow, all eight matrix jobs |
| [ISSUE-002](ISSUE-002-windows-reaper-eperm.md) | OPEN | product/Windows concurrency | P0 | W05/W06, E2E-009, Oracle 8 | `lib/task-store.mjs` reaper acquisition | Windows 2022/2025 × Node 22/24 plus full matrix |
