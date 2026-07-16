# 03 — Supervisor charter（Gate 0）裁决

Type: grilling
Status: resolved
Blocked by: 02, 05, 08

## Question

在 #02 推导出的维度框架内（归属维度 5「迭代控制」的驱动/next-work 半边），裁决 [Loop Supervisor 演进决策稿](../../../docs/decisions/2026-07-15-taskloop-loop-engineering-evolution.md) 的 Gate 0：taskloop 是否从「被动 stop gate」演进为「持久化 Loop Supervisor」？接受、拒绝还是修改 charter？若接受，tracer bullet 切片的授权边界（范围、预算、退出条件）是什么？若拒绝，决策稿中的哪些组件（结构化控制面、argv criterion 等）仍单独有价值？

**证据门禁（#02 增补，2026-07-15）**：Gate 0 的裁决以恢复采用（票 05）后的账本证据为承重假设 A1（「主动 supervisor 能提高真实长任务的恢复率/正确率」）的输入——现有账本 rounds≈0、任务几乎不跨轮，对 A1 无任何证据基础，不在无数据状态下裁 14–22 工程日量级的方向。故增补 Blocked by: 05。

**门禁前提已变（票 05 更正，2026-07-15）**：「等 05 恢复采用后再有数据」不成立——采用从未断流，框架漏读了 `~/.taskloop/outcomes-v2.jsonl`（10 个终态任务、含 6 个真实业务仓任务，07-13→07-14）。唯一 rounds=4 的业务仓任务（「FIELD_OPTION 战队保号」）跨 2 天、3 次 suspend/resume 后 achieved——真实长任务的跨会话恢复在**没有** supervisor 的情况下走通了。详见[工作流接入与判据交接决策记录](../../../docs/decisions/2026-07-15-workflow-adoption-criterion-handoff.md)证据修正节。

**样本 population 错误（2026-07-15 首次裁决被撤回后增补，Blocked by 加 08）**：上述 v2 账本证据**不能**用来裁 A1，因为它整体来自**有人值守**的工作形态，而 A1 真正吃的是**无人值守**长任务——那类样本 **n=0，且是按构造为零**：taskloop 今天不做无人值守，所以它的失败模式没有机会进账本。具体地：

- FIELD_OPTION 样本 15 小时的 `needs_input` 之所以解开，是因为早晨 owner 回来了。用它论证「人拥有 next-work，故无缺口」是循环——「人拥有」正是有人值守的**定义**。真正的 A1 争点是**夜里那两次 `stuck` 如果没人在，谁把它续上**；样本回答不了，因为当时人在。
- 9/10 rounds=0 可以读成「循环不需要循环」，也可以读成「工具让多轮不划算，所以从不尝试多轮」。05 刚为此立了「动手前开单」纪律，而**纪律生效后的数据一行都还没有**——框架要的是「采用后的新账本数据」，现有账本是**纪律之前**的。
- 因此 Gate 0 必须排在 [08 过夜无人值守配方](08-overnight-unattended-recipe.md) 之后：08 第 1 问「驱动侧：选哪个驱动（/goal、codex exec、宿主 scheduled task）」**就是** Gate 0 的问题在无人值守下的形态，且 08 的三个候选驱动全是**外部**驱动（即预设了当前 charter 的「驱动让渡」）。08 将产出第一份关于「外部驱动够不够」的真实证据——那才是 A1 的检验。若 08 裁定档 2 不要（只在有人值守下用），则现有账本恢复代表性，Gate 0 可据其裁决。

**开工须先自检**：不要拿当前实现当参照系。当前实现不去做的那类工作，其失败模式不会出现在账本里——「没有证据」可能是工具能力边界的投影，而非事实。反向刹车：该论式能论证建任何东西，它在此成立的**唯一**理由是 08 白纸黑字记着「owner 真实需求：睡前交付一个任务让它整夜自跑」——被压制的 population 是有据的。

## Answer

**拒绝 charter。** taskloop 维持「stop gate + 事件权威」定位。详见[Gate 0 裁决记录](../../../docs/decisions/2026-07-16-supervisor-charter-gate0-verdict.md)。

**理由不是「没证据所以不建」**（那是 07-15 被推翻的那条），而是：**A1 不是一个假设，是三个焊在一起的假设**——捆包里含一项结构上不可答（A1c），故整包三次死锁；**而可答的那两项早已被 08/09 在别处裁掉，无人注意到 Gate 0 因此被掏空**。

- **A1a（接得上吗）证否**——**初稿以 wayfinder 为证据，被 owner 当场指出取自设计仓、不转移到业务仓，证据链已重铺**：账本按仓库拆 = taskloop 4 + 业务仓 mrksupport 5；业务仓唯一真实长任务 `1e123be8` 三次挂起**无一是真恢复**（1 次人的授权门 + 2 次票 15 已裁的假红，同一个 `4b720486`）。**业务仓 5 任务、中位 21 分钟、真实恢复需求 0 次**，owner 裁定该 0 为真（`salesfundmp` 的 0 开单 = 业务无变动，非工具摩擦）。
- **A1b（干错谁发现）与 supervisor 正交**——全图更正按抓到者分成**两个物种**：**fresh-context agent ≥5 次抓事实错误**（它会去把文件打开），**owner 4 次抓参照系错误**（agent 泡在参照系里，结构上抓不到）。**transition engine 抓 0 次，且它也在水里。** 两个机制 taskloop 都已有（07 决议 5 的机器地板 / 08 决议 5 的 D2）。
- **A1c（无人时谁触发）归 08**——再拆：**A1c-1（session 活着）= Stop 闸门，08 档 1 已裁够用**；**A1c-2（session 死了）= 档 2 = 08 的雾区**。**08 无意中修好了杀死撤回那次的缺陷**：其两个铃（单会话装不下／一月 ≥2 夜）**是会发生的事件**，而撤回那三条「按构造永不触发 = 把门焊死」。
- **归属撞 09 判据**——检验是「谁也不能单独定义它」：fold **算不了**（无 runtime 递事件）→ 共同作者；next-work **算得了** → 消费者 → 住自己仓库。**业务仓连 DAG 都没有**：whether 已在 runtime（闸门拒绝放行），what 是**票 06 的三处接线**。**判据的第四个数据点**：wayfinder 住外面**且不是共同作者** → 它没烂（vs. meta-loop 共同作者却住外面 → 烂了）。
- **charter 五条自杀开关（§13「会成为最差方案」）命中五条**，其中 **2/3/5 条根本没看 taskloop，看的是环境** → 不可能是「拿当前实现当参照系」。另两个自身开关同时开火：**§11 脚注**（14–22 日 vs 真实事故成本一个晚上 → DEFER）、**§14 末行**（不许在没有对照 eval 时宣布优于 gate——而那 eval 测 A1，A1 已拆散）。

**两条更正**：①**「被动 stop gate」是错的自我描述**——拒绝停 = 驱动下一轮，真实局限是**开火时机窄**（需 agent 活着且合作）；charter 把「时机窄」读成「不驱动」。②**taskloop ≠ loop engineering，它是内核**；owner 的「对业务仓来说 taskloop 也住在外面」成立但是**另一根轴**（该轴上所有工具都在外面，不区分任何东西），其真正贡献是把**价值该在哪测搬回了 mrksupport**。

**重开条件 = 08 的两个铃**（已生效裁决，非本票发明，且真会响）。

**残值清算**（每条独立理由，「无消费者」一次未用）：关闭 **13–20 日**（核心 + eval）+ **9–16 日**（可选面）；活 **1–2 日**（argv criterion，已由票 10 裁完）；**A3 控制面摩擦测量进 #04**（独立于 Gate 0 成立——它是 stop gate 自己那件工作上的正确性缺口）。**07-15 那张表漏了 evaluator model adapter，本次补上并裁死**（撞 judgmentloop 的人验收终结动词）。

**清算里浮出的那条线（第七次开火）**：WorkOrder/Receipt schema、幂等 receipt（`event-store.mjs:378` 内容寻址）、crash resume——**三条的独立理由是同一句话：它们已经存在了**。**charter 的 WorkOrder 与票 06 的三处接线干的是同一件事**，而 charter 想造它是**因为它没看见 runtime 手上已经攥着 `output_tail`**。**这次「手上有 X 却不用」的不是 runtime，是 charter 自己**——**「14–22 日」是给已经存在的东西重新报的价**。由此得本图一条结论（写给 #04）：**loop engineering 的真问题在「观测」，charter 瞄的是「调度」；五张关单票的根据全落在观测面，指向调度面的零张。**

**如实记下的限制**：①业务仓证据是**单仓 n=5**；②A1c-2 永远 n=0（非缺陷，08 的雾）；③8 倍余量量自**有人值守**的 110 分钟。

**附带登记（未处置）**：**Stop 闸门当前未装**（三处 settings 零命中，07-15 移除后未装回）；**账本自 07-14 11:23 断流**，05 的纪律至今 0 任务；**v3 是未发布在途分支**（main = 契约 3，`~` 下 `*-v3.jsonl` 零命中；票 09/13 称其为「当前契约」的口径应为「未合并分支」，不影响其决议）。**05 的纪律、08 的档 1、13 的 untracked 观测全部依赖闸门开火。**

## Comments

- **2026-07-16 重新认领**：`Status: claimed` 系 07-15 那个被撤回的 session 留下的**陈旧认领**——它撤回后加了 `Blocked by: 08` 却没清 Status（当时 08 还挡着，故无人发现；地图第 30 行记的是「已退回 open」，以地图为准）。本 session 重新认领开工。**票面第 19 行预设的解锁方式没有兑现**：它赌「08 裁定档 2 不要 → 现有账本恢复代表性」，而 08 实际裁的是**档 1 成立**（交互式会话过夜，不无头）——无人值守没被裁掉，是被裁进了一个**单会话装得下**的形态。故「population 错误」一节的前提需重新核。
- **2026-07-15 首次裁决尝试（已撤回）**：经 4 问 grilling 裁出「拒绝 charter + 否 tracer bullet」，owner 逐项确认后**由 owner 质疑推翻**——质疑原文「那这样看还是按 taskloop 的现在来的呀 因为你总是参考当前实现」。撤回理由见上节「样本 population 错误」：裁决建立在有人值守账本上，而 A1 的目标 population 是无人值守（n=0）。另一个自封信号：所拟的三条翻盘条件（崩溃丢进度／重复副作用／因无人拥有 next-work 而停摆）在有人值守形态下**按构造永不触发**——不可触发的重开条件等于把门焊死。
  - 这是本图第三次「用被评估对象当参照系」的翻盘（前两次在票 02：根问题表述照抄 charter；框架骨架照抄 taskloop 分层）。**记录以防复发。**
  - 撤回的裁决全文（含 A1 样本的逐事件读数）保留在 [Gate 0 分析记录](../../../docs/decisions/2026-07-15-supervisor-charter-gate0.md)，其 charter 判决已作废，分析与残值清算仍可用作重裁的输入。
- **首次尝试中不依赖 charter 判决、因而幸存的结论**（重裁时不必重推，但需复核）：
  1. **tracer bullet 否**——它验可行性而非价值（`decide/evolve` 已是结构化领域核、维度 7 判达标，可行性从来不是疑点），且不测 A1。纯逻辑论证。
  2. **MCP adapter / parent-child 多 worker 死**——维度 9 已边界写死（单写入者 + 只读评审是唯一认可形态），owner 的独立决定。
  3. **ResumePacket 死**——维度 8 判「让渡」。
  4. **判据传输独立有价值**——硬证据在账本里（`"The command line is too long."` → 强制 amend → 5 个自授 grant → review floor 抬升 → `criterion_provenance` 缺口 → 终态 provisional），与 supervisor 无关，已出[票 10](10-criterion-transport-form.md)。
  5. **application service 的招牌收益「去 shell」兑现不了**——shell 字符串由宿主在 hook 边界递入（`lib/application.mjs:98-119` 靠字符串匹配认自己的生命周期命令），进程内 service 不改变宿主发什么。此为机制事实。**但**「因此只能靠 adapter，而 adapter 已随 charter 死」这半句随 charter 重开而失效。
  6. **「测试慢」是误诊（实测）**——`npm test` 全量 288.8 秒，由必须真装 home、真拉子进程的 `installer.test.mjs`/`windows.test.mjs` 吃掉，application service 一秒省不下；测试慢的解法是测试架构，不是控制面重构。
  7. **A3 控制面摩擦未测量**——决策稿标 A3「部分验证」并给了最便宜验证法（记录 rewrite/deny/人工重试与解析失败率），该数据不存在。无论 charter 怎么裁，先测量都成立。
- **随 charter 重开而复活为未决**：WorkOrder/Receipt/Transition schema、supervisor transition engine、单 worker lease / crash resume / 幂等 receipt、JSON stdio adapter、三组对照 eval。首次尝试杀它们的唯一理由是「charter 否了故无消费者」，该理由已撤回。
- **附带登记（非本票议题，查证时发现）**：①`npm test` 本机为红——`tests/windows.test.mjs:163`，根因 `core.hooksPath` 指向本仓 `hooks/` 致 installer 拒绝替换外来 hook 目录，环境交互非代码回归（决策稿基线为 195 passed／0 failed）；②`tests/taskloop-powershell-criterion.test.mjs` 未提交且红（import 的 `powershellCriterionCommand` 不存在），归[票 10](10-criterion-transport-form.md)。
