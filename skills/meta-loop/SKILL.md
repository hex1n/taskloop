---
name: meta-loop
description: Inspect provider authority history to find recurring workflow failures and improvement candidates.
argument-hint: "[authority or time window]"
---

# Meta loop

Use `ledger`, `audit`, and `tasks` as read-only evidence. Treat an outcome shard
as a cache, never as authority. Look for repeated attachment collisions,
uncertain Git receipts, certification failures, or claim conflicts; form one
falsifiable improvement hypothesis and hand it to a new provider task.

Do not infer execution approval from Hook evidence. The host owns approval, and
default Hooks can legitimately have incomplete evidence.
