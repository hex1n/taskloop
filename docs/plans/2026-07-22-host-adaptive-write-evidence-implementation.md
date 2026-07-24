# Workloop 路径感知写入证据实施计划

日期：2026-07-22  
状态：待实施；Phase 0 能力门禁通过后进入生产代码  
类型：已收敛方案的执行拆解  
父方案：`docs/plans/2026-07-22-host-adaptive-write-evidence.md`  
仓库基线：`e5ecad652f818f98f7f87eea1e752b8299fab950`  
当前分支：`codex/stop-hook-liveness-root-fix`  
决策：BUILD（来源：用户）  
输入来源：父方案、仓库 `AGENTS.md`、当前工作树 diff、`lib/prims.mjs`、`lib/event-store.mjs`、`历史任务状态运行时`、`lib/application.mjs`、`lib/criterion.mjs`、`lib/host-hooks.mjs`、`install.mjs`、runtime/Hook/installer/Windows 测试与冻结 Contract 5 fixture

## TL;DR

按 8 个阶段、10 个带明确激活前回滚边界的绿色提交实施，核心依赖顺序为：

```text
能力契约
  -> Contract 6 语义
  -> artifact baseline/reconciliation
  -> PostToolUse completion receipt
  -> closure/budget/not-needed
  -> reporting/ledger
  -> installer/migration
  -> live E2E/release
```

逐项相加后的总工期为 **9.5–10 工程日**，仍处于父方案的约 9–10 日量级。任何阶段都不得把“Hook 已配置”写成“写入历史已完整观察”，也不得在 release gate 前安装当前工作树到 `~/bin`。

现有 `install.mjs`、`lib/host-hooks.mjs`、`tests/host-hooks.test.mjs`、`tests/installer.test.mjs` 的未提交改动予以保留，作为 installer 切片的输入；它们目前只覆盖 Pre/Stop 配置诊断，不能单独作为遥测修复发布。

## 完成定义

只有以下条件全部成立，本计划才完成：

1. `write_authorized` 只表示写前许可，不再增加 `artifact_revision` 或实际 touched files。
2. Hook 可见路径用相同 `operation_id` 关联 Pre/Post，重放不重复计数。
3. Hook 不可见的落地变化能被 repository reconciliation 发现，且不会显示为“无写入且证据完整”。
4. `artifact_state_coverage` 与 `mutation_history_coverage` 独立投影、独立门禁。
5. capability interval 是 event-sourced、operation-scoped authority；lease 不能跨 operation 或 surface 沿用，单次 exact receipt 不能升级未完整覆盖的任务历史。
6. criterion observation 与最终 terminal event 绑定同一个稳定 artifact checkpoint、evidence revision 和 event cursor。
7. Claude/Codex 配方生成各自支持的 Post 事件；installer 只诊断、不改用户配置。
8. Contract 5 冻结 fixture 保持不变；活动 Contract 5 task 不被伪迁移，逃生 runtime 不被后续安装 prune。
9. 本地完整测试、Windows CI、真实 Claude/Codex CLI/Codex App E2E 全绿后才允许激活。

## 实施总表

| 阶段 | 交付物 | 依赖 | 预估 | 状态 |
|---|---|---|---:|---|
| 0 | 能力矩阵、隐私安全 fixtures、当前 diff 基线 | 无 | 0.5 天 | pending |
| 1 | Contract 6 事件、投影、三重 schema 校验 | 0 | 1.5 天 | pending |
| 2 | task-open baseline、checkpoint delta、reconciler | 1 | 2 天 | pending |
| 3 | Pre/Post completion Adapter 与 exactly-once | 1、2 | 1.5 天 | pending |
| 4 | closure、budget、review freshness、`not-needed` | 2、3 | 1.5 天 | pending |
| 5 | status/report/ledger/outcome 可观测性 | 4 | 0.5 天 | pending |
| 6 | Hook recipe、installer、Contract 5 迁移/回滚 | 3、5 | 1 天 | pending |
| 7 | 故障注入、真实宿主、Windows、发布门禁 | 0–6 | 1–1.5 天 | pending |
| **总计** | | | **9.5–10 天** | |

## 全程实施约束

- 每个工单先写失败测试，再实现；红绿循环可以发生在本地，但提交点必须全绿。
- `lib/application.mjs` 仍是唯一 assembly；leaf module 只能 import `lib/prims.mjs`。
- lifecycle mutation 只进入 `历史任务状态运行时`。
- schema 变更必须在 `prims` payload fields、`event-store` persisted contracts、`task-engine` projection validators 三处同一提交完成。
- repository 全量哈希在 task lock 外完成；lock 内只做 bounded membership/stat/recent-content revalidation。
- `.git/` 与 `.workloop/` 不进入 artifact fingerprint；task/event authority 用现有 task revision、source cursor 与 event digest 单独绑定。
- 不保存 Hook 原始 payload、会话正文、tool response 正文或 transcript 内容；fixture 只保留字段名、类型和去标识化值。
- transcript 只能提供诊断细节，删除或损坏 transcript 不得改变 closure 结论。
- installer 不修改自动审批、sandbox、notifier 或任何现有 Hook 文件。
- 当前中间实现不得执行 `node install.mjs` 指向真实 HOME；手工安装测试只能使用临时 `WORKLOOP_INSTALL_HOME`。

## Phase 0：能力与工作树基线

### 0.1 固化宿主能力矩阵

目标：把已经验证的事实和仍需验证的 Claude 分支变成可复跑、无隐私内容的 conformance receipt。

新增建议：

- `docs/research/2026-07-22-host-hook-capability-conformance.md`
- `tests/fixtures/host-hook-capabilities/*.json`

矩阵最少记录：

| 字段 | 含义 |
|---|---|
| host/profile/surface | Claude、Codex CLI、Codex App code-mode 的显式组合 |
| runtime version | 产生观察的真实版本 |
| canonical tool | `apply_patch`、Write、Edit、Bash 等 |
| outcome | success、failure、nonzero |
| Pre/Post/Failure | 是否观察到对应事件 |
| correlation | Pre/Post 是否共享 `tool_use_id` |
| receipt semantics | 哪个字段能证明完成、失败或只能证明返回 |
| exhaustive surface | 该 surface 是否承诺覆盖所有潜在写路径 |
| capability id | 可写入事件、绑定具体 runtime/profile/surface fixture 的稳定标识 |
| sanitized_at | fixture 去标识化时间 |

执行：

1. 复用已验证的 Codex CLI successful/failed `apply_patch` 与 App code-mode shell/patch 结论。
2. 新增 Claude Write、Edit、Bash 的 success、failure、partial-write-before-failure 探针。
3. 在发布候选版本上重跑一个新 Codex App thread，防止把旧 App 观察外推到新 runtime。
4. 原始探针文件仅放临时目录，生成 sanitized fixture 后移入废纸篓。

门禁分支：

- 单次 Pre/Post 可稳定关联：该 operation receipt 可标 `exact` 或 `tool_specific`。
- Post 缺失或成功字段不可靠：该 operation 标 `unknown`，依赖 reconcile。
- capability fixture 是随 runtime 版本化的 capability registry，不是 task 事实；具体 operation 必须通过 `coverage_changed` 事件绑定 `capability_id`、`operation_id` 和生效 checkpoint。
- 默认 `history_requirement=artifact_only` 的任务保守报告 partial/unknown，不为追求 full 在每个 Pre 增加全仓扫描；direct receipt 只改善 operation 级证据。
- critical risk、有限 `--writes` 或用户显式 strict-history 的任务使用 `history_requirement=complete`。只有从 task baseline 到当前 checkpoint 的每个 artifact-changing interval 都由 `exhaustive_surface=true` 的 operation lease 覆盖，整项任务才允许 `mutation_history_coverage=full`。
- write-shaped Pre 在严格模式下必须先 reconcile 到当前 checkpoint，确认此前没有 unowned delta，再以该 checkpoint 为起点打开单次 operation lease；Post/Failure reconcile 后关闭。缺 Post、orphan/conflict、下一次 Pre 前发现 delta，或 lease 外 reconcile 都把对应 interval 降为 partial/unknown。
- lease 不能跨 operation 或 episode 保持 open。已产生的 partial/unknown interval 永远不能被后续 exact receipt 补成 full。
- 当前 Codex App specialized patch 已知不 exhaustive；Codex payload 又没有稳定 App/CLI surface 标识时，Codex capability lease 必须保守绑定为 non-exhaustive。因此另一次 CLI operation 的 exact receipt 只能提升该 operation 的 quality，不能升级 task history。
- `history_requirement=complete` 下遇到 non-exhaustive/unknown capability、Pre reconcile timeout 或无法建立 operation lease时，Pre fail closed 并给出该 surface 不支持完整历史的行动提示；默认 artifact-only 任务不承担这项额外 Pre 扫描成本。
- `full` 明确限定在 Workloop 的 collaborative threat model：同一 operation interval 内不存在同时运行的 unhooked writer。需要抵抗同路径并发隐形写入或恶意 mtime/content 伪装的审计任务，当前宿主能力一律报告 unavailable，只有原生不可绕过 mutation ledger 才能满足。

验收：capability fixture 不含路径、prompt、代码正文、session/transcript 内容；同一 fixture 可由纯测试加载。

### 0.2 冻结当前未提交改动

当前四文件 diff 的处理规则：

- 保留 matcher/timeout 中央常量、Codex `statusMessage` 和 Pre/Stop 诊断结构。
- 将 installer 的“ok”语义限定为 `configured`，不得暗示 `observed`。
- 不单独安装或发布该提交。
- 在 Phase 6 扩展为 host-specific Post/Failure 事件集合。

提交 1：`refactor(hooks): centralize configured hook recipe contracts`

提交前验证：

```sh
node --test tests/host-hooks.test.mjs tests/installer.test.mjs
npm test
git diff --check
```

## Phase 1：冻结 Runtime Contract 6

### 1.1 版本边界

版本策略：

- 公共 `RUNTIME_CONTRACT`：`5 -> 6`。
- task snapshot `schema_version` 保持 3，但 persisted task runtime contract `4 -> 5`，因为 projection shape 改变。
- event record framing 保持 schema 2；新语义通过 event `payload_version` 和 Contract 6 fixture 区分。
- HOME outcome projection `3 -> 4`，因为 terminal/report payload 增加 coverage 与 count basis。
- `tests/fixtures/runtime-contract-5.mjs` 字节和断言保持不变；新增 `runtime-contract-6.mjs`，禁止覆盖旧 fixture。

### 1.2 事件契约

`task_opened` 的 Contract 6 payload 使用 `payload_version: 2`，新增 event-sourced `artifact_baseline` 和初始 `coverage_basis`；Contract 5 的 version 1 仅用于 legacy replay。初始 history coverage 为 unknown，除非 task open 已有从 baseline 生效、可验证且 exhaustive 的 capability lease。

四个写入证据事件：

```text
write_authorized
  operation_id, tool_family, declared_targets, target_coverage,
  host_profile, receipt_expectation

tool_completed
  operation_id, tool_family, outcome,
  reported_targets, receipt_quality, host_profile

artifact_reconciled
  checkpoint_id, from_checkpoint, to_checkpoint,
  changed_entries, changed_paths, current_scope_violations,
  coverage, reason

coverage_changed
  artifact_state, mutation_history, prewrite_enforcement,
  episode_id, operation_id, capability_id, host_profile, surface,
  exhaustive_surface, effective_from_checkpoint,
  interval_from_checkpoint, interval_to_checkpoint, reason
```

约束：

- `write_authorized` 不再调用 `applyWriteMutation`，只增加 authorization count。
- `tool_completed` 不增加 artifact revision；Bash success/nonzero 都不能单独推出文件变化。
- `artifact_reconciled` 只有在 `to_checkpoint != from_checkpoint` 时增加 `artifact_revision` 和使 review stale；无变化 reconcile 仍可记录 checkpoint receipt，但不伪造内容 revision。
- `coverage_changed` 不改变 artifact revision；mutation history 一旦从 full 降级，不得通过后续单次 exact receipt 恢复。
- `coverage_changed` 与会改变 closure assurance 的 orphan/conflict receipt 增加 `evidence_revision`；相同 checkpoint、相同 capability、相同 coverage 的 no-op reconcile 不增加该 revision。
- reducer 只从 event-sourced capability intervals 推导整项 task coverage，禁止从当前 profile、installer configured 状态或单次 receipt 临时推断。
- exhaustive lease 只能在 strict mode 的 write-shaped Pre 完成 pre-reconcile 后，从当前权威 checkpoint 对一个 `operation_id` 生效，禁止回填过去 interval；Post/Failure reconcile 关闭 lease。non-exhaustive/unknown 观察可以安全地把尚未归属的旧 interval 降级为 partial/unknown。每个 `artifact_reconciled(from,to)` 必须引用匹配 operation lease；没有 lease、lease 已关闭或 operation 不匹配就记录 unowned partial/unknown。
- 重复 `operation_id` + 相同事实为 no-op；相同 ID + 冲突事实 fail closed 并把 history coverage 降为 unknown。

### 1.3 Payload version 与 reducer dispatch

active task contract 由该 task 的 genesis `task_opened` 决定并进入 projection，不能由当前 binary 版本猜测：

| Event kind | Contract 5 | Contract 6 | Dispatch |
|---|---|---|---|
| `task_opened` | payload v1 | payload v2（含 `runtime_contract: 6`、baseline、coverage basis） | genesis 冻结 task contract |
| `write_authorized` | payload v1 `{files}` | payload v2 operation contract | 按 active task contract + payload version |
| `criterion_observed` / `criterion_side_effect_recorded` | nested observation v1 | payload v2 / observation v2，绑定 checkpoint/evidence/cursor | 按 active task contract + payload version |
| `review_recorded` | review record v1 | payload v2 / review record v2，绑定 evidence revision | 按 active task contract + payload version |
| `tool_completed` / `artifact_reconciled` / `coverage_changed` | 不允许 | payload v1 | 仅 Contract 6 |
| shape 未变化的 lifecycle/token/amend/terminal events | payload v1 | payload v1 | 共享 shape，但 reducer 仍按 active task contract 选语义 |

实现规则：

- `V3_EVENT_PAYLOAD_FIELDS`、persisted contracts 和 reducer validators 改为按 `{kind, payload_version}` 查表；Contract 5 frozen map 保留，不能用 Contract 6 field list 覆盖。
- Contract 6 decider 对所有 reused-but-changed kind 只发对应 v2；Contract 5 active compatibility path 只发 v1。
- 一个 task 的 event 不得跨 contract 混用；共享 v1 kind 只有上表显式列出的 unchanged shape 允许。
- mixed repository ledger 可以先有 terminal Contract 5 task，再有 Contract 6 `task_opened v2`；task boundary 重置 active dispatch，repo hash chain 不重置。
- runtime 5 遇到 v2 或新 event kind fail closed；runtime 6 可 replay terminal Contract 5，并对 active Contract 5 使用 Phase 6 的受限兼容规则。

### 1.4 Projection 契约

Contract 6 projection 新增：

```json
{
  "authority": {
    "write_operations_authorized": 0,
    "prewrite_enforcement": "full|partial|unknown"
  },
  "evidence": {
    "evidence_revision": 0,
    "tool_completions_observed": 0,
    "artifact_state_coverage": "full|unknown",
    "mutation_history_coverage": "full|partial|unknown",
    "touched_files": [],
    "current_scope_violations": []
  },
  "artifact_baseline": {},
  "artifact_checkpoint": {},
  "capability_leases": [],
  "coverage_intervals": [],
  "history_requirement": "artifact_only|complete",
  "operations": {},
  "spent": {
    "writes": 0,
    "write_count_basis": "authorized"
  }
}
```

兼容规则：`spent.writes` 暂时等于 `authority.write_operations_authorized`，只为 CLI/consumer 迁移保留；任何输出都必须伴随 `write_count_basis=authorized`。

建议修改：

- `lib/prims.mjs`
- `lib/event-store.mjs`
- `历史任务状态运行时`
- `lib/task-store.mjs`
- `lib/outcome-projector.mjs`
- `tests/fixtures/runtime-contract-6.mjs`
- `tests/runtime-v6.test.mjs`
- `tests/event-store.test.mjs`
- `tests/task-snapshot-v3.test.mjs`

提交 2：`feat(runtime): define contract 6 write evidence semantics`

验收：

- 三个 schema 定义点拒绝缺字段、未知字段、非法枚举和冲突 operation replay。
- payload v1/v2 dispatch matrix 在三个 schema 定义点产生相同 accept/reject 结果；v1 Contract 5 event 不能进入 v2 reducer，反之亦然。
- snapshot 删除后，capability lease、coverage interval 和 evidence revision 能从 event ledger 完整重建。
- Contract 5 terminal ledger 可读，Contract 5 fixture 无变化。
- 授权事件后 `artifact_revision===0`、`touched_files=[]`。
- `npm run test:event-store`、`npm run test:snapshot`、Contract 6 suite 全绿。

## Phase 2：Artifact baseline 与 reconciliation

### 2.1 Event-sourced checkpoint 表示

不得仅在 disposable `task.json` 保存 baseline。使用以下权威表示：

- `task_opened.artifact_baseline` 保存完整 canonical manifest：repo-relative path、entry kind、content digest、checkpoint digest、capture time。
- 后续 `artifact_reconciled.changed_entries` 只保存相对前一 checkpoint 的增加/修改/删除 delta。
- reducer 从 baseline + deltas 重建当前 manifest，并验证 `to_checkpoint` 与 canonical digest 一致。
- `task.json` 可缓存重建后的完整 manifest；删除 snapshot 后必须能从 event ledger 重放恢复。

这避免每次 reconcile 把全仓 manifest 复制进 event log，同时避免 sidecar 丢失后无法判断 scope。

### 2.2 task open baseline

顺序固定为：

```text
prepare open + capture pre-criterion snapshot
-> run criterion outside task lock
-> require no criterion side effect
-> use final stable snapshot as baseline candidate
-> under task lock revalidate membership/stat/recent-content
-> commit task_opened(payload_version=2, artifact_baseline)
```

失败规则：

- unreadable file、snapshot timeout、membership race 或 incomplete manifest：不创建任务。
- baseline 超过 deadline：报 `artifact_baseline_unavailable`，不降级打开一个无法安全闭环的任务。
- existing dirty/untracked/ignored files属于 baseline，不算新任务 touched files。

### 2.3 Reconciler 接口

在 `lib/criterion.mjs` 复用并扩展现有 `repoSnapshot`、`changedSnapshotPaths`、`validateRepoSnapshot`；`application.mjs` 负责编排：

```js
prepareArtifactReconciliation(repo, checkpoint, authorityCursor)
// lock 外返回 full snapshot + canonical delta candidate，绑定 base checkpoint/task revision/event cursor

commitArtifactReconciliation(repo, candidate, reason)
// lock 内先验证 current checkpoint/task revision/event cursor 仍等于 candidate base，再重验内容并提交
```

触发点：

- strict-history/有限 writes 的 write-shaped Pre：授权前强制 reconcile，关闭此前 unowned gap，再打开单次 operation lease；失败则 deny。
- PostToolUse/PostToolUseFailure：快速 reconcile。
- `verify --record`：criterion 前强制 reconcile。
- `achieve`：criterion 前强制 reconcile。
- Claude hard Stop：criterion 前强制 reconcile。
- Codex release-only Stop：deadline 内 best effort reconcile；失败标 unknown，不执行 closure criterion。
- `not-needed`：终态判断前强制 reconcile。

scope 规则：

- changed path 与 task envelope 逐项比较。
- envelope 外当前变化进入 `current_scope_violations` 并阻止 closure。
- 后续 revert 可清除 current violation，但历史 evidence 保留曾观察事实。
- `.git/`/`.workloop/` 继续走现有 supervision/task authority 保护，不混入 artifact delta。
- 即使仓库字节恰好等于 stale candidate 的 `to_checkpoint`，只要 `from_checkpoint`、task revision 或 authority cursor 已变化，该 candidate 也必须 stale；不得把内容相等当作有效链式转换。

建议修改：

- `lib/criterion.mjs`
- `lib/application.mjs`
- `历史任务状态运行时`
- `tests/workloop.test.mjs`
- `tests/workloop-architecture.test.mjs`
- `tests/event-store.test.mjs`

提交 3：`feat(runtime): persist task-open artifact baselines`

提交 4：`feat(runtime): reconcile repository checkpoints as events`

验收：

- tracked/untracked/ignored/symlink 的增删改均产生正确 delta。
- baseline 前已有 dirty state 不进入 touched files。
- 修改后 revert 回 baseline，当前 checkpoint 等于 baseline，但 mutation history 不被伪升级。
- snapshot 删除后 event replay 恢复相同 checkpoint manifest。
- lock 外哈希、lock 内 bounded revalidation 的 architecture test 通过。
- 并发改变 membership/stat/content 时 candidate stale，不提交错误 checkpoint。
- 两个 candidate 从同一 checkpoint 出发时，第一个提交后，第二个无论当前仓库字节是否再次匹配其 `to_checkpoint` 都必须 stale 或在重新 prepare 后成为真正 no-op；event replay、snapshot 和 authority cursor 必须一致。
- mixed surface：exhaustive operation 完成后发生 invisible specialized patch，再进入另一个 visible Pre；Pre reconcile 必须先把该 delta 记为 unowned partial/unknown，旧 lease 不得覆盖它。

## Phase 3：PostToolUse completion receipt

### 3.1 Host Adapter

扩展 canonical invocation：

```text
event: pre_tool_use | post_tool_use | post_tool_use_failure | stop
operationId: host tool_use_id
toolName/toolInput
toolResponseSummary: only normalized status/exit metadata
```

宿主事件集合：

- Claude：`PreToolUse`、`PostToolUse`、`PostToolUseFailure`、`Stop`。
- Codex：`PreToolUse`、`PostToolUse`、`Stop`；失败无 Post 的工具不得合成 receipt。
- Post encoder 永远 silent/exit 0；它不能 deny、rewrite 或输出 Stop frame。

receipt 映射：

- direct Write/Edit/patch 且宿主明确成功：`outcome=success`，quality 按 capability fixture。
- Claude failure event：`outcome=failure`。
- Bash/PowerShell nonzero：`outcome=failure|unknown`，但仍必须 reconcile，因为命令可能先写后失败。
- tool response 缺少稳定成功字段：`outcome=unknown`。
- 不持久化 stdout/stderr/tool response 正文。

### 3.2 Exactly-once 与缺失 Pre

- strict mode 的 Pre 顺序固定为 `pre-reconcile -> open operation lease -> authorize`；默认 artifact-only 模式不建立 full lease，也不把 absence of pre-reconcile 解释成 full。
- Pre 许可持久化 operation record；deny 不创建 authorized operation。
- matching Post 只允许完成一次。
- 相同 Post replay 返回 no-op。
- Post 与已有 receipt 冲突：不覆盖原事实，history coverage 降 unknown，输出诊断到 stderr/evidence ledger。
- write-shaped Post 没有 matching Pre：记录 completion 为 orphan，执行 reconcile，将当前 capability interval 与 prewrite enforcement/history 降级，并增加 evidence revision；不得补造 authorization。
- read-only Post 不进入写证据状态机。

建议修改：

- `lib/host-hooks.mjs`
- `lib/application.mjs`
- `历史任务状态运行时`
- `历史监督运行时`（仅复用 write-shaped/tool-family 分类，不复制分类器）
- `lib/evidence-ledger.mjs`
- `tests/host-hooks.test.mjs`
- `tests/workloop.test.mjs`
- `tests/foreign-session-scope.test.mjs`
- `tests/command-safety-adversarial.test.mjs`

提交 5：`feat(hooks): correlate post-tool completion receipts exactly once`

验收：

- successful Pre/Post 共享 operation ID，只产生一个 authorization 和一个 completion。
- failed apply_patch 只有 Pre 时不产生成功 completion 或 artifact revision。
- shell 非零但已落地文件：completion failure/unknown + artifact revision 增加。
- duplicate/reordered/orphan/conflicting Post 的投影满足上述规则。
- foreign session 不能借 Post 为 owner task 注入成功 receipt。
- Pre deny/rewrite 与 Claude Stop byte-exact fixture 不回归。

## Phase 4：Closure、预算与 assurance

### 4.1 Closure transaction

`verify --record`、`achieve` 与 Claude Stop 使用同一编排：

```text
reconcile artifact
-> persist checkpoint/coverage
-> prepare criterion against checkpoint_id + artifact_revision + evidence_revision + task_revision + event cursor
-> run criterion outside task lock
-> revalidate repository and authority
-> commit observation only if every binding remains stable
-> evaluate review/coverage/scope/budget
-> terminal event
```

criterion observation 新增或明确绑定 `observed_checkpoint_id`、`observed_evidence_revision` 和 prepared event cursor。只比较 digest 不够；同 digest 的旧观察不能越过后续 task/evidence/authority revision 直接复用。

required review record 同时绑定 `reviewed_artifact_revision` 与 `reviewed_evidence_revision`。coverage、orphan/conflict receipt 或 current violation 的实质变化使 assurance review stale；相同 checkpoint/coverage 的 no-op reconcile 不增加 evidence revision，因此不制造永远无法闭环的 review churn。

Closure hold 条件：

- `artifact_state_coverage != full`。
- `current_scope_violations` 非空。
- checkpoint、artifact revision、task revision 或 event authority cursor stale。
- evidence revision 与 criterion/review 绑定不一致。
- required review 不新鲜。
- task 有有限 write budget，但 `prewrite_enforcement` 或 `mutation_history_coverage` 不能证明合规。
- critical/strict-history task 的 `mutation_history_coverage != full`。

普通、无有限 write budget 的任务允许 `mutation_history_coverage=partial` 完成，但 terminal/report 必须保留该降级。

### 4.2 写入预算

- `--writes N` 在 Contract 6 中明确表示“最多授权 N 个可在 Pre 阶段阻止的 write operations”，并隐式设置 `history_requirement=complete`。
- `open`/`amend` 增加 `--history-requirement artifact-only|complete`；默认 `artifact-only`，critical risk 默认提升为 complete，用户可显式要求 complete，但不能把 critical 降回 artifact-only。状态输出在首次写入前就显示当前 surface 能否满足该要求。
- 仅 `prewrite_enforcement=full` 且 task history exhaustive 时可称 hard-enforced。
- partial/unknown 时状态为 `compliance=unknown`，不能显示“剩余 N 次且未超限”。
- 达到可证明上限时仍在 Pre 阶段 deny，保持现有 fail-closed 特性。

### 4.3 `not-needed`

`achieved` 与 `not_needed` 必须先通过同一个 terminal assurance gate：current checkpoint、artifact/evidence/task revisions、event cursor、scope、review、history requirement 和 write-budget compliance 全部使用 Phase 4.1 的稳定性规则。`not_needed` 不能保留绕过该 gate 的独立快速终态；只有显式 `abandon` command 是不声称成功/无需工作的管理性退出例外。

在公共 gate 之上，替换旧的 `spent.writes===0` 判定；`not_needed` 还必须同时满足：

- current checkpoint digest 等于 task-open baseline digest。
- artifact state coverage full。
- 没有 success completion receipt。
- 没有 current scope violation。
- 用户提供显式 evidence。
- `history_requirement=artifact_only`，或 `mutation_history_coverage=full`；critical/finite-write/explicit-complete task 不得因当前字节回到 baseline 而跳过完整历史要求。
- write budget 为 unlimited，或 compliance 已证明 `proven_within_limit`。
- prepare/commit 之间 checkpoint、evidence revision、task revision 和 event cursor 全部稳定。

授权但未执行、失败且未落地的 operation 不应阻止 artifact-only `not-needed`；成功写入后又 revert 的任务有 success receipt，不能伪装成从未需要。无法观察的写入后 revert 会留下 partial/unknown history：artifact-only task 可以在明确报告该限制后 `not_needed`，complete-history task 必须 hold。

建议修改：

- `lib/application.mjs`
- `历史任务状态运行时`
- `lib/criterion.mjs`
- `tests/workloop.test.mjs`
- `tests/roadmap-e2e.test.mjs`
- `tests/workloop-architecture.test.mjs`

提交 6：`feat(runtime): bind closure to artifact evidence coverage`

提交 7：`feat(runtime): make write budgets and not-needed evidence-aware`

验收：

- criterion satisfied 但 checkpoint stale 时不得 terminal。
- reconcile 与 commit 之间并发写时 observation stale。
- artifact coverage unknown 时 `achieve` 与 Claude Stop hold。
- App partial history + 默认无限 writes 可在 artifact full 时完成，并明确报告 partial。
- App partial history + `--writes N` 不能声称预算合规或 terminal。
- review 在 artifact revision 改变后 stale；无变化 reconcile 不无故使 review stale。
- coverage 或 orphan/conflict receipt 改变 evidence revision 后 required review stale；完全相同的 reconcile receipt 不改变 evidence revision。
- `not-needed` 正反例全部覆盖。
- `not-needed` 与 `achieved` 共享 terminal assurance gate；构造 strict/critical/finite-write task 的 invisible write-and-revert，必须因 history/compliance unknown hold。`abandoned` 仍可作为不声称完成的显式退出。

## Phase 5：CLI、报告与全局 ledger

输出目标：用户一眼能区分“允许过几次、宿主回执几次、当前实际有哪些变化、证据有多完整”。

### 5.1 JSON 与 Markdown

`status --json`、`report --json`、`report --markdown` 增加：

- `authority.write_operations_authorized`
- `authority.prewrite_enforcement`
- `evidence.tool_completions_observed`
- `evidence.evidence_revision`
- `evidence.artifact_state_coverage`
- `evidence.mutation_history_coverage`
- `evidence.current_scope_violations`
- `artifact_checkpoint`
- `capability_leases` 与 interval coverage basis
- `spent.write_count_basis`
- `budget.write_compliance`

Markdown 禁止继续输出含义不明的 `writes X/Y`；改为 authorization count、completion count、artifact changes 和 coverage 四行。

### 5.2 HOME outcome/ledger

- outcome projection schema 4 持久化 terminal coverage 与 count basis。
- `queries.terminal_write_sets` 继续输出 touched files，同时增加 artifact/history coverage，消费者才能判断集合是 exact 还是 lower bound。
- Contract 5 terminal rows继续可读，标记 `write_count_basis=preauthorization_legacy`、coverage unknown；禁止回填虚构证据。

建议修改：

- `lib/application.mjs`
- `lib/outcome-projector.mjs`
- `lib/evidence-ledger.mjs`
- `tests/workloop.test.mjs`
- `tests/runtime-v6.test.mjs`
- `tests/roadmap-e2e.test.mjs`

提交 8：`feat(cli): report authorization completion artifact and coverage separately`

验收：四类事实能在 CLI JSON、Markdown 和 HOME ledger 对上；真实 artifact 变化时不可能输出 `touched_files=[]` 且 `artifact_state_coverage=full`。

## Phase 6：Installer、迁移与回滚

### 6.1 Host-specific recipe

从 Phase 0 的中央常量扩展：

| Host | 必需配置事件 |
|---|---|
| Claude | PreToolUse、PostToolUse、PostToolUseFailure、Stop |
| Codex | PreToolUse、PostToolUse、Stop |

- Pre/Post matcher 共享 canonical alias 集，但分别拥有 timeout/status message。
- Codex 可使用 `statusMessage`；Claude recipe 不写 Codex-only 字段。
- installer 分事件检查 missing、duplicate、profile、matcher、timeout 和 command version。
- installer 只能报告 `configured`；`observed/degraded/unknown` 来自运行时 capability/coverage 状态，不由配置文件存在推断。
- 配置不完整时输出生成命令与人工 merge 指引，配置字节保持不变。

### 6.2 Contract 5 cutover

规则：

1. Contract 6 runtime 保留 legacy Contract 5 terminal replay，只读报告 legacy write 语义。
2. 当前 repo 有 active Contract 5 task 时，installer 拒绝激活并要求先用旧 runtime finish 或 abandon。
3. 首次 Contract 6 激活把当时的 Contract 5 runtime hash 写入 manifest 的 `compatibility_runtimes.contract_5`，并永久排除在自动 prune 集合外；不是只保留“上一版”。后续任意次数 Contract 6 安装都必须保留这个 pin。
4. Contract 6 遇到其他 repo 的 active Contract 5 task 时，允许 status/audit/report，拒绝 Contract 6 mutation；显式 abandon 可由冻结 legacy decider 完成，finish 使用保留的 runtime 5。
5. terminal Contract 5 后第一次新 task open 才创建 Contract 6 baseline；不存在“从中途 dirty state 猜 baseline”的 migrator。
6. 写入第一个 Contract 6 event 后，runtime 5 必须拒绝该 authority；rollback 只能恢复 Contract 6 binary 或只读导出诊断。
7. Contract 5 compatibility pin 不由后续 install 自动退休；只有完整 uninstall 或用户手工删除才移除。一个小型兼容 runtime 的磁盘成本低于无法盘点其他仓库 active task 的风险。

### 6.3 原子激活

```text
validate source/tests
-> materialize versioned runtime 6
-> validate generated recipes and manifest
-> pin Contract 5 compatibility runtime + retain previous runtime for ordinary rollback
-> atomically switch stable shim
-> record activation
```

任一步失败，stable shim 继续指向完整旧 runtime；用户 Hook 配置永远不在该事务内修改。

建议修改：

- `lib/host-hooks.mjs`
- `install.mjs`
- `lib/application.mjs`
- `lib/task-store.mjs`
- `tests/host-hooks.test.mjs`
- `tests/installer.test.mjs`
- `tests/runtime-v6.test.mjs`
- `tests/windows.test.mjs`

提交 9：`feat(installer): diagnose post hooks and gate contract 6 activation`

验收：

- JSON/TOML/Claude settings 中每类 drift 都有 fixture。
- duplicate handler 跨 `hooks.json`/`config.toml` 也会被发现。
- 用户配置 before/after bytes 完全一致。
- active Contract 5 阻止激活，terminal Contract 5 不阻止新 Contract 6 task。
- 连续执行两次以上 Contract 6 upgrade 后，manifest 指向的 Contract 5 compatibility runtime 仍存在且 digest 正确；普通 old Contract 6 runtime 可以按现有策略 prune。
- activation failpoint 后 shim 只能指向完整 5 或完整 6。

## Phase 7：验收与发布

### 7.1 自动化矩阵

至少覆盖：

| ID | 场景 | Oracle |
|---|---|---|
| E01 | Claude Write success | authorization + completion + artifact delta |
| E02 | Claude Write failure/no mutation | failure receipt；artifact 不增加 |
| E03 | shell partial write then failure | failure/unknown receipt + artifact 增加 |
| E04 | Codex CLI patch success | same ID Pre/Post；一次 delta |
| E05 | Codex CLI patch failure, no Post | authorization only；artifact 不增加 |
| E06 | App code-mode specialized patch | reconcile 发现文件；history partial |
| E07 | patch 后 revert | checkpoint 回 baseline；history 不伪装 full |
| E08 | duplicate/reordered/conflicting Post | exactly-once 或 fail-closed downgrade |
| E09 | Hook disabled/untrusted | artifact 可发现；capability degraded/unknown |
| E10 | envelope 外变化 | current violation 阻止 closure |
| E11 | transcript 缺失/损坏 | 核心 projection 与 closure 不变 |
| E12 | reconcile 后并发写 | stale observation，不 terminal |
| E13 | finite writes + partial coverage | compliance unknown，closure hold |
| E14 | `not-needed` positive/negative | outcome-specific 条件 + 公共 terminal gate 生效；strict write/revert 不得绕过 |
| E15 | Contract 5 active/terminal migration | 分别拒绝/允许 |
| E16 | Windows path/lock/installer | 固定 CI 四组合通过 |
| E17 | stale checkpoint chain with matching bytes | stale candidate 不得追加 delta 或越过 closure |
| E18 | repeated Contract 6 installs | pinned Contract 5 runtime 永不被自动 prune |
| E19 | exhaustive operation 后切换 invisible surface | 下一次 Pre/closure 把 gap 标 unowned；旧 lease 不得维持 full |
| E20 | reused event kinds across contracts | v1/v2 精确 dispatch；mixed task history 可 replay，task 内混用 fail closed |
| E21 | external active Contract 5 escape | 多次 v6 upgrade 后仍可只读查看并用 pinned v5 finish/abandon |

### 7.2 性能与故障注入

- task open baseline 在代表性小/中型仓库测量文件数、manifest bytes、hash duration。
- 10,001-record event replay benchmark 继续满足现有阈值；若 checkpoint manifest 改变基准，先 profile，不直接放宽阈值。
- 注入 event append 后/snapshot 前崩溃，replay 必须恢复同一 artifact checkpoint。
- 注入 reconcile candidate 计算后/commit 前内容变化与 authority-only 变化，必须 stale；补测内容回到 candidate bytes 但 `from_checkpoint` 已过期的 ABA 场景。
- 注入 HOME ledger 写失败，repo authority 不回滚，后续 sync 收敛。
- 在非安装源仓库创建 active Contract 5 task，执行首次激活与至少两次 Contract 6 upgrade；验证新 runtime 的 status/audit/report 不写 event、Contract 6 mutation 被拒绝，并用 manifest pin 指向的 runtime 5 完成真实 finish 与 abandon 两条 fixture。

### 7.3 Release gate

本地：

```sh
node --test tests/runtime-v6.test.mjs
npm run test:event-store
npm run test:snapshot
npm run test:host-hooks
npm run test:installer
npm run test:behavioral
npm run test:architecture
npm run bench:event-store -- --json
npm test
git diff --check
```

CI：

- Linux/macOS 主矩阵全绿。
- `windows-2022/windows-2025 × Node 22/24` 全绿。

Live receipts：

- Claude success/failure/partial failure。
- Codex CLI success/failure/Bash nonzero。
- Codex App new thread shell + specialized patch。
- 自动审批开启/关闭各一次，Workloop 证据语义相同。

提交 10：`test(e2e): prove contract 6 evidence across hosts and failures`

只有上述证据齐全、同 commit review 通过，才允许在临时 HOME 做 installer smoke；临时 HOME 通过后才进入真实 HOME 的单独安装授权步骤。

## 提交序列与回滚点

| # | 提交 | 可独立回滚条件 |
|---:|---|---|
| 1 | centralize configured hook contracts | 未激活，可直接回滚 |
| 2 | define Contract 6 events/projection | 尚无 Contract 6 event，可回滚 |
| 3 | persist task-open baseline | 尚无 Contract 6 event，可回滚 |
| 4 | reconcile checkpoints | 尚无 Contract 6 event，可回滚 |
| 5 | correlate Post receipts | 尚无 Contract 6 event，可回滚 |
| 6 | closure coverage gate | 尚无 Contract 6 event，可回滚 |
| 7 | budget/not-needed semantics | 尚无 Contract 6 event，可回滚 |
| 8 | CLI/ledger reporting | repo authority不变；projection 可重建 |
| 9 | installer/cutover | 激活前可回滚；激活后保留旧 runtime |
| 10 | E2E/release evidence | 测试/文档提交，可回滚 |

一旦真实 repo 写入 Contract 6 event，提交 2–7 视为一个兼容性单元；不得只回滚其中一部分。

## 最终 Oracle

`achieved` 与 `not_needed` 的公共 terminal gate 必须满足：

```text
artifact_state_coverage = full
AND current_scope_violations = []
AND task/artifact/evidence revisions and event cursor stable through commit
AND required review fresh
AND (write budget is unlimited OR write budget compliance = proven_within_limit)
AND (strict history not required OR mutation_history_coverage = full)
```

然后应用 outcome-specific oracle：

```text
achieved:
  criterion verdict = satisfied
  AND criterion checkpoint = latest artifact checkpoint

not_needed:
  current checkpoint = task-open baseline
  AND no successful completion receipt
  AND explicit user evidence
```

`abandoned` 不经过成功 assurance gate，但必须保持显式 reason 和正常 event-authority 原子提交；它不声称 criterion satisfied 或工作无需进行。

禁止状态：仓库存在相对 task-open baseline 的落地变化，而 terminal projection 同时声称 `touched_files=[]`、`artifact_state_coverage=full` 和“没有写入”。

## 已知风险与停线条件

- Claude 没有可靠 failure receipt：继续使用 reconciliation，Claude operation quality 降级，不停掉核心方案。
- Codex App 新版本仍 bypass nested patch Hook：维持 partial history；不再寻找 transcript 主方案。
- baseline manifest 在真实仓库造成不可接受的 event size/replay 成本：停在 Phase 2，先验证 delta/压缩或显式 scope fingerprint；不得静默牺牲 ignored/untracked 覆盖。
- repository revalidation 无法把 criterion commit 绑定到同一 checkpoint：停止发布，不能用“高概率稳定”替代 gate。
- installer 无法证明旧 runtime 被保留：停止 Contract 6 激活。
- 宿主提供覆盖所有路径、稳定且不可绕过的原生 mutation ledger：重新评估并删除可被原生能力取代的 reconciliation 复杂度。
