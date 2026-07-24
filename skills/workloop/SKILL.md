---
name: workloop
description: Run durable provider-authority loops. Use when work must survive sessions or worktrees, multiple sessions share a Git repository or detached directory, or completion requires task-scoped receipts and tri-state certification.
---

# Workloop

Read the [provider authority reference](references/REFERENCE.md) before
mutating a task. Read [criterion adapters](references/ADAPTERS.md) before
selecting or authoring a criterion. For Hook or installation work, also read
[host bindings](references/HOSTS.md).

Treat the host permission decision as execution authority. Hook receipts are
evidence, not permission or certification.

1. Frame the authority. Select `--target` for a Git-contained path or
   `--filesystem-root` for a detached directory. Declare the complete write
   claim and choose replayable command provenance.

   Completion: one provider, one canonical target or root, exhaustive claims,
   and stable command provenance are known.

2. Select the task. Use `open` for a new task, `join` for an existing foreign
   task, disjoint claims for shared-worktree concurrency, or an exclusive
   worktree for overlapping work.

   Completion: the provider returns a task and attachment identity whose
   authority, session, and claims match the intended work.

3. Implement within the declared claim and run focused checks. Let Hooks record
   available evidence while the host remains responsible for execution.

   Completion: all writes stay within the claim and current verification
   evidence exists for the requested change.

4. Produce a receipt. For Git work, run task-scoped `stage` and `commit`. For
   detached-filesystem work, retain the provider journal as the durable receipt.

   Completion: the Git receipt contains only task-owned paths, or the detached
   provider records the completed filesystem mutation without Git-only verbs.

5. Run `certify --criterion-file <file>` with a read-only tri-state adapter.

   Completion: exit `4` records `achieved`; exit `3`, `2`, or `0` leaves the
   task non-terminal with an explicit unsatisfied or indeterminate result.
