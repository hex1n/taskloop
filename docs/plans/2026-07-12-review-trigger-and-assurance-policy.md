# taskloop Review 触发与保证策略改进方案

**日期**：2026-07-12
**类型**：第一性原理设计方案（已实现）
**范围**：review 触发、判据可信度、任务风险、closure hold、CLI、task schema、ledger、skills

## TL;DR

当前实现仅在 criterion 的 `provenance !== "repo"` 或
`input_coverage !== "full"` 时要求 review。它回答的是“判据传感器是否弱”，
却被用来替代“这次变更是否值得第二双眼睛”，因此会让大型破坏性重构免审，
同时让简单的 `npm test` 修复被强制评审。

最佳改进不是把“文件数超过 N”换成新的单一触发器，而是建立两个正交闸门：

1. **Proof assurance**：机器证据能否支撑 achieved；弱判据形成
   `criterion_assurance_gap`，review 不能消除它，只能通过加强判据或显式接受证明
   降级来处理。
2. **Change assurance**：变更的预期失败损失是否值得独立评审；根据任务声明的
   risk class 与 runtime 可见事实派生 review 要求，形成
   `change_review_unaccepted`。

runtime 只派生并阻止收口，不自行调用 reviewer。宿主或 workloop 看到
`review_requirement` 后触发 fresh-context/second-model review，再通过现有 `review`
命令提交结果。

## 当前最佳路径

新增规范保证模型：

```text
proof_assurance = adequate | gap(reasons[])

declared_risk = routine | substantial | critical
effective_risk = max(declared_risk, machine_risk_floor)

review_policy = risk_based | required | waived
review_requirement = none | fresh_context | second_model
```

风险到 review 的默认映射：

| effective risk | risk_based requirement |
|---|---|
| `routine` | `none` |
| `substantial` | `fresh_context` |
| `critical` | `second_model` |

`required` 必须同时声明最低 level；`waived` 必须携带非空理由并进入 ledger。
机器事实只能提高 `effective_risk`，不能把用户/上游生产者声明的风险降低。

closure 分别回显：

```text
held(criterion_assurance_gap)
held(change_review_unaccepted)
held(criterion_assurance_gap, change_review_unaccepted)
```

两者的解除规则不同：

- `criterion_assurance_gap`：加强 criterion 使 proof adequate，或通过独立、显式、
  可审计的 proof-gap acceptance 降级；review verdict 本身不能解除。
- `change_review_unaccepted`：取得当前 generation、当前 substantive revision、当前
  artifact revision 上满足最低 level 且 blocking findings 为 0 的 review，或按 policy
  显式 waive。

## 最佳性检查

- **适配标准**：语义正确、不会把 LLM review 冒充机器证明、能覆盖高风险强判据
  任务、低风险任务成本可控、runtime 可确定性执行、所有降级可审计。
- **当前赢家**：proof assurance 与 change assurance 双轴模型，任务风险显式声明、
  机器事实只做风险下限。
- **最接近替代方案**：单一 `--review-policy auto|required|none`，由文件数、模块数等
  启发式决定 auto。
- **反转条件**：如果 taskloop 被明确限定为只管理机器判据可信度、不承担变更质量
  保证，则应删除 change review gate，而不是继续扩充风险模型。
- **边际收益停止点**：v1 不引入数值评分、可训练风险模型或几十个权重；三级风险与
  少量确定性 floors 足以修复当前责任错配。

## 下一步验证

先实现一个最小纵向切片：使用仓库内、full coverage 的强判据打开
`critical + risk_based` 任务，证明 criterion satisfied 后 closure 仍因
`change_review_unaccepted` 被 hold；提交当前 revision 上的 second-model、零阻塞项
review 后才 eligible。该测试直接证伪“强判据自动免审”的旧行为。

## 根问题

review 的根本目的不是补齐一个字段，而是降低“机器检查已通过但交付仍然错误”的
剩余风险。是否值得 review 取决于：

```text
review value ≈ escaped-error probability × failure impact − review cost
```

任务复杂度会提高 escaped-error probability，但不是充分条件：单文件权限修改可能
高影响，二十个机械改名可能低风险。criterion provenance/coverage 只描述机器传感器，
既不等于复杂度，也不等于失败影响。

当前模型混合了三件不同的事：

1. criterion 是否可执行并给出 determinate observation；
2. criterion 的输入和来源是否足以防止传感器漂移；
3. criterion 没覆盖的设计、结构、安全和边界错误是否需要独立判断。

解决状态是：每一种 hold 都有单一原因、单一解除机制，review 不再承担它无法可靠
完成的“把弱机器证据变强”职责。

## 真实约束、约定与假设

### 真实约束

- runtime 必须基于持久化事实作确定性裁决，不能自行判断代码“复杂不复杂”。
- runtime 不拥有 fresh-context 或 second-model 调度能力；触发执行属于宿主/workloop。
- achieved 仍必须有 fresh satisfied observation；review 是第二传感器，不能替代 criterion。
- review 必须绑定当前 criterion generation、substantive task revision 与 artifact revision；
  后续实质改动必须使其过期。
- taskloop 是协作式信任边界，不能密码学证明 reviewer 身份或 finding 质量。
- clean-break 方案当前仍在开发工作树中，新增 schema 字段可在正式发布前一次性收敛。

### 可改变约定

- 目前把 weak sensor review 直接作为 closure acceptance gate。
- 目前只有 provenance/coverage 会自动产生 review hold。
- `--provisional` 同时承担含义不够清晰的证明降级职责。

### 待验证假设

| 假设 | 若错误 | 验证方式 |
|---|---|---|
| 上游计划/agent 能在 open 时可靠声明三级 risk | 任务可能系统性低报风险 | 对历史任务盲标并比较 reviewer findings；机器 floors 保底 |
| substantial 默认 fresh-context 的成本可接受 | review 成本压过收益 | ledger 统计 review 数量、耗时、blocking finding 命中率 |
| critical 可获得 second-model | 任务长期 held | 宿主 capability preflight；不可用时记录明确 downgrade/waiver |
| proof gap 不允许被 review 消除不会过度阻塞 | 大量外部证据任务无法收口 | 用 tri-state adapter 和显式 proof-gap acceptance 验证两条路径 |

## 方案比较

### 方案 A：继续只按 weak sensor 触发

机制简单，且能提醒判据来源不明。但它遗漏强判据上的高风险变更，也把 review 当成
proof 修复工具。不能解决根问题，淘汰。

### 方案 B：仅按变更规模自动触发

例如文件数、目录数或 diff 行数超过阈值。它可机器计算，但规模与风险相关性很弱，
且容易被拆分调用或集中单文件修改绕过。可作为 risk floor 的一个信号，不能成为模型。

### 方案 C：仅由用户声明 required/none

语义清晰、runtime 简单，却缺少默认安全性；遗漏声明或乐观低报会直接免审。适合作为
override，不适合作为默认机制。

### 方案 D：双轴保证模型（推荐）

proof 与 change risk 各自建模；任务生产者声明 risk，runtime 用确定性事实提高下限，
宿主执行 review。它保留机器可判定性，又能覆盖高风险强判据任务，且不会宣称 review
修复了 proof gap。

最强失败模式是“risk 仍由同一个乐观 agent 低报”。缓解方式不是引入伪精确评分，
而是：默认 `risk_based`、明确 risk rationale、机器 floors 只升不降、高风险类别由计划/
用户显式声明，并把声明与最终 findings 写入 ledger 供事后校准。

## 风险模型

### 声明风险

open 新增：

```text
--risk routine|substantial|critical
--risk-reason "<why>"
--review-policy risk-based|required|waived
[--required-review-level fresh-context|second-model]
[--review-waiver-reason "<why>"]
```

默认值：

- `--risk substantial`，避免未声明时乐观免审；
- `--review-policy risk-based`；
- `routine`、`critical` 必须提供 risk reason；
- `required` 必须提供最低 review level；
- `waived` 必须提供 waiver reason。

### 机器风险下限

v1 只使用少量高信号、可确定性观测：

| 事实 | risk floor | 原因 |
|---|---|---|
| destructive grant、whole-repo grant、不可逆操作授权 | `critical` | 失败影响和恢复成本高 |
| security/auth/permission、持久化 schema、公共 hook/API/protocol 的显式 change class | `critical` | 边界或兼容性影响高 |
| network/install/git grant、criterion/policy/trust amend、proof gap acceptance | `substantial` | 权限或证明边界发生变化 |
| 触及多个 envelope roots、超过保守文件阈值 | `substantial` | 仅作复杂度下限，不单独判 critical |
| 普通单模块、可逆、强判据变更 | 不提高 | 保留 routine 快速路径 |

语义 change class 应由 open/amend 显式声明，runtime 不通过文件名猜测安全或协议含义：

```text
--change-class internal|public-contract|schema|security|permissions|migration
```

机器可验证的 grant、触及文件和 revision 事实可以自动抬升风险。

### 为什么不使用连续复杂度分数

`risk = 37` 看似精确，实际需要未经验证的权重，并会产生阈值博弈。三级序关系足以决定
`none/fresh_context/second_model`，同时让理由可以被人审计。

## 规范状态

task schema 增加：

```json
{
  "assurance": {
    "declared_risk": "substantial",
    "risk_reason": "cross-module lifecycle refactor",
    "risk_declared_by": "user",
    "change_classes": ["public_contract", "schema"],
    "review_policy": "risk_based",
    "required_review_level": null,
    "review_waiver_reason": null,
    "review_waiver_granted_by": null,
    "proof_gap_acceptances": [],
    "risk_floor_events": []
  }
}
```

`risk_floor_events` 仅保存无法从当前 grant/envelope 重新推导的 criterion/policy
amend 事实；它是 projector 的输入事实，不缓存 `effective_risk` 或 requirement。

不持久化以下派生值：

```text
effective_risk
machine_risk_floor
review_requirement
proof_assurance
closure holds
```

它们统一由 projector 根据当前 task facts 计算，避免缓存分叉。

## Projector 与收口规则

纯函数分成三个阶段：

```text
projectProofAssurance(task, currentCriterionInputs)
projectReviewRequirement(task)
projectClosure(task, proofAssurance, reviewRequirement)
```

`projectReviewRequirement`：

1. 计算 machine risk floor；
2. `effective_risk = max(declared_risk, floor)`；
3. `required` 使用显式 level；
4. `waived` 返回 none，但携带 waiver telemetry；
5. `risk_based` 按三级映射得到 requirement；
6. 查找当前 generation/revisions 上满足最低 level、blocking=0 的 review；
7. 缺失则产生 `change_review_unaccepted`。

review freshness 继续使用当前规则；advisory findings 不阻塞，但必须在 closeout 回显。

proof assurance：

- `repo + full` 且无 drift：adequate；
- provenance/coverage 不足：gap，并列出具体原因；
- fresh-context/second-model review 不改变该投影；
- 当前 generation 上的 proof-gap acceptance 可让 achieved 走显式降级路径，并在 terminal
  lifecycle 与 ledger 上记录 `proof_provisional: true`。

删除含义模糊的通用 `--provisional`，替换为：

```text
taskloop accept-proof-gap --reason "..." --granted-by user|self
```

如果风险策略同时要求 review，proof acceptance 不解除 review hold。

## runtime 与宿主职责

runtime 的“触发”定义为输出可执行请求，而不是直接启动另一个模型：

```json
{
  "closure": {
    "state": "held",
    "reasons": ["change_review_unaccepted"]
  },
  "review_requirement": {
    "level": "second_model",
    "reasons": ["declared_critical", "public_contract"]
  }
}
```

workloop/宿主看到 requirement 后：

1. 调用满足 level 的 reviewer；
2. 将 artifact、generation、revision 和评审标准交给 reviewer；
3. 处理 blocking findings；
4. 修改后重新 review；
5. 用 `taskloop review` 记录最终 counts；
6. 再次 Stop/achieve。

这保持 taskloop “runtime 是 stop gate、scheduler 在仓库外”的边界。

## 实施切片

### 切片 1：纯风险与保证投影

- 增加 assurance schema 和构造器；
- 实现 risk floor、review requirement、proof assurance 三个纯函数；
- 将 `weak_sensor_unreviewed` 拆为 proof gap 与 change review 两类 hold；
- 用穷举矩阵固定 policy × risk × floor × review freshness。

验证：强判据 critical 仍 held；弱判据 routine 同时出现 proof gap，是否需要 review 由
effective risk 独立决定。

### 切片 2：CLI 与状态转移

- open/amend 支持 risk、change class、review policy；
- 增加 `accept-proof-gap`；
- 删除通用 `--provisional`；
- substantive amendment 与 artifact write 继续使 review 过期；
- 风险抬升后旧 review level 不足时重新 held。

验证：fresh-context review 不能解除 critical 的 second-model requirement；proof
acceptance 不能解除 change review hold。

### 切片 3：ledger、status 与 hook

- ledger 记录 declared/effective risk、floor reasons、policy、waiver/acceptance；
- status 输出两个保证投影及下一步动作；
- Stop block reason 使用稳定 token；
- info 提升 contract/schema 版本，clean break 同步发布。

验证：audit 能区分 adequate proof、proof provisional、review accepted、review waived。

### 切片 4：skills 与端到端验证

- loop-core 定义双轴模型；
- workloop 根据 `review_requirement` 调度 reviewer；
- 临时 HOME 安装后覆盖 routine/substantial/critical、risk floor、waiver、proof-gap
  acceptance、review stale/level insufficient；
- 扫描发布内容，确保旧的 `weak_sensor_unreviewed` 和模糊 `--provisional` 不再作为公共接口。

## 必须覆盖的真值表

1. repo/full + routine + risk_based → 无 review hold；
2. repo/full + substantial → fresh-context requirement；
3. repo/full + critical → second-model requirement；
4. critical + fresh-context review → 仍 held；
5. critical + current second-model blocking=0 → accepted；
6. review 后 artifact write → stale；
7. review 后 goal/alignment/envelope/grant amend → stale；
8. declared routine + destructive grant → effective critical；
9. declared routine + public-contract change class → effective critical；
10. weak sensor + routine → proof gap，不由 review 自动消除；
11. weak sensor + proof acceptance → proof provisional；
12. proof acceptance + substantial → review hold 仍存在；
13. required(second-model) 覆盖 declared routine；
14. waived 无 review hold，但 ledger/closeout 明确 waiver；
15. 风险从 substantial amend 为 critical 后 fresh-context review 不再足够；
16. suspended/terminal 的 closure 和 review requirement 投影遵循 lifecycle 边界；
17. Stop 与 achieve 使用同一 projector，不复制规则；
18. 未声明风险按 substantial，而不是 routine；
19. runtime 只输出 requirement，不直接调用 reviewer；
20. risk/review/proof 降级均携带 reason 与 provenance。

## 优先级与工作量

| 优先级 | 改动 | 估算 | 风险 | 价值 |
|---|---|---:|---|---|
| P0 | assurance schema、纯 projector、真值表 | 1–1.5 天 | 中 | 修正领域责任 |
| P0 | CLI、transition、closure hold 切换 | 1–1.5 天 | 高 | 形成可执行闸门 |
| P0 | ledger/status/hook contract 切换 | 0.5–1 天 | 中 | 保证可审计 |
| P0 | loop-core/workloop 与安装后 E2E | 0.5–1 天 | 中 | runtime/指导一致 |
| **合计** | | **3–5 天** | | |

## 失败条件与防护

### 失败条件 1：复杂度再次被当作风险本身

防护：文件数只提高 routine→substantial；critical 必须来自高影响 change class、grant
或显式声明。

### 失败条件 2：review 再次被描述成 proof 修复

防护：proof projector 不读取 reviews；测试断言任意 review 都不能改变 proof assurance。

### 失败条件 3：同一 agent 低报风险以绕过 review

防护：默认 substantial、risk reason 入 ledger、机器 floors 只升不降、waiver 显式留痕。
这不能消除协作信任边界，但让降级可见且可审计。

### 失败条件 4：runtime 越界成为 scheduler

防护：runtime 只输出 stable requirement；reviewer 调度继续属于宿主/workloop。

### 失败条件 5：review 成本失控

防护：routine 强判据保留无审快速路径；用 ledger 统计各风险级别的 review 数量、
blocking finding 命中率与返工率，再校准默认值和 floors。

## 停止点

完成双轴保证模型、三级风险、确定性 floors、明确 waiver/acceptance、宿主触发契约和
安装后 E2E 后停止。不在本次引入自动风险分类模型、事件溯源、reviewer 身份认证或
通用 workflow scheduler。
