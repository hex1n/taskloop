# Workloop repository

## Start and verify

This repository implements a provider-neutral loop-engineering runtime.

- `npm test` verifies the runtime, installer, provider matrix, and packaged
  Skill contract.
- `node tests/verify-provider-tickets.mjs` verifies the Ticket 02–10 acceptance
  criteria.
- `node bin/workloop.mjs help` prints the public Contract and verb surface.

## Architecture

- `bin/workloop.mjs` is the only runtime process entry.
- `lib/provider-application.mjs` is the only public application assembly.
- Keep public verbs exactly aligned with `help` and the current Contract.
- Git and detached-filesystem providers own replayable authority journals;
  locators are attachments while provider authority remains canonical.
- Task-scoped Git receipt operations stage and commit only the selected task's
  paths. Concurrent disjoint tasks may share an attachment; overlapping claims
  are rejected.
- Detached-filesystem authority uses an explicit root outside or inside Git and
  requires non-overlapping roots.
- Outcome shards in `WORKLOOP_AUTHORITY_HOME` are best-effort projections and
  never adjudication inputs.

## Host contract

- The host owns execution approval and its Hook files. Workloop installs
  runtime and Skill assets without rewriting host Hook configuration.
- `observe` and `nudge` record available evidence and release on routing or
  configuration failure. Codex Stop always releases.
- Explicit `deny` PreToolUse is the only Workloop mode that may reject.
- `claude` and `codex` are the complete Hook profile set.
- A stale or unsupported `observe`/`nudge` invocation is released with a
  diagnostic and no recording; explicit `deny` rejects it.
- Installer activation preflight accepts a discovered Codex Workloop handler
  only when it uses `--profile codex`, and it replaces only proven
  Workloop-owned runtime and Skill assets.

## State and recovery

- Treat earlier `.workloop` task artifacts as opaque. Preserve recognized files
  byte-for-byte with `archive-incompatible-state`, explicit user provenance,
  and a reason; leave the source in place.
- Attachment move, copy/collision, reattach, cleanup, and identity fork paths
  preserve durable truth and use idempotent command provenance.
- Provider modules stay independent of the retired event/task runtime.

## Change contract

- Assert behavior at public seams. Source-text assertions are reserved for
  shipped Contract text, package closure, and removed runtime surfaces.
- Add a focused acceptance test for each new invariant and include it in
  `npm test`.
- Keep the source Skill tree, installer package closure, and
  `tests/skills.test.mjs` synchronized.
