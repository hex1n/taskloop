# Workloop Multi-Root Authority and Worktree Isolation

Status: ready-for-agent

## Problem Statement

Workloop currently treats one repository-local state location as the practical center of task authority. That shape breaks down when several host sessions work in the same Git repository, when a task uses its own linked worktree, or when a task operates on a non-Git filesystem root.

From the user's perspective, these are ordinary workflows:

- two sessions edit disjoint files in one worktree and must add and commit only their own changes;
- a task uses a separate worktree because it needs an independent branch, index, HEAD, or repo-wide criterion;
- a task writes tracked, untracked, ignored, or not-yet-created paths inside a Git worktree;
- a session launched from one repository writes targets in another repository or outside Git entirely;
- a linked worktree or filesystem root is moved, removed, pruned, copied, or recreated at the same path;
- Workloop's state directory is intentionally outside Git version control.

Pathnames, Git tracking status, launch working directory, `git worktree list`, and Hook delivery are not durable identity or authority. A design based on any of them can silently lose a live task, attach old task history to a new directory, attribute another task's files to the wrong task, or treat missing telemetry as proof that an operation did not happen.

Workloop must also preserve its existing permission boundary. The host remains the only component that grants tool execution authority. In the default `observe` and `nudge` modes, Hook failures, unreadable state, identity ambiguity, and telemetry failures must never block tool execution or Stop. Workloop may withhold clean task evidence or terminal certification, while hard execution denial remains an explicit user-selected mode.

The feature therefore needs a single, replayable authority model that supports both Git and non-Git roots, survives ordinary attachment lifecycle changes, isolates task evidence, and fails safely without turning Workloop into a scheduler or permission broker.

## Solution

Introduce a provider-based authority model with one append-only authority ledger per authority boundary and one shared reducer/event model.

For Git targets, the authority boundary is the Git common repository. All main and linked worktrees of that common repository share one authority ledger. Each worktree is a separate attachment with its own stable generated identity, artifact checkpoint, index/HEAD behavior, and task placements. Removing or pruning a linked worktree changes attachment availability but does not delete task truth.

For a filesystem root that is outside every Git worktree, the authority is a detached per-root shard in the user's Workloop control area. The filesystem root contains only a protected, non-authoritative locator. Moving or deleting the root cannot delete the ledger; identity is accepted at a new path only when a stable object identity proves a real move or after an explicit user-provenance reattach operation.

Target routing is control-plane-first and target-authority-first. Workloop canonicalizes each operation target, excludes Git and Workloop control resources from ordinary task evidence, determines the containing Git worktree or claimed filesystem locator, validates the attachment claim, and only then resolves session and task attribution. Launch `cwd` and Git tracked status never select authority.

Git worktrees support two placement modes. `partitioned` allows multiple live tasks in one worktree when their declared write scopes do not overlap. `exclusive_worktree` binds one live task to its own worktree when independent branch/history/index behavior or repo-wide verification is required. Non-Git roots support `partitioned` placement only.

Attachment identity uses an authority-recorded claim state machine. Locator creation, authority claim, locator publication, recovery, collision handling, reattach, and fork all produce explicit, replayable transitions. Pending, ambiguous, unavailable, and collision states remain non-routable for clean evidence. Recovery operations require an explicit user grant, optimistic epoch or digest checks, and idempotent receipts; Hooks cannot invoke them automatically.

Workloop-mediated Git stage and commit operations select only task-scoped paths and produce receipts bound to immutable commit objects and verified postconditions. Direct host Git remains allowed. If interference prevents unique attribution, the Git operation may still succeed but Workloop records uncertainty and withholds a clean receipt or terminal certification.

Outcome views remain per-authority, best-effort projections. They are physically and logically separate from filesystem authority shards and can be deleted or rebuilt without changing any task decision.

This is a hard current-format cut. The runtime does not read, migrate, or dual-write older task authorities or earlier runtime contracts. Explicit archive operations may preserve old bytes opaquely, but archived bytes never become current task truth.

Before product implementation proceeds, a decision-blocking mechanism spike must prove the selected common-repository, detached-control-root, lock, locator publication, stable object identity, and crash-recovery semantics across macOS, Linux, and the supported Windows matrix. A failed guarantee triggers a provider redesign rather than a compatibility workaround.

## User Stories

1. As a developer running multiple host sessions in one Git worktree, I want each session to join a specific task, so that concurrent work is attributed intentionally.

2. As a developer running multiple tasks in one worktree, I want disjoint write scopes to be enforced by task evidence, so that one task does not claim another task's files.

3. As a developer, I want two partitioned tasks to edit unrelated files concurrently, so that I do not need a separate worktree for every small task.

4. As a developer, I want overlapping live write scopes to be rejected, so that ambiguous file ownership is discovered before certification.

5. As a developer, I want a task to use an exclusive linked worktree, so that it can own an independent branch, index, HEAD, and repo-wide criterion.

6. As a developer, I want placement to remain stable after task creation, so that evidence history cannot silently move to another execution location.

7. As a developer, I want tracked, untracked, ignored, and not-yet-created targets inside a Git worktree to use the same Git authority, so that Git tracking status does not fragment task truth.

8. As a developer, I want a target outside Git to use an explicitly registered filesystem root, so that non-Git work receives the same task and criterion semantics.

9. As a developer, I want unregistered targets outside every authority to remain unsupervised rather than inherit the launch repository's task, so that `cwd` does not create false attribution.

10. As a developer, I want writes into another supervised repository or root to be judged by that target's authority, so that task scope does not bleed across repositories.

11. As a developer, I want one tool operation that touches several authorities to carry one operation identity while recording separate shard-local evidence, so that the audit trail is correlated without pretending to be cross-authority atomic.

12. As a developer, I want a removed or pruned linked worktree's tasks to remain queryable, so that ordinary Git lifecycle operations cannot erase work history.

13. As a developer, I want an unavailable attachment to prevent clean completion while preserving its task, so that missing files are not mistaken for success.

14. As a developer, I want a newly created worktree at an old path to receive a new attachment identity, so that path reuse cannot inherit an old task.

15. As a developer, I want a Git worktree move to preserve identity only when the original Git administration object and claim remain valid, so that a copied locator cannot impersonate a move.

16. As a developer, I want a non-Git root move to preserve identity automatically only when a stable filesystem object identity proves it, so that move and copy are not guessed from the pathname.

17. As a developer, I want a cross-volume or otherwise unprovable filesystem move to require explicit reattach, so that safety does not depend on platform-specific assumptions.

18. As a developer, I want deleting a non-Git root to leave an unavailable but replayable task authority, so that I can inspect or explicitly abandon the task later.

19. As a developer, I want recreating a non-Git directory at the same path to produce a new identity, so that old task state is not resurrected accidentally.

20. As a developer, I want copied locators at two live anchors to produce a collision state, so that neither copy receives clean task evidence until I resolve it.

21. As a developer, I want a copied locator whose original anchor is unavailable to require an explicit copy-versus-move decision, so that temporary storage outages do not authorize rebinding.

22. As a developer, I want to recover a locator publication interrupted by a crash, so that a committed task can become usable without creating a second history.

23. As a developer, I want recovery to validate the authority, attachment, epoch, token, locator digest, and anchor, so that the recovery command cannot adopt unrelated bytes.

24. As a developer, I want a repeated recovery command to return the same result, so that a crash after commit but before output is safe to retry.

25. As a developer, I want to discard an unclaimed staged locator with explicit provenance, so that incomplete setup artifacts can be cleaned without deleting a committed task.

26. As a developer, I want to abandon an unattached filesystem authority staging shard without deleting its audit bytes, so that abandoned initialization remains explainable.

27. As a developer, I want to reattach an unavailable or collided identity to one selected anchor, so that I can preserve the intended task history after an attended decision.

28. As a developer, I want reattach to increment the claim epoch, so that every old locator becomes stale and non-routable.

29. As a developer, I want to fork a copied attachment into a new identity without copying task history, so that the copy can start independent work without fabricating continuity.

30. As a developer, I want Workloop-mediated stage to select only my task's paths, so that another task's staged entries remain untouched.

31. As a developer, I want Workloop-mediated commit to prove its diff is inside my task's write scope, so that a clean receipt cannot certify mixed changes.

32. As a developer, I want commit receipts to bind the previous HEAD, commit object, parents, diff paths, authority sequence, and index postconditions, so that certification remains replayable after HEAD moves.

33. As a developer, I want terminal certification to recheck that a receipt's commit remains landed and its criterion observation remains fresh, so that later Git changes cannot silently preserve an obsolete success claim.

34. As a developer, I want direct host Git commands to continue working, so that Workloop does not replace the host's execution authority.

35. As a developer, I want direct Git interference to produce uncertain evidence instead of a false clean receipt, so that permission and certification remain separate.

36. As a host user, I want `observe` and `nudge` Hooks to fail open on unreadable state, lock timeout, telemetry failure, or ambiguous identity, so that Workloop does not interrupt host automation.

37. As a host user, I want explicit deny mode to remain an opt-in policy, so that stronger enforcement is never enabled by an authority-layout change.

38. As a host user, I want Codex and Claude Hook differences to preserve the same host-authoritative boundary, so that runtime capability does not redefine task truth.

39. As a developer, I want Git administration data and Workloop control data excluded from task artifacts, so that control-plane mutations cannot satisfy a task criterion.

40. As a developer, I want legitimate Git commands to be observed through command intent and receipts rather than raw Git-internal file attribution, so that normal Git behavior does not look like direct task writes.

41. As a developer, I want internal Workloop control writes to use authenticated internal APIs, so that ordinary tool writes cannot masquerade as runtime transactions.

42. As a developer, I want criterion execution outside the authority mutation lock, so that a slow or hung criterion cannot block all task state changes.

43. As a developer, I want criterion observations committed only after authority and artifact freshness checks, so that concurrent work produces a stale result rather than a false pass.

44. As a developer, I want the authority ledger to rebuild all task, attachment, session, scope, and availability state after snapshots are deleted, so that projections never become hidden truth.

45. As a developer, I want outcome projection deletion or corruption to have no effect on task decisions, so that best-effort reporting cannot control execution or completion.

46. As a developer, I want one damaged filesystem authority shard or outcome shard to leave other authorities usable, so that failures retain a narrow blast radius.

47. As a developer, I want repository task queries to list tasks whose linked worktrees are missing, so that `git worktree list` is only a liveness sensor.

48. As a developer, I want authority and task IDs to be generated and never inferred from path, branch, remote, HEAD, or content, so that identity survives ordinary metadata changes.

49. As a developer, I want old runtime state detected but never read by the new reducer, so that incompatible histories cannot be partially interpreted.

50. As a developer, I want an explicit byte-preserving archive path for incompatible state, so that a hard cut does not require destructive deletion.

51. As a developer, I want a repository-scoped hard cut to leave unrelated HOME data unchanged, so that activating one repository cannot damage another.

52. As a developer, I want installer activation to install only the current runtime and avoid mutating repository or authority data, so that installation and state conversion remain separate decisions.

53. As a developer, I want filesystem tasks to omit Git stage and commit commands, so that the CLI does not imply Git semantics where none exist.

54. As a developer, I want whole-repository deletion documented as the Git authority destruction boundary, so that backup and export expectations are explicit.

55. As a developer, I want an explicit authority export before intentional repository destruction, so that retained history has a user-selected destination rather than an outcome-cache fallback.

56. As a maintainer, I want one provider-neutral reducer and schema vocabulary, so that Git and filesystem behavior do not drift into two task models.

57. As a maintainer, I want runtime contract and data schema versions to evolve independently, so that a storage redesign does not falsely claim a new host permission contract.

58. As a maintainer, I want event payload, persisted record, and projection validation updated together, so that invalid bytes are rejected before reducer execution.

59. As a maintainer, I want an explicit non-reentrant lock contract, so that recovery does not depend on accidental nested lock behavior.

60. As a maintainer, I want only the declared Git-to-authority and criterion-to-authority lock nesting, so that lock-order inversions are mechanically rejected.

61. As a maintainer, I want outcome publication to occur without another lock held, so that best-effort projection cannot deadlock critical authority mutation.

62. As a maintainer, I want multi-authority operations to hold at most one authority lock at a time, so that there is no distributed transaction hidden inside a Hook.

63. As a maintainer, I want crash injection at every claim, append, locator publication, snapshot, and receipt boundary, so that recovery claims are evidence-backed.

64. As a maintainer, I want the same mechanism suite to pass on macOS, Linux, Windows 2022, and Windows 2025 with supported Node versions, so that the provider design is genuinely portable.

65. As a maintainer, I want a failed stable-object-ID or durable-lock guarantee to stop implementation and reopen provider selection, so that platform incompatibility is not papered over by unsafe fallback behavior.

## Implementation Decisions

- The current architecture is replaced by two authority providers sharing one event vocabulary and reducer: a Git common-repository provider and a detached filesystem-root provider.

- A Git common repository has exactly one replayable authority ledger containing every attachment and task in that repository. Individual worktrees never contain the only task authority.

- A non-Git filesystem root maps to exactly one detached replayable authority shard. The root contains only a protected locator and no task state.

- Git containment, not Git tracked status, selects the Git provider. Tracked, untracked, ignored, and not-yet-created targets inside a worktree all belong to the same Git authority.

- Provider resolution starts from canonical operation targets. Launch context is diagnostic only and cannot assign external targets to the launch task.

- Control-plane classification precedes provider selection. Git administration resources, Workloop authority data, locators, outcomes, archives, locks, temporary publication files, and recovery files are never ordinary task artifacts.

- Internal Workloop writes use authenticated authority or projector interfaces. Direct tool writes to protected resources may become interference diagnostics but never clean task evidence.

- Authority state contains generated authority, attachment, and task identities. Paths, branch names, HEADs, Git administration names, filesystem object IDs, and locators are observations or anchors, not identity.

- Attachment lifecycle is event-sourced. Creation records an authority stage intent, the staged locator, a provenance-bound staged receipt, a pending authority claim, locator publication, and a final publication event. Only the final event plus matching claimed locator makes the attachment routable.

- A crash at any claim-publication boundary leaves an explicit pending state. Target scans and Hooks cannot adopt, replace, or repair it automatically.

- Git attachment anchors combine the common authority identity, a platform-stable Git administration directory object identity, and the locator claim. A path or administration basename alone is insufficient.

- Filesystem attachment anchors use a platform-stable directory object identity when available. Automatic path update is permitted only when the stable identity matches and the old anchor is unavailable in the same reconciliation.

- If stable identity is unavailable or changes, the attachment becomes `reattach_required`. Two simultaneously reachable anchors carrying one claim produce `collision` and make all copies ineligible for clean evidence.

- Staged-locator recovery, claim recovery, staged-locator cleanup, staged-authority abandonment, reattach, and identity fork are explicit CLI control mutations. They require user provenance, a reason, optimistic epoch or digest checks, and idempotent command receipts.

- Locator-changing control commands use one bounded framed-journal protocol: authority pending, append and fsync the pre-hashed next locator frame, locked reread/verification, then authority final. A repeated command truncates only a verified torn tail and continues the same command identity rather than creating another claim.

- Reattach preserves the old task history but increments claim epoch and invalidates every older locator. Identity fork creates a new attachment or authority without copying task history.

- Git supports `partitioned` and `exclusive_worktree` placement. Filesystem roots support `partitioned` only.

- Partitioned live tasks on one attachment must declare structurally non-overlapping write scopes. Suspended tasks retain their scopes; terminal tasks release them.

- One session may bind to at most one live task per attachment. A session may participate in different tasks across different authorities because target routing is evaluated before session attribution.

- Each attachment maintains its own artifact checkpoint. Reconciliation assigns changed paths to task scopes and does not treat same-named paths in another worktree as current task evidence.

- Criterion execution uses a separate long-running lease and occurs outside the authority mutation lock. Committing an observation rechecks task revision, attachment availability, artifact checkpoint, verification scope, and landing state.

- Workloop-mediated Git stage and commit use a per-attachment Git operation lock. The lock serializes Workloop's own index and HEAD activity but is not treated as protection from direct host Git.

- The only legal lock nesting is Git-operation-to-authority or criterion-lease-to-authority. Locks are non-reentrant. Outcome locks, maintenance locks, two authority locks, and Git plus criterion locks may never be held together.

- Authority lock sections contain only bounded replay, locator/stat revalidation, append/fsync, locator publication, tail validation, and digest-bound snapshot publication. They cannot launch child processes, run Git or criteria, scan a repository, use the network, or publish outcomes.

- Multi-authority operations share an operation identity but commit one authority at a time. The design makes no cross-authority atomicity claim.

- A clean Git commit receipt binds task, attachment, prior HEAD, immutable commit object, parent relation, diff scope, index postcondition, and authority sequence. Interference produces uncertainty rather than a clean receipt.

- Terminal certification reauthenticates that the receipt remains landed, task paths were not reversed, and the criterion observation is fresh.

- Direct host Git and filesystem operations remain host-authorized. Default Hooks record intent and receipts when possible, degrade open on state or telemetry failure, and never make successful telemetry a prerequisite for host execution.

- Explicit deny remains a separate user-selected Hook mode. The authority redesign does not broaden automatic approval or denial power.

- Outcome data is a per-authority, best-effort projection. Filesystem authority shards and outcome shards have separate namespaces, locks, resolvers, and APIs; projector code cannot repair or create authority.

- Runtime Contract 7 remains the host permission and authentication contract. Authority, event-record, authority-state, and outcome-projection schema versions advance independently.

- The current format is a hard cut. Older Contract task state, worktree-local authorities, and monolithic outcome projections are not read, migrated, dual-written, or continued.

- Explicit archive commands preserve incompatible bytes opaquely with copy, fsync, digest verification, and publication ordering. Archives are not compatibility readers.

- Installation activates only the current runtime and does not convert repository state, filesystem roots, or user-level projections automatically.

- The application assembly layer orchestrates provider selection, open/join/query/reconcile/recovery/stage/commit/export flows. Leaf responsibilities remain separated into authority resolution, event storage, state reduction, criterion evaluation, supervision, and outcome projection while preserving the repository's dependency-direction rules.

- The decision-blocking mechanism spike is the first implementation activity. Product implementation cannot proceed unless every supported platform proves durable locks, locator publication, stable anchors, crash recovery, and control-plane exclusion.

- If the Git common-repository provider fails the platform gate, reconsider a fully detached authority. If the user control root or stable-anchor requirements fail, require an explicit external authority location or reduce non-Git lifecycle guarantees. Do not add silent fallback or dual authority.

## Testing Decisions

- The primary test seam is the installed public CLI and Hook protocol operating against real temporary Git repositories, linked worktrees, filesystem roots, and isolated user control areas. Tests assert observable commands, exit behavior, Hook bytes, replayed state, Git objects, and filesystem results rather than private helper call counts.

- The same end-to-end seam covers provider selection, task placement, cross-repository targets, lifecycle queries, recovery commands, stage/commit receipts, criterion freshness, hard-cut refusal, and installer activation.

- A lower fault-injection seam is permitted only where the public boundary cannot deterministically trigger a crash or platform filesystem condition. It should operate at the shared filesystem/lock/process adapter rather than add provider-specific test-only APIs.

- The mechanism spike runs before feature implementation. It covers common-repository and detached authority genesis and append, lock owner/reaper recovery, torn tails, locator staged/pending/final publication, stable object identities, cross-volume moves, linked-worktree remove/prune/move/reuse, direct control-plane targets, and identity collisions.

- The spike must run on macOS, Linux, Windows 2022, and Windows 2025 across the supported Node matrix. Local simulation is not accepted as Windows evidence.

- Good authority tests delete every disposable snapshot and projection, replay only the ledger, and compare the resulting task/attachment state and authority cursor.

- Good lifecycle tests distinguish registered-but-missing, removed, pruned, moved, copied, same-path-recreated, locator-lost, authority-unreadable, and whole-authority-destroyed states. They never infer correctness solely from a directory listing.

- Good routing tests include tracked, untracked, ignored, nonexistent, symlinked, differently cased, external, nested, control-plane, and multi-authority targets. They assert the selected authority and whether evidence is clean, uncertain, or absent.

- Good collision tests exercise two live copies, one unavailable original plus a new anchor, stale epochs returning later, a fork interrupted between authorities, and a reattach retried after output loss.

- Good recovery tests inject a partial initial staged frame and recovery retry, then failure before pending append, after pending append, during and after claimed locator-frame append, after final append, and before command output. They assert idempotent receipts and no second claim.

- Good lock tests enumerate all allowed and forbidden nesting. They assert bounded timeout behavior, non-reentrancy errors, one-authority-at-a-time processing, no projection lock nesting, and no authority lock held during Git, criterion, network, or repository scans.

- Good Hook tests preserve byte-exact host-profile output where the contract is unchanged. In default modes, lock timeout, unreadable state, failed telemetry, pending locator, collision, and control-plane interference all release host execution while withholding clean evidence.

- Good Git receipt tests inject direct add, commit, reset, checkout, index changes, and HEAD movement at every precheck, stage, commit, post-diff, and authority-append boundary. No out-of-scope or non-unique operation may receive a clean receipt.

- Good partitioned-placement tests prove that task-scoped stage/commit preserves other tasks' staged entries and never clears or commits them.

- Good criterion tests run execution outside the authority lock, mutate artifacts concurrently, and prove stale observations cannot count rounds, satisfy closure, or retain outdated review freshness.

- Good outcome tests corrupt, delete, lag, and lock one projection shard. Authority decisions and unrelated shards must remain unchanged, and the damaged shard must rebuild from verified authority records.

- Good hard-cut tests seed incompatible repository, worktree, filesystem-root, and user-level bytes. Current commands must refuse them until explicit archival, archive failure must preserve sources, and no current reducer may consume archived events.

- Good installer tests prove activation does not mutate any authority or old projection and that incompatible state is reported with an explicit next action.

- The existing public CLI/Hook behavioral suites, architecture dependency suite, append-only event recovery tests, linked-worktree tests, criterion concurrency tests, installer tests, and bounded Windows CI suites are the prior art. Extend these seams instead of building a parallel test framework.

- Acceptance requires no duplicate authority sequence, no split authority, no simultaneous lock ownership, no silent tail truncation, no automatic pending-state adoption, no path-based identity reuse, no clean evidence from protected or collided targets, and no host blocking in default modes.

## Out of Scope

- Tracking Workloop authority or locator files in Git.

- Storing authority in Git refs, notes, objects, or hidden branches.

- Cross-machine, cross-clone, distributed, or multi-user shared authority.

- A central daemon, scheduler, background worker, or automatic next-round trigger.

- Automatic host approval, expanded permission grants, or default Hook blocking.

- Automatic worktree creation except an explicit exclusive-worktree open request.

- Automatic worktree removal, pruning, merge, rebase, branch deletion, or current-directory changes.

- Automatic movement of a task between attachments.

- Automatic copy-versus-move decisions when stable identity does not prove the answer.

- Automatic task-history copying during identity fork.

- Filesystem-root exclusive placement or Git stage/commit commands for non-Git roots.

- Automatic recovery after deletion of an entire Git common repository or the detached user control root.

- Treating outcome projection, Hook telemetry, Git worktree enumeration, paths, branches, remotes, or HEAD as authority.

- Compatibility readers, event migration, dual read, dual write, or continued execution of Contract 5/6 task state.

- Automatic deletion of incompatible or abandoned authority bytes.

- A complete arbitrary-shell side-effect interpreter. Ambiguous commands remain uncertain evidence.

- Cross-authority transactions. Correlated operations remain independently committed per authority.

- Long-running operations, child processes, Git commands, criteria, network calls, or outcome publication while holding the authority mutation lock.

- General backup, synchronization, or disaster-recovery infrastructure beyond explicit authority export and opaque legacy archive.

## Further Notes

- The frozen delivery and maintenance estimate is 17–23 engineering days, including provider resolution, shared reducer/schema work, identity and recovery protocols, task-scoped Git receipts, projection isolation, CLI/Hook integration, hard cut, and cross-platform evidence.

- The latest independent complete review returned `CONDITIONAL-GO`, not `GO`. The original locator-state and control-plane-routing blockers were closed. Lock hierarchy and recovery-command contracts were incorporated into the current specification but await final independent closure.

- Cross-platform control-root portability remains decision-blocking. `ready-for-agent` means an agent can begin with the frozen mechanism spike and then implement only if it passes; it is not evidence that the provider mechanism has already passed.

- If the spike fails, stop. Preserve the evidence, update the provider decision, and submit the revised specification for another complete review before product implementation.

- Runtime Contract 7 remains unchanged because the host authority boundary is unchanged. New authority and projection data formats use independent schema versions.

- The specification deliberately preserves host-authoritative, nonblocking defaults: Workloop certifies work; it does not own tool execution.
