# Loop Engineering 维度框架（第一性推导）

> 日期：2026-07-15
> 状态：决策记录；owner 已逐项确认（wayfinder ticket 02 的 grilling 裁决）
> 来源 ticket：[02 — 第一性推导 loop engineering 维度框架](../../.scratch/loop-engineering-best-practice/issues/02-first-principles-dimension-framework.md)
> 证据集：[01 — 2026-07 一手证据调研](../../.scratch/loop-engineering-best-practice/issues/01-loop-engineering-evidence-refresh.md)（41 条，仅作反例校验，不作推导起点）

## 根问题（学科中立版）

> 一个有限、不可全信的 actor 在环境里反复行动，如何让循环以可接受的成本收敛到经证实的目标态，或及时正确地停止。

## 方法论：两层框架

**第一层（学科层）对 taskloop 失明推导**：从循环的解剖结构（目标 → 行动 → 观察/反馈 → 裁决 → 下一轮决策 → 状态存续，外加安全包络、人的位置、全局度量）推出维度；推导过程不引用 taskloop 的任何机制或边界。

**第二层（taskloop 覆盖层）**：每个维度标注 taskloop 的立场——拥有 / 共担 / 让渡给宿主——然后才是现状、差距、价值门禁。**让渡也是决策，必须出现在框架里被审视。**

### 推导链（学科层，全程不引用 taskloop）

循环的最小闭环：**目标 →（context 载入）→ 行动 → 环境变化 → 观察/反馈 → 裁决 → 下一轮/停止 →（状态存续）→ 重复**。闭环之外有五个横切前提：actor 不可全信、actor 记忆有限、actor 可有多实例、人存在于系统边界上、成本有限。对闭环的每个节点/边与每个横切前提问「这里的工程决策是什么」，逐部位枚举：

| 解剖部位 | 工程问题 | 维度 |
|---|---|---|
| 目标节点 | 追什么、什么算到、怎么切成循环大小 | 1 目标与判据 |
| 行动边 | actor 拿什么行动（工具/prompt/模型） | 2 行动面 |
| 观察/反馈边 | 每轮回来什么信号、能否让下轮更好 | 3 反馈与收敛 |
| 裁决节点 | 谁判完成、凭什么可信（前提：不可全信） | 4 裁决与信任 |
| 下一轮/停止边 | 下轮为何发生、何时停（前提：成本有限） | 5 迭代控制 |
| 行动的许可边界 | 能碰什么、护栏强度 | 6 授权与安全 |
| 状态存续边 | 轮间/崩溃间事实不丢不重 | 7 状态与恢复 |
| context 载入边 | actor 每轮带什么（前提：记忆有限） | 8 Context 管理 |
| 多实例前提 | 几只手同时动、怎么协调 | 9 并行与多 actor |
| 人的边界前提 | 人在哪介入、怎么被拉回来 | 10 人的位置 |
| 成本/全局前提 | 循环整体值不值、怎么证明与改进 | 11 度量与元循环 |

**完备性**：闭环节点/边与横切前提逐一对应后无剩余部位；主张新维度者须指出它长在哪个部位。**独立性检验**（推导后事后做，非推导输入）：若框架是从 taskloop 反推的，它不会生成 taskloop 不拥有的维度——而维度 2/8 在覆盖层标注为「让渡」、维度 3 收纳了 taskloop 打回通道之外的信号质量问题，且证据集 #9/#10b/#11a/#12 恰好落进这些格（映射见附录）。

方法论教训（本次推导第一版被 owner 当场推翻的原因，记录以防复发）：第一版根问题表述实为 taskloop charter 的转写，「刻意排除」段照抄了 taskloop 的分层边界——用被评估对象的使命宣言当推导起点，推出的维度天然给它打高分，且看不见它让渡掉的维度。两层结构是对此的修复：证据是修复后新增的维度 2/3 恰好接住了旧骨架无家可归的证据条目（#9、#10、#11、#12）。

## 价值门禁基准（全框架统一）

- **受益人：owner 单人日常真实工作**。不以「产品完整性」「业界对标」为由过门禁。
- **证据基准**：本机账本 46 行（2026-07-07 ～ 07-10，21 个终态任务，含真实业务仓库工作），采用自 07-10 断流。
- **证据标准**：便宜的接入/纪律项凭推理放行；**重建设项（supervisor tracer bullet 量级）一律要求恢复采用后的新增账本数据**。路线图第一优先级由此自动确定：接入优先，建设殿后。

## 落点轴（第二根轴）

每个维度 ticket 裁决时必须声明落点：**runtime**（CLI + hooks）/ **skills**（loop-core、workloop、judgmentloop、meta-loop）/ **host 绑定**（HOSTS.md 配方）/ **文档**（决策记录）。skills 体系演进由此被逐维度覆盖，不设独立维度。owner 定义的「产出物形态」（给自己用的报告/记录形态）归维度 11。

## 账本证据（21 个终态任务）

> **⚠ 事后更正（2026-07-15，由[票 05](../../.scratch/loop-engineering-best-practice/issues/05-workflow-adoption-criterion-handoff.md) 查证发现）**：本节的语料盘点是错的。`~/.taskloop/outcomes-v2.jsonl`（53 事件、10 个终态任务、07-13→07-14、含 6 个真实业务仓任务）被漏读，「legacy 是现存唯一语料」与「采用自 07-10 断流」均不成立——07-13 的重装把账本从 `outcomes.jsonl` 换成了 `outcomes-v2.jsonl`，本节把一次 schema 迁移误读成了采用崩塌。**受影响的结论**：下表「循环几乎从不循环」仍成立（新窗口 9/10 rounds=0），故各维度判决与出票结论全部不变；但「关单前独立评审纪律实际为零」被证否（业务仓 4/4 achieved 均带 `fresh_context`），票 07 立论的一半需重述。完整读数与影响分析见[工作流接入与判据交接决策记录](2026-07-15-workflow-adoption-criterion-handoff.md)证据修正节。是否就更正后的证据重跑 /plan-review，待 owner 决定。

语料出处：legacy `~/.taskloop/outcomes.jsonl`（asdf 时代账本）。当前分支的 runtime 契约已是 `~/.taskloop/outcomes-v3.jsonl`（`lib/prims.mjs:25`），但本机尚无该文件——v3 投影还没在本机产出，legacy 文件是现存唯一语料。

| 指标 | 分布 | 含义 |
|---|---|---|
| rounds | 19 个 rounds=0、1 个 =1、1 个 =5 | 循环几乎从不循环；stop-gate 的打回压力基本未被行使 |
| review_level | 19 none、1 fresh-context、1 self-reread | 关单前独立评审纪律实际为零 |
| criterion_input_drift | 真实触发 2 次 | 防作弊机制在真实工作中开过火，不是摆设 |
| self_granted | 0 | 无自授权扩权 |
| episodes>1 | 3 个任务 | 跨 session 恢复被真实用过 |

rounds=0 的良性解释（计划切片好、一遍过）与恶性解释（掐点开单、判据事后补记账）账本无法区分；owner 未表态，留给接入 ticket 裁决。

## 十一维度与判决

| # | 维度 | 裁决问题 | taskloop 立场 | 判决 |
|---|---|---|---|---|
| 1 | 目标与判据 | 什么算完成？目标怎么冻结成可查规格、怎么切成 loop 大小？ | 判据半边拥有；切片半边靠上游 skills | **票 05**（工作流接入与判据交接） |
| 2 | 行动面 | actor 拿什么行动：工具/ACI、prompt、模型 | 工具/模型让渡；prompt 层以 skills 共担 | **关闭**：让渡照旧，skills 随落点轴演进；owner 证实无反例体验 |
| 3 | 反馈与收敛 | 每轮回来什么信号，能否让下一轮更好？ | 共担：打回通道（closure + 300 字符尾部 + remaining）归 taskloop | **票 06**，Blocked by 05：等 rounds>0 数据 |
| 4 | 裁决与信任 | 谁判完成、凭什么可信、防作弊 | 拥有（核心资产层） | **票 07**，Blocked by 05：作者溯源盲区 + 评审纪律 |
| 5 | 迭代控制 | 下一轮为何发生、何时停、预算止损 | 停止/预算拥有；驱动让渡；next-work 无人拥有 | 停止半边**关闭**（P0/P1 已落地）；驱动半边归 **#03**（增补 Blocked by 05） |
| 6 | 授权与安全 | 能碰什么、护栏强度档位 | 协作式护栏拥有；对抗式墙让渡宿主沙箱 | **票 08**（过夜无人值守配方；无前置阻塞、frontier 直取，但作为维度决策票仍阻塞 #04）；档 2 进雾区 |
| 7 | 状态与恢复 | 轮间/崩溃间事实不丢不重 | 拥有（事件溯源、锁、快照） | **关闭**：达标，无差距；#03 若翻盘再扩展 |
| 8 | Context 管理 | actor 每轮带什么 | 让渡（只做错误尾部回注 + resume banner） | **关闭**：让渡照旧；ResumePacket 归 #03 |
| 9 | 并行与多 actor | 几只手同时动、怎么协调 | 状态锁拥有；编排明确不做 | **关闭 + 边界写死**：单写入者 + 只读评审是唯一认可形态，编排（多 worker/任务图/lease）不建设 |
| 10 | 人的位置 | 人在哪介入、怎么被拉回来 | 共担（needs_input、人独占动词、git 双闸、grant 溯源） | **关闭**：机制齐备；拉回路径挂靠票 08 的早晨验收面 |
| 11 | 度量与元循环 | 循环好不好怎么证明、产出物形态、改进闭环 | 拥有账本/audit/报告；改进闭环由 meta-loop skill 承载 | **票 09**（meta-loop v2 入仓重写）+ **charter 修正案**（下节） |

### 维度 4 的已证实盲区（票 07 的背景）

判据溯源按路径判而非按作者判（`lib/criterion.mjs:178-182`）：判据文件在 state-dir 下才标 `state_dir`，在仓库内一律标 `repo` 受信。agent 本 session 现写检查器进仓库再当判据，弱判据闸门不拦。机制群防「改传感器」（指纹），防不住「一开始就造宽松传感器且无人复核」。

证据分层如实标注：账本**可证**的是 19/21 终态任务 review_level=none；「判据一般由 agent 开工时自己组织」是 **owner 自述**（2026-07-15 grilling），账本字段无法证明判据作者——作者归因的核实正是票 07 第 1 问。

### charter 修正案（owner 2026-07-15 确认）

内核从三 skills 扩为四：loop-core、workloop、judgmentloop、**meta-loop**。理由是 schema 共居：meta-loop 的第一输入是 outcome 账本行格式，schema 的 owner 是本仓库——**当前契约为 `~/.taskloop/outcomes-v3.jsonl`**（`lib/prims.mjs:25` `OUTCOME_PROJECTION_FILE`；README:115 与 `skills/loop-core/REFERENCE.md:171` 同口径；`tests/skills.test.mjs:20-21` 要求 v3 口径并**拒绝**旧 `outcomes.jsonl` 字样）。现存用户级 meta-loop 为 asdf 时代产物：仍读 legacy `outcomes.jsonl`、定时触发名 `asdf-meta-loop`（存活未验证）——消费者已因分居而契约陈旧，这正是 schema 共居论据的活证，也是票 09 de-asdf 的首要迁移项；v2 文本须以 v3 口径书写（入列 skill-closure 清单后，`tests/skills.test.mjs:21` 会拒绝 `~/.taskloop/outcomes.jsonl` 形态的旧路径字样）。v2 spec 由票 09 裁决。

**迁移面（受影响的现行文本与测试面；第 1-4 条由票 09 的 spec 逐条给出替换/处理方案，第 5 条由 ticket 02 关单时的地图更新直接处理、票 09 复核即可）**：

1. `AGENTS.md` Start and verify 节的三 skill 列举（"the portable loop kernel skills (`skills/loop-core`, `skills/workloop`, `skills/judgmentloop`)"）；
2. `AGENTS.md` Direction and danger 节的 kernel 定义行（"taskloop ships the loop kernel: the runtime plus `loop-core`, `workloop`, and `judgmentloop`"，含 2026-07-13 charter 修订括注）及同段 "Further loop skills and their skill-specific tools live in their own repositories" 句——meta-loop 入仓后该句须改写为「内核四 skills 之外的 loop skills 住自己仓库」；
3. installer 与测试面：`install.mjs` 动态枚举 `skills/` 做 digest-proven 分发（约 772-783 行），分发侧自动；但**测试覆盖不自动**——`tests/skills.test.mjs:7` 是硬编码文件清单（现含 loop-core/workloop/judgmentloop），`tests/installer.test.mjs:20` 只断言 loop-core/workloop 安装存在。票 09 spec 须把 `skills/meta-loop` 显式加入两处清单，且 v2 文本须满足清单锚定的既有断言（相对链接、canonical 词汇、v3 账本口径）；
4. `README.md:133-134` 安装分发描述——现只列 runtime、loop-core、workloop（本已滞后于 judgmentloop），需一并修正并纳入 meta-loop；
5. 本图 `map.md` Notes 行（`.scratch/loop-engineering-best-practice/map.md:12` 现写三 skills 内核口径）——属图内文书而非仓库执行，在本次关单的地图更新中一并改写为四 skills 口径。

以上均为执行动作，进路线图（#04）；本图 plan-not-do，不在图内动 AGENTS.md。

### 边界写死（维度 9）

单写入者 + 只读评审子 agent 是唯一认可的多 actor 形态；多 worker、任务图、lease 明确不建设。依据：单人使用无多写入者压力；证据侧 2026 官方基调保守（#33、#34、#35：写入保持单线程，只读评审型子 agent 实测有效）。

## 反例校验（对 #01 的 41 条证据）

- **41/41 条证据全部有主归属维度**（逐条映射见附录），无孤儿；含多个独立主张的证据按主张拆分 a/b 各归其位（拆分规则见附录）。
- **每个维度至少一条主归属证据**，无空维度（附录按维度可查）。
- **修复的牙齿**：#9（规则化反馈解释哪条失败为何失败）、#12（验证-修复耦合）落入维度 3；#10b（人工检查编成 SKILL.md）、#11a（Codex AGENTS.md 工具约定）落入维度 2——四条在推导第一版（10 维、无反馈/行动面）中无家可归。

## 对既有 tickets 的接线变更

- **#03（supervisor charter Gate 0）**：增补 Blocked by 票 05；裁决问题补充「Gate 0 以恢复采用后的账本证据为承重假设 A1 的输入」。理由：rounds≈0 的账本对「主动 supervisor 提高长任务恢复率/正确率」没有任何证据基础，不应在无数据状态下裁 14–22 工程日量级的方向。
- **#04（总路线图汇编）**：Blocked by 扩为 02、03、05、06、07、08、09。

## 本记录不判定

- 各 graduate ticket 的答案（那是它们自己的裁决）。
- 路线图排序方法（#04 前置，留在雾区）。

## 附录：41 条证据 → 维度映射

拆分规则：一条证据含多个**独立主张**时拆为 a/b 分别归位；「主」为该主张的裁决问题所在维度（参与「每维至少一条」计数），括号内「副」为受其牵连的维度（不计数）。编号沿用证据集 `docs/research/2026-07-15-loop-engineering-evidence-refresh.md`（research 分支 `423053b`）。

| # | 证据（gist） | 主归属 | （副） |
|---|---|---|---|
| 1 | Anthropic loop engineering：turn/goal/time 停机形态 + evaluator 拦截 Stop | 5 | 4 |
| 2 | Agent SDK：max_turns/max_budget_usd 熔断 subtype 化、可续跑 | 5 | 7 |
| 3 | OpenAI Running agents：final_output 停止 + max_turns | 5 | — |
| 4 | Codex 长时程：冻结目标 +「Done when」清单 + 里程碑验证 | 1 | 3 |
| 5 | Effective harnesses：过早自称完成 → 外部结构化状态裁决 | 4 | 7 |
| 6 | Reward hacking 泛化 + inoculation prompting | 4 | — |
| 7 | Eval awareness：模型反推评测并破解答案库 | 4 | 11 |
| 8 | Contain Claude：三层防御框架收纳 eval-gaming | 6 | 4 |
| 9 | Agent SDK verify work：最好的反馈=解释哪条规则失败、为何失败 | 3 | 4 |
| 10a | 确定性/可量化判据最有效 | 1 | 4 |
| 10b | 把人工检查步骤编成 SKILL.md 让 agent 端到端自查 | 2 | — |
| 11a | Codex AGENTS.md：强制 `just test` 等工具使用约定 | 2 | — |
| 11b | UI 改动必须带 snapshot 覆盖（完成须可复核证据） | 1 | — |
| 12 | 验证-修复耦合为循环内不可跳过步骤 | 3 | — |
| 13 | Task budgets（soft hint） | 5 | — |
| 14 | max_turns/max_budget_usd 硬熔断 | 5 | — |
| 15 | 限额数值口径调整 | 5 | — |
| 16 | Codex auto-compact 阈值 + rollout budget accounting | 8 | 5 |
| 17 | turn caps 方法论化（stop after 5 tries） | 5 | — |
| 18 | Checkpointing（含 bash 改动不覆盖的边界） | 7 | — |
| 19 | Sessions：resume 作为预算耗尽/重启恢复路径 | 7 | 5 |
| 20 | SessionStore 外部存储镜像 | 7 | — |
| 21a | SQLiteSession 落盘恢复 | 7 | — |
| 21b | 审批暂停后同 session 恢复（人的介入点协议） | 10 | 7 |
| 22 | 12-factor：线程可序列化、任意点恢复 | 7 | — |
| 23 | session log 外置使 harness 可崩溃重启 | 7 | — |
| 24 | OS 级沙箱（文件+网络隔离） | 6 | — |
| 25 | 凭证 deny/mask 与默认读权限风险披露 | 6 | — |
| 26a | 沙箱能力边界 vs 审批策略正交两层 | 6 | — |
| 26b | reviewer-agent 自动化部分人工审批（agent 审 agent） | 10 | 9 |
| 27 | brain/hands/session 三分解耦（hands=沙箱为「牛」） | 6 | 7、5 |
| 28 | LLM-as-judge：单调用单打分最稳 | 11 | 4 |
| 29 | OTel：子 agent 调用链折叠进同一 trace | 11 | — |
| 30 | OpenAI Evals 平台弃用 | 11 | — |
| 31 | Claude Console eval tool 延续 | 11 | — |
| 32 | orchestrator+并行 subagent；15× token | 9 | — |
| 33 | 多 agent 适用三判据、基调转保守 | 9 | — |
| 34 | Don't build multi-agents：反并行写入 | 9 | 8 |
| 35 | 单线程写+只读评审子 agent 有效（58%） | 9 | 4 |
| 36 | 多 brain 共享 hands 池 | 9 | 6 |
| 37 | compaction/子 agent 隔离/外部笔记三手段 | 8 | — |
| 38 | compaction 不足，需显式进度文件 | 8 | 7 |
| 39 | compaction 服务端产品化 | 8 | — |
| 40 | 剩余 token 预算注入模型可感知 | 8 | 5 |
| 41 | Memory tool 多 session 交接范式（ASSUME INTERRUPTION） | 8 | 7 |

**#10b/#11a 为何归维度 2 而非 1/3/4**：#10b 的主张对象是「把人工检查编成 SKILL.md 以扩展 agent 能检查的范围」——它改变的是 actor 的行动能力面（prompt 层组件），判据规格本身是 #10a（维度 1）；#11a「不要直接跑 `cargo test`、用 `just test`」约束的是 agent **怎么行动**（工具使用约定），不是怎么被裁决（维度 4）也不是打回信号（维度 3）。

**按维度计数（主归属）**：1×3（#4、10a、11b）｜2×2（#10b、11a）｜3×2（#9、12）｜4×3（#5、6、7）｜5×7（#1、2、3、13、14、15、17）｜6×5（#8、24、25、26a、27）｜7×6（#18、19、20、21a、22、23）｜8×6（#16、37、38、39、40、41）｜9×5（#32~36）｜10×2（#21b、26b）｜11×4（#28~31）——合计 45 个主归属 = 41 条证据其中 4 条（#10、11、21、26）各拆两半，每维 ≥2。
