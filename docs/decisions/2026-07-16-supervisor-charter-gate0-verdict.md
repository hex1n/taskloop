# Supervisor charter（Gate 0）：拒绝——三个问题各有归宿，charter 自己的五条开关命中五条

> 日期：2026-07-16
> 状态：**已裁决**（owner 逐条亲裁）。取代 [2026-07-15 分析记录](2026-07-15-supervisor-charter-gate0.md)（其判决已于同日撤回）。
> 来源 ticket：[03 — Supervisor charter（Gate 0）裁决](../../.scratch/loop-engineering-best-practice/issues/03-supervisor-charter-adjudication.md)
> 被裁对象：[Loop Supervisor 演进决策稿](2026-07-15-taskloop-loop-engineering-evolution.md)（`decision: BUILD` → **拒绝**）
> 上游框架：[Loop Engineering 维度框架](2026-07-15-loop-engineering-dimension-framework.md)（维度 5「迭代控制」的驱动/next-work 半边）
> 承重前置：[08 过夜配方](2026-07-15-overnight-unattended-recipe.md)（档 1 + 两个铃）、[09 meta-loop v2 入仓 spec](2026-07-15-meta-loop-v2-kernel-spec.md)（内核判据）

## 裁决

**拒绝 charter。** taskloop 维持「stop gate + 事件权威」定位；「持久化 Loop Supervisor」方向关闭。

**理由不是「没有证据所以不建」**——那正是 2026-07-15 被 owner 当场推翻的那条。理由是：

> **Gate 0 问的三件事，两件已经有答案，一件已经有归宿；而它想搬进来的东西，一半已经存在。**

**重开条件 = 票 08 的两个铃**（已生效裁决，非本记录发明）：① 出现**单会话装不下的任务**；② **僵死在一个月内吃掉 ≥2 个夜晚**。

## 为什么这道门裁了三次

前两次（含撤回的那次）都试图整体回答 A1「主动 supervisor 能提高真实长任务的恢复率/正确率」，每次都死在同一句质疑上：**「你总是参考当前实现。」**

该质疑是对的，且不是抬杠：账本里没有「无人值守时出的事」，**不是因为不会出事，而是因为 taskloop today 不做那类工作**——「没有证据」可能是工具能力边界的投影。

**本次的转折：A1 不是一个假设，是三个焊在一起的假设。** 捆包里含一项结构上不可答（A1c），于是整包死锁；**而可答的那两项，早已被 08 和 09 在别处裁掉，无人注意到 Gate 0 因此被掏空。**

## A1 的拆分与逐项归宿

| | 问题 | 裁决 | 立在哪 |
|---|---|---|---|
| **A1a** | 干到一半断了，**接得上吗** | **证否** | **业务仓 mrksupport** |
| **A1b** | **干错了谁发现** | **与 supervisor 正交** | 全图 9+ 次更正 |
| **A1c** | **没人在时谁触发下一轮** | **归票 08** | 08 已生效裁决 |

### A1a：证否（证据立在业务仓，非设计仓）

**初稿曾以 wayfinder（本图自身）为证据——owner 当场指出该证据取自设计仓，不转移到业务仓（`salesfundmp`/`salesfundmrksupport` 才是真实工作现场，那里没有 wayfinder）。该证据链已重铺。**

账本按仓库拆分：**9 个任务 = taskloop 自身 4 个 + 业务仓（mrksupport）5 个**（含 1 个跨仓）。业务仓唯一的真实长任务 `1e123be8`（FIELD_OPTION 保号，跨夜、22 revision）三次挂起，**一次都不是真恢复**：

| # | 原因 | 停滞 | 真相 |
|---|---|---|---|
| 1 | `needs_input` | 15 小时 | **人的授权门**（要人去部署测试包）——supervisor 替不了 |
| 2 | `stuck` | 105 秒 | **假红**——[票 15](../../.scratch/loop-engineering-best-practice/issues/15-failure-signature-provenance.md) 已裁：指纹量的是 PowerShell CLIXML 启动噪声，**三次尝试后必 stuck，与 agent 做了什么无关** |
| 3 | `stuck` | 44 秒 | **同上，同一个 `4b720486`** |

**读数：业务仓 5 任务、中位 21 分钟、真实恢复需求 = 0 次。**

**owner 裁定该 0 为真**：不是「工具让长活不划算所以不开单」——`salesfundmp` 的 0 开单是**那阵子业务无变动**，不是工具摩擦。**该裁定堵死了「没证据是因为工具不好用」在 `salesfundmp` 上的唯一出口。**

### A1b：与 supervisor 正交（且第二个机制买不到）

全图更正事件按「谁抓到的」归类，得到**两个干净分开的物种**：

| 抓到者 | 次数 | 物种 | 为什么只有它能抓 |
|---|---|---|---|
| **fresh-context agent** | ≥5（05→02 漏读 `outcomes-v2.jsonl`／15→维度 5 未读 `signature`／08→07 决议 5／09→05／09→charter「schema 共居」） | **事实错误** | **它会去把文件打开。** 前一个 session 手上攥着 `output_tail`／tail／`acting_session`／untracked 却扔了 |
| **owner** | 4（票 02 两次、票 03 一次、票 10 一次——地图记「本图第四次栽在同一毛病上」） | **参照系错误**（「拿当前实现当参照系」） | **agent 结构上抓不到——它泡在那个参照系里。** 问一条鱼「水是什么」 |

**transition engine 抓到 0 次**：它调度轮次，不重查前提；**且它本身也在水里**。

**这两个机制 taskloop 都已经有了**：fresh context = 票 07 决议 5 裁死的**机器地板不可豁免**（`fresh_context` 的字面意思就是「另一个 session」）；人 = 票 08 决议 5 的 **D2 早晨评审**。

### A1c：归票 08（再拆一次，大半已有答案）

| | 场景 | 谁触发 | 状态 |
|---|---|---|---|
| **A1c-1** | 无人 + **session 活着** | **Stop 闸门**——agent 想停 → 拒绝 → 继续 | **08 档 1 已裁：够用** |
| **A1c-2** | 无人 + **session 死了** | 需要 session 外部的东西 | **= 档 2 = 08 的雾区**，8 倍余量下**一次僵死值一个夜晚** |

**08 无意中修好了正是杀死撤回那次的缺陷。** 撤回的三条翻盘条件（崩溃丢进度／跨轮重复副作用／因无人拥有 next-work 而停摆）**在有人值守下按构造永不触发**——分析记录原话：「**一个永不触发的重开条件不是重开条件，是把门焊死。**」而 08 的两个铃（单会话装不下／一月 ≥2 夜）**是会发生的事件**。

## 归属：撞 09 的判据

[09 决议 4](2026-07-15-meta-loop-v2-kernel-spec.md) 已立法：**内核 = 与 runtime 共同作者化核心契约的 skills（两边各持一半知识、谁也不能单独定义它）；消费既定契约的 loop skills 住自己仓库。**

该判据的检验是一句可证伪的话：**「谁也不能单独定义它」**。

| | runtime 那半 | skill 那半 | **skill 能单独定义吗** | 判决 |
|---|---|---|---|---|
| **fold**（09 裁进 runtime） | 事件流——**只有它有** | 哪些聚合是病症诊断指标 | **不能**——没有 runtime 递事件，fold 无从算起 | 共同作者 → **入内核** |
| **next-work** | 「任务 N 终态了」——**已发布的契约** | DAG + frontier 规则 | **能** | **消费者 → 住自己仓库** |

**「必须选」是两者共有的；「单独定义不了」只有 fold 有。**

**而在业务仓，连 DAG 都没有——next-work 就一句话「接着修到判据变绿」，它已经就位：**

| | 谁决定 | 在哪 |
|---|---|---|
| **要不要有下一轮**（whether） | **Stop 闸门**（判据没绿就拒绝放行） | **已经在 runtime 里** |
| **下一轮干什么**（what） | agent 读判据的失败输出 | **票 06 的三处接线** |

**判据的第四个数据点（查证时发现，非推导输入）**：09 的病因诊断是「user-level meta-loop 烂掉不是地址错，是**它是共同作者却住在外面**」。**wayfinder 也住在外面**（`~/.claude/skills/wayfinder`），**但它不是共同作者**——**它没烂，它正驱动着本图**。同一条判据预言了「住外面」的两种下场，两个都对上了。

## charter 的五条自杀开关：命中五条

§13 标题即「**在以下条件下，Loop Supervisor 会成为最差方案**」——**这是 charter 自己写的证伪条件，写在本图存在之前**。

| # | charter 自己写的死亡条件 | 现实 | |
|---|---|---|---|
| 1 | 真实任务绝大多数单轮完成，**恢复价值接近零** | **A1a**：业务仓真实恢复需求 0 次；08 定价「一次僵死值一个晚上」 | **命中** |
| 2 | 只有一个宿主，且宿主**已提供 durable execution、HITL、trace 和 scheduler** | 宿主四样全有（`/schedule` cron 云 agent、`/loop`、HITL、trace） | **命中** |
| 3 | taskloop 与宿主**同时决定 retry/stop**，双重预算与重复副作用 | `AGENTS.md:13`：**宿主已经在自己决定 stop**（九次计费停顿附近强制释放，2026-07-13 实测）。加 supervisor = **三个状态机** | **命中** |
| 4 | adapter 无法提供可信 identity/receipt，**supervisor 只能相信自然语言** | **票 08 决议 6 的病灶**：`reviewer` 是自由字符串、`acceptedReview` 没有一行检查评审者是谁 | **命中** |
| 5 | 团队没有能力维护**跨宿主兼容矩阵** | 单人；且 `windows.test.mjs` 本机已红 | **命中** |

**第 2/3/5 条根本没看 taskloop，看的是环境（宿主有什么、你有几个人）——故它们不可能是「拿当前实现当参照系」。** 第 1 条特意绕开了有争议的「9/10 rounds=0」读法（票 03 第 18 行警告过那可能是工具形态的产物），改立在 A1a 上。

**另两个 charter 自己的开关同时开火：**

- **§11 脚注**：「如果 14–22 日的定价**明显超过真实事故/摩擦成本**，完整建设应退回 DEFER。」→ 真实事故成本 = **一个晚上**。
- **§14 末行**：「**不在没有对照 eval 的情况下宣布 supervisor 优于 gate。**」→ 该 eval 测的是 A1，**而 A1 已拆成三块各回各家，没有「A1」可测了**。

## 两条更正

1. **「被动 stop gate」是错的自我描述。** **拒绝停 = 驱动下一轮。** 其真实局限是**开火时机窄**（需要 agent 活着且合作），不是不驱动。**charter 把「时机窄」读成「不驱动」，于是要造一套已经在跑的东西。**
2. **taskloop ≠ loop engineering，它是 loop engineering 的内核。** loop engineering = 内核（判据/信任/账本/终态）+ loop skills（决定下一步）+ 宿主（scheduler/sandbox/HITL）。owner 的观察「**对业务仓来说 taskloop 也住在外面**」成立，但那是**另一根轴**——该轴上所有工具都在外面，故它不区分任何东西；**它真正的贡献是把「Gate 0 的价值该在哪测」搬回了 mrksupport。**

## 残值清算（每条独立理由，「无消费者」一次未用）

> 撤回的那次以「charter 否了故无消费者」关闭多数条目，该理由随判决一并撤回。**本次逐条重给独立理由。**

| 组件 | 定价 | **独立理由** | 判决 |
|---|---|---|---|
| WorkOrder/Receipt/Transition schema | 2–3 日 | **它已经存在，只是没叫这个名字**：`task_opened` payload = goal+criterion+envelope+grants+budget+assurance = **一张 WorkOrder**；`criterion_observed`/`task_terminal` = receipt | **死** |
| supervisor transition engine | 3–5 日 | 决策稿 §5 自陈「双状态机」，实为**三状态机**（`AGENTS.md:13`：宿主已在自己决定 stop） | **死** |
| 单 worker lease | 含 3–4 日 | **lease 的用途是防两个 writer 打架；维度 9 已写死单写入者。单写入者的 lease 是空操作** | **死** |
| crash resume | 含 3–4 日 | **已有且实测走通**（`task_resumed`；`1e123be8` 三次 suspend/resume 全部走通）；且业务仓真实恢复需求 = 0 | **死** |
| 幂等 receipt | 含 3–4 日 | **已有，机制是内容寻址**：`lib/event-store.mjs:378` `event_id: sha256Hex(canonicalJson(persisted))`；`lib/outcome-projector.mjs:319` 直接拒重复 id。v2 的 `event_id` 是 UUIDv5（名字派生，同样确定） | **死** |
| application service + JSON stdio adapter | 2–3 日 | **「去 shell」兑现不了是机制事实**：shell 字符串**由宿主在 hook 边界递入**（`lib/application.mjs:98-119` 靠字符串匹配认自己的生命周期命令）；进程内 adapter 改变不了宿主发什么 | **死** |
| MCP adapter | 2–4 日 | **Stop 闸门是 hook，不是 MCP 调用**；adapter 改变不了闸门那条路径——**而闸门是 taskloop 的全部工作** | **死** |
| agent-in-loop 三组对照 eval | 3–5 日 | **它测 A1；A1 已拆成三块各有归宿，没有「A1」可测了** | **死** |
| evaluator model adapter | 2–4 日 | **（07-15 那张表漏了本条，本次补上）** judgmentloop 已在内核，其终结动词是**人的显式验收**；把 judge 换成模型 = 撞 judgmentloop 的形状 | **死** |
| ResumePacket schema | — | 维度 8 判「让渡」（独立理由） | **仍关闭** |
| parent/child 与多 worker join | 5–8 日 | 维度 9 边界（owner 独立决定） | **仍关闭** |
| 显式 argv criterion + legacy 兼容 | 1–2 日 | **已归[票 10](2026-07-16-criterion-transport-form.md) 并裁完**（`kind:"file"` + 信道分离） | **活着，已裁** |
| A3 控制面摩擦测量 | 便宜 | **独立于 Gate 0 成立**：字符串匹配一次误判 = 一个生命周期事件被静默丢掉，或一次写入没被 gate 住 = **stop gate 自己那件工作上的正确性缺口**。「同一把尺」：A1 用数据裁掉了，A3 没数据就不靠推理立项 | **进 #04** |

**合计**：关闭 **13–20 日**（核心 + eval）+ **9–16 日**（可选面）；**活下来 1–2 日**，已由票 10 裁完。

## 清算里浮出来的那条线

WorkOrder/Receipt schema、幂等 receipt、crash resume——**三条的独立理由是同一句话：它们已经存在了。**

> **charter 想造的核心里，有一半 taskloop 已经有了。**
>
> **这是本图那根线的第七次开火**——前六次是 06（手上有 `output_tail` 却扔了）／07（有 tail 却没拿它分类）／08（有 `acting_session` 却没拿它判独立性）／13（有 untracked 观测却用完即弃）／10（判据已经会说话，runtime 不听）／**charter 的 WorkOrder（2–3 日 schema + 3–5 日 engine）与票 06 的三处接线干的是同一件事——把「下一轮该干什么」递给 agent；charter 想造它，是因为它没看见 runtime 手上已经攥着那句话**。
>
> **只不过这次「手上有 X 却不用」的不是 runtime，是 charter 自己**：它手上有事件契约、有内容寻址、有 resume，提案里当它们不存在。**它错过的理由和前六次一模一样——盯着「该造什么」，没去读手上已经有什么。**
>
> **这也解释了「14–22 日」这个定价怎么来的：它给已经存在的东西重新报了一遍价。**

**并由此得到本图的一条结论**（写给 #04）：**loop engineering 的真问题在「观测」，charter 瞄的是「调度」。** 五张关单票（06/07/08/10/13）的根据连成一根线，全部落在观测/判据/信任面；**指向调度面的，零张。** charter 三次裁不动的根因是它一直在给错的器官动手术。

## 如实记下的限制（不藏）

1. **业务仓证据是单仓 `mrksupport`、n=5**。`salesfundmp` 因业务无变动而 0 样本。**薄，但它是我们有的全部。**
2. **A1c-2 永远 n=0**——这不是缺陷，是票 08 已经接手的雾；其 graduate 条件同时是本裁决的重开条件。
3. **8 倍余量量自有人值守的 110 分钟**（owner 坐在椅子上的 110 分钟）。无人值守的活可能天然更长。owner 已认，此处再记一次。

## 附带登记（本票查证时发现，非本票裁决）

1. **taskloop 的闸门在裁决时全部未装，本票收口时按 owner 裁定部分装回。**

   **发现时**：`~/.claude/settings.json`、`~/.claude/settings.local.json`、项目 `.claude/settings.local.json` 三处 `taskloop` 均零命中；`hooks` 块只有 `SessionStart`（patch-codex）与一个 `PreToolUse`（`dangerous-operation-check.js`，与 taskloop 无关）。2026-07-15 本图 03 session 因 untracked gate `deny` 而由 owner 移除后未装回。

   **处置（owner 裁定，2026-07-16）**：`taskloop hooks` 生成的是**两个职责不同的 hook**——`Stop` 是**判据裁决（循环本身）**，`PreToolUse` 是 **untracked/envelope/预算闸门（07-15 咬人的那个）**。

   - **`Stop`：已装回并实测**（指向装机 shim `~/bin/taskloop.mjs`，`timeout: 300`）。**零副作用经实测确认**：无 open task 时零 stdout、exit 0 干净释放。08 的档 1 与 Gate 0 的主体重新有承重件。
   - **`PreToolUse`：不装，等雾区「无机器判据的仓内工作」裁完。** 理由是算术而非风险偏好：其逃逸路径为 untracked → nudge → **第 2 个仓内文件 deny**（装机 `application.mjs:669-671`），而一个 wayfinder session 必写 ≥3 个仓内文件（ticket Status、决策记录、map.md）→ **原样装回 = 07-15 必然重演**。代价照实记：业务仓失去「动手前开单」nudge，票 13 的观测源仍缺席。

   **由此得一条对票 05 的更正**：**其「0 任务」不能全赖闸门没装。** 雾区自陈「票 05 决议 1『动手前开单』在这类活身上落不了地」，而 owner 近两日所做正是这一类——**闸门被卸是症状不是原因：它在一类「没有合法形态」的活上开火，只能被卸。**

   **附带观察（留给接雾区那条的人，本票不处置）**：该雾的 graduate 条件写作「等 05 的纪律真正跑起来后再 graduate」——但 05 的纪律跑起来是在**业务仓**（有机器判据那类），而该雾说的是**规划类**。**它在等一个错 population 的信号**，与撤回那次的「永不触发的重开条件」是同一个毛病。
2. **账本自 2026-07-14 11:23 起断流**（`outcomes-v2.jsonl` 最后写入时间）。**票 05 的「动手前开单」纪律（07-15 立）至今 0 个任务。**
3. **v3 是未发布的在途分支**：`main` = 契约 3 / `LEDGER_FILE = "outcomes-v2.jsonl"`，装机 runtime（`~/bin/.taskloop-runtime/9a078b03abba`，07-14 装）与 main 一致；当前分支 `agent/schema-v3-event-sourcing` 领先 main 9 个提交、契约 4、`events-v3.jsonl`/`outcomes-v3.jsonl`。**`~` 下 `*-v3.jsonl` 零命中——v3 从未产出过一行。** 票 09/13 以「当前契约」称之并引 `lib/prims.mjs:25`，口径应为「未合并分支」；**不影响其决议**（两票裁的是将来的 spec）。
4. **第 1/2 条的承重面**：票 05 的纪律、票 08 的档 1（配方含「Stop 闸门」）、票 13 的 untracked 观测**全部依赖闸门开火**。**本票开工时，本图正在为一台没在跑循环的机器规划循环的演进**——这是查证本票时最刺眼的一条，也是 `Stop` 得以当场装回的理由。**08 的档 1 与 Gate 0 的主体现已重新有承重件；05 与 13 的那半仍缺席，等雾区那条。**

## 本记录不判定

- 档 2 无人值守的建设（票 08 已送雾区，graduate 条件 = 本裁决的重开条件）。
- A3 控制面摩擦的**测量结果**（测量项本身进 #04）。
- **`PreToolUse` 闸门何时装回**——等雾区「无机器判据的仓内工作」裁完（附带登记第 1 条已记其算术理由与代价）。
- 账本断流的补记、v3 合并（附带登记，未开票）。
- 上述执行项的排序（#04）。
