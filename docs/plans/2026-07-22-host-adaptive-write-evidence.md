# Workloop 路径感知的写入授权与证据方案

日期：2026-07-22  
状态：修订完成；通过宿主能力预检后可进入实施  
模式：Plan  
深度：Deep  
决策：BUILD（来源：用户）

## TL;DR

Workloop 不应再用一个 `write_authorized` 同时表示“允许写”“实际写成功”和“当前产物已变化”。当前最佳路径是：

> 路径感知的 Host Adapter + 写前授权 + 写后完成回执 + 仓库状态对账 + 分层覆盖度。

直接 Hook 可见的工具通过 `PreToolUse`/`PostToolUse` 和 `tool_use_id` 建立准确关联；Codex App code-mode `exec → apply_patch` 等不可见路径不得伪装成受保护，而由 repository reconciliation 解释当前落地状态。transcript 只作辅助诊断，不进入长期正确性契约。

闭环必须要求当前仓库状态可完整对账；历史写操作覆盖度单独报告。这样既不会错误显示 `writes=0`，也不会因为 Codex App 缺少完整历史传感器而永久无法完成任务。

## 行动方案

1. 进入 Runtime Contract 6，拆开授权、工具完成和产物状态三类事实。
2. 为 Claude/Codex 增加 `PostToolUse` Adapter；按 `tool_use_id` 幂等关联 Pre/Post。
3. 复用现有仓库 fingerprint 机制，在 task open、Post、verify、achieve 和 Stop 建立 artifact checkpoint。
4. 分开 `artifact_state_coverage` 与 `mutation_history_coverage`，闭环规则不再混淆两者。
5. installer 生成和诊断 `PreToolUse + PostToolUse + Stop`，同时显示真实 capability matrix。
6. 用真实 Claude、Codex CLI、Codex App code-mode 路径建立 E2E 矩阵，验证后才允许安装到 `~/bin`。

## 当前最佳性检查

- 决胜条件：事实语义正确、不可见路径不伪装、当前产物可安全闭环、宿主差异局部化、长期不依赖非稳定 transcript。
- 胜出方案：直接 Hook 回执与 repository reconciliation 组合的路径感知双证据模型。
- 最接近替代：所有宿主只使用 `PreToolUse + PostToolUse`；实现更小，但 Codex App code-mode `apply_patch` 会继续漏记。
- 胜出方案的失败条件：repository fingerprint 无法完整覆盖 ignored/untracked/current working tree，或 reconciliation 不能与 criterion commit 绑定为同一稳定状态。
- 能击败本方案的新事实：宿主提供覆盖所有写路径、带稳定成功/文件清单且不可绕过的原生 mutation ledger；届时可删除大部分 reconciliation 实现。
- 边际停止点：不开发任意 JavaScript/shell 静态分析器，不把 transcript JSONL 变成事实来源，不开发 OS 级文件监控器。

## 下一步验证

实施前先完成一个半天内可结束的 capability conformance probe：

- Claude：成功/失败的 Write、Edit、Bash 对应 Pre/Post/PostToolUseFailure payload。
- Codex CLI：复核成功/失败 `apply_patch` 与非零 Bash payload。
- Codex App 新 thread：分别捕获 code-mode `shell_command` 和 `exec → apply_patch` 是否触发 Pre/Post。
- 只保留字段名、类型、canonical tool name、`tool_use_id` 和成功语义；不保存会话正文。

若 App 新版本已经让 code-mode `apply_patch` 进入直接 Hook，删除该路径的特殊降级，但不删除 repository reconciliation。若 Claude 没有可靠成功回执，则把 Claude 对应路径从 `exact` 调整为 `reconciled`，核心方案仍成立。

## 验收预言机

一个真实任务只有在以下观察同时成立时才能 `achieve`：

```text
criterion verdict = satisfied
AND criterion fingerprint = latest artifact checkpoint
AND artifact_state_coverage = full
AND no unresolved current scope violation
AND task/evidence/artifact revisions remained stable through commit
AND required review is fresh
```

在严格历史审计或有限 write-operation budget 下，还必须满足：

```text
mutation_history_coverage = full
```

默认产物闭环不把“宿主无法提供完整历史”伪装为 full；它允许以 `reconciled` assurance 完成，并在状态、报告和 ledger 中保留降级事实。

## 根问题

Workloop 必须分别回答四个问题：

1. 这次工具调用是否被允许？
2. 工具是否完成，宿主给出了什么结果？
3. 当前仓库内容相对上一个稳定 checkpoint 实际发生了什么变化？
4. 对写入历史和当前产物分别拥有多完整的证据？

旧模型把四者压进 `write_authorized`，导致：

- 已授权但失败的工具被当成写成功。
- Hook 不可见的真实写入被显示为 `writes=0`。
- `artifact_revision` 来自许可而不是内容事实。
- 缺少传感器时无法区分“没有写”和“不知道是否写”。

## 已验证事实

- Codex Hooks feature 在本机 CLI `0.144.5` 和 App 内置 runtime `0.145.0-alpha.18` 中均标为 Stable。
- 官方 [Codex Hooks 文档](https://learn.chatgpt.com/docs/hooks)规定标准本地 function-tool 路径支持 `PreToolUse`/`PostToolUse`，并明确 specialized path 可以 opt out。
- Codex CLI 直接 `apply_patch` 的 Pre/Post 使用同一 `tool_use_id`；Post 包含 `tool_response`。
- CLI 失败 `apply_patch` 实测只有 Pre、没有 Post、没有仓库变化。
- Bash 非零退出也会产生 Post，因此“出现 Post”不是跨工具通用的成功布尔值。
- 当前 Codex App code-mode 中，嵌套 `shell_command` 进入 Hook；`exec → apply_patch` 只产生内部 patch 事件，没有对应 Hook。
- 官方明确声明 transcript 格式不是稳定 Hook interface。
- 项目已有完整 repository-content fingerprint、criterion prepare/commit stale 检查和 side-effect reconciliation，可复用而不应平行重写。

## 真实约束与假设

| 项目 | 分类 | 方案影响 | 验证方式 |
|---|---|---|---|
| Hook 可以按工具路径缺席 | 真实约束 | capability 不能只按 `codex-safe` profile 声明 | 已实测 |
| transcript 不是稳定接口 | 真实约束 | 只能用于诊断/加速，不能决定 closure | 官方契约 |
| criterion 执行在 task lock 外 | 真实约束 | reconciliation 必须参与现有 prepare/commit stale 绑定 | 当前源码 |
| 事件 schema 三处重复验证 | 项目约束 | Contract 6 同时改 prims/event-store/task-engine | `AGENTS.md` |
| Claude Post 成功/失败 payload 可稳定区分 | 待验证假设 | 决定 Claude 是 exact 还是 reconciled | capability probe |
| App 新 thread 仍绕过 patch Hook | 易变事实 | 决定 Codex App capability matrix | capability probe |

## 方案比较

| 机制 | 结论 | 主要失败模式 |
|---|---|---|
| 保持现状 | 淘汰 | 授权即写入、继续产生假 `writes=0` |
| 只补 `PostToolUse` | 次优 | App specialized path 仍不可见 |
| 只做 repository diff | 次优 | 看不到已 revert 的历史操作，也失去可用的写前阻止 |
| 解析 transcript `patch_apply_end` | 淘汰为核心 | 非稳定格式会让正确性跟随宿主内部实现漂移 |
| 路径感知双证据模型 | 胜出 | 需要清楚区分当前产物覆盖与历史覆盖 |
| 等待宿主统一 Hook | 延后项 | 当前 bug 继续影响所有 Codex App 任务 |

## 目标模块与接口

```text
Host Hook payload
      |
      v
Host Adapter --------------> Capability observation
      |                           |
      | authorize/complete        v
      v                     Coverage projection
Task Engine <---- Artifact Reconciler
      |                 |
      +---- Closure Gate+
```

外部接口保持小而明确：

```js
decodeHostEvent(payload) -> HostEvent
decideAuthorization(task, hostEvent) -> Allow | Deny | Rewrite
observeCompletion(task, hostEvent) -> CompletionReceipt | Unknown
reconcileArtifact(repo, checkpoint) -> ArtifactDelta
evaluateClosure(task, artifactDelta, criterionObservation) -> Eligible | Hold
```

宿主特有的 tool name、payload shape、成功语义和 matcher aliases 只存在于 Host Adapter；Task Engine 只消费宿主中立事件。

## Contract 6 事件与投影

### 1. `write_authorized`

含义：一个潜在写操作在执行前获得许可。

```json
{
  "operation_id": "host tool_use_id or generated id",
  "declared_targets": ["lib/a.mjs"],
  "target_coverage": "exact"
}
```

它只更新授权/预算视图，不更新 `artifact_revision` 或实际 touched files。

### 2. `tool_completed`

含义：宿主报告一个潜在写工具已经完成。

```json
{
  "operation_id": "...",
  "tool_family": "patch|shell|direct_write|mcp",
  "outcome": "success|failure|unknown",
  "reported_targets": ["lib/a.mjs"],
  "receipt_quality": "exact|tool_specific|unknown"
}
```

- `apply_patch` 成功 Post 可形成 `exact` 或 `tool_specific` receipt。
- Bash Post 只证明命令完成，是否写入由 artifact reconciliation 决定。
- 重放相同 `operation_id` 必须幂等。

### 3. `artifact_reconciled`

含义：当前仓库内容相对前一个 checkpoint 的事实。

```json
{
  "from_checkpoint": "sha256",
  "to_checkpoint": "sha256",
  "changed_paths": ["lib/a.mjs"],
  "current_scope_violations": [],
  "coverage": "full"
}
```

它是 `artifact_revision`、当前 touched files、review freshness 和 criterion freshness 的权威来源。

### 4. `coverage_changed`

含义：写入历史或当前产物的证据质量发生变化。

```json
{
  "artifact_state": "full|unknown",
  "mutation_history": "full|partial|unknown",
  "reason": "specialized_tool_path_unhooked"
}
```

### Projection

废弃单一、含义不明的 `spent.writes` 解释，投影为：

```json
{
  "authority": {
    "write_operations_authorized": 4,
    "prewrite_enforcement": "partial"
  },
  "evidence": {
    "tool_completions_observed": 3,
    "mutation_history_coverage": "partial",
    "artifact_state_coverage": "full",
    "touched_files": ["lib/a.mjs"]
  },
  "artifact_revision": 2
}
```

若为兼容保留 `spent.writes`，必须同时输出 `write_count_basis: authorized|completed|reconciled_lower_bound`，且报告/预算不得把 lower bound 当精确值。

## 写入预算与 assurance

- 写入预算只能对传感器可见、可在 Pre 阶段阻止的操作提供 hard enforcement。
- `prewrite_enforcement=partial` 时，有限 write-operation budget 的合规性为 `unknown`，不能显示为未超限。
- 默认产物正确性闭环要求 `artifact_state_coverage=full`，允许 mutation history 为 partial，但报告必须明确降级。
- critical risk、严格审计或用户显式要求完整写入历史时，要求 `mutation_history_coverage=full`；Codex App code-mode 不满足时应在 task open/status 时立即提示不可达，而不是到最后才失败。
- `not-needed` 必须同时满足：artifact checkpoint 与 task-open baseline 相同、artifact coverage full、没有成功 completion receipt、没有 scope violation，并提供显式证据。

## Repository reconciliation

### Baseline

task open 成功时捕获完整 repository-content fingerprint：

- ignored/untracked/tracked 文件全部覆盖。
- 排除 `.git/` 和 `.workloop/`。
- 记录已存在 dirty state，避免归因给新 task。
- fingerprint 使用现有 criterion primitives，避免第二套哈希语义。

### Checkpoint 时机

- task open：建立 baseline。
- PostToolUse：快速 reconcile，及时更新遥测。
- `verify --record`、`achieve`、Claude Stop：强制 reconcile。
- Codex release-only Stop：best-effort reconcile，但真正 closure 仍由显式 `achieve` 或外部 driver 完成。

### 并发与原子性

1. 锁外计算完整 fingerprint。
2. 在 task lock 内重验成员/stat/recent-content，并提交 `artifact_reconciled`。
3. criterion prepare 绑定 task revision、artifact revision 和 checkpoint digest。
4. criterion commit 再验证三者；任何变化都产生 stale observation。
5. scope violation 或无法读取的路径将 artifact coverage 降为 unknown，并阻止 closure。

## Host Adapter 行为

### Claude

- Pre：保留当前 envelope、grant、session ownership 和 deny/rewrite 行为。
- Post/PostToolUseFailure：按 capability probe 结果记录完成/失败。
- Stop：先 reconcile，再运行 criterion；hard Stop 保持 byte-exact 输出契约。

### Codex 标准路径

- Pre/Post 使用 canonical tool name 和 matcher alias。
- 用 `tool_use_id` exactly-once 关联。
- `apply_patch` 从 `tool_input.command` 解析 declared/reported targets；Post 只确认工具结果，最终内容由 checkpoint 确认。
- Bash 非零 Post 记录 completion failure/unknown，不直接推断写入。

### Codex App code-mode specialized path

- `shell_command` 若进入标准 Hook，按标准路径处理。
- `exec → apply_patch` 不宣称 Pre enforcement 或 Post receipt。
- repository delta 产生 artifact revision 与 interval attribution。
- transcript patch event 仅可增加诊断细节；缺失、变化或损坏不能破坏核心闭环。

## Closure Gate

`achieve` 和 Claude Stop 的顺序固定为：

```text
reconcile artifact
-> persist coverage/checkpoint
-> prepare criterion against checkpoint
-> execute criterion outside task lock
-> commit only if task/artifact/evidence/checkpoint all stable
-> evaluate review and assurance
-> terminal event
```

以下情况必须 hold：

- artifact coverage unknown。
- 当前存在 envelope 外变化或受保护控制状态变化。
- criterion 观察绑定旧 checkpoint。
- reconcile 与 commit 之间出现并发变化。
- required review 不新鲜。
- task 要求完整历史，但 mutation history coverage 不是 full。

## Installer 与配置

- recipe 生成 `PreToolUse + PostToolUse + Stop`。
- Claude/Codex matcher 使用同一中央常量，但 capability 由 Adapter 和运行时观察决定，不由 matcher 存在推断。
- 检查三个事件的存在、profile、matcher、timeout、重复 handler 和命令版本。
- 状态输出区分：`configured`、`observed`、`degraded`、`unknown`。
- 不修改自动审批、sandbox、notifier 或其他用户 Hook。
- 安装前检测 active Contract 5 task；存在时拒绝 Contract 6 切换并给出 finish/abandon 指引。
- 当前未完成遥测修复的中间源码不得安装到 `~/bin`。

## 迁移与回滚

- 已终态 Contract 5 task 保持字节不变；报告注明旧 `writes` 是 preauthorization 语义。
- active Contract 5 task 没有 task-open artifact baseline，不能自动迁移为 full coverage；必须先完成或 abandon。
- Contract 6 使用新事件字段和 projection validator；prims、event-store、task-engine 三处同时更新。
- runtime、shim 和 Hook recipe 原子切换；任一步失败保留 Contract 5 runtime 与原配置。
- 一旦写入 Contract 6 event，旧 runtime 必须拒绝继续写；回滚仅允许恢复二进制后以只读方式导出诊断。

## 验收矩阵

| 场景 | 必须观察到的结果 |
|---|---|
| Claude Write 成功 | authorization + completion + artifact checkpoint |
| Claude Write 失败 | authorization/失败 receipt；artifact 不增加 |
| Codex CLI patch 成功 | 同 ID Pre/Post；changed file；一次 artifact revision |
| Codex CLI patch 失败 | 不产生 artifact revision，不虚增成功写入 |
| Codex Bash 非零 | Post 不等同成功；repo 未变则 artifact 不增加 |
| App code-mode patch | 无直接 Hook 也能由 reconciliation 发现当前落地文件；history 标 partial |
| App code-mode patch 后 revert | 当前 artifact 回到 baseline；history 不得声称 full |
| Hook replay | 相同 operation ID 不重复计数 |
| Hook 被禁用/未信任 | capability degraded；当前变化仍由 reconciliation 发现 |
| envelope 外写入 | scope violation 阻止 closure，直到 revert 或用户 amend |
| transcript 缺失/格式变化 | 核心状态和 closure 不受影响，仅诊断降级 |
| reconcile 后并发写 | criterion observation stale，不得 terminal |
| `not-needed` | baseline 相同、coverage full、无成功 receipt、显式 evidence |
| 自动审批开/关 | Workloop 证据语义相同 |
| Windows | path canonicalization、locks、installer 三事件诊断通过 |

最终禁止再次出现：仓库存在当前任务落地变化，而 terminal task 报告“没有写入且证据完整”。

## 范围与成本

| 范围 | 组成 | 预估 | 风险 | 价值 |
|---|---|---:|---|---|
| 核心 | Contract 6 events、projection、validators | 1.5 天 | schema 漂移 | 纠正事实语义 |
| 核心 | Post Hook Adapter、per-tool receipt、exactly-once | 1.5 天 | 宿主 payload 差异 | 利用直接成功证据 |
| 核心 | artifact baseline/checkpoint/reconciliation | 2 天 | 性能与并发 | 覆盖不可见路径 |
| 核心 | closure、budget、assurance 与 stale 集成 | 1.5–2 天 | 终态安全 | 防止错误闭环 |
| 支撑 | installer、capability diagnostics、迁移/回滚 | 1 天 | 用户配置保护 | 可安全发布 |
| 支撑 | fixtures、故障注入、真实宿主与 Windows E2E | 1.5–2 天 | 环境易变 | 证明跨宿主行为 |
| 可选 | transcript patch-event 诊断 Adapter | 1–1.5 天 | 非稳定格式 | 仅提升诊断细节，不计入总价 |
| **总计（核心 + 支撑）** | | **9–10 天** | | |

主要维护成本是宿主 Adapter fixture 随 Claude/Codex Hook 契约升级；repository reconciliation 和 Task Engine 保持宿主中立。

## 可能修改的模块

- `lib/prims.mjs`：Contract 6 event payload fields、capability enums。
- `lib/event-store.mjs`：持久化 record contracts。
- `lib/task-engine.mjs`：新 decider/reducer、projection、budget/closure 语义。
- `lib/application.mjs`：Pre/Post dispatch、reconcile/criterion transaction。
- `lib/host-hooks.mjs`：Post decode/encode、profile capability、recipe。
- `lib/criterion.mjs` / `lib/task-store.mjs`：复用 fingerprint/checkpoint 与 snapshot contract。
- `install.mjs`：三事件诊断和 Contract 6 发布门禁。
- `tests/host-hooks.test.mjs`、`tests/installer.test.mjs`、`tests/workloop.test.mjs`、`tests/roadmap-e2e.test.mjs`、`tests/windows.test.mjs`：验收矩阵。
- `skills/loop-core/HOSTS.md` / `ADAPTERS.md`：宿主能力与降级语义。

## 价值门禁

```yaml
decision: BUILD
decision_source: user
target_outcome: Workloop 对授权、实际工具完成、当前产物状态和证据覆盖给出可信结论
baseline_and_frequency: 当前 Codex App 的 specialized patch 路径可让真实落地修改显示为 writes=0
expected_benefit: 消除错误无写入结论；保留可用写前阻止；让不可见路径以明确降级安全闭环
delivery_and_maintenance_cost: 9–10 工程日；持续维护薄 Host Adapter fixtures
status_quo_or_existing_mechanism: 手动 verify 只能证明 criterion，不能解释写入授权与证据覆盖
decision_flip_condition: 宿主提供覆盖所有写路径、稳定且不可绕过的原生 mutation ledger
review_scope: implementation-authorization
review_budget: unbounded by explicit user request
```

当前定价仍低于继续保留错误遥测和错误终态的长期成本，BUILD 决策不变。
