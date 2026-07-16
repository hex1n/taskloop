# 工作流接入与判据交接（维度 1：目标与判据）

> 日期：2026-07-15
> 状态：决策记录；owner 已逐项确认（wayfinder ticket 05 的 grilling 裁决）
> 来源 ticket：[05 — 工作流接入与判据交接](../../.scratch/loop-engineering-best-practice/issues/05-workflow-adoption-criterion-handoff.md)
> 上游框架：[Loop Engineering 维度框架](2026-07-15-loop-engineering-dimension-framework.md)（本记录**更正**其证据盘点，见末节）

## 裁决问题

owner 的两条真实工作流——① 需求→人参与分析计划→agent 实施验证；② 描述问题→agent 排查给方案→修复——怎么接进 taskloop。机制不动，落点在 skill 文本、上游 planning skills 与使用配方。

## 四条决议

### 决议 1：动手前开单为纪律；收尾清单是降级形态

task 必须在第一笔 write 之前 open。「干完活再 open→close 做收尾核验」不禁止，但**不算标准接入**，是降级形态。

**落点**：skills 文本 / 使用配方。**机制不动**——runtime 侧已有牙齿：`lib/untracked.mjs:94-101` 对无 task 的写入，单文件给 notice，第二个仓内文件起 `deny`（"The lightweight default covers a single-file tweak; wider work opens a task first"）。纪律要补的是机制拦不到的那半边：第 1 个文件写下去才 notice，且纪律要求的是「动手前」而非「第 2 个文件前」。

**新证据支持**（本票新读到的 v2 账本，见末节）：业务仓 6 个终态任务里有 writes=18、writes=21 的任务而 rounds 仍为 0。大量写入 + 零打回与「切片好、单文件小改、一遍过」的良性解释不相容，恶性解释（判据事后补、掐点开单）的嫌疑上升。这条纪律对症。

### 决议 2：计划必须自带可执行验收判据

工作流 ① 的每个可交接工作项须附：done-when + 可执行检查（写不出就明确标 `deferred_witness`）+ envelope 提示。

**落点是仓外**——这是本决议最重要的边界结论：

- **taskloop 仓内无需改动**。`skills/workloop/SKILL.md:14-29`（§1 Source the criterion）已经写全了兜底：无判据随工作到达时向请求者 interview、provenance→policy 映射、"Never invent a check to make the gate pass"。
- 真正要动的是 **owner 的用户级 planning skills 的产出约定**（`~/.claude/skills/` 下，不在本仓）。`AGENTS.md:22` 明令内核 skill 文本不得点名任何外部 skill 或工具，所以这条约定**不能**写进 workloop——写进去就违反可移植性契约。

因此：仓内落点为空，执行项落在仓外 planning skills，进路线图 #04 时须标注「仓外执行项」。

### 决议 3：修复前红检查先行（默认纪律 + 逃生舱）

工作流 ② 的排查产出 = 可复跑红检查 + 方案；修复以 `deferred_witness` 开单。

**逃生舱**：复现不经济（环境相关、偶发）时可降级为较弱判据，但须在 `not-covered` 如实记录降级理由。**不允许无判据修复**。

**落点**：skills 文本 / 使用配方。机制与词汇已在——`skills/workloop/SKILL.md:26-29` 已有 "recovering the failure first — writing the failing check before the fix — opens `deferred-witness`"。缺的只是「排查类工作默认走这条」的纪律声明，不是机制。

### 决议 4：meta-loop 触发线最小重接为月度提醒（已执行）

**本票唯一的 do，其余全部 plan。**

查得的实况：Windows 计划任务 `asdf-meta-loop` 存在，月度（每月 1 日 09:00），但

- 动作指向 `C:\Users\hexin\Desktop\asdf\scripts\analyze-sessions.py`——**该脚本已不存在**（asdf 仓 commit `ef9141b` "feat(skills): add plan review and retire legacy workflows" 删除）；
- `Last Result: 267011` = `0x00041303` `SCHED_S_TASK_HAS_NOT_RUN`——**从未跑过一次**。任务是月度 1 日触发，创建于本月 1 日之后，所以从未获得触发机会。

即：不是「断了」，是**装上去就没通过电，且目标在通电前已经被删**。

**已执行的重接**：动作改为自足的 PowerShell 提醒——写 `~/.taskloop/meta-loop-due.txt` 标记 + `msg *` 弹窗，人收到后手动跑 `/meta-loop`。不依赖任何 asdf 路径，不拉起无人值守会话（越档位的正式触发器设计归票 09）。

**验证**：手动 test-fire → `LastTaskResult: 0`，标记文件正确生成，`NextRunTime: 2026-08-01 09:00`。测试标记文件已清理。

## 证据修正：框架的账本盘点是错的

本票查证落点时读到 `~/.taskloop/` 实况，发现[维度框架](2026-07-15-loop-engineering-dimension-framework.md)「账本证据」节的盘点存在事实错误。**记录在此，不单方面重裁受影响的门禁——那是 owner 的决定。**

### 错在哪

框架称：「本机尚无该文件——v3 投影还没在本机产出，legacy 文件是现存唯一语料」，证据基准「46 行（2026-07-07 ～ 07-10，21 个终态任务），采用自 07-10 断流」。

实况：`~/.taskloop/` 下有**三代账本**，框架只读到第一代。

| 文件 | 形态 | 行数 | 跨度 | 状态 |
|---|---|---|---|---|
| `outcomes.jsonl` | 扁平投影（一行一关单） | 46 | 07-07 04:18 → 07-10 09:22 | legacy，框架的唯一语料 |
| `outcomes-v2.jsonl` | **事件记录**（`event_schema_version: 2`） | 53 | **07-13 10:27 → 07-14 11:23** | **框架漏读**；当前安装契约在写 |
| `outcomes-v3.jsonl` | 投影（契约 4） | — | — | 不存在；契约 4 仍在未合分支 |

### 「07-10 断流」的真实成因

不是采用中断，是**账本换了文件名**。v2 账本的第一个任务（07-13 10:27）的 goal 就是「删除本机旧 taskloop 安装并以当前仓库版本重新安装」——这次重装把记录从 `outcomes.jsonl` 切到了 `outcomes-v2.jsonl`。框架按文件名读 legacy，读到最后一行是 07-10，就把**一次 schema 迁移误读成了采用崩塌**。

这个错误本身是票 09 的活证据，且比框架给的版本强得多：用户级 meta-loop v1 skill 硬编码读 `~/.taskloop/outcomes.jsonl`（`SKILL.md:24`），它今天跑起来会报告「采用自 07-10 归零」——**框架犯的错，正是 meta-loop 会犯的错**。结论：消费者必须按 schema 发现账本，不能按文件名硬编码；每次 contract 提升改账本文件名，都会让按名读的消费者静默失明。此项进 #04。

### v2 账本读数（10 个终态任务，3 个仓库）

仓库分布：真实业务仓 6 个、taskloop 自身 3 个、skills 同步 1 个。**「采用自 07-10 断流」和「05 是数据发生器、接入落地后账本才恢复积累」的前提均不成立——采用从未断流，真实业务工作一直在用。**

业务仓（6 个终态任务，07-13 → 07-14）：

| 时间 | 终态 | rounds | writes | review_level |
|---|---|---|---|---|
| 07-13 11:24 | achieved | 0 | 2 | fresh_context |
| 07-13 13:53 | abandoned | 0 | 18 | — |
| 07-13 14:55 | abandoned | 0 | 1 | — |
| 07-13 15:49 | achieved | 0 | 21 | fresh_context |
| 07-13 16:18 | achieved | 0 | 6 | fresh_context |
| 07-14 09:44 | achieved | **4** | 9 | fresh_context |

对框架三条判断的影响：

1. **「循环几乎从不循环」——仍然成立**，且这是 05 四条决议的证据基础，未被动摇：10 个终态任务 9 个 rounds=0。
2. **「关单前独立评审纪律实际为零」（19 none / 21）——在新窗口被证否**。业务仓 4 个 achieved **全部**带 `fresh_context` 评审（4/4）；全量 10 个里另有 1 个 `second_model`。这条是票 07 立论的一半，需要 owner 重裁。
3. **新信号，legacy 账本无此字段**：10 个终态任务的 `assurance.proof.state` 为 **8 个 `provisional` + 2 个 `gap`，0 个干净**；`proof_gap_accepted` 事件 9 次，抽样 `granted_by: "self"`。即：评审做了，但证明缺口是自己批的。这**加强**票 07 的另一面（信任链盲区），只是把盲区从「没人评审」挪到了「缺口自批」。

另：唯一 rounds=4 的任务（业务仓，07-13 18:04 → 07-14 09:44）是正面样本——跨 2 天、3 次 suspend/resume、3 次 amend、1 次 proof-gap 接受、1 次 fresh_context 评审后关单。跨会话恢复 + 真正多轮在真实业务工作里发生过。

### 对既有 tickets 的影响（如实标注，不代裁）

- **票 06 / 票 07 / #03** 的 `Blocked by: 05` 门禁前提是「等 05 落地后账本恢复积累」。该前提不成立——数据已经在了（v2 账本，含 6 个真实业务任务）。三票开工时须先重裁门禁：是直接用 v2 数据裁，还是仍要求 v3 契约落地后的新数据。**owner 决定。**
- **票 07** 的立论一半（19/21 review_level=none）被证否，另一半（判据溯源按路径不按作者，`lib/criterion.mjs:178-182`）是代码事实，不受影响；新的 proof-gap 自批信号是更强的替代立论。
- **框架决策记录**已过 5 轮 Codex 证伪到 GO，本更正是事实盘点层的，未推翻其任何维度判决（11 维出票结论全部不变）。是否需要就更正后的证据重跑 /plan-review，owner 决定。

## 迁移面 / 执行项（进 #04，本图 plan-not-do）

1. `skills/workloop/SKILL.md`：补「动手前开单」纪律声明（决议 1）与「排查类工作默认 deferred_witness 红检查先行 + 逃生舱」纪律声明（决议 3）。仓内，须保持 host-neutral 与不点名外部 skill。
2. **仓外**：owner 用户级 planning skills 的产出约定补「计划自带 done-when + 可执行检查 + envelope」（决议 2）。不进 taskloop 仓。
3. **账本消费者按 schema 发现、不按文件名硬编码**（证据修正节的结论）；与票 09 的 de-asdf 迁移合并考虑。
4. **hook 配方迁移风险**（本票查证时发现，非本票裁决）：owner 的 `~/.claude/settings.json` 用无参数调用 `node ~/bin/taskloop.mjs`。当前安装的是契约 3 运行时（release `9a078b03abba`），无参数调用走它的正常处理器，Stop 仍然 `{"decision":"block"}`——**stop gate 现在是带牙的，没有失效**。但 `hook --profile` 契约在未合分支 `agent/schema-v3-event-sourcing`（commit `16906a0`）上：该分支一旦发布并重装，无参数调用将被判定为 profile `unknown`，Stop hold 降级为**静默安全释放**（`lib/host-hooks.mjs:60-62`，仅 stderr 提示，PreToolUse 保护保留）。安装流程不改写宿主 settings.json，所以这会在重装那一刻静默解除 stop gate 的牙齿，直到 owner 用 `hook --profile claude` 重新生成 hook 配方。发布前须处理。

## 本记录不判定

- 票 06 / 07 / #03 的证据门禁是否因 v2 账本而解除（owner 决定，三票开工时首问）。
- meta-loop 正式触发器形态（票 09）；本票只把月度提醒接回来。
- 上述执行项的排序（#04）。
