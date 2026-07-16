# 04 — 总路线图汇编

Type: grilling
Status: resolved
Blocked by: 02, 03, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17

## Question

把所有维度决策汇编成本图的最终交付物：优先级排序、依赖关系、每项工作可直接交给执行 session 开工的 spec 指针。随维度 tickets 从雾区 graduate，本票的 Blocked by 需同步增补——它必须是最后一张关单的 ticket。

收口：关单前必须过 /plan-review 独立证伪。

## 各票交进的执行项

<!-- 维度票裁完后把「该做什么」寄存在这里，等汇编时排序 -->

- **A3 控制面摩擦测量**（票 03 交）——独立成立：它是 stop gate 自己那件工作上的正确性缺口。
- **AGENTS.md 改判据 + 列举**（票 09 决议 10 交）——内核成员资格判据入 AGENTS.md。
- **去掉 `machineRiskFloor` reasons 上的守卫**（票 11 决议 4 交）——`lib/task-engine.mjs:130-131`；纯记账修复、判级恒等可证；依赖 v3。
- **适配器注入 `agent_id` 作为 acting 身份**（票 12 决议 4 交）——`lib/application.mjs:117-118` 注入时优先取钩子 payload 的 `agent_id`（在场时），`claude` 与 `codex-safe` 两 profile 对称；v3 已记 `acting_session` → **零 schema 变更**。**依赖：装 PreToolUse**（今天未装，等「无机器判据的仓内工作」那条雾裁完）。**排序提示**：它落地后，07 的「零评审关单」重算与票 12 决裁项 3 的真实数字才第一次有数据可攒。
- **HOSTS.md 两处更正**（票 12 决议 6 交）——**优先级须单独判**：这不是「改进」，是**仓内文档正在生产错误的票**（票 12 的立论就是从 `:31-33` 继承的）。
  - `skills/loop-core/HOSTS.md:31-33`（Claude Code）：「subagents are foreign sessions」**实测为假**（subagent 与父 session_id 逐字节相同；`isForeignSession` 对 subagent 恒 false）。连带「Join explicitly or use a separate worktree」这条建议是在教人绕一个不存在的约束。
  - `skills/loop-core/HOSTS.md:61-62`（Codex）：引文属实，但「只能当一个 ownership domain」的结论**过时**——`agent_id` 已由官方 PR #22882 补上，且就在其自称做实测的 0.144.x。
  - 更正方向：**session 身份在两个宿主上都区分不了 subagent；`agent_id` 在两个宿主上都能。**
- **证据书建设**（票 13 决议 2/3 交）——`.taskloop/` 下独立追加流（untracked 观测书），记录 `{seq, at, acting_session, foreign, gate, targets_parsed, during_task}`；per-session 序号（计数器住现有瞬态状态文件）；**task 事件流框架零改动**。隐私分层：路径 repo-local，跨仓投影只聚合。
- **模式梯 + 传感器复活**（票 13 决议 4 交）——hook 三档 `{observe, nudge, deny}`，全档位写证据书；落地后即装回 PreToolUse 停 **nudge** 档（owner 已裁）；deny 档继续等雾区「无机器判据的仓内工作」。**排序提示：它同时解锁上面票 12 `agent_id` 注入项的「依赖：装 PreToolUse」**——那条依赖不必再等雾区。
- **fold 扩展**（票 13 决议 3/5 交）——`ledger --json` 合并证据书；完整性一等输出四样：当前武装状态+档位、过渡记录、序号跳空/重置、窗口覆盖判定 covered/gapped/unknown。
- **过渡记录**（票 13 决议 4 交）——`taskloop hooks` 装/卸/换档写过渡行进证据书；绕开动词直改 settings.json 承认看不见（unknown 计价）。
- **Stop census**（票 13 决议 5 交，可选便宜补强）——Stop hook 每次 session 停止写 `{at, session, pretooluse_armed, mode}` 进证据书，把「零行」变成逐 session 在场见证。
- **封条形态准入规则**（票 14 决议 4 交）——workloop/planning skill 文档：开单时问「业务真相机器今晚够得着吗？」，够不着→显式选封条形态（机器半边判据 + 绑定检查 + 收据计划 + 预告 acceptance 路径）。**05 决议 2 由此在这类活上落地**：够不到的残余开单时如实预告，而非关单时才发现。
- **判据写作三禁**（票 14 决议 1 交）——loop-core 判据纪律：判据不读 agent 可写的 verdict 字段；红见证供给侧归机器半边；收据绑定用指纹不用字段。
- **收据入 git**（票 14 决议 3 交）——planning/evidence 规范：封条类任务的证据文件必须提交进 git，评审收据连同其版本史（A1 的收据未提交，翻转仪式因此对评审不可见）。
- **指纹与消息层取材换源**（票 15 决议 2/4/5 交）——`lib/application.mjs:625-626`：提取判据 stdout 约定前缀行（取最后一条匹配），有 → `signature = fnv1aHex(前缀行)`、`failure_summary` = 前缀行逐字；无 → `signature = null`、`failure_summary` = `output_tail` **开头** 160。`lib/task-engine.mjs:483-485` 加 null 防卫（null 不参与「相同」判定）；`:487-489` 一字不动。零 schema 变更。**排序提示：与票 10 决议 2/3（专用退出码）同批落地**——同属判据报告契约，分两批会让判据作者迁移两次。
- **前缀字符串与提取规则定版**（票 15 决议 3 交）——loop-core 判据契约文档：一行、约定前缀、取最后一条匹配行；**消息行不是裁决通道**（永不参与 verdict 判定，裁决独占在退出码）。
- **理由行写作纪律**（票 15 决议 3 配套交）——与票 14「判据写作三禁」并轨：理由行要稳定，禁时间戳/随机 id/流水路径（否则指纹永不相等，白变测不到）。

<!-- 2026-07-16 认领 session 补登：以下各票的交付此前未寄存进本票 -->

- **workloop 纪律声明两条**（票 05 决议 1/3 交）——`skills/workloop/SKILL.md`：补「动手前开单」纪律声明 + 「排查类工作默认 deferred_witness 红检查先行 + 逃生舱」纪律声明。仓内，须保持 host-neutral、不点名外部 skill。
- **【仓外】planning skills 产出约定**（票 05 决议 2 交）——owner 用户级 planning skills 补「计划自带 done-when + 可执行检查 + envelope」。不进 taskloop 仓，路线图须标注「仓外执行项」。
- ~~账本消费者按 schema 发现、不按文件名硬编码（票 05 交）~~——**已由票 09 撤销**：决议 3 之下 skill 根本不碰文件（调动词），消费者没有文件可发现。
- **hook 配方迁移风险（v3 发布 gating）**（票 05 执行项 4 交）——owner `~/.claude/settings.json` 无参数调用 `node ~/bin/taskloop.mjs`；v3 分支的 `hook --profile` 契约发布重装后，无参数调用判成 profile `unknown` → Stop hold 降级静默安全释放（`lib/host-hooks.mjs:60-62`）→ **stop gate 静默失牙**。**v3 发布前须处理**（发布流程或迁移提示，须让 owner 用 `hook --profile claude` 重生成配方）。
- **三处接线**（票 06 裁决 1 交）——`lib/task-engine.mjs:485/489`（`v3FailureSuspension` 把手上的 `output_tail` 接进 judgment）、`lib/application.mjs:627`（`remaining` 停印 `criterion.source.value`，改印「判据还没绿 + 它最后说的话」；身份归 status `## Criterion` 节）、`:633`（stuck hold message 带判据的话）。不动 judgment schema 三字段。**排序提示（票 08 交）：06 接线是过夜配方的前置增益**——凌晨被打回的 agent 收到的 hold 不带原因且没人可问。**注意与票 15 换源同批**：15 已裁定消息层取材换源（有前缀行用前缀行、无则 tail 开头 160），06 的「话」以 15 的取材为源。
- **判据溯源刻度重写**（票 07 执行项 1/2 交）——`lib/criterion.mjs`：`provenance` 与 `input_coverage` 退出证明分级，新增 `criterion.authored_by`（沿用 `granted_by` 词汇）；`lib/task-engine.mjs:102-105`：`projectProofAssurance` 缺口判定改为**仅时序违规**（动工后 amend）。
- **机器地板不可豁免**（票 07 执行项 3 交）——`lib/task-engine.mjs:148`：`waived` 早返回下沉，`machineRiskFloor` 必须先算；豁免只作用于 `declared_risk`。**注意（票 08 副产品）**：焊死 `waived` 而不看 `review` 那扇门 = 把诚实的零评审推成洗过的假评审——本项**不得先于评审面锚记录（12 `agent_id`/17 `permission_mode` raw）就位**（08 原文「同时看」= 焊门时另一扇门已有锚在记账，顺序约束而非字面同批；plan-review round 1 修正措辞）。
- **`task_amended` 补 `artifact_revision`**（票 07 执行项 4 交）——schema 缺口：「开单后立刻修判据」与「动工后改判据」在账本里长得一样，决议 4 的时序线现有 schema 答不了。`artifact_revision > 0` 即「动工后」的机器可读形态。
- **过夜配方成文**（票 08 决议 1–5 交）——准入式（「判据今晚能否无人开火」，开单时人判，不造闸门）+ 档 1 配方（交互式会话 + `/sandbox` + Stop 闸门）+ 预算（`--rounds 30`、不设 wall-clock/token）+ D2（早晨评审即终态）为意图形态。落点：skills/HOSTS 配方文本。**与票 14 封条准入规则同族**（都是开单时的准入问题，可同批落 planning 纪律文本）。
- **`ledger --json` 聚合动词**（票 09 决议 3/9 交）——runtime 聚合动词，自带完整性输出；字段级契约是执行工作。**排序约束（票 09 交）：`ledger` 动词必须先于 meta-loop v2 文本落地**；且须补一条测试断言「skill 文本引用的 CLI 动词必须在 runtime 里存在」（今天没有测试押住这个绑定）。
- **meta-loop v2 SKILL.md 重建**（票 09 交）——几乎从零重建，只捞回五件存活项；体量对标 judgmentloop 58 行/workloop 98 行。host 绑定：月度提醒携带增量读数。
- **AGENTS.md/README/测试清单四处机械迁移**（票 02 迁移面经票 09 逐条定案交）——AGENTS.md Start-and-verify 三 skill 列举加 meta-loop（机械）；AGENTS.md kernel 定义行**改判据 + 列举**（09 决议 10，非机械）；`tests/skills.test.mjs:7` + `tests/installer.test.mjs:20` 硬编码清单加 `skills/meta-loop`（机械）；`README.md:133-134` 修正滞后并纳入 meta-loop。
- **判据专用退出码**（票 10 决议 2/3 交）——`unsatisfied` 挪离 `exit 1`（专用号如 3）、`satisfied` 挪离 `exit 0`（专用号如 4）、`0` = 没说话；禁透传（透传型判据改写成翻译型）。`open_requirement` 的放行判定随之只认真红。**排序提示：与票 15 取材换源同批**（同属判据报告契约，分两批让判据作者迁移两次）。
- **派发补全为按类型启动**（票 10 决议 4 执行面交）——`lib/criterion.mjs:121`：`.mjs/.js` → `process.execPath`（无 shell）；`.cmd`/`.ps1`（win32）、`.sh`/shebang（posix）→ 各自正确启动。`.ps1` CLIXML 噪声不用白名单绕（归 15 治本）。skills 默认配方文本**推荐** `.mjs`（推荐非强制）。
- **弃置未提交红测**（票 10 决议 5 交）——`tests/taskloop-powershell-criterion.test.mjs` 物理删除（仍在工作区未跟踪）；决策记录已明记「自觉的丢弃」及文件内另一个无主红测的处置。
- **两账拆分完整 spec**（票 16 交）——不可逆 grant kind 归类（publish 确定在内；destructive/git 按「撤得回吗」逐一归类）、实得赌注的 v3 fold 口径（关单地板改读 touched files/实际写入根/命令形状）、锚记录的 schema 位（评审事件并排记录 `agent_id` 在否、`acting_session` 适配器状态、`permission_mode` raw）、「无锚声称」查询类定义、11 最小修与本票重构的排序。**依赖 v3**。
- **「写入不可归因」升格为缺口信号**（票 16 决议 3 交）——hook 解析不出写入目标记 `["<command>"]`（`lib/application.mjs:950`）时按「看不清」抬缺口，含糊本身计价。
- **`change_classes` 并轨 `declared_risk`**（票 16 决议 4 交）——废独立法律效力，词表降为结构化 reason 保留；path→class 映射住消费者层不进内核。
- **`permission_mode` 锚进内核**（票 17 交）——适配器 raw 值原样记账；内核只消费 `bypassPermissions`/其他 的二元投影（唯一双宿主对称的一颗锚；细档位在 Codex 侧恒定错值，不可押）。sandbox 轴双宿主都不进 payload——08 档 1 的 `/sandbox` 状态 hook 看不见，账 B 记录它须走进程/文件系统级探测或接受不可观测（spec 时定）。

### 排序原则与提示存量（各票交进）

- **第一排序原则已锁**：接入优先、建设殿后（框架决策记录，价值门禁）。其余权衡（价值/成本/依赖）为本票开工时须定的雾区项（map.md:84）。
- **票 03 写给本票的结论**：loop engineering 的真问题在「观测」，charter 瞄的是「调度」——五张关单票的根据全落在观测面，指向调度面的零张。
- **v3 是未发布在途分支**（map Notes）：票 11 守卫修复、票 16 实得赌注依赖 v3；票 15 换源「v3 发布前落地无历史包袱」；票 05 执行项 4 是 v3 发布的 gating 项——**v3 发布是路线图上的天然里程碑**。
- **解锁链**：13 模式梯落地 → 装回 PreToolUse（nudge 档）→ 解锁 12 `agent_id` 注入 → 07 零评审重算与 12 决裁项 3 第一次有数据可攒。
- **同批约束**：10 决议 2/3 + 15 换源/前缀（判据报告契约一次迁移）；06 三处接线以 15 取材为源；08 准入式与 14 封条准入同族。**顺序约束**：07 地板焊死不得先于评审面锚记录就位（08 副产品警告的机器可读形态；plan-review round 1 修正措辞）。
- **票 09 排序约束**：`ledger` 动词先于 meta-loop v2 文本；动词可以晚建而不丢数据（事件耐久，fold 随时补算）。

## Answer

**锁定路线图落 [docs/decisions/2026-07-16-loop-engineering-roadmap.md](../../../docs/decisions/2026-07-16-loop-engineering-roadmap.md)**（终版 r4 = sha256 `23449ecb…`）。gist：

- **排序方法（决议 0，owner 裁）**：依赖定批 + 接入优先定序 + 批为交接单位；否掉价值打分制（维度裁决已做过价值筛选）与纯拓扑逐项交接（同批约束表明逐项交接有真实成本）。v3 发布为天然里程碑，切三波。
- **第一波（v3 分支上）**：批 1 判据报告契约（10 专用退出码/派发补全/弃红测 + 15 取材换源/前缀定版 + 06 三处接线 + 判据契约文档一次定版）；批 2 传感器与身份（13 证据书/模式梯 nudge 档/过渡记录/Stop census[M1 非阻塞] + 12 `agent_id` 注入 + 17 `permission_mode` raw 记账 + HOSTS.md 两处更正）→ **M1 = v3 发布**（gating 修复 = 05 执行项 4 为发布前置）。
- **第二波**：批 3 纪律文本（05 两条声明 + 14 封条准入/三禁/收据入 git + 15 理由行 + 08 过夜配方；【仓外】planning skills 约定平行轨道）；A3 控制面摩擦测量独立小项；批 4 信任链（07 刻度/时序/地板不可豁免/artifact_revision + 11 守卫最小修）。
- **第三波**：批 5 观测收口（09 `ledger --json` 动词先行 → meta-loop v2 文本 + 13 fold 扩展 + AGENTS.md 判据/README/tests）；批 6 两账拆分（16 全部 spec + 17 二元投影消费面）。
- **评审中产生的关键新裁**：07 地板焊死由「同批看」重述为**顺序约束**（不得先于批 2 锚记录就位，附 4.3 开工前检查项）；17 的 raw 记账**提前进批 2**（`decodeHook()` 今天丢弃 `agent_id`/`permission_mode` 两字段——2.5/2.7 写死「两种身份不得互换」：所有权语义走宿主 `session_id`，行动者锚走 `agentId ?? sessionId`）。

**收口纪律**：/plan-review 全深度 4 轮（Codex 只读第二模型，每轮 fresh thread）：r1 blocker sweep NO-GO（B1 约束失真、B2 M1 错误承诺）→ r2 complete CONDITIONAL-GO（SF-1/SF-2/OP-1/VG-1/VG-2）→ r3 complete CONDITIONAL-GO（SF-3 身份拆分）→ **r4 complete GO 四档全清**。8 条 finding 全部披露、独立验证（confirmed）、处置闭合（6 fix + 2 defer-gap 归执行 session）；Exact Gate 经 check-gate-state.mjs 机械校验 **pass**。

雾区「总路线图的优先级排序方法」随本票 graduate（决议 0 即其答案）。本票为本图最后一张关单 ticket。
