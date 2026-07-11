---
name: workloop
description: >
  The one work loop for approved, machine-verifiable work. Use after a plan is
  approved or to implement/land/apply/proceed (按方案落地, 开始实现, 改), to
  diagnose and fix a live failure (排查, 定位, 根因, 修到通过, fix until green),
  or to self-drive until a criterion holds (循环到X为止, 授权一次自驱). Needs a
  machine-checkable done-when criterion and an envelope before editing. It
  consumes handoffs from any skill through a producer-agnostic contract.
argument-hint: "[approved work or failure scene + done-when criterion + optional envelope]"
---

# Workloop

One shell, three criterion sources. The only real fork is **where the red comes
from**; after that the body is identical. If the prompt only asks for analysis,
options, or a taste-judged deliverable, do not force it through taskloop: answer
read-only or let the host choose an appropriate external skill.

Read `../loop-core/REFERENCE.md` for terminal-state, task-state, concurrency,
git, and closeout details, and `../loop-core/ADAPTERS.md` before hand-writing a
criterion that reads external evidence.

## Composition Seam

Treat the producer as opaque. A user or any upstream skill can hand off the
same fields:

- `goal` — one observable outcome;
- `criterion` or `criterion-file` — one executable done-when sensor;
- `alignment` — why green proves the goal and what it does not cover;
- `files` — the write envelope;
- optional evidence, failed items, freshness metadata, and resume snapshot.

Validate these fields, then run the same loop body. An adapter using the
three-way exit contract also supplies `--criterion-protocol tri-state`; ordinary
test commands remain `binary`. Never require, invoke, or
branch on the upstream skill's name. Producer-specific parsing belongs in an
external criterion adapter, not this skill.

## 1. Source The Criterion

- **given** — the approved plan already carries the check (test command, SQL
  assertion, expected response, diff condition). Restate it and open.
- **recovered** — you hold only a failure. Reproduce it first: replay the input,
  fix the environment, capture the real red output. The red is *earned from the
  world*, not declared. When an upstream producer supplies a structured failure
  report, preserve its failed items, freshness metadata, resume snapshot, and
  declared rerun scope; consume that report contract instead of re-deriving the
  whole problem from one error line.
- **absent (keep-green)** — a verification task whose criterion is legitimately
  green; open with the keep-green reason and close `not_needed` with evidence if
  no change is warranted.

Completion criterion: goal, envelope, and a red-at-birth machine criterion (plus
its alignment line) are explicit; for a recovered criterion, the reproduction is
replayable from the report or scene, not from memory.

## 2. Open The Task

Open taskloop state with exactly one sensor form: `--criterion <command>` or
`--criterion-file <repo-relative script>`, plus `--goal`, `--alignment "green ⇒
goal because <...>; not covered: <...>"`, and `--files <glob>`. Prefer the file
form when the checker is already a repository script; it avoids shell parsing
and fingerprints the script directly. `open` refuses an already-green or
non-executable criterion. Do not hand-write `task.json`.

Completion criterion: the task is open, or the reason it is not used is stated.

## 3. Run The Body

Make the narrowest change that can satisfy the criterion; run the smallest
relevant verification after each meaningful change; each round `status`-checks
that nothing left the envelope. The body is identical across sources with one
branch — **recovered adds a freshness gate**: replay only against the changed
build/process/config/data, because a green on the old world's evidence does not
count. Keep at least two plausible causes alive until one distinguishing check
separates them.

The criterion gate proves the check passes; it does not prove the change is
structurally right. When the criterion is a **weak proxy for done** — a
refactor, a migration, a design-shaped change where "green" leaves the real
done-ness (coverage, coherence, "is this the right structure") unjudged, as the
alignment line should admit — the criterion alone is a rubber stamp. There, take
an independent review at the strongest level the runtime supports (second-model
> fresh-context > self-reread; self-reread never counts), feed its findings back
into this body, and record the level with `taskloop review --level <...>` so the
ledger shows how independently it was checked. When you must drop a rung, record
the downgrade.

Completion criterion: the criterion passes; for a criterion-weak change, an
independent review at a recorded level fed its findings back, or the downgrade
is named.

## 4. Stop Without Drifting

Close exactly one of three ways: `done` (criterion green from a fresh run),
`not_needed` (read-only check, with evidence), or `abandoned` (with reason). A
`suspend` (`stuck` / `out_of_budget` / `needs_input`) is **not** a close — it
keeps the task open and pauses writes while reads and verification remain free.
Resume only with `resume --reason <what changed>`; if direction changed, first
`amend --goal/--criterion --reason`. Stop immediately before touching
anything outside the envelope;
do not restart planning after approval unless new blocking evidence appears.
Continue between rounds without asking unless the loop needs an envelope
expansion, user-only input, or irreversible/high-risk approval. Use the shared
default cap of eight rounds unless the user or target repo states another cap.
For autonomy across turns, use a host-provided recurring goal or loop driver;
taskloop deliberately does not schedule another turn. If the host has no such
driver, state the downgrade and run a single pass.

Completion criterion: the terminal state is named and supported by evidence.

## 5. Report

Report the terminal state, verification output, actual touched targets (the
machine records changed files) versus the declared envelope, evidence for
completion claims, and remaining risks. For a suspend, supply the three judgment
lines (remaining criterion, current failure, next safe action). For rework,
apply the shared rework-log rule.

Completion criterion: a follow-up agent can continue or audit the work from the
report without rediscovering the scene or guessing why the loop stopped.
