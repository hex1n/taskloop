# 05 — 工作流接入与判据交接

Type: grilling
Status: resolved
Blocked by: 02

## Question

维度 1（目标与判据）的裁决 + 全图数据发生器：owner 的两条真实工作流（① 需求→人参与分析计划→agent 实施验证；② 描述问题→agent 排查给方案→修复）怎么接进 taskloop？

1. **计划→判据交接**（工作流 ①）：要不要约定「计划必须自带可执行验收判据」？落点在上游 planning skills 与 workloop 的接缝。
2. **问题→红检查先行**（工作流 ②）：要不要约定「修复前先把问题固化成可复跑的红检查」？落点在使用配方/skill 文本。
3. **open 时机纪律**：task 应在动手前开（让循环真的循环起来），还是接受「收尾清单」用法为合法形态并如实定位？背景：账本 21 个终态任务中 19 个 rounds=0，良性（切片好一遍过）与恶性（掐点开单、判据事后补）解释 owner 未表态，本票裁决。
4. **meta-loop 触发重接**（task 项）：验证 `asdf-meta-loop` 定时接线是否存活，断则重接（meta-loop v2 的 spec 归票 09，本票只管把触发线接回来）。

机制不动。本票同时是数据发生器：接入落地后账本才恢复积累，票 06/07 与 #03 的门禁证据都等它。

上下文：[维度框架决策记录](../../../docs/decisions/2026-07-15-loop-engineering-dimension-framework.md)

## Answer

owner 逐项确认，四条决议全部落定；详见[工作流接入与判据交接决策记录](../../../docs/decisions/2026-07-15-workflow-adoption-criterion-handoff.md)。

1. **open 时机**：动手前开单为纪律，收尾清单降级为非标准形态。机制不动（runtime 已有 untracked gate：单文件 notice、≥2 仓内文件 deny）。
2. **计划→判据交接**：计划必须自带 done-when + 可执行检查 + envelope。**仓内落点为空**——workloop §1 兜底 interview 已写全，且 `AGENTS.md:22` 禁止内核 skill 点名外部 skill；真正的执行项落在 owner 用户级 planning skills（仓外）。
3. **红检查先行**：排查产出 = 可复跑红检查 + 方案，修复走 `deferred_witness`；逃生舱为复现不经济时降级判据但 `not-covered` 如实记录，不允许无判据修复。
4. **meta-loop 触发（task 项，已执行）**：`asdf-meta-loop` 计划任务查得从未跑过（`0x00041303`）且目标脚本已被 asdf 仓 `ef9141b` 删除。已重接为自足的月度提醒（写 `~/.taskloop/meta-loop-due.txt` + 弹窗，人工跑 `/meta-loop`），test-fire 通过（result 0，next run 2026-08-01）。正式触发器形态归票 09。

**额外产出——证据修正（本票的重要副产品）**：查证落点时发现框架「账本证据」节盘点错误。`~/.taskloop/outcomes-v2.jsonl`（53 事件、10 个终态任务、07-13→07-14、含 **6 个真实业务仓任务**）被漏读。「采用自 07-10 断流」实为 **07-13 重装把账本换了文件名**，框架把 schema 迁移误读成采用崩塌——而这正是硬编码读 `outcomes.jsonl` 的 meta-loop v1 会犯的同一个错（票 09 的活证据）。影响：**本票四条决议不受动摇**（rounds=0 在 9/10 任务上仍成立）；但「评审纪律为零」被证否（业务仓 4/4 achieved 均带 fresh_context），票 06/07/#03「等 05 产数据」的门禁前提不成立——数据已在。三票开工时须先重裁门禁，**owner 决定**。
