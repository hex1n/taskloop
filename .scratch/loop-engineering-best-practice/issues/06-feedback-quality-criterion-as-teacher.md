# 06 — 反馈质量：判据作为老师

Type: grilling
Status: resolved
Blocked by: 05

## Question

维度 3（反馈与收敛）的裁决：接入（票 05）落地、账本积累起 rounds>0 的 episodes 后，从账本与实际会话看，打回反馈是否驱动了收敛？

现状机制：判据执行捕获输出尾部 4096 字符（`lib/criterion.mjs:109`），Stop hold 消息注入 300 字符（`lib/application.mjs:643`），160 字符摘要 + 全尾部指纹驱动 stuck 检测；ADAPTERS.md 已要求「output tail 必须点名失败项」；agent 有非记账 `verify` 动词可重跑看全量。

裁决项：若收敛不好，调什么——回注截断参数 / skill 判据编写指引（「判据要会说话」）/ 都不动？落点声明必填。

**门禁前提已变（票 05 更正，2026-07-15，开工首问）**：本票原设「等 05 落地后账本积累起 rounds>0」。该前提不成立——采用从未断流，框架漏读了 `~/.taskloop/outcomes-v2.jsonl`（10 个终态任务、含 6 个真实业务仓任务，07-13→07-14）。但**本票要的 rounds>0 样本仍然稀缺**：10 个里 9 个 rounds=0，唯一 rounds=4 的是业务仓「FIELD_OPTION 战队保号」任务（07-13 18:04→07-14 09:44，3 次 suspend/resume + 3 次 amend + fresh_context 评审后 achieved）——n=1。开工首问：拿这 1 个样本 + 其会话记录裁，还是仍要求更多 rounds>0 数据后再裁。**owner 决定**。详见[工作流接入与判据交接决策记录](../../../docs/decisions/2026-07-15-workflow-adoption-criterion-handoff.md)证据修正节。

上下文：[维度框架决策记录](../../../docs/decisions/2026-07-15-loop-engineering-dimension-framework.md)

## Answer

owner 确认，四条裁决落定；详见[反馈质量决策记录](../../../docs/decisions/2026-07-15-feedback-quality-criterion-as-teacher.md)。

**门禁重裁**：用那个 n=1 样本裁，但**重写问题**——不是「样本够」，是「样本不是那件事」。该样本 4 轮打回**全在判据面**（命令行太长 / 缺 `Get-FileHash` / `Test-Path` 语法），工作面打回样本实为 **0，非 1**。

1. **票面三候选项全部证否**。截断参数不是瓶颈（正常路径 `application.mjs:643` 注 300 字符够用，本例 tail 仅 29 字符；stuck 路径压根不注 tail）；判据编写指引无的放矢（判据**已经会说话**且点名了病因，是 runtime 在 stuck 路径上不听）；「都不动」否。
2. **真裁决 = 三处接线**，落点全在仓内、均为机制改动：`task-engine.mjs:485/489`（`v3FailureSuspension` 手上就有 `observation.execution.output_tail`，却把它扔了）、`application.mjs:627`（`remaining` 停印 `criterion.source.value`）、`application.mjs:633`（stuck hold message 带上判据的话）。第一性根据：**判据的身份不是判据的话；`remaining` 要的是话，印的是身份。** 职责分工：`failure`=为何停（保持）／`remaining`=还差什么（含判据的话）／`next_action`=下一步。
3. **工作面反馈质量**：样本=0，**无证据可裁**，留 fog；graduate 条件写死为「出现至少 1 个**工作面**打回样本」而非「rounds>0」（后者已发生且正是它误导了本票一轮）。附解释：`verify` 动词吸收教学是恒定底噪，与 05 的恶性解释不互斥。
4. **stuck 归因**：判为裁决 2 的影子，06 **不动** `next_action`（账本佐证 agent 实际没被误导，它从 CLI 回显知道病因——恰恰不是从 stuck 反馈）。根因（cmd.exe 拒绝 → exit 1 → tri-state 读成 unsatisfied → `exit 2 = indeterminate` 被传输层绕过）**移交票 10**。

**维度 3 就此裁完**（当前证据下），fog 那条不阻塞 #04。按收口纪律未过 /plan-review。对照票 05「仓内落点为空」——**维度 3 落点全在仓内**，这是维度 1 与维度 3 的真实分野。
