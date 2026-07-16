# 02 — 第一性推导 loop engineering 维度框架

Type: grilling
Status: resolved
Blocked by: 01

## Question

从第一性原理出发（不以旧研究矩阵为骨架），loop engineering 到底由哪些维度构成？对每个维度：裁决问题是什么、taskloop 当前处在哪、是否存在真实差距、该差距是否值得关（价值门禁）。#01 的证据集只用作反例校验，不作推导起点。

产出：维度框架决策记录（`docs/decisions/`），并把每个维度 graduate 成后续决策 ticket（同时增补 #04 的 Blocked by）。

收口：关单前必须过 /plan-review 独立证伪——它是所有下游裁决的地基。

## Answer

**两层框架锁定**：学科层 11 维（对 taskloop 失明推导，推导链/完备性/独立性检验在案）+ taskloop 覆盖层（拥有/共担/让渡）。全文见 [维度框架决策记录](../../../docs/decisions/2026-07-15-loop-engineering-dimension-framework.md)（最终修订 `97C6DCCCE64684FE`，经 5 轮 Codex 独立证伪至 GO，[评审台账](../reviews/2026-07-15-framework-plan-review.md)）。

要点：

- **价值门禁基准**：owner 单人日常真实工作；便宜接入项凭推理放行，重建设项要求恢复采用后的新账本数据——路线图排序原则自动确定：接入优先、建设殿后。
- **账本证据**（legacy 语料 21 终态）：19/21 rounds=0（循环几乎不循环）、19/21 review none、drift 真实开火 2 次——最大差距是横切的采用缺口，不在任一单维机制里。
- **判决**：5 维当场关闭（行动面、状态与恢复、context、并发+边界写死、人的位置）；维度 5 拆半（停止/预算关闭，驱动归 #03）；5 维出新票——[05 工作流接入与判据交接](05-workflow-adoption-criterion-handoff.md)（frontier、数据发生器）、[06 反馈质量](06-feedback-quality-criterion-as-teacher.md)（blocked by 05）、[07 信任链盲区](07-trust-chain-authorship-review.md)（blocked by 05）、[08 过夜无人值守配方](08-overnight-unattended-recipe.md)（frontier）、[09 meta-loop v2 入仓](09-meta-loop-v2-into-kernel.md)（frontier）。
- **接线变更**：[03](03-supervisor-charter-adjudication.md) 增补 Blocked by 05 + Gate 0 证据门禁（A1 需采用后数据）；[04](04-roadmap-assembly.md) Blocked by 扩为全部决策票。
- **charter 修正案**（owner 确认）：内核 3→4 skills（+meta-loop，schema 共居于 `outcomes-v3.jsonl` 契约），迁移面五条清单在决策记录。

## Comments

- 2026-07-15 工作 session：owner 逐项确认全部判决。两次方法论翻盘均由 owner 质疑触发：①根问题表述去 charter 化（第一版实为 taskloop 使命宣言转写）；②框架改两层（学科层失明推导），新增维度 2/3 恰好接住旧骨架无家可归的证据。
- plan-review 5 轮：sweep NO-GO(5) → complete NO-GO(2) → NO-GO(3) → CONDITIONAL-GO(1) → **GO(0)**；11 项发现全部 fix 闭合。关单。
