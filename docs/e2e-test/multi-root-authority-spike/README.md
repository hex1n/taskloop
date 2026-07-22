# Multi-root authority mechanism evidence

Ticket 01 is a decision-blocking portability gate. It passes only when the public disposable adapter succeeds in all eight supported cells—Node 22 and 24 on macOS, Linux, Windows Server 2022, and Windows Server 2025—at one exact candidate SHA.

The dedicated `multi-root-authority-spike` workflow emits one receipt per cell only after that cell completes. Its aggregate job downloads exactly eight receipts, verifies platform, Node major, runner, job, canonical repository, run ID, run attempt, canonical workflow ref, candidate SHA, and the digest manifest of the complete executable gate source closure. It then emits `multi-root-authority-proof.json` and signs that exact file with GitHub artifact attestation.

No hand-maintained `passed` summary is authoritative. To continue after CI:

1. Download the `multi-root-authority-proof-<SHA>` artifact from the successful workflow run.
2. Place its JSON file at `docs/e2e-test/multi-root-authority-spike/proof.json` without editing it.
3. Run the Workloop criterion. It revalidates all eight cells and current source digests, then invokes `gh attestation verify` against the independently fixed `hex1n/workloop` repository, canonical signer workflow, source digest, and hosted-runner constraint.

The adapter suite proves:

- real Git-common and detached authority genesis/append through a shared public seam;
- cross-process serialization, live-owner timeout, competing dead-owner reapers, non-reentrant lock ordering, and monotonic hash-chained records;
- in-process framed append, write-all, file fsync, first-create parent sync on POSIX, and recoverable torn tails without a child process inside the authority lock;
- staged/pending/claimed locator journals with digest-only authority tokens, including explicit digest-bound recovery and durable authority receipts for a partially created initial locator;
- durable tail-recovery intents that block all authority use after truncate until the exact recovery receipt lands, including partial intent/genesis/receipt frames;
- bounded authority transactions that reserve emergency bytes/records, preflight every remaining canonical frame before the first write, and block unrelated mutations until the same command completes or an attended recovery consumes the reserve;
- attended staged cleanup, terminal staging-shard abandonment, monotonic reattach, and one-authority-at-a-time detached identity fork with full success/abort capacity preflight, destination reservation, source-intent and source-ready barriers, digest-bound partial-tail recovery, and an idempotent source abort resolution when attended destination abandonment wins before source-ready;
- Git linked-worktree move, registered-missing, remove, prune, same-path reuse, admin-dir anchors, locator loss, live copy collision, and symlink alias deduplication;
- filesystem same-volume rename, deletion, same-path recreation, real cross-volume reattach, stable-anchor unavailability, and copied-locator collision;
- target-first provider routing for tracked, ignored, untracked, nonexistent, nested, transition, Git, root-local, and HOME control-plane paths; and
- a public stdin Hook process that decodes host payloads and performs target-to-provider-to-claim routing, plus real lock-timeout, corrupt authority, failed telemetry, pending, collision, unavailable, and protected-target chains with byte-exact nonblocking Claude/Codex output.

The local criterion reruns only deterministic, unprivileged coverage. Real cross-volume capability setup is enabled exclusively in the attested CI matrix; a local environment that cannot mount or expose a second volume therefore cannot invalidate a valid hosted-runner proof.
