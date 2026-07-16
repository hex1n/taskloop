# 16 — 两个门的输入认识论：声明、自缚声明、观测

Type: grilling
Status: resolved
Blocked by: 07, 11, 12

## Question

**由票 11 出票（owner 2026-07-16 裁定不在 11 里胀）；2026-07-16 由票 12 扩辖区——本票裁的不再只是地板，是「两个门」：地板门与评审门。** 两门共用同一条认识论，故一起裁；分开裁会各自重推一遍同一条线（本图先例：06/07/08/13 四票同形却各裁各的）。

地板存在的**唯一**意义是 `effective = max(declared, floor)`——让**观测压过声明**（07 的根据：声明只能作用于声明，不能作用于观测）。但把 `machineRiskFloor`（`lib/task-engine.mjs:112-133`）的 6 个输入按「撒谎的代价是什么」排开：

| 地板输入 | 来源 | 性质 | 撒谎代价 |
|---|---|---|---|
| `grants` | `--destructive-allowed` 等 | 自缚声明 | 干不成那件事 |
| `multiple_envelope_roots` | `--files` | 自缚声明 | 写不进去（`insideEnvelope` 拦） |
| `proof_gap_acceptances` | `accept-proof-gap` | 自批 | 07 裁过：付费通行（抬地板换强制评审） |
| `change_classes` | `--change-class` | **裸声明** | **零** |
| `risk_floor_events` | criterion/policy amend | **观测** | 撒不了谎 |
| `many_touched_files` | `evidence.touched_files` | **观测** | 撒不了谎（**但票 11 裁：结构上不可达 0/10**） |

**6 个输入里 4 个是声明的函数。**真观测只剩两条：`risk_floor_events`（时序——恰是 07 决议 4 已认出并押上的那条）与 `many_touched_files`（死的）。**地板里唯一观测「你实际动了什么」的规则，是死的。**

裁决项：

1. **「自缚声明」与「观测」在博弈上是否等价？** 论证是「撒谎的代价是干不成活」——申请了 `destructive` 才能删，envelope 划窄了就写不进去。若等价，地板的认识论问题只剩 `change_classes` 一个，本票大部分消解；若不等价，差在哪。

2. **`change_classes` 的零代价裸声明怎么办？** 它能把 risk 抬到 `critical`（最高），**只抬不降** → 撒谎的方向是**不填** → 不填零成本 → **它奖励沉默，向诚实的人收税**。与 08 的病灶「评审闸门是 agent 自己能写的一张纸」同形。选项面：给它找锚点（哪些 change_class 可由 runtime 观测推出？如 `schema`/`public_contract` 可否从 touched paths 推）／接受它是声明并只记账不作闸门（07 决议 4 对时序用的正是这一手）／废掉它。

3. **票 11 的守卫修复落地后，地板的观测面够不够？** `many_touched_files` 活过来后，真观测变成两条。这够不够支撑「让观测压过声明」这个立论，还是说地板的名字本身就名不副实。

### 评审门那一半（2026-07-16 由票 12 交进）

4. **`level` 的零代价裸声明怎么办？** `acceptedReview`（`lib/task-engine.mjs:135-143`）只核对 generation_id、两个 revision、level 够不够高、`blocking_findings_count === 0`——**没有一行检查评审者是谁**。故 **`level` 是评审门上唯一有法律效力的字段，而它零代价**：敲 `--level fresh_context` 与敲 `--level self_reread` 成本完全相同、收益天差地别。与 `change_classes` **同病、方向相反**——那个撒谎方向是**不填**（奖励沉默），这个是**填高**。注意内核其实把区分编码对了（`self_reread` **不在 `REVIEW_ORDER` 上** → 结构上永不满足），它只是把这个区分 100% 押在了一个裸声明上。

5. **P2/P3 不可判定怎么办？** 票 12 裁定：`agent_id` 证明「一个新语境**执行了**命令」，证明不了「一个新语境**做出了**判断」——父写 subagent 的 prompt，故**橡皮图章 subagent（P2）与诚实 subagent（P3）机器不可判定**。评审**内容**的真实性只能由人裁 → **与 judgmentloop 同形**（品味型交付物 + 人的显式验收作为终结动词）。裁决项：这是否意味着评审门的终点必然是 judgmentloop，而非机器闸门？注意与雾区「复盘面/产出物形态」那条的关系——**那条也是 judgmentloop 的形状一字不差**（09 决议 6）。

**校准提示（本图反复栽过的三个坑）**：
- **别拿当前实现当参照系**（本图已第**六**次，第六次栽的是票 12 自己的 session）——先问「门该由什么构成」，再看现有输入配不配，而不是拿现有输入定义问题。**票 12 贡献了它的第六种变体：拿「当前实现读的通道」当成「可观测通道的全集」**（只测了 env，而宿主授权的身份走的是钩子 payload）。
- **别混 v2/v3 两个世界**——装机 runtime = `main` = v2 契约；本仓是 v3 在途分支。`machineRiskFloor` 两边逐字节相同（票 11 已核），但 `assurance`/事件面差别很大。
- **别只按一个宿主裁**（票 12 由 owner 中途追加「还得考虑 codex」救回）——内核是 host-neutral 的，一个只在半个宿主上成立的锚点不能进内核。`agent_id` 双宿主对称（12 已核实），`model` 字段**不对称**（Codex 有、Claude 没有）。

上下文：[风险地板口径决策记录](../../../docs/decisions/2026-07-16-risk-floor-calibration.md)「移交」节；[信任链决策记录](../../../docs/decisions/2026-07-15-trust-chain-authorship-review.md)

## Answer

**裁决完成（owner 逐项确认）。票面「声明 vs 观测」问错了轴**——真病是**两本账被 `max()` 焊进一个标量、在同一个时刻结算**。owner 裁定评审两本账都记：**账 A 补缺口**（家在关单时刻，评审值 = 缺口 × **实得**赌注）、**账 B 权力钥匙**（家在发权时刻——事后转的钥匙叫事故调查；硬边界 = **不可逆权力**）。五条决议与全部证据见[决策记录](../../../docs/decisions/2026-07-16-gate-input-epistemology.md)。

裁决项逐条：①「自缚声明」物种不成立——绑定力是检测器的属性（"it is not a sandbox"），边界**有声化**处置：写入不可归因（`["<command>"]`）本身升格为缺口信号，含糊计价；②`change_classes` 废独立法律效力**并轨 `declared_risk`**（它只捕获过诚实人，账本唯一样本非边际；path→class 住消费者层）；③观测面重构后够用——关单改读实得（v3 fold），「6 输入 4 声明」溶解为时刻错位；④`level` 与 `granted_by` 同判：**声明永不作闸门键、永远记录在锚旁**，「声称 fresh_context 却无锚」成账本可查询类；⑤终点**不是 judgmentloop**（内核够不到「人」，天花板 = 必要条件 + 出处 + 抽样审计），梯顶按选项 1 接受（second_model 模型声称记账不验证，等 Claude payload 模型标识毕业再补锚）。

宿主钥匙可观测性探测出票 [17](17-host-key-observability.md)；spec 落点全进 #04。本 session 第一轮曾拿现有实现的六行表当宇宙推演，被 owner 一句「你还是按现有的 taskloop 来推的」掀翻重来——本图第七次「拿当前实现当参照系」，记档。
