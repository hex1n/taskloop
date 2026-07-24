---
name: judgmentloop
description: Run rubric-gated provider reviews. Use when a deliverable needs an independent reviewer, a pre-registered rubric, a human-owned verdict artifact, and Workloop certification.
---

# Judgment loop

Read the [provider authority reference](../workloop/references/REFERENCE.md)
before opening the review task and
[criterion adapters](../workloop/references/ADAPTERS.md)
before implementing its gate.

1. Freeze the deliverable revision, rubric, reviewer independence rule, and
   selected provider authority.

   Completion: the review inputs identify one immutable deliverable, one
   pre-registered rubric, one eligible reviewer, and explicit write claims.

2. Obtain the independent review and record the human verdict in an artifact
   outside the reviewer-controlled result.

   Completion: the verdict binds the deliverable revision and rubric, records
   every blocking item, and remains under human ownership.

3. Implement a read-only criterion adapter over the bound verdict. Map rubric
   satisfaction to exit `4`, rejection to `3`, and missing, stale, or
   unverifiable evidence to `2`.

   Completion: the adapter cannot mutate the deliverable or verdict and its
   three outcomes are reproducible from the recorded evidence.

4. Use the provider workflow: `open` or `join`, then task-scoped `stage` and
   `commit` for Git work, followed by `certify`.

   Completion: the provider records a matching receipt and certification
   reaches `achieved` only when the rubric gate returns exit `4`.
