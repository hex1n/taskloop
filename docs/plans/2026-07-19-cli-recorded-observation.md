# CLI-recorded observations: `verify --record` and the `cli_verify` source

Status: implemented with this document (same batch).
Provenance: two live workloop runs on 2026-07-19 whose ledgers show `rounds 0/8`
against 84 supervised writes — a single-session agent that never stops mid-work
produces no Stop observations, so round accounting, the stuck three-identical-
signatures detector, and failure-signature provenance all sit dark for exactly
the usage class the loop most targets.

## Decision

Add a `--record` flag to `verify` that persists the observation it already
runs, as a first-class `criterion_observed` event with a new observation source
`cli_verify`. This is a deliberate interface change to a frozen contract
surface and follows the AGENTS.md rule: the event-schema enum is extended at
the schema definition sites and in the runtime-contract-5 fixture in the same
change, with byte-exact hook protocol output untouched.

## Semantics

- `verify` without `--record` is unchanged: read-only observation, side-effect
  commits only, verdict exit codes (0 satisfied / 1 unsatisfied / 2 otherwise).
- `verify --record` requires an active task. It runs the observation under the
  task lock (as Stop does) and issues the engine's existing `observe` command
  with `source: "cli_verify"`, `autoSuspend: true`, and `closeEpisode: false`
  — the session continues, so the episode stays open; a resulting suspension
  leaves episode closure to `resume`'s existing catch-up.
- Budget incentives are self-aligning: an unsatisfied recorded observation
  burns the task's own round budget and appends an attempt (streak, signature),
  so honest recording pays; not recording is exactly the status quo.
- A satisfied recorded observation behaves like a satisfied Stop observation:
  under the `default` policy an eligible closure auto-closes the task. That is
  the policy's existing meaning, not new behavior.
- Lifecycle events triggered by a recorded observation (`task_suspended`,
  `task_terminal`) carry lifecycle source `cli`, not `cli_verify`: the
  observation-source enum (`open|stop|achieve|cli_verify`) and the lifecycle
  source enum (`cli|stop`) answer different questions, and a CLI-initiated
  transition is a `cli` transition. The observe decider maps this explicitly;
  the previous behavior (Stop observations map to `stop`) is unchanged.
- An unsatisfied recorded observation refreshes the witness with
  `source_event: "cli_verify"`, extending the witness enum alongside the
  payload enum.

## Frozen-surface changes (all in this batch)

- `lib/event-store.mjs` `PAYLOAD_CONTRACTS.criterion_observed.source`:
  `enum:open|stop|achieve` → `enum:open|stop|achieve|cli_verify`.
- `历史任务状态运行时` witness `source_event` validation set gains
  `cli_verify`.
- `tests/fixtures/runtime-contract-5.mjs`: both frozen enum spellings updated —
  the fixture exists to make schema drift explicit, and this document is that
  explicit declaration.
- Hook protocol stdout/stderr: untouched; no deny/hold reason changes.

## Non-goals

- No observation spam vocabulary: guidance (workloop skill) says record when
  the verdict changed or is unsatisfied; the engine does not rate-limit.
- No foreign-session gate on `--record`: it shares the CLI verbs' local
  collaborative trust model, and burning a task's rounds is self-defeating as
  an attack.
- Stage-3 items from the same retrospective (review-receipt runtime flag,
  risk-floor root granularity) stay deferred behind their evidence conditions.

## Rollout order

An installed runtime that predates `cli_verify` treats the first recorded
event as `UNKNOWN_EVENT_FIELD` and fails the whole repository closed
(`CORRUPT_EVENT_AUTHORITY` on every write) — observed live on 2026-07-19 when
this batch's own dogfood recording ran before `node install.mjs`. Upgrade the
installed runtime before the first `verify --record` in any supervised
repository; the armed old hook keeps taskloop verbs and reads working, so
recovery is exactly `node install.mjs` from the new source.

## Verification

- Behavioral tests in `tests/taskloop.test.mjs`: a recorded unsatisfied
  observation increments `spent.rounds`, appends an attempt, persists
  `cli_verify` provenance in the event stream and witness; three identical
  recorded failure signatures suspend the task as stuck.
- `npm test` green; the batch's acceptance adapter
  (`acceptance-cli-observation.mjs`) pins the enum extension at every frozen
  site.
