# Plan-review 台账：loop engineering 维度框架决策记录

## Freeze（2026-07-15）

- candidate: `docs/decisions/2026-07-15-loop-engineering-dimension-framework.md`
- revision r1: sha256 前 16 位 `688F7E89CBC732D3`
- 深度校准依据：文档本身可逆、无危险路径（shallow 资格形式上成立），但候选是全图所有下游裁决（05-09、#03、#04）的地基，爆炸半径为整个 effort 方向，且地图收口纪律明文要求独立证伪 → 资格视为存疑，取 **full depth**。
- required reviewers：R1 = Codex（只读第二模型，full depth 必需）；fallback = fresh-context 只读 subagent（记录在案方可替代）。
- rubric：默认六维——连贯性、可行性、兼容性、迁移/回滚、验证、范围。存量系统断言需权威来源，否则记 verification gap。
- 证据范围（只读）：候选文档；.scratch/loop-engineering-best-practice/（map.md、issues/01-09）；AGENTS.md；lib/criterion.mjs、lib/task-engine.mjs、lib/application.mjs 被引用行；~/.taskloop/outcomes.jsonl（账本统计复核）；git show research/loop-engineering-evidence-refresh:docs/research/2026-07-15-loop-engineering-evidence-refresh.md（41 条证据集）；~/.claude/skills/meta-loop/SKILL.md。
- budget：本 session 第二模型审阅 ≤3 轮；耗尽或同一 blocker 连续三修不闭即 suspend。
- 约束：审阅者只读；裁决记录（owner 已确认的判决）本身不是审阅对象的错误——审阅对象是记录的推理、证据、一致性与完整性。

## Rounds

### R1 调用回执

- 尝试 1（codex:codex-rescue 子代理转发）：任务在子代理会话侧启动（task-mrlj0079-9rqnmy），主会话运行时无该 job 记录，结果不可取回。判定：调用失败（可用性），子代理为一次性转发器不轮询。观测成本：subagent_tokens≈17.9k+20.1k，两次调用约 97s。
- 尝试 2（主线程直调 codex-companion task，前台）：Codex 正常开审（哈希已复核一致、开始核对票据接线与账本），但调用方 120s 超时把进程杀死。判定：调用方超时，非审阅者失败。
- 尝试 3（主线程直调，后台）：完成，job bnv2hz5zb。

### R1 = blocker sweep（Codex，账号默认模型 gpt-5.6-sol 线）

- revision：688F7E89CBC732D3（审阅者自行重算，一致）
- verdict：**NO-GO**；coverage：六 rubric 维 × [blocker, verification_gap]
- 回执：运行 ~6 分钟（后台任务), 工具调用约 30 次（哈希复核/账本重算/证据集抽查/接线核对）；token 遥测不可得（记为 unavailable，非零）。
- 发现与家长验证：
  - B1 推导链缺失，无法排除循环论证残留 — confirmed（记录只有方法宣言）→ **fix**：新增「推导链」节（闭环解剖表 + 完备性 + 独立性检验）。
  - B2 票 08「不阻塞」措辞与 #04 Blocked by 含 08 冲突 — confirmed（措辞歧义）→ **fix**：改为「无前置阻塞、frontier 直取，仍阻塞 #04」。
  - V1 41/41 归位不可审计 — confirmed → **fix**：新增附录：45 主归属映射表（4 条拆分）+ 拆分规则 + #10b/#11a 归位理由 + 按维计数。
  - V2 「判据由 agent 自组织」无来源 — confirmed（实为 owner 自述被写成事实）→ **fix**：证据分层标注（账本可证 vs owner 自述），指向票 07 第 1 问。
  - V3 charter 迁移面不完整 — confirmed → **fix**：候选新增迁移面三条清单（AGENTS.md 两处 + installer/测试面）；票 09 增补第 6 项对应要求。
- 附带修正：附录计数行笔误（1×3/6×5/7×6，合计 45 校验通过）。

### r2

- revision r2：`15B25B89A7039F30`（五项 fix + 计数修正 + 票 09 联动增补后）
- R1 全部发现已处置（5× fix），无 rebut/accept-risk/defer-gap/needs-input。
- 下一步：收口轮 complete review（全 rubric、全严重度）对 r2。

### R2 调用回执

- 尝试 1（`task --resume-last` 续 R1 线程）：被运行时僵尸 job 记录（前台超时误杀留下的 task-mrlj2uxd-duyi75 仍标 running）阻挡，9 秒失败。cancel 无法翻转已死进程的记录（taskkill 目标 PID 不存在）。
- 尝试 2（全新 task，fresh context，自包含 packet 含 R1 五发现与 r2 修订说明）：完成，job b2evxbjr0。

### R2 = complete review（Codex fresh context，账号默认模型）

- revision：15B25B89A7039F30（审阅者重算，一致）
- verdict：**NO-GO**；coverage：六 rubric 维 × 四严重度
- 回执：运行 ~7 分钟，工具调用约 35 次；token 遥测不可得。
- 旧发现闭合复核：B1/B2/V1/V2/V3 全部确认闭合（接线一致、账本复算一致、迁移面已落 #09、附录映射抽查通过）。
- 新发现与家长验证：
  - B1(r2) meta-loop charter 锚定 legacy `outcomes.jsonl`，与当前契约 `outcomes-v3.jsonl` 冲突 — **confirmed**（家长独立复核：`lib/prims.mjs:25`、README:115、REFERENCE.md:171、`tests/skills.test.mjs:20-21` 拒绝旧口径；且本机尚无 outcomes-v3.jsonl，legacy 是唯一语料）→ **fix**：charter 修正案改以 v3 契约锚定、legacy 定位为 de-asdf 首要迁移项与共居论据活证；账本证据节加语料出处注；票 09 第 1/2 项改写。
  - S1(r2) 迁移面仍缺 README:133-134，且「skill-closure 自动覆盖新目录」断言不真实 — **confirmed**（家长复核：`tests/skills.test.mjs:7` 硬编码清单、`tests/installer.test.mjs:20` 只断言两 skill、README 分发描述连 judgmentloop 都滞后）→ **fix**：迁移面第 3 条改写（分发自动/测试不自动）、新增第 4 条 README；票 09 第 6 项同步。

### r3

- revision r3：`A25C223E461191DB`（B1(r2)/S1(r2) 两项 fix + 票 09 联动后）
- R2 全部发现已处置（2× fix），optional/verification_gap 为空。
- 下一步：R3 收口轮 complete review 对 r3。

### R3 = complete review（Codex fresh context，账号默认模型，job bsxcf447g）

- revision：A25C223E461191DB（审阅者重算，一致）
- verdict：**NO-GO**；coverage：六 rubric 维 × 四严重度；发现收窄（1 blocker + 1 should_fix + 1 optional，无 verification gap）
- 回执：运行 ~5 分钟；token 遥测不可得。
- r1 五项与 r2 两项：闭合确认（r2-B1 除 #09 顶段残留外）。
- 新发现与家长验证（全部 confirmed → fix）：
  - B1(r3) #09 顶段 charter 理由句仍写 legacy `outcomes.jsonl`，票内自相矛盾（r2-B1 同根因第二修）→ fix：#09 顶段改 v3 契约口径。
  - S1(r3) 迁移面漏本图 map.md Notes 行（三 skills 口径）→ fix：候选迁移面新增第 5 条；关单地图更新时一并改写。
  - O1(r3) 「旧口径字样直接使测试失败」表述过强（regex 只拒 `~/.taskloop/outcomes.jsonl` 路径形态）→ fix：措辞收精确。

### 预算修正（记录在案）

freeze 时我写的「第二模型 ≤3 轮」与调用指令「审到通过为止」冲突——用户指令是预算权威，预算修正为 until-pass；「同一 blocker 连续三修不闭即 suspend」止损保留（outcomes 口径根因现处第二修）。

### r4

- revision r4：`9D1ED037D98E36DA`（B1/S1/O1(r3) 三项 fix + #09 顶段联动后）
- R3 全部发现已处置（3× fix）。
- 下一步：R4 收口轮 complete review 对 r4。

### R4 = complete review（Codex fresh context，账号默认模型，job bcoct0tn5）

- revision：9D1ED037D98E36DA（审阅者重算，一致）
- verdict：**CONDITIONAL-GO**；blockers 0、optional 0、verification_gap 0、should_fix 1
- 回执：运行 ~5 分钟；token 遥测不可得。
- 复核：r3 三项闭合（含同根因第二修的 outcomes 口径——已闭，未触发三修 suspend）；r1/r2 七项仍闭合；账本统计复算再次一致。
- S1-r4（候选迁移面第 5 条与 #09 第 6 项分派口径不齐）— confirmed（根因：迁移面表头把五条全派给票 09，而第 5 条实为 02 关单动作）→ **fix**：表头分派明确化（1-4 归票 09，5 归 02 关单）；#09 第 6 项补第 ⑤ 目（复核 map.md 改写生效）。

### r5

- revision r5：`97C6DCCCE64684FE`（S1-r4 修复 + #09 联动后）
- 下一步：R5 收口轮 complete review 对 r5（最终 GO 必须覆盖完整当前修订）。

### R5 = complete review（Codex fresh context，账号默认模型，job b9ryw8w40）

- revision：97C6DCCCE64684FE（审阅者重算，一致）
- verdict：**GO**；四严重度全空；r4-S1 闭合确认；r1/r2/r3 十项无回归；账本统计第三次独立复算一致。
- 回执：运行 ~4 分钟；token 遥测不可得。

## 关门（2026-07-15）

**Exact gate 六条件核验（手工机械，对 r5）**：

1. 必需审阅者 GO 于当前修订：✓（Codex complete GO @ 97C6DCCCE64684FE，唯一一次收口判决）
2. open blockers = 0：✓
3. open should-fix = 0：✓
4. unvalidated findings = 0：✓（11 项发现各有一条家长验证记录，全部 confirmed）
5. optional 全部有处置：✓（O1-r3 → fix，closed）
6. 活跃审阅调用 = 0 且 GO 后无实质变更：✓（僵尸 job 记录属被杀的 attempt-2 wrapper，目标 r1、结果通道已死，无法对 r5 返回发现；候选哈希 GO 后复核一致）

**证据局限（如实记）**：`check-gate-state.mjs` 的 schema 要求 gap_scope 枚举与六项非空成本遥测从首轮起按其格式采集；本评审 R1 审阅者返回的 gap_scope 为自由文本、Codex 侧 token 遥测不可得，事后补造即伪造，故门禁按技能正文六条件手工机械核验，脚本未运行于伪造输入。

**最终报告**：最终修订 r5 = `97C6DCCCE64684FE`；审阅者 = Codex 第二模型（fresh-context 独立、只读），fallback 未启用；5 轮（sweep NO-GO 5 项 → complete NO-GO 2 项 → complete NO-GO 3 项 → complete CONDITIONAL-GO 1 项 → complete GO 0 项），发现共 11 项，处置 11× fix，0 rebut / 0 accept-risk / 0 defer-gap / 0 needs-input；剩余 verification gaps = 0；各轮模型均为 Codex 账号默认（gpt-5.6-sol 线），单轮墙钟 4–7 分钟，token 遥测不可得。另有两次失败调用回执在案（子代理结果不可取回、前台超时误杀）。

**GATE PASSED。**
