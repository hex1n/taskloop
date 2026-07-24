# 风险地板的口径：写入量 vs 触及文件数（票 11 裁决）

- 日期：2026-07-16
- 票：[11 — 风险地板的口径](../../.scratch/loop-engineering-best-practice/issues/11-risk-floor-calibration.md)
- 地图：`.scratch/loop-engineering-best-practice/map.md`
- 状态：已裁

## 根据（一句话）

**「够了」是判级的答案，不是记账的答案。**

`machineRiskFloor` 的两条规模规则挂着 `&& risk === "routine"` 守卫（`历史任务状态运行时:130-131`，`main` 与 v3 分支逐字节相同）。守卫服务的是**判级**——已经抬起来的级不必再抬。但 `reasons` 是**记账**，守卫让它记成了「第一个够用的理由」，而不是「所有为真的理由」。

**票 11 自己就是这个缺陷的伤害实证**：整张票是由这个有损字段造出来的。

## 决议 1：触发样本 T6 不存在，前提证否

票面立论：`07-13 14:58` 那单（writes=21、owner 亲手 declare `routine`、无判据 amend）在票 07 新规则下机器地板为空 → 零评审关单 → 「坏钟抓到过它，新表漏了它」。

该推断读的是**终态** `floor.reasons = ["proof_gap_acceptance"]`。账本实际记着：

| 时点 | T6 的 floor |
|---|---|
| 开单 `14:58:04` | `{"risk":"substantial","reasons":["multiple_envelope_roots"]}` |
| 终态 `15:49:29` | `{"risk":"substantial","reasons":["proof_gap_acceptance"]}` |

T6 的 envelope 跨 `app/` 与 `docs/` 两个根，且 **`amends=0`——envelope 从没变过**。`multiple_envelope_roots` 的条件自始至终为真；它在终态消失，是因为 `proof_gap_acceptance`（`:125`）先把 risk 抬到 substantial，`:130` 的守卫随即让它**不再被求值、不再被记账**。

所以 07 新规则拿掉 `proof_gap_acceptance` 之后，T6 的地板**重算仍是 substantial**（`multiple_envelope_roots` 复活为 reason）→ 仍要 `fresh_context` → 而 T6 确实有一份 accepted 的 `fresh_context`。**零评审关单不存在，退步不存在。n 从 1 变 0。**

**本图第三次账本误读级别的更正**，但与前两次不同类：05 更正 02 是「漏读了一个文件」，15 更正框架是「没读 attempts 的 signature 字段」——都是**没看**。这次是**看了，但字段本身有损**。

**顺带**：同类错配（declared `routine` 但 writes 高）账本里有两个——T3（writes=18）与 T6（writes=21）。**两个都被地板抓住了，且都不靠写入量**（T3 靠 grants，T6 靠 envelope roots）。**漏网 0 个。**

## 决议 2：口径之争问在一条死规则上

`many_touched_files` 在 **10/10 任务里结构上不可达**。它排在所有其他地板之后且要求 `risk === "routine"`，而 10/10 都在它之前就被抬起来了：

```
T1  blocked by [destructive_grant, install_grant, proof_gap_acceptance]
T2  blocked by [proof_gap_acceptance]
T3  blocked by [criterion_subject_grant, destructive_grant, install_grant, criterion_amend]
T4  blocked by [destructive_grant, install_grant, public_contract, proof_gap_acceptance]
T5  blocked by [criterion_amend]
T6  blocked by [proof_gap_acceptance]
T7  blocked by [destructive_grant, proof_gap_acceptance, criterion_amend, policy_amend]
T8  blocked by [proof_gap_acceptance]
T9  blocked by [criterion_subject_grant, proof_gap_acceptance, criterion_amend]
T10 blocked by [install_grant, proof_gap_acceptance]
reachable: 0/10
```

根因是 **07 已经裁过的那条饱和链**：10/10 全是 `command` 判据 → `provenance != repo` → 必有 proof gap → 要关单必须 `accept-proof-gap` → 地板必 ≥ substantial → 永远走不到 `:131`。**它的 true 分支从来没有执行过一次。**

**争论「换成 writes 会不会更好」= 争一具尸体该穿什么衣服。**先让规则活过来，才谈得上校准它。

由此，票面裁决项 3（「>10 阈值有没有证据支撑，还是拍的」）的答案是：**既没被支撑也没被证否——它今天不可证伪**（true 分支不可达 + v2 账本不记 `touched_files`）。问题不是「>10 对不对」。

## 决议 3：写入量的第一性地位——合格，但是更差的代理

**首版推导作废，因为它拿当前实现当参照系**（本图第五次栽在同一毛病上，owner 当场抓出）：初稿把「写入量」等同于 `spent.writes` 这个字段，用它的实现语义（`applyWriteMutation` 每个写事件 `+= 1`，故量的是工具调用粒度）去杀掉整个概念。**字段的缺陷是实现事实，不是第一性事实**——若「改动量」是对的信号，正确结论是「runtime 今天没测量它」，一个要填的洞，而不是拒绝的理由。

重推，两道筛子：

**筛子一：对撒谎免疫吗？** 地板存在的唯一意义是 `effective = max(declared, floor)`，让**观测压过声明**（07 根据）。写入量／改动量是 runtime 数出来的 → **观测 → 合格**。文件数同样合格。**所以写入量并不「不配」。**

**筛子二：它预测「人该看一眼」吗？** 03 的实证读数：fresh-context agent 抓的是**事实错**，抓法是「把文件打开逐个核对」；owner 抓的是**参照系错**；transition engine 抓 0 次。故评审收益 ∝ **需要独立核对的声称的个数**。按这把尺子：

- **文件数**：中等正相关（不同文件通常承载不同声称；但跨 20 文件的机械重命名 = 1 个声称 → 假阳性）
- **改动量（行/字节/hunk）**：更弱（机械改动爆表，精巧改动看不见）
- **写入次数**：与 agent 手法相关，与声称数无关

**结论：写入量合格，但它是「独立声称数」的更差代理。**故**不预先裁死，取舍等证据**——graduate 条件见地图雾区。

## 决议 4（唯一建设项）：去掉 reasons 上的守卫

`历史任务状态运行时:130-131` 的两条规则：

```js
if (roots.size > 1 && risk === "routine") { risk = "substantial"; reasons.push("multiple_envelope_roots"); }
if ((task.evidence?.touched_files ?? []).length > 10 && risk === "routine") { risk = "substantial"; reasons.push("many_touched_files"); }
```

改为去守卫 + `riskMax`：

```js
if (roots.size > 1) { risk = riskMax(risk, "substantial"); reasons.push("multiple_envelope_roots"); }
if ((task.evidence?.touched_files ?? []).length > 10) { risk = riskMax(risk, "substantial"); reasons.push("many_touched_files"); }
```

**判级恒等，可证**：`riskMax(a,b) = RISK_ORDER[max(indexOf a, indexOf b)]` 是单调 max。守卫成立时 `risk` 必为 `routine` → `riskMax(routine, substantial) = substantial`，与原赋值相同；守卫不成立时 `risk` 已 ≥ substantial → `riskMax` 保持不变。故 `risk` 的取值逐例不变，只有 `reasons` 变成全集。

**安全性**：`floor.reasons` 全仓**没有任何逻辑消费者**——`application.mjs:122` 那个 `reasons[0]` 取的是 closure holds（另一个数组），`:498`/`:560` 是展示。故这是**纯记账修复**。

**v3 下自动追溯全历史**：v3 的 `assurance` 字段是 `["declared_risk","risk_reason","risk_declared_by","change_classes","review_policy","required_review_level","review_waiver_reason","review_waiver_granted_by","proof_gap_acceptances","risk_floor_events"]`——**没有 `floor`**。floor 是 `projectAssurance` 读时算的**投影**，不是事件里的快照。故改函数即重算全部历史，零 schema 变更、零迁移。

**代价：接受 v3 依赖。** v2 把 floor **快照进了事件**（所以 v2 账本行里读得到 `floor.reasons`）→ **v2 已写死的历史永久有损，救不回来**。owner 2026-07-16 裁定接受：v3 是本仓活跃分支，而在一个即将被取代的投影上加字段 = 第二次给已有的东西重新报价。

### 与 `closureReasonCode` 的区别：摘要 vs 销毁

`application.mjs:122` 的 `closure?.reasons?.[0]` 形状相似但**不是同病**：它只是给 hold 挑一个 code 字符串，**全集仍活在 `closure.reasons` 里**（`:498` 会 join 打全）。那是**摘要**。地板的守卫是**销毁**——短路后条件根本没被求值，全集从不存在，无处可捞。**这个区别正是本决议的根据。**

## 决议 5（撤销）：`touched_files` 进账本——不需要，v3 已有

裁决过程中一度裁定「`task_terminal` payload 加 `evidence`」，**当场推翻并撤销**。v3 的事件面已有：

```js
write_authorized: Object.freeze(["files"]),
```

**v3 的事件流带着每一次写和它的 files。** fold 一遍即同时得到 `spent.writes`（数 `write_authorized` 事件，`历史任务状态运行时:746`）与 `evidence.touched_files`（并集其 `files`，`:747`）。而 09 决议 3 已把 fold 裁给 runtime 的 `ledger --json`。

在 v3 上加 `task_terminal.evidence` = **把 v3 刚废除的那个投影选择重新引进来**，且 `evidence` 这个名字在 v3 terminal payload 里**已被占用**（`not-needed --evidence` 的证据文本，`null|non-empty-string`）。

**这是本次第二次「给已有的东西重新报价」**（03 记的 charter 病：「charter 想造它是因为它没看见 runtime 手上已攥着 `output_tail`」）。病因同上：**混了两个世界**——分析的账本是 v2（装机 runtime = `main`），读的代码是 v3（本分支，`prims.mjs` 写的是 `outcomes-v3.jsonl`）。地图 Notes 早写了这条（「`AGENTS.md:32` 描述的是 v3 分支」）。

## 副产品：票面立论是 v2 账本形状生的

| | v2（今天的账本） | v3（在途分支） |
|---|---|---|
| `floor.reasons` | 快照进事件 → 有损且**永久写死** | 读时投影 → **改函数即追溯全历史** |
| `touched_files` | **不进账本** → 不可审计 | `write_authorized:["files"]` fold 即得 |
| `spent.writes` | 快照进 terminal | fold 计数即得 |

**两个规模观测，各瘸一条腿**：地板判级用 `touched_files`，账本不记它；账本记 `spent.writes`，地板不看它。做账本考古的人打开 v2，看得见的只有 `writes=21`，看不见 `touched_files`——**于是自然得出「地板该量写入量」。票 11 的立论是 v2 快照投影选择的产物，而 v3 废掉了那个形状，也就溶掉了这个问题。**

**同形谱系（第五例）**：06 手上有 `output_tail` 却扔了／07 手上有 tail 却没拿它分类／08 手上有 `acting_session` 却没拿它判独立性／13 手上有 untracked 观测却用完即弃／**11：手上有「所有为真的地板条件」，只记了第一个够用的**。11 的变体不是「扔了」，是**「短路了」——判级够用即停，记账跟着停**。

## 移交：地板的输入认识论 → [票 16](../../.scratch/loop-engineering-best-practice/issues/16-risk-floor-input-epistemology.md)

裁决中浮出一个比票面大得多的发现，owner 裁定**不在 11 里胀**，另开票：

| 地板输入 | 来源 | 性质 | 撒谎代价 |
|---|---|---|---|
| `grants` | `--destructive-allowed` 等 | 自缚声明 | 干不成那件事 |
| `multiple_envelope_roots` | `--files` | 自缚声明 | 写不进去 |
| `proof_gap_acceptances` | `accept-proof-gap` | 自批 | 07 裁过：付费通行 |
| `change_classes` | `--change-class` | **裸声明** | **零** |
| `risk_floor_events` | criterion/policy amend | **观测** | 撒不了谎 |
| `many_touched_files` | `evidence.touched_files` | **观测** | 撒不了谎（但见决议 2：是死的） |

地板号称让观测压过声明，**6 个输入里 4 个是声明的函数**。真观测只剩 `risk_floor_events`（时序，恰是 07 决议 4 已认出并押上的那条）与 `many_touched_files`（结构上不可达）。**地板里唯一观测「你实际动了什么」的规则，是死的。**

## 实证追加：2026-07-19 小改动 × 多写根的评审税样本

同日两个连续任务（味道批次、advisory 跟进批次）的账本对照：

| | 批次一 | 批次二 |
|---|---|---|
| `spent.writes` | 84 | 4 |
| 实际触达文件 | 12 | 3 |
| 写根 | `lib` + `install.mjs` + `tests` + … | `lib` + `install.mjs` |
| `floor.reasons` | `multiple_actual_write_roots`, `many_touched_files` | `multiple_actual_write_roots` |
| 强制评审 | fresh_context | fresh_context（同额） |

样本含义：`multiple_actual_write_roots` 把「仓库根下的单文件」（`install.mjs`）计为独立写根，4 次写的外科修复与 84 次写的批量重构支付同额评审税。写根计数是粗粒度的爆炸半径代理——这正是上文「地板输入认识论」里 `many_touched_files` 一系的结构问题在另一条规则上的显影。

**不动机制**。翻转条件：meta-loop 复盘看到 ≥3 次同型摩擦（小写入量 × 恰两写根 × 全额评审税）后，候选机制是升档需 `roots > 1 && writes > N` 的合取，而非给地板加权重参数。单样本（n=2 且评审确有产出：批次一 3 条 advisory 全部有效）不足以证明税负错付。
