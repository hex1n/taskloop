# Supervisor charter（Gate 0）：有人值守形态下的分析与残值清算（**判决已撤回**）

> ⚠ **2026-07-16：Gate 0 已裁决——[拒绝 charter](2026-07-16-supervisor-charter-gate0-verdict.md)。本记录已被取代，仅存档。**
> 下文的**事实读数**（A1 样本逐事件、tracer bullet 可行性≠价值、判据传输证据链、application service 机制分析、`npm test` 实测）仍有效并已被新裁决引用；**其「残值清算」表已由新裁决逐条重给独立理由并作废**（该表以「charter 否了故无消费者」关条目，正是撤回的那条理由）。**下文两处「A1 样本 n=0，按构造为零」的判断已被更正**：A1 不是一个假设而是三个（A1a/A1b/A1c），仅 A1c-2 结构上 n=0。
>
> 日期：2026-07-15
> 状态：**分析记录；判决已撤回并已被 2026-07-16 裁决取代。**
> 来源 ticket：[03 — Supervisor charter（Gate 0）裁决](../../.scratch/loop-engineering-best-practice/issues/03-supervisor-charter-adjudication.md)
> 被裁对象：[Loop Supervisor 演进决策稿](2026-07-15-taskloop-loop-engineering-evolution.md)（Gate 0 **未**关闭）
> 上游框架：[Loop Engineering 维度框架](2026-07-15-loop-engineering-dimension-framework.md)（维度 5「迭代控制」的驱动/next-work 半边）
> 证据修正前提：[工作流接入与判据交接决策记录](2026-07-15-workflow-adoption-criterion-handoff.md)（v2 账本的发现者）

## ⚠ 撤回声明（2026-07-15，owner 质疑触发）

本记录原以「**拒绝 charter 变更 + 否 tracer bullet**」结案，owner 已逐项确认。随后 **owner 一句话推翻**：「那这样看还是按 taskloop 的现在来的呀 因为你总是参考当前实现」。**判决撤回，Gate 0 退回未裁。**

**撤回理由——样本 population 错误：**

下文全部证据来自 `~/.taskloop/outcomes-v2.jsonl`，而这份账本整体来自**有人值守**的工作形态。A1（「主动 supervisor 能提高真实长任务的恢复率/正确率」）真正吃的是**无人值守**长任务——那类样本 **n=0，且是按构造为零**：taskloop 今天不做无人值守，它的失败模式就没有机会进账本。**「没有证据」是工具能力边界的投影，不是事实。**

具体到下文的核心论证：FIELD_OPTION 样本 15 小时的 `needs_input` 之所以解开，是因为早晨 owner 回来了。用它论证「人拥有 next-work，故无缺口」是**循环**——「人拥有」正是有人值守的定义。真正的 A1 争点是**夜里那两次 `stuck` 若无人在场，谁把它续上**；该样本回答不了，因为当时人在。

**第二个自封信号**：下文所拟三条翻盘条件（崩溃丢进度／跨轮重复副作用／因无人拥有 next-work 而停摆）在有人值守形态下**按构造永不触发**——人始终是 next-work 的拥有者。**不可触发的重开条件不是重开条件，是把门焊死。**

**排序错误**：Gate 0 必须排在 [08 过夜无人值守配方](../../.scratch/loop-engineering-best-practice/issues/08-overnight-unattended-recipe.md) 之后。08 记着「owner 真实需求：睡前交付一个任务让它整夜自跑、早晨可信验收」，其第 1 问「驱动侧：选哪个驱动（/goal、codex exec、宿主 scheduled task）」**就是** Gate 0 的问题在无人值守下的形态；三个候选驱动全是**外部**驱动，即预设了当前 charter 的「驱动让渡」。08 将产出第一份「外部驱动够不够」的真实证据——那才是 A1 的检验。若 08 裁定档 2 不要，现有账本恢复代表性，Gate 0 方可据其裁决。

**反向刹车（记录以防滥用）**：「没有证据是因为工具不支持」这个论式能论证建任何东西，是经典的不可证伪立项理由。它在此成立的**唯一**理由是 08 白纸黑字记着 owner 的真实需求——被压制的 population 有据，不是替 owner 想象的。

**方法论**：这是本图第三次「用被评估对象当参照系」的翻盘（前两次在票 02：根问题表述照抄 charter；框架骨架照抄 taskloop 分层）。同一个错误在同一张图上第三次出现，说明它不是疏忽而是**默认引力**。

**本记录仍然可用的部分**：下文的 A1 样本逐事件读数（事实）、tracer bullet 的可行性≠价值论证、判据传输的证据链、application service 的机制分析与 `npm test` 实测——见「幸存结论」节的分级。**「裁决」「翻盘条件」两节作废。**

## ~~裁决~~（已撤回）

~~**拒绝 charter 变更。** taskloop 维持「被动 stop gate + 事件权威」定位；「持久化 Loop Supervisor」方向关闭。**5–8 日 tracer bullet 一并否掉。**~~

决策稿的 `decision: BUILD` **未**作废，退回未裁状态。其 §4（当前实现相对最佳实践的位置）、§13（反向失败测试）、§14（不做什么）仍是有效的现状盘点。

**注**：§13 反向失败测试第 1 条「真实任务绝大多数单轮完成，恢复价值接近零」曾是本记录的主要依据——撤回后须注意：**「绝大多数单轮完成」本身可能是当前工具形态的产物**，不能直接当作独立于工具的工作负载事实。

## 幸存结论分级（重裁时的输入）

**不依赖 charter 判决，独立成立**（重裁不必重推，需复核）：

1. **tracer bullet 否**——验可行性而非价值，且不测 A1（纯逻辑论证，见下文同名节）。
2. **MCP adapter / parent-child 多 worker 死**——维度 9 边界写死，owner 独立决定。
3. **ResumePacket 死**——维度 8 判「让渡」。
4. **判据传输独立有价值**——硬证据在账本里，与 supervisor 无关，已出[票 10](../../.scratch/loop-engineering-best-practice/issues/10-criterion-transport-form.md)。
5. **application service 的招牌收益「去 shell」兑现不了**——机制事实（shell 字符串由宿主在 hook 边界递入）。**但**「因此只能靠 adapter，而 adapter 已随 charter 死」这半句随 charter 重开而失效。
6. **「测试慢」是误诊**——实测 288.8 秒由必须端到端的 installer/windows 测试吃掉。
7. **A3 控制面摩擦未测量**——无论 charter 怎么裁，先测量都成立。

**随 charter 重开而复活为未决**：WorkOrder/Receipt/Transition schema、supervisor transition engine、单 worker lease / crash resume / 幂等 receipt、JSON stdio adapter、三组对照 eval。杀它们的唯一理由是「charter 否了故无消费者」，该理由已撤回。

## ~~证据门禁的处置：不等数据，现在裁~~（已撤回）

框架给 Gate 0 增补的门禁是「A1 须以恢复采用后的账本证据为输入」。票 05 证明该门禁的前提写错了——采用从未断流，v2 账本一直在积累。~~**owner 裁定：不等更多数据，现在裁。**~~

原三条理由与撤回后的处置：

1. ~~**样本的失败模式是结构性的，不是统计性的。**~~ **已推翻**：这条恰恰是循环论证的核心。「长尾成因是人的授权门」只在有人值守形态下为真；换到无人值守，人的授权门不再是长尾的解释，而「谁续上 `stuck`」变成真问题。所谓「性质不同的样本零出现」，是因为产生它的工作形态从未被尝试。
2. ~~**数据到达率极低。**~~ **已削弱**：该论证假定当前使用形态延续，但 05 刚刚**故意改变了发生器**（立「动手前开单」纪律）。纪律生效后 rounds 应当上升；且 08 若落地档 2，将直接产出无人值守样本。「等数据」不再是无限期挂起。
3. **框架的价值门禁要求重建设项拿数据——这条仍然成立，且现在指向相反方向。** 我们手上的数据是**纪律之前 + 有人值守**的，对 A1 既不支持也不否定，因为它取自错的 population。门禁未被满足，Gate 0 不能据此裁 NO，也不能据此裁 BUILD。

## A1 的样本读数：唯一的真实长任务（**事实有效，结论已撤回**）

> **读这一节前先读撤回声明。** 下表的事件读数是事实，可直接用于重裁；但由它推出的「恢复没有缺口」**只在有人值守形态下成立**，而该形态不是 A1 的目标 population。原标题「恢复没有缺口」即撤回对象。

样本：`1e123be8-8d1b-4e5c-b227-1351adaee96a`（业务仓「FIELD_OPTION 战队保号」，13 事件、22 revision，2026-07-13 18:04 → 07-14 09:44，终态 achieved）。这是 v2 账本 10 个终态任务里**唯一** rounds>0 的一个，即 A1 的全部样本。

三次 suspend/resume：

| # | suspend 原因 | 停滞 | 解开者 | supervisor 能否改善 |
|---|---|---|---|---|
| 1 | `needs_input` | **15 小时**（跨夜） | 人 | **不能** |
| 2 | `stuck` | **105 秒** | agent 自己 | 无可改善 |
| 3 | `stuck` | **44 秒** | agent 自己 | 无可改善 |

第 1 次的 `next_action` 原文：「用户请回复：已部署包含当前工作区 FIELD_OPTION 保号修复的版本到 10.74.194.42:12200；授权在 mrksupport_test 对 divisionId=… 执行 querySeasonBySeasonId、连续两次 updateSeasonV2 原样保存…」——**这是人的授权门**：supervisor 不能替人去部署测试包，也不能替人授权对测试库的真实 RPC 写入（项目安全边界要求）。维度 10「人的位置」已判「关闭：机制齐备」，维度 6 已把对抗式墙让渡宿主沙箱。

~~**结论：这个真实长任务里，「下一轮为何发生、崩溃后谁负责」根本没有出现无人负责的缺口。A1 想买的东西，样本显示不需要买。**~~ **已撤回**——该结论的隐含前提是「人在场」，而这正是待证的东西。

**撤回后这个样本仍然告诉我们什么**（重裁时可用）：

- **A1 设想的场景真实存在**：跨会话、多轮、真实业务、高风险的长任务确实发生了。这一条不受影响。
- **在有人值守下，现有机制足以走通它**：3 次恢复全部成功。这一条也是真的，但它的适用范围**仅限有人在场**。
- **真正的 A1 争点被样本回避了**：夜里那两次 `stuck`（105 秒、44 秒）是 owner 在场时自己续的。若无人在场，谁续？样本无法回答——**这恰恰是 08 要产出的证据**。
- **15 小时的 `needs_input` 不是 A1 的争点**：08 第 4 问明写「夜里 `needs_input` 就地停等到早晨是预期行为」。即便进了档 2，人的授权门仍是预期行为而非缺陷。**supervisor 争的不是这 15 小时。**

## ~~翻盘条件（charter 关闭的出口）~~（已撤回——不可触发）

~~账本出现 A1 预言的失败模式，任一即重开 Gate 0：①崩溃丢失已提交进展；②跨轮重复工具副作用；③因无人拥有 next-work 而停摆。10 个终态任务中三者一次未现。~~

**撤回理由**：这三条在**有人值守形态下按构造永不触发**——人始终拥有 next-work（③ 不可能），而有人在场的会话不会崩溃后无人续跑（①② 几无机会）。**一个永不触发的重开条件不是重开条件，是把门焊死。** 「三者一次未现」因此不是证据，是同义反复。

重裁时若仍要设翻盘条件，它必须挂在**能真实发生的事件**上——例如 08 对档 2 的裁决结果、或无人值守跑起来之后的账本。

## tracer bullet 为何一并否掉

决策稿 §11 给自己留了后路：「完整建设应退回 DEFER；但 5–8 日 tracer bullet 仍值得作为决策实验」。该后路在证据面前不成立：

- **它验的是可行性，不是价值。** Gate 1 的验收 oracle 全是「能不能做到」（不解析 shell、receipt 重放不重复 transition、重启后完成两轮）。可行性从来不是疑点：`decide/evolve` 已是结构化领域核（框架判「强」），事件溯源/锁/快照全部达标（维度 7 判「关闭：达标，无差距」）。**花 5–8 日证明无人怀疑的事，不产生决策信息。**
- **被证伪的是价值假设 A1，而 tracer bullet 不测 A1。** 测 A1 的是 Gate 2 的三组对照评测，其输入是真实长任务样本——样本已到，答案是「没有缺口」。
- 故 DEFER + tracer bullet 是最坏组合：付 5–8 日买回已知结论，价值问题原地不动。

## 残值清算（**分级有效——见「幸存结论分级」**）

> charter 判决撤回后，本节表格里**仅靠「charter 否了故无消费者」**成立的条目随之复活为未决；有独立理由的条目仍然有效。逐条见下表「撤回后状态」列。

### ~~随 charter 关闭~~ → 分级

| 组件 | 定价 | 原关闭理由 | **撤回后状态** |
|---|---|---|---|
| WorkOrder/Receipt/Transition schema | 2–3 日 | supervisor 的协议，无 supervisor 即无消费者 | **复活为未决**（理由纯依赖 charter） |
| supervisor transition engine | 3–5 日 | 同上；与现有 task engine 构成双状态机（决策稿 §5 自陈风险） | **复活为未决**（双状态机风险仍是重裁时的有效反对论据） |
| 单 worker lease / crash resume / 幂等 receipt | 3–4 日 | 维度 7 判「达标，无差距」；样本 3 次恢复全部走通 | **复活为未决**——「样本 3 次恢复走通」是有人值守读数；维度 7 的「达标」也是对**有人值守**恢复而言 |
| JSON stdio adapter | （含于控制面 2–3 日） | 无消费者（executor 随 charter 死） | **复活为未决** |
| MCP adapter | 2–4 日 | 无消费者（executor 随 charter 死） | **复活为未决** |
| agent-in-loop 三组对照 eval | 3–5 日 | 主要用途是证明 supervisor 是否更好，随 charter 消失 | **复活为未决**——它正是 A1 的检验工具，charter 未裁则它重新有用 |
| ResumePacket schema | §9 | 维度 8 判「让渡」 | **仍关闭**（独立理由：维度 8 让渡） |
| parent/child 与多 worker join | 5–8 日 | 维度 9 **边界写死**：单写入者 + 只读评审是唯一认可形态 | **仍关闭**（独立理由：owner 的边界决定） |

~~合计关闭 22–30 日的提案面。~~ **撤回后实际仍关闭者：ResumePacket + 多 worker（5–8 日档）。其余约 17–22 日退回未决。**

### 活下来：判据传输（有硬证据）

决策稿 §11 支撑项「显式 argv criterion + legacy command 兼容」（1–2 日）是全篇**唯一**有硬证据的条目。证据链在同一个 FIELD_OPTION 样本里：

首次 observation 的 `output_tail` = **`"The command line is too long."`**（`exit_code: 1`，99ms）。判据是塞进命令行的 base64 `EncodedCommand`，撑爆 Windows 命令行长度限制 → 被迫 amend（rev2，reason「压缩 PowerShell 判据以满足 Windows 命令行长度限制，保持原验收语义」）→ 该 amend 自授 **5 个 `criterion_subject` grant**（`granted_by: "self"`）→ review floor 抬升（`floor.reasons: [criterion_subject_grant]`）→ 埋下 `criterion_provenance` + `criterion_input_coverage` 证明缺口 → 终态 `proof.state: provisional`。

**一条判据传输故障，污染了信任链一整条。** 这是 A3（shell 控制面造成可观测摩擦）在账本里唯一一次真实开火——**而且它开在判据面，不在控制面**。

处置：**归新票 10「判据传输形态」**，其机制形态撞票 07 的溯源盲区（把判据推进仓内文件 = 推进 `repo` 受信桶，正是 07 要裁的东西），故 `Blocked by: 07`。

### 不立项：application service（降级为 A3 测量项）

owner 初裁「结构化控制面不否」，随后要求撤掉 `AGENTS.md` 的声明重推——**撤掉后建议翻转为不立项，owner 采纳**。

方法论说明：以 `AGENTS.md:9`「`lib/application.mjs` 是单一 assembly 模块」为论据，是拿被评估对象的使命宣言当证据——正是票 02 第一版被推翻的同一个错（「用被评估对象的使命宣言当推导起点，推出的维度天然给它打高分」）。决策稿 §1 亦自律「`AGENTS.md` 只用于遵守仓库操作规则，不作为能力判断或方案证据」。

撤掉拐杖后三条：

1. **招牌收益兑现不了。** 决策稿卖「去除控制面 shell」——进程内 service 做不到：shell 字符串是**宿主在 hook 边界递进来的**（`lib/application.mjs:98-119` 靠字符串匹配认自己的生命周期命令），只有 host adapter 能改变宿主发什么，而 adapter 已因无消费者否掉。
2. **剩余收益受益人不对。** 只剩 taskloop 自身的可测试性/可维护性；框架价值门禁明写「受益人：owner 单人日常真实工作，不以产品完整性为由过门禁」。
3. **「测试慢」是误诊（实测）。** `npm test` 全量 **288.8 秒**（≈4 分 49 秒）确是真摩擦，但吃掉时间的是 `installer.test.mjs` / `windows.test.mjs` 这类**必须**真装进 home、真拉子进程的端到端测试——它们的全部意义就是端到端，application service 一秒省不下。测试慢的解法是测试架构（分组/并行），不是控制面重构。

**但方向不关死，而是降到与 A1 同一条证据线上。** 真正未被回答的是 A3 的**控制面**那一侧：字符串匹配一次误判 = 一个生命周期事件被静默丢掉，或一次写入没被 gate 住——这是 stop gate 自己那件工作上的正确性缺口，不是审美问题。决策稿把 A3 标为「部分验证」并给了最便宜的验证法：**记录 rewrite/deny/人工重试和解析失败率**。该数据我们没有。

处置：**「A3 控制面摩擦测量」作为便宜测量项进 #04**；测量结果决定 application service 是否立项。**同一把尺**：A1 用数据裁掉了，A3 没数据就不靠推理立项——否则是对偏爱的条目松尺。

## 对地图的影响（撤回后）

- **票 03 退回 `Status: open`，`Blocked by: 02, 05, 08`**——Gate 0 排在 08 之后。
- **新票 10「判据传输形态」**，`Blocked by: 07`；**#04 的 Blocked by 加 10**。**保留**——其证据与 charter 无关。
- ~~Out of scope 增一行：application service 的立项决策~~ **撤回**——该行的依据「03 裁定其不随 charter 立项」已随判决撤回；A3 测量项本身仍有价值，但它的归属待 Gate 0 重裁。
- ~~雾区：「host adapter 能力面」的专项 research 随 charter 否掉而消失~~ **撤回**，该雾恢复；sandbox 集成现状保留（归票 08）。

## 附带登记（本票查证时发现，非本票裁决）

1. **`npm test` 在本机是红的**：`tests/windows.test.mjs:163` 断言 `1 !== 0`。根因见输出——`error core.hooksPath is 'C:\Users\hexin\Desktop\taskloop\hooks'; not replacing a foreign hook directory`：installer 测试装进临时 home 时，因本仓 `core.hooksPath` 指向自己的 `hooks/`，installer 拒绝替换「外来 hook 目录」→ `summary: … 1 error` → 退出码非 0。**环境交互，非代码回归**（决策稿 §1 记录的基线是「202 tests、195 passed、0 failed」）。未处理，登记备查。
2. **`tests/taskloop-powershell-criterion.test.mjs` 未提交且红**：它 import 的 `powershellCriterionCommand` 在 `lib/application.mjs` 不存在（:173 的报错文案仍是旧的两选一）。它要的 `--criterion-powershell` 把脚本编成 UTF-16LE base64 `EncodedCommand`——正是撑爆命令行的那个形态，膨胀 ≈2.67×（UTF-16 翻倍 × base64 的 4/3），Windows 上限 8191 字符 → 约 3000 字符以上的判据必炸。它解决的是引号/编码（用例含 shell 元字符 `&` 与 CJK），但继承并放大了长度天花板。**归票 10。**

## 本记录不判定

- **Gate 0 本身**（判决已撤回，票 03 退回 open，`Blocked by: 08`）。
- 档 2 无人值守是否为真实目标、以及它选哪个驱动（票 08——Gate 0 的前置）。
- 判据传输的问题定义与形态（票 10）。
- application service 是否立项、A3 测量项的归属（待 Gate 0 重裁）。
- 上述执行项的排序（#04）。
- `npm test` 红态与 `core.hooksPath` 的处置（未开票，登记备查）。
