---
name: meta-loop
description: Diagnose recurring provider-authority failures. Use when ledger, audit, or task history shows repeated collisions, uncertain receipts, certification failures, or claim conflicts and one falsifiable workflow improvement should be opened.
---

# Meta loop

Read the [provider authority reference](../workloop/references/REFERENCE.md)
before interpreting task history. Treat provider authority as canonical and
outcome shards as best-effort caches.

1. Capture `ledger`, `audit`, and `tasks` from the same selected authority
   without mutating it.

   Completion: the evidence names its authority identity, task identities,
   sequence bounds, and any integrity gaps.

2. Group repeated attachment collisions, uncertain Git receipts, certification
   failures, or claim conflicts. Keep one-off observations separate.

   Completion: every candidate pattern cites the exact recurring records and
   distinguishes authority facts from outcome-cache or Hook evidence.

3. Select one root-cause hypothesis and define one intervention, one observable
   prediction, and one read-only criterion.

   Completion: the hypothesis can be falsified, the predicted evidence is
   measurable, and no Hook receipt is treated as execution approval.

4. Hand the intervention to a new provider task with explicit claims.

   Completion: the new task owns only the proposed change surface and leaves
   the host responsible for execution approval.
