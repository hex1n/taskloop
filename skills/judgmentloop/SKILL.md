---
name: judgmentloop
description: Run a human-rubric review whose recorded verdict is certified through a provider task.
argument-hint: "[deliverable + rubric + selected authority]"
---

# Judgment loop

Use a pre-registered rubric and an independent reviewer. Record the human
verdict in an artifact outside the reviewer-controlled result, then use a
read-only criterion adapter that returns 4 only when the rubric is satisfied.

The task still follows the provider workflow: open with explicit write claims,
commit only task-owned Git paths when applicable, and close with `certify`.
Review prose is evidence for people; the criterion is the machine gate.
