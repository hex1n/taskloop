# Loop engineering 演进路线图（#04 总路线图汇编）

日期：2026-07-16
来源：[.scratch/loop-engineering-best-practice](../../.scratch/loop-engineering-best-practice/map.md) 票 [04](../../.scratch/loop-engineering-best-practice/issues/04-roadmap-assembly.md)
状态：owner 已裁（五个结构决策逐一裁定）；关单前须过 /plan-review 独立证伪

## 裁决问题

把 16 张已关维度票交进的执行项汇编成锁定路线图：优先级排序、依赖关系、每项工作可直接交给执行 session 开工的 spec 指针。执行本身不在本记录内（plan-not-do）。

## 决议 0：排序方法（雾区规定开工前先定，owner 已裁）

三层：

1. **硬约束不可违反**——同批约束（判据契约一次迁移：10+15+06；08 准入式与 14 封条准入同族）、**顺序约束**（07 的机器地板焊死【4.3】**不得先于评审面锚记录就位**——08 副产品「焊死一扇门时必须同时看另一扇」的机器可读形态：批 2 的 `agent_id` 注入与 `permission_mode` raw 记账随 M1 发布在场后，4.3 才可落地）、解锁链（13 模式梯 → PreToolUse 装回 → 12 `agent_id` 注入 → 数据积累）、v3 发布 gating（05 执行项 4）。
2. **批间顺序按「接入优先、建设殿后」**（框架决策记录已锁的第一原则）。
3. **批内不细排**——一批 = 一个可整体交给执行 session 的工作包。

**不采用**价值/成本逐项打分（维度裁决已做过一轮价值筛选，重复劳动且打分无账本证据支撑）；**不采用**纯拓扑逐项交接（同批约束表明逐项交接本身有成本——判据作者被迫迁移两次）。

v3 发布是天然里程碑，把路线图切成三波：**发布前（第一波）／发布后接入面（第二波）／建设面（第三波）**。批 4/5/6 各自完成后可随 owner 节奏发小版本，不再设强制里程碑。

## 路线图

### 第一波（v3 分支上落地，随后立即发布）

#### 批 1 判据报告契约批

同批根据：10/15 同属判据报告契约，分两批让判据作者迁移两次；06 的「话」以 15 的取材为源。

| # | 项 | 落点 | Spec |
|---|---|---|---|
| 1.1 | 专用退出码：`unsatisfied` 挪离 `exit 1`（专用号如 3）、`satisfied` 挪离 `exit 0`（专用号如 4）、`0` = 没说话、禁透传；`open_requirement` 放行判定只认真红 | runtime（tri-state protocol、`历史任务状态运行时` open gate） | [判据传输形态](2026-07-16-criterion-transport-form.md)决议 1/2/3 |
| 1.2 | 派发补全为按类型启动：`.mjs/.js` → `process.execPath`；`.cmd`/`.ps1`（win32）、`.sh`/shebang（posix）各自正确启动 | runtime（`lib/criterion.mjs:121`） | 同上决议 4 执行面 |
| 1.3 | 指纹与消息层取材换源：判据 stdout 约定前缀行（取最后一条匹配）→ `signature`/`failure_summary`；无则 `signature = null`（null 不参与相同判定）、`failure_summary` = tail 开头 160 | runtime（`lib/application.mjs:625-626`、`历史任务状态运行时:483-485`；`:487-489` 一字不动） | [失败指纹取材](2026-07-16-failure-signature-provenance.md)决议 2/4/5 |
| 1.4 | 三处接线：`output_tail` 接进 judgment；`remaining` 停印判据身份改印判据的话；stuck hold 带判据的话 | runtime（`历史任务状态运行时:485/489`、`lib/application.mjs:627/:633`；judgment schema 三字段不动） | [反馈质量](2026-07-15-feedback-quality-criterion-as-teacher.md)落点三条 |
| 1.5 | 判据契约文档一次定版：前缀行与提取规则（消息行不是裁决通道）＋专用退出码＋默认**推荐** `.mjs`（推荐非强制） | skills（loop-core 判据契约） | 15 决议 3、10 决议 4 |
| 1.6 | 弃置未提交恒红测试 `tests/taskloop-powershell-criterion.test.mjs`（物理删除，处置已明记于决策记录） | 仓内清理 | 10 决议 5 |

#### 批 2 传感器与身份批

同批根据：13 模式梯装回 PreToolUse 直接解锁 12 `agent_id` 注入的依赖；HOSTS.md 更正与注入代码同一知识域（owner 单独判定顺带，止损优先——该文档正在生产错误的票）。

| # | 项 | 落点 | Spec |
|---|---|---|---|
| 2.1 | 证据书：`.taskloop/` 独立追加流，记 `{seq, at, acting_session, foreign, gate, targets_parsed, during_task}`，per-session 序号；task 事件流一字不动 | runtime | [采用观测入账本](2026-07-16-adoption-observation-into-ledger.md)决议 2/3；schema 细节属执行工作 |
| 2.2 | 模式梯 `{observe, nudge, deny}`，全档位写证据书；落地后即装回 PreToolUse 停 **nudge** 档（owner 已裁）；deny 档继续等雾区「无机器判据的仓内工作」 | runtime + host 绑定 | 13 决议 4 |
| 2.3 | 过渡记录：`taskloop hooks` 装/卸/换档写过渡行；绕开动词直改 settings.json 承认看不见（unknown 计价） | runtime | 13 决议 4 |
| 2.4 | Stop census（可选便宜补强）：每次 session 停止写 `{at, session, pretooluse_armed, mode}`。**M1 非阻塞**——可选项不作为发布 gate，批 2 其余项落地即可发布 | runtime | 13 决议 5 |
| 2.5 | `agent_id` 注入：**第一落点是 `decodeHook()`（`lib/host-hooks.mjs:16`）——该字段今天在此边界被丢弃**，须先解析保留，注入时优先取它（在场时）。解析对全部三个显式 profile（`claude`/`codex-safe`/`codex-cli-legacy`）统一生效，legacy 不排除；票 12 的「双宿主对称」指 Claude/Codex 两**宿主**的 payload 语义，非只改两个 profile。**两种身份不得互换（执行约束）**：`decodeHook()` 把 `agentId` 作为**并列新增字段**返回，`sessionId` 一字不动——所有权语义（`episodes.host_session_id`、foreign 判定 `application.mjs:75/:907`、owner contact）**继续用宿主 `session_id`**（票 12：subagent 与父同 session_id、恒非 foreign 是**正确**行为，换成 `agent_id` 会把 subagent 误判 foreign、改变 envelope 语义）；行动者锚（`actingSession` 记账 `:922`、CLI 注入、评审/认领可查询字段）用 `agentId ?? sessionId`。v3 已记 `acting_session`，零 schema 变更 | runtime（`lib/host-hooks.mjs:16`、`lib/application.mjs:102-118`） | [评审独立性锚点](2026-07-16-review-independence-anchor.md)决议 4 |
| 2.6 | HOSTS.md 两处更正：`:31-33`「subagents are foreign sessions」实测为假；`:61-62` 结论过时（PR #22882 已补 `agent_id`）。更正方向：session 身份两宿主都区分不了 subagent，`agent_id` 两宿主都能 | 文档（`skills/loop-core/HOSTS.md`） | 12 决议 6 |
| 2.7 | `permission_mode` 解析与 raw 记账：`decodeHook()` 以**并列新增字段** `permissionModeRaw` 返回该字段（今天零解析；与 2.5 的身份拆分同一约束——不占用、不改写现有字段），适配器 raw 值原样记账——与 2.5 同触一块解析/注入代码，对三个显式 profile 统一生效。二元投影的**消费**归批 6（6.4）。**本批 spec 必须写明 raw 的耐久落点与查询键**（写进哪本账、绑定哪类事件/证据行）。**最小验证（本批验收标准）**：`decodeHook()` 单测覆盖 `agentId`/`permissionModeRaw` 并列字段保留且 `sessionId` 语义不变；hook 集成测试证明样例 payload 经批 2 后在耐久账/证据书中按查询键可查；6.4 届时只读投影、不得重新发明 raw 记账 | runtime（`lib/host-hooks.mjs:16`、适配器注入） | 票 [17](../../.scratch/loop-engineering-best-practice/issues/17-host-key-observability.md) 答复 3 前半（raw 记账） |

#### 里程碑 M1：v3 发布

- **Gating 修复（发布前必须处理）**：owner `~/.claude/settings.json` 无参数调用 `node ~/bin/taskloop.mjs`；v3 的 `hook --profile` 契约下无参数调用判成 profile `unknown` → Stop hold 静默降级（`lib/host-hooks.mjs:60-62`）→ stop gate 静默失牙。处置：发布/迁移流程必须引导 owner 用 `hook --profile claude` 重生成配方（[工作流接入](2026-07-15-workflow-adoption-criterion-handoff.md)执行项 4）。
- 发布动作：合并 `agent/schema-v3-event-sourcing`、release、owner 重装 + 重生成 hook 配方 + PreToolUse 以 nudge 档就位。
- 里程碑效果：账本续流（断流自 07-14）；`agent_id`/`permission_mode` 原始数据开始积累——07 的零评审重算与 12 决裁项 3 的数据窗口自此打开。

### 第二波（发布后，接入面）

#### 批 3 纪律文本批

纯文本，让刚发布的契约可用；接入面故最先。

| # | 项 | 落点 | Spec |
|---|---|---|---|
| 3.1 | workloop 两条纪律声明：「动手前开单」＋「排查类工作默认 deferred_witness 红检查先行 + 逃生舱」；保持 host-neutral、不点名外部 skill | skills（`skills/workloop/SKILL.md`） | [工作流接入](2026-07-15-workflow-adoption-criterion-handoff.md)决议 1/3 |
| 3.2 | 封条形态准入规则：开单时问「业务真相机器今晚够得着吗」，够不着 → 显式选封条形态（机器半边判据 + 绑定检查 + 收据计划 + 预告 acceptance 路径）；与 08 准入式（「判据今晚能否无人开火」）同族合并成文 | skills（workloop/planning 文档） | [封条形态](2026-07-16-unreachable-business-truth-seal.md)决议 4；[过夜配方](2026-07-15-overnight-unattended-recipe.md)决议 2 |
| 3.3 | 判据写作三禁 ＋ 理由行纪律并轨：判据不读 agent 可写的 verdict 字段；红见证供给侧归机器半边；收据绑定用指纹不用字段；理由行禁时间戳/随机 id/流水路径 | skills（loop-core 判据纪律） | 14 决议 1；15 决议 3 配套 |
| 3.4 | 收据入 git：封条类任务证据文件必须提交，评审收据连同版本史 | skills（planning/evidence 规范） | 14 决议 3 |
| 3.5 | 过夜配方成文：准入式（人判，不造闸门）＋档 1（交互式会话 + `/sandbox` + Stop 闸门）＋预算（`--rounds 30`，不设 wall-clock/token）＋ D2（早晨评审即终态）为意图形态 | skills / HOSTS 配方 | [过夜配方](2026-07-15-overnight-unattended-recipe.md)决议 1–5 |
| 3.6 | **【仓外】** planning skills 产出约定：计划自带 done-when + 可执行检查 + envelope。owner 用户级 skills，不进 taskloop 仓，平行轨道不占批次顺序 | 仓外 | 05 决议 2 |

#### 独立小项：A3 控制面摩擦测量

便宜测量项，与各批无依赖，第二波内随时可做：stop gate 字符串匹配误判 = 生命周期事件被静默丢掉或写入漏 gate，是 stop gate 自己那件工作上的正确性缺口。测量结果决定 application service 是否立项。Spec：[Gate 0 裁决记录](2026-07-16-supervisor-charter-gate0-verdict.md)残值表。

#### 批 4 信任链批

同为 task-engine 风险/保障面。**决议 0 的顺序约束在此结算**：4.3 依赖批 2 的锚记录（`agent_id` 注入 + `permission_mode` raw 记账）已随 M1 发布在场——评审事件的作者身份与宿主钥匙状态已是可查记账，08 副产品「焊死一扇门时必须同时看另一扇」由此满足；16 的「无锚声称」查询类（批 6）是消费层增强，不是这扇门的前提。**4.3 开工前检查项（执行 session 必查）**：确认批 2 的两项锚记录已随 M1 发布**且账本/证据书中已出现可查询样本**；不满足则 4.3 顺延到批 6 与「无锚声称」查询类同批落地。

| # | 项 | 落点 | Spec |
|---|---|---|---|
| 4.1 | 刻度重写：`provenance` 与 `input_coverage` 退出证明分级；新增 `criterion.authored_by`（沿用 `granted_by` 词汇） | runtime（`lib/criterion.mjs`） | [信任链](2026-07-15-trust-chain-authorship-review.md)执行项 1 |
| 4.2 | 缺口判定改为仅时序违规（动工后 amend） | runtime（`历史任务状态运行时:102-105`） | 07 执行项 2 |
| 4.3 | 机器地板不可豁免：`waived` 早返回下沉，`machineRiskFloor` 必须先算；豁免只作用于 `declared_risk` | runtime（`历史任务状态运行时:148`） | 07 执行项 3 |
| 4.4 | `task_amended` 事件补 `artifact_revision`（`> 0` 即「动工后」的机器可读形态）——4.2 的时序线没有它答不了 | runtime（schema） | 07 执行项 4 |
| 4.5 | 11 守卫最小修：去掉 `machineRiskFloor` reasons 上的 `&& risk === "routine"` 守卫；判级恒等可证、纯记账修复；v3 读时投影自动追溯全历史（晚做不丢数据，故不抢第一波） | runtime（`历史任务状态运行时:130-131`） | [风险地板口径](2026-07-16-risk-floor-calibration.md)决议 3 |

### 第三波（建设面，殿后）

#### 批 5 观测收口批

批内顺序硬约束（09）：`ledger` 动词先于 meta-loop v2 文本。

| # | 项 | 落点 | Spec |
|---|---|---|---|
| 5.1 | `ledger --json` 聚合动词，自带完整性输出；字段级契约属执行工作 | runtime | [meta-loop v2 spec](2026-07-15-meta-loop-v2-kernel-spec.md)决议 3/9 |
| 5.2 | fold 扩展：`ledger --json` 合并证据书；完整性一等输出四样（武装状态+档位、过渡记录、序号跳空/重置、covered/gapped/unknown 覆盖判定） | runtime | 13 决议 3/5 |
| 5.3 | 测试断言：skill 文本引用的 CLI 动词必须在 runtime 里存在（v2 绑动词契约的价值靠它押住） | tests | 09 排序约束 2 |
| 5.4 | meta-loop v2 SKILL.md 重建（五件存活项，体量对标 58–98 行）；host 绑定：月度提醒携带增量读数 | skills + host 绑定 | 09 决议 1、5–8 |
| 5.5 | AGENTS.md kernel 定义**改判据 + 列举**；Start-and-verify 列举加 meta-loop；`tests/skills.test.mjs:7` 与 `tests/installer.test.mjs:20` 清单加 meta-loop；`README.md:133-134` 修正滞后并纳入 | 文档 + tests | 09 决议 10 + 迁移面清单①–④ |

#### 批 6 两账拆分批

最重建设，殿后；届时有发布后新账本校准 fold 口径。

| # | 项 | 落点 | Spec |
|---|---|---|---|
| 6.1 | 两账拆分完整 spec：不可逆 grant kind 归类（publish 确定在内；destructive/git 按「撤得回吗」逐一归类）；关单地板 = 纯账 A = 缺口 × 实得赌注（v3 fold 口径：touched files、实际写入根、命令形状）；锚记录 schema 位；「无锚声称」查询类定义 | runtime（`历史任务状态运行时` 地板重构） | [两个门的输入认识论](2026-07-16-gate-input-epistemology.md)决议 1/2/4/5 |
| 6.2 | 「写入不可归因」升格为缺口信号：`["<command>"]` 按「看不清」抬缺口，含糊计价 | runtime（`lib/application.mjs:950` 消费侧） | 16 决议 3 |
| 6.3 | `change_classes` 并轨 `declared_risk`：废独立法律效力，词表降为结构化 reason；path→class 住消费者层 | runtime | 16 决议 4 |
| 6.4 | `permission_mode` 锚的**消费面**：内核只消费 `bypassPermissions`/其他 二元投影（唯一双宿主对称锚；细档位 Codex 侧恒定错值不可押；**raw 记账已在批 2.7，本项届时有 M1 以来的真实分布可校准**）。sandbox 轴双宿主不进 payload——处置（进程/文件系统级探测或接受不可观测）spec 时定 | runtime | 票 [17](../../.scratch/loop-engineering-best-practice/issues/17-host-key-observability.md) + findings（`research/host-key-observability` 分支） |

## 依赖图（批间）

```
批 1 契约批 ──┐
批 2 传感器批 ─┤→ M1 v3 发布（gating 修复为发布前置）
              │
M1 ──→ 批 3 纪律文本（接入面收尾；3.2/3.3 引用批 1 定版的判据契约）
M1 ──→ A3 测量（独立）
M1 ──→ 批 4 信任链；其中批 2 锚记账（agent_id 注入 + permission_mode raw）──→ 4.3 地板焊死（决议 0 顺序约束）
批 2 证据书 ──→ 批 5 fold 扩展（事件耐久，动词晚建不丢数据）
批 5 动词 ──→ 批 5 v2 文本（批内硬顺序）
M1 数据积累 ──→ 批 6 实得赌注 fold 口径（用发布后新账本校准）
批 2.7 raw 记账 ──→ 批 6.4 二元投影消费（届时有 M1 以来真实分布可校准）
```

## 记入的取舍与不判定

- **07 的零评审重算、12 决裁项 3 的真实数字**：等 M1 后数据积累，不在本路线图内设检查点——那是 meta-loop（批 5 之后）月度节奏的活。
- **决议 0 顺序约束若被证伪**（批 2 的 `agent_id` + `permission_mode` raw 记账不足以看住 `review` 那扇门），4.3 顺延到批 6 与「无锚声称」查询类同批——该风险已显式记录。（本条经 plan-review round 1 审查：约束从「同批看」重述为顺序约束，源自 08 原文「焊死一扇门时必须**同时看**另一扇」的语义——要求焊门时另一扇门已有锚在记账，非字面同批。）
- **雾区各条不进路线图**：graduate 条件已在地图逐条写死（档 2 双铃、工作面打回样本、产出物不满意样本、`many_touched_files` 首次开火、无机器判据仓内工作的观测行积累、人-面/模型-面锚出现）。它们 graduate 时按地图规则开新票，不改本路线图。
- **已撤销项**：05「账本消费者按 schema 发现」（09 撤——skill 调动词不碰文件）。
- 各项的具体实现（措辞、字段名、测试内容）归执行 session；本记录只锁「做什么、什么顺序、按哪份 spec」。
