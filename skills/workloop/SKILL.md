---
name: workloop
description: Run provider-authority tasks with explicit ownership, receipts, and certification.
argument-hint: "[goal + target + write claims + criterion]"
---

# Workloop provider workflow

Use this skill when work must be durable across sessions or worktrees. The host
approves execution; Workloop does not replace the host permission decision.

1. Choose a provider. Use `--target` for a Git-contained path or
   `--filesystem-root` for an explicit detached directory. Declare every write
   path/root and use a replayable command id.
2. Open exactly one task with `open`. For a foreign active task, use `join`; for
   parallel work use disjoint claims or an explicit exclusive worktree.
3. Make the requested change and run focused checks. Hooks may record evidence
   but default modes never block work or certify completion.
4. For Git work, run task-scoped `stage` then `commit`; do not stage another
   task's paths. For filesystem work, skip these Git-only verbs.
5. Run `certify --criterion-file <file>`. The criterion must be read-only and
   exit 4/3/2 for satisfied/unsatisfied/indeterminate.

Read `../loop-core/REFERENCE.md` and `../loop-core/ADAPTERS.md` before opening
a task. Preserve existing incompatible artifacts with explicit user provenance;
never migrate or reinterpret them.
