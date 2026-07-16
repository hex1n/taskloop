# 13 — 采用观测入账本：untracked 从瞬态 nudge 到事件流

Type: grilling
Status: resolved
Blocked by: 09

## Question

[票 09 决议 1](09-meta-loop-v2-into-kernel.md) 移交的后半：内核 meta-loop 定为**账本读者**，但**账本有幸存者偏差——它只见开了单的活**。没开单的活，账本里没有行。而 09 拒绝了「借 host 语料来看采用」（语料 schema owner 是 host，按 cohabitation 论据自己的逻辑不该进内核），代之以：**让 meta-loop 的采用输入也归本仓库 schema**。

**已核实的证据**：`~/.taskloop/untracked-writes.json` 现躺着 07-10 的一条记录（一个 session、一个文件路径、一个 ts）。它是 **session 级瞬态 nudge 状态**，`clearUntracked` 会清它，**不进 `events-v3.jsonl`、不进 `outcomes-v3.jsonl`**（两模块 grep 零命中；AGENTS.md:11 明写 untracked telemetry 与 outcome projection 同为 degrade-open）。

**病灶一句话**：**runtime 天天在观测「没开单就动手」——然后把观测扔了。** 与 06「`task-engine.mjs:485/489` 手上有 `output_tail` 却扔了」、07「声明只能作用于声明，不能作用于观测」同形，是同一条根原理的第三次开火。

裁决项：

1. **记什么**：采用/非采用的哪些事实值得进事件流？（untracked 写入的发生、被 nudge 还是被 deny、随后是否补开了单、补单前写了多少文件……）注意**分寸**：untracked 记录里带着**文件路径**（现存样本就带 `desktop/asdf/docs/plans/...` 这样的源项目路径），而事件流会被投影进跨仓的全局账本——**记多了就是把每个仓的工作痕迹汇总到一处**。
2. **记成什么**：新事件 kind？还是挂在既有 `task_opened` 的 payload 上（「本单开出来之前，这个 session 已经动了 N 个文件」）？后者更省，但**只有补开了单的 untracked 才会被记——没补单的（真正的非采用）永远不入账，幸存者偏差原样复现**。这是本票的核心张力。
3. **和 gate 的关系**：nudge/deny 是**闸门**，记账是**观测**。两者能否解耦——即，记账是否应当在 deny 被 owner 移除 hook 绕过时**仍然发生**？（2026-07-15 现场：本图 03 session 在 `.scratch/` 改地图被 untracked gate deny，owner 当场移除 hook 才得以收尾——**那次绕过恰恰是最该被记下的一次非采用**。）
4. **degrade-open 的分寸**：投影 degrade-open 已经让账本可静默残缺（[09 决议 9](09-meta-loop-v2-into-kernel.md) 因此要求 `ledger --json` 自带完整性判定）。采用观测若也 degrade-open，**「没有 untracked 行」将无法区分「真的没发生」与「记丢了」**——而这恰是采用指标最致命的歧义。要不要抬成 fail-loudly？

**落点**：runtime（`lib/untracked.mjs`、事件流 schema、投影）。

**与雾区的关系**：雾区「无机器判据的仓内工作（规划/裁决/文书）怎么接进 taskloop」与本票是**同一处机制的两面**——gate 观测 untracked 写入，一面拒绝它们，另一面本该记下它们。但两者是不同的问题：那条雾问的是**这类活怎么才有合法形态**（判据不存在），本票问的是**非采用怎么被记账**。本票不解决那条雾，但会给它**装上传感器**——雾里那条「等 05 的纪律真正跑起来后再 graduate（届时会有更多同类样本）」所说的样本，正是本票要记的东西。

上下文：[meta-loop v2 入仓 spec 决策记录](../../../docs/decisions/2026-07-15-meta-loop-v2-kernel-spec.md)决议 1

## Answer

2026-07-16 owner 逐项确认，五条决议，详见[采用观测入账本决策记录](../../../docs/decisions/2026-07-16-adoption-observation-into-ledger.md)。gist：

1. **消费者问题 = 物种学**（B 为主）：给雾区「无机器判据的仓内工作」供有形状的样本；采用率只作副产品、不承诺精度（分母结构上测不准，有洞的分母算率是假精度）。
2. **记什么**：`{acting_session, at, targets_parsed, gate, foreign, during_task}`；disposition 归 fold 读时 join、累计计数可导出——都不记。`targets_parsed` 如实标注为解析猜测（毒药剪枝的存在就是它会错的证据）。隐私治在投影层：路径 repo-local、跨仓投影只聚合。
3. **记成什么 = 独立证据书**：非采用观测是证据记录不是状态溯源事件——不进 `events-v3.jsonl`（task_id 框架一字不动），住 `.taskloop/` 独立追加流 + per-session 序号（两种丢失都朝诚实方向退化）。「一本账」是 `ledger --json` fold 的输出，不是一个文件。挂 `task_opened` 的选项正式处决（幸存者偏差原样复现）。
4. **与 gate 的关系 = 模式梯**：hook 三档 `{observe, nudge, deny}`，**全档位写证据书**。07-15 卸载是 deny 档的病不是传感器的病——**传感器不等雾区，装回停 nudge 档**（owner 裁）；deny 档才等。卸载不可自观测按 16 决议 3 有声化：动词过渡记录 + 读时查当前状态 + 覆盖外 unknown 计价。S3′（owner 降档/卸载）经动词走时自身成为证据书一行。
5. **degrade 分寸**：写侧铁律保留（仪器代价高过被观测物就会被拆——S3′ 教训一般化），fail-loudly 住读侧（fold 报覆盖判定 covered/gapped/unknown；Stop census 补强「零行」的见证）。

**核实出的票面外事实**：毒药剪枝（`untracked.mjs:58-59`）让被 deny 的目标在下次观测被剪掉——今天的状态文件结构上装不下「被拒绝」这个最重要的物种。执行项五件寄存 #04，其中模式梯**同时解锁票 12 `agent_id` 注入的 PreToolUse 依赖**。
