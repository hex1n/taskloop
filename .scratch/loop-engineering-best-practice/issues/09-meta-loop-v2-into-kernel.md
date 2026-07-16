# 09 — meta-loop v2 入仓重写

Type: grilling
Status: resolved
Blocked by: 02

## Question

维度 11（度量与元循环）的裁决。charter 修正案已由 owner 确认（2026-07-15）：内核 3→4 skills（+meta-loop），理由 schema 共居（meta-loop 的第一输入是 outcome 账本行格式——当前契约 `~/.taskloop/outcomes-v3.jsonl`，schema owner 是本仓库）。本票裁 v2 的 spec：

1. **de-asdf 化**：现存用户级 meta-loop（`~/.claude/skills/meta-loop`）里的旧项目引用（`asdf-meta-loop` 定时任务名、asdf 语料路径、legacy 账本路径 `~/.taskloop/outcomes.jsonl`）清什么、留什么。
2. **读什么**：以当前契约 `~/.taskloop/outcomes-v3.jsonl`（`lib/prims.mjs:25` `OUTCOME_PROJECTION_FILE`）为准的账本字段清单与 `audit` 动词的分工——skill 文本读哪些字段、audit 负责哪些自检，避免重复；legacy `outcomes.jsonl` 语料（07-07~07-10，本机现存唯一语料）如何处置（迁移/只读归档/弃用）一并裁决。注意 `tests/skills.test.mjs:21` 拒绝旧口径字样——v2 文本只能写 v3 路径。
3. **定时触发**：替换 `asdf-meta-loop` 旧线的新接法（触发存活性验证是票 05 的 task 项，本票裁目标形态）。
4. **职责边界**：产出物形态改进（报告/记录形态是否服务 owner 复盘）是否并入 meta-loop 职责。
5. **可移植性合规**：入仓后须满足 AGENTS.md 的 portable-skill 纪律（不泄源项目名/路径/session id；Markdown + 标准库）。
6. **charter 迁移面清单**（spec 必须逐条给出替换/处理文本）：① AGENTS.md Start and verify 节的三 skill 列举；② Direction and danger 节的 kernel 定义行与 "Further loop skills and their skill-specific tools live in their own repositories" 句（须改写为「内核四 skills 之外」口径）；③ installer 分发自动（`install.mjs` 动态枚举 `skills/`）但测试不自动——`tests/skills.test.mjs:7` 与 `tests/installer.test.mjs:20` 两处硬编码清单须显式加入 meta-loop；④ `README.md:133-134` 安装分发描述（现滞后 judgmentloop）一并修正并纳入 meta-loop；⑤ 本图 `map.md:12` Notes 行的三 skills 口径由 ticket 02 关单时的地图更新改写为四 skills，spec 复核其已生效即可。

重写本身是执行，进路线图（#04），本图 plan-not-do。AGENTS.md charter 行更新同为执行动作。

上下文：[维度框架决策记录](../../../docs/decisions/2026-07-15-loop-engineering-dimension-framework.md)

## Answer

**票面设想（搬家 + 改引用）被核实推翻**：现存 skill 的每一个输入要么已死、要么形状已变。v2 是几乎从零重建，只捞回三件东西。详见 [meta-loop v2 入仓 spec 决策记录](../../../docs/decisions/2026-07-15-meta-loop-v2-kernel-spec.md)（owner 九问九认）。

**推翻票面的三处事实**：① **断代不在票面以为的地方**——真正的断代是 v1→v2（07-13 已发生），账本从「每任务一行的指标表」变成**事件镜像**；票面所有「字段清单」在 v2/v3 里都不再作为字段存在，必须 fold，而 fold **今天无主**（`report` 只读当前单任务，`lib/` 无任何跨任务聚合）。② **语料透镜是死代码**——`analyze-sessions.py` 在整个 `~/.claude` 下不存在，步骤 2 的工具从来没在 skill 手里过。③ **投影 degrade-open**（`application.mjs:415-416`）——账本可以静默残缺，而没有任何东西告诉 skill 它读到的数字可不可信。

**两条根原理**：**机器可计算的确定性函数不该由 actor 复述**（06/07 的共同上位式）；**必须一起改的东西必须一起发**。

**十条决议**：① 身份 = 账本读者、语料透镜出仓（语料 schema owner 是 host，按 cohabitation 论据自己的逻辑不该跟进），但采用必须是账本里的机器观测 → 移交 13 ② 两个死语料**弃用为输入、原地留证**（迁移 = 拿投影完整性换 31 行历史 = **为了让 meta-loop 有历史读而伪造它赖以信任历史的链，自噬**；且 31 个任务已被 05/06/07 榨干，v3 是最后一次杀语料的迁移）③ **fold 归 runtime 聚合动词** `ledger --json`（(a) 手折把会犯错的 actor 放在纯函数位置——本图 3/4 张票出过账本误读；(c) 自带脚本合法但重实现一份 schema 知识 = **(a) 的病延后发作**）④ **入仓理由改判**（见下）⑤ 触发 = 日历轮询 + **提醒携带增量读数** + **恒 HITL 不进无人值守**（能改自己规则的循环无人值守 = 把 reward hacking 靶子挪到裁判席；与 08 无依赖）⑥ 产出物形态**不并入**（证据在人的反应里不在账本里，且它是 judgmentloop 的形状一字不差）⑦ 跑一轮的纪律**不自造**——五条今天全在机器里，**meta-loop 自己的「Rules default into the machine, not prose」判了自己第 4/5 步的死刑** ⑧ **去重基线 = 账本本身**，`rework-log.md` 删除（它是「没有账本的时代」的产物；「重推」不是浪费，是循环在工作）⑨ **`ledger --json` 自带完整性判定**——票面「避免重复」问反了，audit 三兄弟零解读根本不重叠，真问题是没人告诉 skill 数字可不可信 ⑩ AGENTS.md kernel 定义改**判据 + 列举**。

**最耐久的产出——一条判据**：决议 3 抽掉了 charter 修正案的立论（fold 进动词后 meta-loop 不再碰行格式，它绑 CLI 契约，和 workloop 绑 `open/achieve/status` 一模一样）。按「必须一起改的东西必须一起发」重推：**聚合契约无法由 runtime 单独推出**——runtime 知道自己记了哪些事实，但不知道哪些聚合是循环病症的诊断指标；「所有可导出的聚合」无界，runtime 必须选，选就需要 meta-loop 那一半知识。

> **内核 = 与 runtime 共同作者化核心契约的 skills**（两边各持一半知识、谁也不能单独定义它）；**消费既定契约的 loop skills 住自己仓库**。

该判据独立复现了现有三成员，并**解释了病因**：user-level meta-loop 烂掉不是因为地址错，而是**它是共同作者却住在外面**——没有聚合契约可消费，被迫绑生 schema，且无测试押住绑定。**「schema 共居」是对的观察、错的抽象**：共居的不该是 schema，是**契约的作者身份**。结论不变（入仓），立论重述——与 06/07 同形。

**存活五项**（单一问题重述／读聚合成病症假说／去标识去重／Evidence Pointer Hygiene／交棒规则）；体量参照 judgmentloop 58 行、workloop 98 行——**内核 skills 本来就薄，因为纪律都在机器里**。

**迁移面**：①③④ 机械（④ 已核实确实滞后 judgmentloop）；② 改判据 + 列举；⑤ 已生效复核通过；**item 5 可移植性合规被前述裁决自动满足**（纯 Markdown、无 asdf 引用、不点名账本文件）。

**更正 05**：其交给 #04 的「消费者必须按 schema 发现账本」一项**可撤**——决议 3 之下 skill 根本不碰文件。

**移交**：票 13（采用观测入账本）；雾区「产出物形态由 meta-loop 收割」**立论错误**，改为等一次不满意 → judgmentloop 票。**维度 11 就此裁完。**
