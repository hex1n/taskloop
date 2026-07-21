# 平台无关 Shell 语义与 Hook 身份绑定改进方案

- 日期：2026-07-21
- 模式：Plan
- 深度：Deep
- 状态：已收敛，尚未授权实施
- 输入来源：现场 Codex 转录、当前 `lib/host-hooks.mjs`、`lib/application.mjs`、`lib/supervision.mjs`、Windows/对抗测试及既有 Hook 设计文档

## TL;DR

当前最佳路径是构建一条明确的边界：

> 平台相关语法适配层 → 平台无关副作用模型 → 平台无关监督策略

同时把 session 身份从 shell 环境变量注入迁移为 workloop 自身的 CLI 协议。用户继续使用同一套命令；PowerShell、POSIX 和 CMD 的差异只存在于 Hook 安装及内部语义适配层。

本方案不修改 task lifecycle、事件 schema、runtime contract 或历史 ledger。预计交付成本为 **5.75–8 人日**。

### 当前最佳路径

1. Hook recipe 在安装时绑定实际 shell 方言，日常命令无需声明平台。
2. tokenizer 按方言把重定向投影为统一的 `file | descriptor | discard | dynamic` 语义。
3. owner、foreign-session、risk floor 和 evidence 只消费同一份 canonical effect model，不再重复解析原始命令。
4. session 身份通过 workloop 内部 CLI 参数传递，不再生成 `export` 或 `$env:`。
5. 方言未知时不猜：普通命令保守分析，workloop 控制命令禁止无绑定地降级为 `cli`。

### 下一步验证

在干净 worktree 中先建立六个现场型失败测试，不改生产行为。最先验证内部 CLI 身份参数能否无歧义地通过 Bash、PowerShell 和 CMD；如果失败，只将身份传输替换为内部 wrapper，不推翻整体架构。

## 决策信封

```yaml
decision: BUILD
target_outcome: workloop 在 POSIX、PowerShell、CMD 上对同一语义产生相同授权结论，用户日常命令不感知平台差异
baseline_and_frequency: 已现场复现只读命令被拒和 PowerShell 收到 POSIX export 两类确定性故障；命中对应语法时复现率为 100%
expected_benefit: 消除已知 2/2 跨方言故障类，并关闭 NUL 与 /dev/* 全局特判造成的潜在安全盲区；总体工单降幅暂无足够样本估算
delivery_and_maintenance_cost: 5.75–8 人日，约一个工程周；每新增 shell 约 0.5–1 日
status_quo_or_existing_mechanism: 规定 agent 使用绝对路径、避免变量和重定向，并用工具自带静默参数
decision_flip_condition: 若产品明确取消 Windows/PowerShell/CMD 支持并只承诺一种 POSIX shell，则应缩减为单方言实现
review_scope: implementation-authorization
review_budget: 实施前一次 plan review；完成后一次完整 code review；重大机制变更后重审受影响范围
```

## 验收 Oracle

只有以下观察同时成立，方案才算完成：

1. 现场 `rg ... 2>$null` 在 Windows Codex 下正常执行。
2. 同一命令不产生 write evidence。
3. PowerShell 引用或转义后的 `$null` 不被错误当成 discard。
4. POSIX `>NUL` 和 `>/dev/shm/file` 被识别为真实写入。
5. tool label 与实际 shell 不一致时，以 recipe contract 为准。
6. Bash、PowerShell、CMD 中直接调用 workloop 都能绑定正确 session。
7. rewritten command 不再出现 `export` 或 `$env:`。
8. unknown 方言不会产生 `"cli"` owner。
9. control-state、destructive、network、git 和 foreign-session 测试不退化。
10. Windows 固定矩阵、Hook byte contract 和 `npm test` 全绿。
11. 至少各完成一次真实 Codex Windows 与 Claude live probe。

## 根问题

问题不是 PowerShell 语法多，也不是 Node.js 无法跨平台。当前实现把不可靠的 `tool_name` 同时用于三件事：

1. 判断调用是否为 shell 工具；
2. 推断实际 shell 方言；
3. 决定生成 `export` 还是 `$env:`。

现场已证明这个假设不成立：Codex 实际执行 PowerShell，但 Hook 路径把工具当成 `Bash`，造成两个独立故障：

- `2>$null` 被当成向变量路径写文件；
- workloop CLI 被注入 POSIX `export`，随后交给 PowerShell 执行失败。

当前空设备判断还有相反方向的风险：

- 任意 `/dev/*` 都被忽略，但 `/dev/shm/file` 实际可以写入；
- `NUL` 在 POSIX 下可以是普通文件名，却被全局忽略；
- PowerShell `$null` 反而没有被识别。

因此现状既有只读命令被拒的假阳性，也有真实写入被忽略的潜在假阴性。

## 真实约束

1. 保持 dependency-free Node.js CLI。
2. `lib/application.mjs` 继续作为唯一 assembly；leaf module 只依赖 `lib/prims.mjs`。
3. foreign-session 写保护、control-state 保护和风险底线继续 fail closed。
4. Hook wire output 保持 profile 内 byte-exact；有意变化必须同步测试和文档。
5. task lifecycle、criterion、budget、event authority 不因 shell 适配发生变化。
6. 安装器不能静默修改用户拥有的 Claude/Codex Hook 配置。
7. Windows 固定版本矩阵和真实 host probe 都是发布门禁。
8. 当前工作树已有 active task 与未提交修改，实施不得覆盖或混入这些改动。

## 可改变的历史约定

- `tool_name` 可以代表真实执行 shell。
- 操作系统可以替代 shell 方言信息。
- session 身份必须通过 shell 环境变量前缀注入。
- `/dev/*`、`NUL` 等空设备可以脱离方言全局判断。
- `application.mjs` 和 `supervision.mjs` 可以分别维护命令语法判断。

## 承重假设

| # | 假设 | 类型 | 如果错误 | 验证 |
|---|---|---|---|---|
| A1 | Hook recipe 能稳定携带安装时选定的方言 | 高置信设计事实 | 需要独立 sidecar 配置 | recipe round-trip contract test |
| A2 | 内部 CLI 身份参数能安全插入三种 shell 的直接 workloop 调用 | 未验证 | 改用内部 `host-invoke` wrapper | Bash/PowerShell/CMD 实际执行探针 |
| A3 | tokenizer 能保留足够的引用和转义信息来区分 `$null` sink 与字面文件名 | 高置信、未实现 | 需要扩大 token IR，而非字符串特判 | 引用/转义对抗矩阵 |
| A4 | 用户更换 shell 的频率低于每次命令执行频率 | 未量化 | recipe 方言容易过期 | 安装诊断与真实 shell canary |
| A5 | 当前测试失败来自进行中的工作树而非目标架构 | 未验证 | 必须先修复基线再实施 | 干净 worktree 全量测试 |

## 目标架构

```text
Hook payload
    │
    ▼
Host adapter
    ├─ profile
    ├─ shell dialect
    ├─ dialect provenance
    └─ canonical invocation
             │
             ▼
Shell semantic frontend
    ├─ POSIX
    ├─ PowerShell
    ├─ CMD
    └─ portable/unknown
             │
             ▼
Canonical effect model
    ├─ operations
    ├─ write targets
    ├─ redirections
    ├─ uncertainty
    └─ command shapes
             │
             ▼
Existing workloop policy
    ├─ control-state protection
    ├─ envelope intersection
    ├─ foreign-session gate
    ├─ authority/grants
    └─ evidence
```

平台无关的含义是相同意图得到相同策略结论，而不是让一套字符串规则假装所有 shell 的语法相同。

## 详细设计

### 1. Shell Execution Contract

在 canonical Hook invocation 中增加：

```js
shell: {
  dialect: "posix" | "powershell" | "cmd" | "portable",
  source: "recipe" | "trusted_tool_field" | "fallback"
}
```

解析优先级：

1. 安装或 recipe 生成时写入的方言；
2. 由 profile 明确声明可信的 payload 字段；
3. `portable`，不得静默猜测。

用户不需要在日常命令中传方言。生成的内部 handler 可以携带：

```text
workloop hook --profile codex-safe --mode nudge --shell-dialect powershell
```

主要修改范围：

- `lib/host-hooks.mjs`：canonical invocation 和 recipe。
- `lib/application.mjs`：CLI 参数解析、dispatch 和调用链传递。
- `tests/host-hooks.test.mjs`、`tests/windows.test.mjs`：contract 和真实 shell 执行。

### 2. 方言化重定向语义

扩展当前 redirection token：

```js
{
  operator,
  fd,
  rawTarget,
  decodedTarget,
  quoteMode,
  escaped,
  descriptorTarget
}
```

新增统一分类：

```js
classifyRedirection(redirection, dialect)
// file | descriptor | discard | dynamic
```

规则必须精确：

- POSIX：只有精确 `/dev/null` 是 discard。
- PowerShell：只有语法上可证明的未引用 `$null` 是 discard。
- CMD：只有精确 `NUL`/`NUL:` 是 discard。
- `2>&1` 等为 descriptor。
- 引用、转义、变量组合、命令替换和 glob 无法证明时为 dynamic。
- foreign session 对 dynamic write 继续 fail closed。

删除全局 `startsWith("/dev/")` 和全局 `NUL` 特判。

主要修改范围：

- `lib/supervision.mjs`：token IR、redirection 分类和 canonical analysis。
- `tests/command-safety-adversarial.test.mjs`：跨方言敌意矩阵。
- `tests/foreign-session-scope.test.mjs`：foreign-session 判定。

### 3. Canonical Effect Model

保留当前 `callAnalysis` 方向，但规定所有消费者只读取同一份结果：

```js
{
  resolution: "resolved" | "ambiguous",
  dialect,
  local: {
    write: boolean,
    targets: []
  },
  redirections: [],
  git: {},
  network: {},
  effects: []
}
```

`foreignWriteDecision`、owner gate、risk floor、control-state 检查和 evidence projection 不得重新解析原始命令。

`application.mjs` 中的 workloop invocation、身份赋值和续行判断应改为消费 supervision 产出的结构化分析，消除第二套方言正则。

### 4. Shell-neutral Session Binding

新生成的 updated command 不再使用：

```text
export WORKLOOP_SESSION_ID=...
$env:WORKLOOP_SESSION_ID=...
```

改用 host 管理的内部 CLI 参数，例如：

```text
workloop status --hook-session-id=<safe-id> --hook-acting-session-id=<safe-id>
```

约束：

- ID 继续使用现有安全字符限制。
- 用户原命令自行携带 acting session 必须拒绝。
- owner session 冲突必须拒绝。
- 环境变量输入保留一个迁移周期，但不再作为新 rewrite 输出。
- 无法安全识别直接 workloop 调用时，不允许以 `cli` 身份静默执行。

如果 CLI 参数无法在三种 shell 中安全插入，则改用内部 `host-invoke` wrapper；不得退回环境变量拼接。

### 5. Unknown 方言

普通命令：

- 所有候选方言都判断为只读：允许。
- 任一候选认为可能写入：标为 ambiguous。
- foreign session 下 ambiguous write：拒绝并解释缺少 shell contract。

workloop 控制命令：

- unknown 方言下禁止身份 rewrite。
- 不允许降级为 `"cli"` owner。
- 提示重新生成带执行环境契约的 Hook recipe。

## 方案比较

| 机制 | 成本 | 优点 | 失败模式 | 结论 |
|---|---:|---|---|---|
| 保持现状 | 近零 | 无开发成本 | 正常命令继续被拦，身份注入继续失效 | 淘汰 |
| 使用现有规避：绝对路径、`--no-messages`、避免变量 | 低 | 可立即降低摩擦 | 依赖 agent 纪律，不能修复 `export` | 应急措施 |
| 只特判 `$null`，Windows 一律 `$env:` | 0.5–1 日 | 快速修当前案例 | Git Bash/混合 shell 继续错误，增加特判债务 | 最近替代 |
| 所有命令按多方言并行解析，任何歧义都拒绝 | 1–2 日 | 安全保守 | 大量正常 PowerShell 命令仍被拦，身份 rewrite 无解 | 淘汰 |
| OS 级文件系统拦截或完整 shell AST | 10+ 日 | 理论覆盖强 | 跨平台维护成本过高，偏离 dependency-free CLI | 过度建设 |
| 显式执行环境契约 + canonical effects + CLI 身份协议 | 5.75–8 日 | 平台无关、安全、可测试、可迁移 | recipe 可能过期 | 赢家 |

## 实施切片

1. `test: characterize cross-shell false positives and identity rewrite`
2. `refactor: carry shell execution context through hook invocation`
3. `refactor: project dialect-specific redirections into canonical effects`
4. `refactor: consume one command analysis across supervision paths`
5. `feat: bind hook identity through workloop CLI arguments`
6. `feat: generate and diagnose shell-aware hook recipes`
7. `test: prove semantic parity on Windows and POSIX`
8. `docs: document migration and unsupported-shell fallback`

每个切片应独立通过相关测试。parser、任务生命周期和事件 schema 不得在同一切片中同时改变。

## 测试矩阵

### Redirection 语义

| 方言 | 输入 | 期望 |
|---|---|---|
| PowerShell | `2>$null` | discard，无 write target |
| PowerShell | `2>'$null'` | literal/dynamic，不得视为 discard |
| PowerShell | ``2>`$null`` | literal/dynamic，不得视为 discard |
| POSIX | `2>/dev/null` | discard |
| POSIX | `2>/dev/shm/file` | file write |
| POSIX | `2>NUL` | relative file write |
| CMD | `2>NUL` | discard |
| 任意 | `2>&1` | descriptor |
| 任意 | 动态变量路径 | dynamic；foreign 下 deny |

### Host 与方言错配

| 场景 | 期望 |
|---|---|
| payload 工具名为 `Bash`，recipe 声明 PowerShell | 使用 PowerShell 语义 |
| payload 工具名为 `PowerShell`，recipe 声明 POSIX | 使用 recipe，并产生可诊断的错配信号 |
| recipe 无方言且 payload 不可信 | portable；不执行身份 rewrite |
| 非 shell 工具携带 `command` 字段 | 不进入 shell 身份解析 |

### Session Binding

- Bash、PowerShell、CMD 执行相同内部 CLI identity 参数。
- owner、agent 和冲突身份保持现有安全约束。
- 复合或无法安全定位的 workloop 调用不得降级为 `cli`。
- 环境变量旧形式在兼容期只读可用，新输出不再生成。

## 迁移与发布顺序

1. 先发布能识别新旧 recipe 的 runtime。
2. 旧 recipe 遇到无法安全绑定的控制命令时给出明确、可操作的拒绝。
3. `hooks` 生成器加入 shell contract。
4. installer 只读检测旧 recipe，输出准确迁移命令，不自动编辑用户配置。
5. 用户人工更新 Codex/Claude Hook 配置并重新 trust。
6. 运行真实 shell canary，确认方言和 session 绑定。
7. 新 recipe 稳定后进入环境变量兼容期。
8. 后续版本再决定是否停止读取旧环境变量。

顺序不可反转：旧 runtime 不应先接收无法识别的新 handler 参数；新 runtime 与旧 recipe 的短暂组合必须安全、可诊断。

## 回滚

- 不涉及 task/event schema，runtime 回滚无需迁移状态。
- 配置回滚与 runtime 回滚分开执行；用户配置仍由用户所有。
- 若 canonical analysis 回归，恢复旧 runtime，但保留已确认安全的 Hook profile 和 Stop 配置。
- 若 CLI identity 参数失败，回滚该切片并启用内部 wrapper 方案，不恢复新生成的 `export`/`$env:`。
- 若真实 host 方言无法稳定绑定，退回 portable 分析并禁止无绑定控制命令，而不是猜测。

## 权限与安全边界

- 本文只授权计划存档，不授权代码修改、Hook 配置修改或安装。
- 实施前应关闭当前 active task，或由用户明确授权建立独立 worktree。
- 修改用户 `~/.codex/hooks.json`、Claude 配置、重新 trust Hook 和真实 live probe 均需单独授权。
- 不修改历史 session transcript、event store 或 outcome ledger。

## 范围与成本

| 范围 | 组件 | 工作量 | 风险 | 价值 |
|---|---|---:|---|---|
| Core | Shell execution contract | 0.75–1 日 | 旧 recipe 兼容 | 终止运行时猜方言 |
| Core | 方言化 redirection IR | 1.5–2 日 | 引用/转义误判 | 同时修复假阳性和潜在假阴性 |
| Core | 单一 canonical effect consumer | 0.75–1 日 | 现有判定漂移 | 消除重复解析 |
| Core | shell-neutral session binding | 1–1.5 日 | CLI 插入边界 | 消除 `export`/`$env:` 分支 |
| Supporting | 对抗与语义一致性测试 | 1–1.5 日 | 模拟 payload 不代表真实 host | 锁定安全边界 |
| Supporting | installer、迁移和 live probes | 0.75–1 日 | 用户配置归属 | 证明真实可用与可回滚 |
| **总计（Core + Supporting）** | | **5.75–8 日** | | |
| Optional | 完整 shell AST、OS 级拦截、通用 adapter registry | 10+ 日 | 高 | 当前边际价值不足，不实施 |

持续成本：每新增一种 shell，需要约 0.5–1 日完成语义适配和一致性测试；平台无关监督内核不增加条件分支。

## 最佳性检查

- **适配条件**：用户零感知的平台无关体验、安全不退化、一个语义来源、可测试、可迁移回滚、保持 dependency-free。
- **赢家**：显式执行环境契约 + 方言化命令语义 + canonical effect model + workloop CLI 身份协议。
- **最近替代**：特判 `$null` 并在 Windows 使用 `$env:`。
- **击败条件**：如果产品永久只支持 PowerShell，且 host 工具名被外部契约保证准确，最近替代以更低成本胜出；当前现场不满足。
- **边际停止点**：完成 POSIX、PowerShell、CMD、unknown、迁移诊断和真实 host probe 后停止；不实现完整 shell、自动 host 猜测、通用插件注册表或 OS 级拦截。

## 反转测试

本方案在运行时方言配置经常过期时可能成为最差方案：错误的显式契约比保守未知更危险。

控制措施：

- recipe 记录方言来源；
- 安装后执行真实 shell canary；
- 明显不一致时拒绝写操作和身份 rewrite；
- shell 配置变化后重新生成 recipe；
- 不从 `$null`、盘符或路径分隔符等表面特征自动猜方言。

如果未来 host payload 提供权威、稳定的实际 shell 字段，它将取代安装期绑定；canonical model 和监督内核无需改变。
