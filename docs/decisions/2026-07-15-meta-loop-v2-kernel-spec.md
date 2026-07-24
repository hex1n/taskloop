# meta-loop v2 入仓 spec（维度 11 裁决）

> 日期：2026-07-15
> 状态：决策记录；owner 已逐项确认（wayfinder ticket 09 的 grilling 裁决，九问九认）
> 来源 ticket：[09 — meta-loop v2 入仓重写](../../.scratch/loop-engineering-best-practice/issues/09-meta-loop-v2-into-kernel.md)
> 上游：[维度框架决策记录](2026-07-15-loop-engineering-dimension-framework.md)、[工作流接入与判据交接](2026-07-15-workflow-adoption-criterion-handoff.md)

## 摘要

票面把本票设想成「搬家 + 改引用」：清 asdf 痕迹、换账本路径、加测试清单。**核实推翻了这个设想**——现存 skill 的每一个输入要么已死、要么形状已变，v2 是几乎从零重建，只捞回三件东西。而裁决过程推出了一条比 charter 现口径更强的判据：**内核 = 核心契约的共同作者**。

## 核实的事实（推翻票面三处假设）

### 1. 账本的断代已经发生，且不在票面以为的地方

三代账本的行形状：

| 代 | 行形状 | 关键字段 |
|---|---|---|
| legacy `outcomes.jsonl`（07-07~07-10，46 行/21 终态） | **每任务一行的指标表** | `state, rounds, writes, episodes, criterion_input_drift, criterion_input_coverage, review_level, self_granted` |
| `outcomes-v2.jsonl`（07-13 起，53 行/10 终态） | **事件镜像** | `kind, task_id, task_event_sequence, payload`（opened 10 / amended 11 / proof_gap 9 / terminal 10 / reviewed 7 / suspended 3 / resumed 3） |
| `outcomes-v3.jsonl`（本分支契约） | **事件镜像**（`lib/outcome-projector.mjs:20` `ROW_FIELDS`） | `projection_schema_version, repo_identity, repo_sequence, event_id, task_id, task_event_sequence, kind, occurred_at_epoch_ms, occurred_at, payload` |

**真正的断代是 v1→v2，已于 07-13 发生**；v2→v3 只是同形状精修。现存 skill 文本写的「read `outcomes.jsonl` (**one row per task close**) for the terminal-state distribution, the rounds and episodes each task spent, the `criterion_input_drift` rate, the `review_level`…」——**列举的每一项都是 legacy 的预算指标字段，在 v2/v3 里全都不再作为字段存在**，必须按 `task_id` 折叠事件流才能得出。**v3 把「指标」降解成了「事实」**：事实更权威、可重建，但没人再算指标。

fold 今天**无主**：`report` 只读当前单任务（`lib/application.mjs:527`），`lib/` 里没有任何跨任务/跨仓聚合。

### 2. 语料透镜是死代码

`~/.claude/skills/meta-loop/` 下只有 `SKILL.md`；步骤 1/2 赖以计算指标 1–6 的 `scripts/analyze-sessions.py` 在整个 `~/.claude` 下**不存在**——它是 asdf 项目里的脚本，skill 分居时没跟过来。步骤 2 的工具**从来没在 skill 手里过**。

### 3. 投影是 degrade-open 的——账本可以静默残缺

`lib/application.mjs:415-416`：投影同步失败只写一行 stderr warning，**任务照常关单，账本行静默丢失**（AGENTS.md:11 明写这是设计）。一个月后 meta-loop 读它，无从知道少了行。

### 4. 其余核实

- `~/.taskloop/` 本机只有 `outcomes.jsonl` 与 `outcomes-v2.jsonl`；`events-v3.jsonl`、`outcomes-v3.jsonl` **都不存在**，`lib/` 里**没有任何 v2→v3 迁移代码**——v3 落地即 0 行。
- `tests/skills.test.mjs:22` = `assert.doesNotMatch(joined, /~\/\.taskloop\/outcomes(?:-v1|-v2)?\.jsonl/)`：meta-loop 一旦进 `files` 清单，其文本**永远不许出现** legacy/v2 路径。
- taskloop 的 AGENTS.md **没有 evidence loop 节**（那是 asdf 的）——现存 skill 第 4 步的引用入仓即断。
- `~/.taskloop/untracked-writes.json` 是 session 级瞬态 nudge 状态（`clearUntracked` 会清），**不进 `events-v3.jsonl`、不进 `outcomes-v3.jsonl`**（两模块 grep 零命中）。
- audit 三兄弟零解读：`audit` 验事件存储完整性、`sync-outcomes` 从事件全量重放修投影、`audit-outcomes` 验投影。关单时投影自动增量同步（`application.mjs:415`），`sync-outcomes` 是修复/回填动词。

## 两条根原理

本票的十条决议全部从这两条落下：

- **原理一：机器可计算的确定性函数，不该由 actor 复述。** 当机器能观测/计算某物时，actor 对它的报告严格更差——多了一道会错的转述，却不增加任何信息。这是 06「判据的身份不是判据的话」与 07「声明只能作用于声明，不能作用于观测」的共同上位式。
- **原理二：必须一起改的东西必须一起发。** 这是共居的唯一耐久判据。

## 十条决议

### 决议 1：身份 = 账本读者；语料透镜出仓；采用必须是账本里的机器观测

**账本有幸存者偏差——它只见开了单的活。**没开单的活，账本里没有行。而入仓理由是 schema 共居，**只覆盖账本那一半**：语料的 schema owner 是 host，不是本仓库；按 cohabitation 论据自己的逻辑，语料透镜不该跟进内核。何况语料透镜的主要猎物（人在当 scheduler、手动催）属于维度 5 驱动半边（让渡、归 #03）与维度 10（已关闭），在框架内已无内核归宿。

裁决：**内核 meta-loop = 账本读者**，身份重述为「循环是否收敛、在哪失败、采用到什么程度」；语料透镜出仓。但**不接受对采用失明**——采用是可机器观测的（runtime 天天在观测「没开单就动手」），只是观测被当即时 nudge 用完即弃。**让 meta-loop 的采用输入也归本仓库 schema，而不是去借 host 的**——这恰是 cohabitation 论据指向的方向。

具体接线移交**票 13**（runtime 落点）。此项与 06「runtime 手上有 `output_tail` 却扔了」同形。

### 决议 2：两个死语料弃用为账本输入，原地只读保留，不迁移、不删除

v1/v2 **没有事件存储**。v3 的权威是 per-repo 的 `.taskloop/events-v3.jsonl`，`~/.taskloop/outcomes-v3.jsonl` 只是**投影**——`sync-outcomes --repo PATH` 全量重放事件重建它，每行都可证自事件。迁移只有两条路：**合成事件**（从投影行倒推一段从未发生过的事件史，连摘要链一起伪造 = 伪造权威日志），或**直接塞行**（破坏「每行可证自事件」不变式，`audit-outcomes` 要么拒绝要么被放宽）。

两条都是拿**投影的完整性属性**换 31 行历史——而那条属性正是 meta-loop 敢信自己没抽查过的计数的唯一依据。**为了让 meta-loop 有历史读，去伪造 meta-loop 赖以信任历史的那条链——自噬。**

弃用不疼的两点：① **这 31 个任务已被榨干**——05/06/07 把 rounds 分布、`review_level`、`criterion_input_drift`、A1 唯一开火样本（`1e123be8`）、10/10 命令判据 file:0、2/10 零评审关单全部挖出并写进决策记录；**语料的分析价值已收割成决策记录**，meta-loop 要的是未来的纵向数据。② **v3 是最后一次杀语料的迁移**——v1→v2→v3 杀两次是因为前两代只有投影没有事件；v3 之后投影 schema 再变，重放重建即可。**这次重置是一次性终局成本，不是持续失血。**

**不删除**有硬理由：05/06/07 的决策记录直接引用了 v2 账本里的具体样本，删文件 = 那些证据指针当场失效。文件留在盘上作证据后备；skill 文本永不提它们。

诚实的代价：**meta-loop v2 落地即读 0 行**，第一次有意义的运行要等真实工作攒够任务。

### 决议 3：fold 归 runtime 聚合动词；skill 绑聚合契约而非生事件

fold 是**纯函数**：events → 指标。确定性，同输入同输出。

- **(a) skill 散文教 agent 手折——出局。** 按原理一，这是把会犯错的 actor 放在纯函数的位置上。本图 3/4 张票出过账本误读（02 读错文件、07 的账在 05 更正后 5/10 重算成 2/10），这不是运气差，是该错位的预期产物。
- **(c) skill 自带 Node stdlib 折叠脚本——出局。** AGENTS.md:16「standard-library helpers」允许脚本，**合法**；但它装在 `~/.claude/skills/meta-loop/`、够不到 `lib/`，必须**重新实现一份事件 payload 知识**。**fold 就是 schema 知识**；schema 知识存在两处 = 两处要改 = 必然漂移。**(c) 是 (a) 的病延后发作**——不是每次跑重推一遍，而是脚本重推一次然后静默腐烂。
- **(b) runtime 出聚合动词——采纳。** 拟名 `taskloop ledger --json`。住 `lib/`、import schema 定义、`npm test` 押住 → 单一真相源。schema 变 → verb 内部改、测试炸 → skill 文本不动。

**活证据就是漂移本身**：user-level meta-loop 至今读着两代前的路径。

### 决议 4：入仓理由改判——内核 = 核心契约的共同作者

决议 3 抽掉了 charter 修正案的立论。原立论是「meta-loop 的第一输入是**账本行格式**，schema owner 是本仓库」；fold 进动词后，meta-loop 不再碰行格式——它绑 CLI 契约，**和 workloop 绑 `open/achieve/status` 一模一样**。

按原理二重推：meta-loop 必须跟着 runtime 改吗？读生事件 → 每次 schema bump 都改 → 必须共居；读聚合动词 → 只在**聚合契约**变时改。所以真问题是**聚合契约归谁定**。

**关键：聚合契约无法由 runtime 单独推出。** runtime 知道自己记了哪些事实，但不知道**哪些聚合是循环病症的诊断指标**——「rounds 分布」「review_level 与返工的相关」「abandoned 理由聚类」是**关于「循环怎么生病」的假说**，是 meta-loop 的知识。而「所有可导出的聚合」无界（任何 fold 都可导出），runtime **必须选**——选就需要那份知识。

**⇒ 判据：内核 = 与 runtime 共同作者化核心契约的 skills（两边各持一半知识、谁也不能单独定义它，因此必须一起改、一起发）；消费既定契约的 loop skills 住自己仓库，通过 loop-core 契约组合。**

**事后检验**（非推导输入）：该判据独立复现了现有三成员——workloop/judgmentloop 都与 runtime 共同作者化了动词契约；AGENTS.md:22「Further loop skills 通过 loop-core 契约组合」说的正是**既定契约的消费者**。它还**解释了病因**：user-level meta-loop 烂掉不是因为地址错，而是**它是共同作者却住在外面**——没有聚合契约可消费，被迫绑生 schema，且没有任何测试押住那个绑定。

**「schema 共居」是对的观察、错的抽象**：共居的不该是 schema，是**契约的作者身份**。结论不变（入仓），立论重述。

### 决议 5：触发 = 日历轮询 + 提醒携带账本增量读数 + 恒 HITL

**日历是代理量，不是真正的触发量。**meta-loop 值得跑的条件是「攒够了足以改变结论的新数据」，与月份无关。实况：两个月产出 10 个终态任务，月度触发平均落在约 5 个任务上，**统计上什么也不是**。叠上决议 2（v3 落地即 0 行），纯日历提醒会在**空账本上连响数月** → 告警疲劳 → 恰好在账本终于有数据的那个月被无视。**决议 2 给纯日历触发上了膛。**

但闸门不该是机器阈值：「这次值不值得跑」是判断不是计算（机器不知道 3 个新任务里有没有一个 critical 异常）。而人要判断就得先有读数——今天的提醒只说「该跑了」，人必须付出跑一整轮的代价才能发现不值得跑。

裁决：沿用 05 已接好的月度提醒（自足 PowerShell + `meta-loop-due.txt` + `msg *`），**提醒携带账本增量读数**（「距上次有 N 个新终态任务、M 个 abandoned」，调决议 3 的动词取）。空账本的月份，提醒自己说「0 个新任务」——人不是被训练忽略，是被告知跳过。**不建机器阈值。**这是原理一的第三次实例：提醒手上能拿到数字，却只说「该跑了」。

**meta-loop 恒为 HITL，不进任何无人值守档位**，与票 08 的档位裁决**无关**（不构成依赖）。理由：meta-loop 的产出是**对循环自身规则的修改**；让它无人值守 = 循环在没人看的时候重写自己的规则。07 的信任链整条建立在「人能当场否认那句『用户要求的』」上，其雾区条目写死「无人值守 = 没人能当场否认」。**这是把 reward hacking 的靶子挪到裁判席上。**

### 决议 6：产出物形态改进不并入 meta-loop 职责

**一个职责归谁，取决于谁手里有判它的证据。**产出物形态的裁决问题是「这份报告/记录服不服务 owner 的复盘」——证据**不在账本里**：账本记的是任务的事实，没有「owner 有没有看懂/用上」这一行。**与决议 1 的幸存者偏差同构。**

证据实际在**人的反应**里。而「品味型交付物 + 预注册 rubric + 人的显式验收作为终结动词」**是 judgmentloop 的形状，一字不差，且 judgmentloop 已在内核**——塞进 meta-loop 等于在内核里复制一份 judgmentloop。用决议 4 的判据检验：产出物形态不是 runtime 与 meta-loop 共同作者化的核心契约，也不从那条路进内核。且决议 1 已把「人还在做机器活」连同语料透镜移出内核，**产出物形态正是那个问题的实例，跟着走**。

### 决议 7：跑一轮的纪律不自造，按 candidate 性质交棒

决议 4 判据的对偶：**既定契约的消费者不该重定义契约。**现存 skill 第 4/5 步的每一条今天都已在机器里：

| 现存文本条款 | 今天住在哪 |
|---|---|
| baseline → narrowest edit → re-validate | **workloop 的形状** |
| independent falsification when high-stakes | **07 裁的机器风险地板**（`machineRiskFloor`，不可豁免） |
| Never batch candidates into one round | **runtime 单任务模型**——一次只能开一个 task |
| never accept on the author's re-read | **review floor** |
| filed as provisional with the evidence gap named | **`accept-proof-gap` → `proof.state: provisional`**（`历史任务状态运行时:109`） |

**meta-loop 自己的原则判了自己第 4/5 步的死刑**——它写着「**Rules default into the machine, not prose**」。那两步整段是散文重述已在机器里的规则：**第二处真相源，必然漂移**（与决议 3 否掉 (c) 同理：那里是 schema 知识第二处，这里是纪律知识第二处）。

裁决：v2 不定义跑一轮的纪律。出 candidate 后交棒——**有机器判据的交 workloop，品味型的交 judgmentloop**。

### 决议 8：去重基线 = 账本本身；`rework-log.md` 删除

接上决议 7 + 05 的「动手前开单为纪律」：**每个被处理的 candidate 都必然成单，每个单都必然在账本里留行。**于是：

| 要记住的 | 账本 |
|---|---|
| **修好了的病** | 不需要记——**信号自己消失了** |
| **试过但失败的修法** | 记得住——账本里一条 `abandon --reason` / `not-needed --evidence` 的单 |
| **想过但没开单的候选** | 不该记住——信号还在就该被重提，且是带着更多数据重提 |

第三行是关键：老文本写「filed as provisional... so the next monthly run picks them up **instead of re-deriving them**」——**它把「重推」当浪费。它不是。**一个因证据不足被否的候选，其信号会持续存在；下月带更多数据重推它**正是循环在工作**。想避免重推 = 想让 meta-loop 记住一个它当时判错了的判断。

`rework-log.md` 是**「没有账本的时代」的产物**：asdf 时代 meta-loop 没有可复读的事实源，只能记住自己的结论。**现在账本就是记忆，而且是比结论更好的记忆——它记事实，不记当时的判断。**（原理一：记观测，别记复述。）删它不是「因为它是 asdf 的」，而是**因为它的功能已被账本吸收**。

### 决议 9：`ledger --json` 自带完整性判定；audit 三兄弟不进 skill 步骤

票面担心「skill 读哪些字段、audit 负责哪些自检，**避免重复**」。**问反了**——audit 三兄弟零解读，跟 skill 根本不重叠。真问题相反：**没有任何东西告诉 skill 它读到的数字可不可信**（投影 degrade-open，见事实 3）。

**「这些数字是多少」和「这些数字可不可信」是同一次读取的两半。**分开给，消费者就得靠一条散文纪律记得先查——决议 7 刚判过散文重述必然腐烂；而这条纪律一旦漏掉，失败模式是**自信地报错数**，正是 02 犯过的错换套衣服。

裁决：`ledger --json` 的输出**自带完整性判定**（投影是否有效、覆盖哪些 repo、各自同步到哪、有无缺口），与聚合数字一起吐。skill **不调** audit 动词，也不需要知道它们存在。`audit`/`sync-outcomes`/`audit-outcomes` 保持为**运维/修复动词**。`ledger` **只读不修**：报告缺口并点名修复动词，不自动 sync（读的动词不该写）。

**不分工，因为不重叠。要划的线在别处——完整性必须跟着数字走，而不是留给纪律。**

### 决议 10：AGENTS.md 的 kernel 定义改为「判据 + 列举」

今天 AGENTS.md 靠**列举**定义内核，所以每次有 skill 要进/出都得重吵一遍「凭什么」；charter 已因此被改过两次（07-13 加 judgmentloop、07-15 加 meta-loop），**两次都是逐案裁决，没留下判据**。而 AGENTS.md 那句 "Further loop skills ... compose through the `loop-core` contract" **已经在摸这条判据了**，只是摸的是反面，且没说出正面。

裁决：Direction and danger 节的 kernel 定义行改写为判据 + 列举，判据取决议 4 的表述。**这条判据是本票最耐久的产出**：只活在决策记录里，下次「kernel 4→5?」还是逐案吵；写进 AGENTS.md 就成了下一个 agent 能独立判的规则。

## v2 的存活清单

**存活**（五项）：① 单一问题（重述为账本口径：循环是否收敛、在哪失败、采用到什么程度）② **读聚合 → 形成病症假说**（它真正独有的那一半知识，决议 4 中与 runtime 共同作者化的那一半）③ 去标识 + 去重（去重基线 = 账本，决议 8）④ **Evidence Pointer Hygiene**（现存文本最好的部分，为一次真实事故而写）⑤ 交棒规则（candidate → workloop/judgmentloop）。

**删除**：步骤 2 语料透镜（决议 1）／步骤 4、5 的纪律（决议 7）／全部 asdf 引用（`asdf-meta-loop`、`scripts/analyze-sessions.py`、`docs/rework-log.md`、AGENTS.md evidence loop）／legacy 路径（决议 2）／`done`/`not_needed` 旧口径／indicators 1–6。

体量参照：**judgmentloop 58 行、workloop 98 行**——内核 skills 本来就薄，正因为纪律都在机器里。v2 落在这个量级是**结论正确的表现，不是缩水**。票面说的「入仓重写」名副其实：**不是搬家改引用，是几乎从零重建，只捞回三件东西。**

## 落点

- **runtime**：`ledger --json` 聚合动词（决议 3、9）。
- **skills**：`skills/meta-loop/SKILL.md` v2 重建（决议 1、5–8）。
- **host 绑定**：月度提醒携带读数（决议 5）。
- **文档**：AGENTS.md kernel 判据 + 列举（决议 10）、README、测试清单。

## 迁移面清单（票面 item 6 逐条结论）

| # | 项 | 结论 |
|---|---|---|
| ① | AGENTS.md Start and verify 三 skill 列举 | 加 meta-loop，机械 |
| ② | AGENTS.md Direction and danger kernel 定义行 + "Further loop skills…" 句 | **改判据 + 列举**（决议 10），非机械改「三→四」 |
| ③ | `tests/skills.test.mjs:7` + `tests/installer.test.mjs:20` 硬编码清单 | 加 `skills/meta-loop`，机械 |
| ④ | `README.md:133-134` | 已核实确实滞后（只列 runtime/loop-core/workloop，缺 judgmentloop），一并修正并纳入 meta-loop |
| ⑤ | `map.md:12` 四 skills 口径 | **已生效**（02 关单时已改），复核通过 |

**票面 item 5「可移植性合规」被前述裁决自动满足**，无需单裁：fold 进动词（决议 3）→ v2 是纯 Markdown 不带脚本；asdf 引用全删（决议 7、8）→ 无源项目泄漏；v2 不点名任何账本文件（它调动词）→ `skills.test.mjs:22` 的 v1/v2 路径禁令天然不触发。

## 排序约束（交 #04）

1. **`ledger` 动词必须先于 v2 文本落地**，否则 v2 引用一个不存在的动词。
2. **且这一条今天没有测试押住**：`skills.test.mjs` 检查 skill 里的相对链接不断，**但不检查 skill 提到的动词存在**。v2 绑动词契约的全部价值建立在「绑定会被测试押住」上（决议 3 否掉 (c) 的理由），故须补一条断言：**skill 文本引用的 CLI 动词必须在 runtime 里存在**。
3. **动词可以晚建而不丢数据**：事件是耐久的，fold 任何时候都能补算（这正是决议 2 敢弃用的同一条 v3 性质）。故本票裁**契约**，落地时机交 #04。

## 对既有裁决的更正

**05 交给 #04 的「消费者必须按 schema 发现账本，不能按文件名硬编码」一项可以撤。**决议 3 之下 skill **根本不碰文件**——它调动词。这比 05 要求的修法更强：不是「让消费者学会发现文件」，是「消费者没有文件可发现」。

**决议 2 与决议 3 咬合而非冲突**：弃用了语料，聚合契约怎么知道该聚合什么？**因为 05/06/07 收割的恰恰是这一半**——弃用的是数据，留下的是「该问什么」，而聚合契约需要的正是后者。

## 移交

- **票 13（新出票）**：采用观测入账本——untracked 从瞬态 nudge 到事件流（决议 1 的后半，runtime 落点）。
- **雾区更正**：「复盘面/产出物形态改进——由 meta-loop 收割改进候选」**立论错误**（决议 6）——账本里没有它，meta-loop 收割不到；「等 meta-loop v2 能读账本」是**假依赖**。正确 graduate 条件改为「出现 owner 对某份具体产出物不满意的样本 → 开一张 judgmentloop 票」。

## 本记录不判定

- v2 SKILL.md 的实际文本、`ledger --json` 的字段级契约（执行，进 #04）。
- 票 13 的接线方案（那是它自己的裁决）。
- meta-loop v2 与 `ledger` 动词的落地时机（#04 排序）。
