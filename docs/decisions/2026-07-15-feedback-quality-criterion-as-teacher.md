# 反馈质量：判据作为老师（维度 3：反馈与收敛）

> 日期：2026-07-15
> 状态：决策记录；owner 已确认（wayfinder ticket 06 的 grilling 裁决）
> 来源 ticket：[06 — 反馈质量：判据作为老师](../../.scratch/loop-engineering-best-practice/issues/06-feedback-quality-criterion-as-teacher.md)
> 上游框架：[Loop Engineering 维度框架](2026-07-15-loop-engineering-dimension-framework.md)
> 门禁前提来源：[工作流接入与判据交接](2026-07-15-workflow-adoption-criterion-handoff.md)（其证据修正节推翻了本票原门禁）

## 裁决问题

维度 3 的裁决：打回反馈是否驱动了收敛？若收敛不好，调什么——回注截断参数 / skill 判据编写指引（「判据要会说话」）/ 都不动？落点声明必填。

## 门禁重裁：样本不是「少」，是「不是那件事」

本票原门禁是「等 05 落地、账本积累起 rounds>0 的 episodes」。票 05 的证据修正已推翻该前提（采用从未断流，v2 账本一直在积累），并把首问改为：**用唯一那个 rounds=4 的样本裁，还是等更多数据**。

查证结论：这个二选一本身有假前提。把业务仓样本 `1e123be8`（FIELD_OPTION 战队保号，13 个事件，07-13 18:04 → 07-14 09:44）逐事件拆开后——

| 轮 | 反馈内容 | agent 的反应 |
|---|---|---|
| seq 1 | `output_tail: "The command line is too long."` | amend：压缩 PowerShell 判据 |
| seq 5 | 精简环境缺 `Get-FileHash` | amend：改用 .NET SHA-256 |
| seq 8 | Windows `Test-Path` 参数分隔语法错 | amend：修语法 |
| seq 6 / 9 | `stuck: same failure repeated 3 times` | — |

**4 轮打回全部落在判据面，无一在工作面。** 工作面（保号逻辑本身）的收敛全程发生在会话内，从未经过一次打回反馈。

即：本票原问题「打回反馈是否驱动了收敛」在账本里的样本数是 **0，不是 1**。

**owner 裁决：用它裁，但重写问题**——转向这个样本真正证明的东西。理由不是「样本够」，而是它证明的那两条**不依赖样本量**（是代码事实）。

## 裁决 1：票面三候选项全部证否

三条路径分开看，agent 实际收到什么：

| 路径 | agent 实际看到 | 判据的话在不在 |
|---|---|---|
| **正常 hold**（每轮）`lib/application.mjs:643` | `criterion unsatisfied; closure ...; <output_tail 300 字符>` | ✅ 在，**这条路是好的** |
| **suspend(stuck)** `lib/application.mjs:633` | `criterion unsatisfied; task suspended(stuck): same failure repeated 3 times` | ❌ 一个字都没有 |
| **status**（恢复时）`lib/application.mjs:571` | `- remaining: criterion must become satisfied: <base64>`<br>`- failure: same failure repeated 3 times`<br>`- next action: change the approach or inputs, then resume` | ❌ 两坨 base64（`:561` 的 `## Criterion` 节又印一遍 `source.value`） |

因此：

- **「回注截断参数」证否**。正常路径 300 字符窗口绰绰有余——本例 `output_tail` 仅 29 个字符（`"The command line is too long."`）；stuck 路径**压根不注 tail**，调 4096/300 无效。
- **「skill 判据编写指引」证否**。判据**已经会说话**了，且说得很准（直接点名病因）。ADAPTERS.md 要求的「output tail 必须点名失败项」已被满足。病不在判据的嘴，在 **runtime 在 stuck 路径上不听**。
- **「都不动」证否**。

**stuck 时——恰恰是最需要信息的时刻——反馈面最贫瘠。**

## 裁决 1（续）：真正的裁决——三处接线

病灶精确且干净：`历史任务状态运行时:471` 的 `v3FailureSuspension(task, observation, atEpochMs)` **手上就有 `observation`**（:472 还用了 `observation.verdict`），里面带着 `execution.output_tail`。但 :485 造 failure 时：

```js
return { reason: "stuck", failure: `same failure repeated ${STUCK_REPEATS} times`, next_action: "change the approach or inputs, then resume" };
```

**判据的话就在参数里，函数把它扔了。** 且 `criterion_observed` 事件的 `failure_summary`（160 字符 tail）是**存了的**（`历史任务状态运行时:690`）——账本里有，只是没往 suspension judgment 里走。这不是「信息不存在」，是**信息在手上没接线**。

第一性根据一句话：**判据的身份（`source.value`）不是判据的话（`output_tail`）；`remaining` 要的是话，印的是身份。**

职责分工就此确定：`failure` = 为何停（元话，**保持不动**，它是对的）／`remaining` = 还差什么（含判据的话）／`next_action` = 下一步。

**落点（全在仓内，机制改动；具体措辞归执行 session）**：

1. `历史任务状态运行时:485` 与 `:489` —— `v3FailureSuspension` 把手上的 `observation.execution.output_tail` 接进 judgment。
2. `lib/application.mjs:627` —— `remaining` 停印 `criterion.source.value`，改为「判据还没绿 + 它最后说的话」。判据**身份**归 status 的 `## Criterion` 节（`:561`）负责，不归 `remaining`。
3. `lib/application.mjs:633` —— stuck hold message 带上判据的话，agent 被 block 时即刻知道病因，不必主动跑 status。

对照：票 05 最重要的边界结论是「仓内落点为空」（纪律落在仓外 planning skills）。**维度 3 恰好相反，落点全在仓内、全是机制**。这是维度 1 与维度 3 的真实分野——判据怎么来是纪律问题，失败怎么说回去是机制问题。

## 裁决 2：工作面反馈质量——无证据可裁，留 fog

账本样本 = 0（非 1）。判定「无证据可裁」，不强裁。

**graduate 条件写死为「出现至少 1 个工作面打回样本」**（agent 自评已好、判据说没好），**而非「rounds>0」**——后者已经发生过，且正是它把本票误导了一轮。

附解释（供未来 graduate 时校准）：**rounds=0 未必是病**。agent 手上有非记账的 `verify` 动词可自己重跑看全量，真正的教学发生在 verify 循环里，那是**账本外的**；Stop 打回只在「agent 自以为好了、判据说没好」时才开火。这条恒定底噪与票 05 的恶性解释（判据事后补、掐点开单）**不互斥**：05 纪律修好后，工作面打回会从「0」变成「偶尔」，但不会变成常态。

## 裁决 3：stuck 归因——判为裁决 1 的影子，根因移交票 10

`next_action: "change the approach or inputs, then resume"` 在判据坏掉时指向工作面，是错的归因。但：

**06 不动 `next_action`。** 判据的话一旦在场（裁决 1），泛泛措辞就退回成无害的泛泛。账本佐证：agent 实际**没被误导**——三次 stuck 后它都正确地 amend 了判据。它知道病因，是因为 `taskloop open`/`amend` 时判据输出直接回显到 CLI——**恰恰不是从 stuck 反馈知道的**。这反过来印证裁决 1：stuck 路径的话缺席，agent 只能靠别处补。

**根因是结构性盲区，移交票 10**：

```
cmd.exe 层拒绝执行（命令行太长，判据脚本压根没跑起来）
  → exit_code = 1
  → tri-state protocol 读成 unsatisfied（「判据跑了，说没达成」）
  → runtime 结构上分不清「判据没跑起来」与「判据说没达成」
  → tri-state 的 exit 2 = indeterminate 本为此设计，但被传输层失败绕过
    （脚本没机会返回 2）
```

这属于判据的**载体**问题，是票 10 的地盘。边界：「命令行太长」这个**病因**归 10；「病因没被说回去」归 06。同一个样本喂两票的不同面，不重叠。

## 维度 3 的收口

**维度 3 就此裁完**（当前证据下）。fog 里那条（工作面反馈质量）**不阻塞 [#04 总路线图](../../.scratch/loop-engineering-best-practice/issues/04-roadmap-assembly.md)**——否则 #04 永远等。符合 fog 不阻塞前进的纪律。

本票按地图收口纪律**不过 /plan-review**（只有 02 与 04 需要）。

## 迁移面 / 执行项（进 #04，本图 plan-not-do）

1. **三处接线**（裁决 1）：`历史任务状态运行时:485/489`、`lib/application.mjs:627`、`lib/application.mjs:633`。仓内机制改动；不动 `judgment` 的 schema（`lib/event-store.mjs:77` 的 `{remaining, failure, next_action}` 三字段不变，只改内容），故不撞 `agent/schema-v3-event-sourcing` 分支。

## 本记录不判定

- 工作面打回反馈的质量（样本 = 0，留 fog）。
- 判据传输形态与「判据执行失败 vs 判据不满足」的可区分性（票 10）。
- 三处接线的排序与定价（#04）。
