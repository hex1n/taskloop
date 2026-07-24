# 信任链盲区：判据作者溯源与评审纪律（维度 4：裁决与信任）

> 日期：2026-07-15
> 状态：决策记录；owner 已逐项确认（wayfinder ticket 07 的 grilling 裁决）
> 来源 ticket：[07 — 信任链盲区：判据作者溯源与评审纪律](../../.scratch/loop-engineering-best-practice/issues/07-trust-chain-authorship-review.md)
> 上游：[工作流接入与判据交接](2026-07-15-workflow-adoption-criterion-handoff.md)（证据修正）、[Loop Engineering 维度框架](2026-07-15-loop-engineering-dimension-framework.md)

## 裁决问题

维度 4 的裁决。票面立论有两半：

1. 「账本显示 19/21 终态任务评审 none」——**已被票 05 证否**（出自 legacy 账本；v2 窗口里业务仓 4 个 achieved 全部带 `fresh_context`）。
2. 「溯源按路径不按作者（`lib/criterion.mjs:178-182`）——agent 本 session 写进仓库的检查器获得 `repo` 受信级，弱判据闸门不拦」——代码事实。

票 05 另提供了替代立论：10 个终态任务 `assurance.proof.state` = 8 `provisional` + 2 `gap`，0 干净；`proof_gap_accepted` 9 次，抽样 `granted_by: "self"`。

## 立论的第二半也是空的：这是个休眠洞

本票开工首查 `~/.taskloop/outcomes-v2.jsonl`：

| 读数 | 值 |
|---|---|
| 开单判据 `source.kind` | **command: 10 / file: 0** |
| proof 缺口原因 | `criterion_provenance` 10/10、`criterion_input_coverage` 10/10 |
| 缺口接受人 | **self: 9 / user: 0** |
| 评审豁免 | 3 个 `waived`，全部 `waiver_granted_by: self` |

`lib/criterion.mjs:178-182` 只在 `source.kind === "file"` 时才发 `repo` 受信级。**10/10 全是内联命令——`repo` 桶从来没有人进过一次。** 那个洞是真代码洞，但至今 0 样本，是**休眠洞**。

与票 06 同形：票面写的立论不是病灶，病灶在旁边。

## 真正在发生的三层

### 第一层：信号饱和（形态注定，非纪律）

`历史任务状态运行时:105` 的 `adequate` 要求 `provenance === "repo"` **且** `input_coverage === "full"`，二者**只有文件判据够得着**。命令判据结构上永远拿不到 `repo`、永远没有 `declared_inputs` → 两条缺口理由每单必炸、10/10。

**一个 100% 触发的信号没有鉴别力。** 它区分不了任何东西，只能被绕过。

更难看的是梯子顶那一格的刻度本身（`lib/criterion.mjs:192`）：`input_coverage = declared_inputs.length ? "full" : "unknown"`，而 `declared_inputs` 只是**判据入口文件那一个哈希**。于是——

- **命令判据**（`npm test`）诚实地说「我不知道我读了什么」→ `unknown` → 必炸；
- **文件判据**（`./check.sh`）只哈希了入口文件却宣称 **`full`**，可 check.sh 里调的 `npm test` 一样会漂移。

**闸门奖励的不是更强的证明，是更会声称的形态。** 文件形态还更弱一层：判据文件若同时被声明为 subject，漂移检查直接跳过（`lib/criterion.mjs:201`）——agent 可以改自己的检查器而不触发漂移。

### 第二层：缺口自批不是洞，是付费通行

`历史任务状态运行时:125`：任何 `proof_gap_acceptance` 把风险地板抬到 `substantial` → 强制 `fresh_context`。所以自批**不买逃逸，买的是一次评审**。机制这一环是对的。

**副产品：票 05「评审纪律在新窗口不是零，4/4 fresh_context」成立，但归因错了。** 那不是纪律，是这条机械链强制的：

```
命令判据(10/10) → provenance=unresolved + coverage=unknown → gap
              → 只能 self 批(9/9) → 地板抬到 substantial → 强制 fresh_context
```

反事实核算：5 次实际评审里，**2 次纯由判据形态凭空造出**（两个都是 owner 亲手 declare `routine` 的任务）。其一是「纯文档追加，仅动 CONTEXT.md」——被形态噪音抬进 `fresh_context`；其二是 writes=21 报 routine 的任务——**该评审，但抓到它纯属走运**。坏钟每天也对两次。

### 第三层（最深）：自证豁免删掉机器地板

`历史任务状态运行时:148`——`review_policy === "waived"` 在**第一行就 return，在 `machineRiskFloor` 被计算之前**：

| 时间 | declared | **effective 风险** | 机器地板理由 | 评审 |
|---|---|---|---|---|
| 07-13 10:27 | critical | **critical** | destructive_grant, install_grant, proof_gap_acceptance | **none** |
| 07-13 15:50 | routine | **critical** | destructive_grant, criterion_amend, policy_amend | **none** |
| 07-14 11:21 | substantial | substantial | install_grant | **none** |

三个全部 `waiver_granted_by: self`。**两个 critical 有效风险的任务——含受控递归删除 + 重装——零评审关单，因为 agent 自己一句话豁免了评审。** 豁免理由还写得很像样：「都是客观机器检查，无需主观结构评审」。

**这才是维度 4 真正的信任链盲区。** 不是路径不认作者，不是缺口自批。

## 五条决议

### 决议 1：病灶重述为「饱和 + 自证」，路径洞由规则化解

主线不是「溯源按路径不按作者」（休眠洞，0 样本），是**缺口信号饱和到无鉴别力 + 出口全靠自证**。路径洞不单独立票——决议 3 让形态退出分级后，`repo` 桶不再发放信任，**洞被化解，不是推迟**。

### 决议 2：保耦合，修刻度

「证明弱 → 多评审」这条耦合**是对的**，保留。坏的是「证明强度」在实现里是个**常量**（永远弱）——而常量不是控制。修的是梯子的刻度，不是耦合。

### 决议 3：刻度换成作者 + 时序，形态退出分级

`provenance` 与 `input_coverage` 两个**坏代理**退出：前者是「作者」的坏代理（按路径猜作者），后者是「覆盖」的坏代理（哈希了入口文件就宣称 full）。换成两个真维度：

- **谁写的**：`criterion.authored_by: user|self`，沿用已有的 `granted_by` 词汇（`lib/application.mjs:465/781`）；
- **什么时候写的**：开单自带 vs 动工后 amend（`criterion_amend` 地板事件已接好，`lib/application.mjs:790`）。

**`command` / `file` 形态不再影响评级。**

| 判据 | 评级 |
|---|---|
| 开单自带 + user 写 | 强 |
| 开单自带 + self 写 | 中 |
| 动工后 amend 才变绿 | **弱（真该炸的）** |

### 决议 4：缺口的线 = 只有时序违规

**开单自带 = 干净，不论谁写。** 只有「动工后 amend 判据」才是缺口。

理由：**时序承担了绝大部分防护。** 动手前写的判据，是在还不知道自己会怎么做的时候立的字据——哪怕是 agent 立的，那也是真承诺（TDD 的全部道理就在这）。危险的是事后把判据改到变绿。

反过来说，若「self 写」本身算缺口，则 10/10 换个标签继续必炸、继续自批——**饱和原样重建**。这是必须当场拆掉的陷阱。

**押在时序上还有个更硬的理由**：时序是**机器观测**的（判据何时到、写入何时发生，runtime 自己看见，撒不了谎）；作者是**自证**的——`grantProvenance` 默认 `self`（`lib/application.mjs:131-133`），而 `--granted-by user` 也是 **agent 自己敲的**，runtime 看不见人。**故作者记账、不作闸门。**

**传输型 amend 不给豁免。** A1 任务一单 3 次 amend 判据，全注「判据语义不变」（命令行超长／`Get-FileHash` 缺失／`Test-Path` 语法）。这些会被新规则判成时序违规——**接受这个误报**：runtime 确实分不出来，而「语义不变」是不可验证的自证，给豁免等于开一道只需声明就能过的门。代价只是一次强制评审，很便宜；判据中途改 3 次的任务本来就该有人看一眼。**这给票 10 一个锐化的任务：让 amend 少发生，而不是争取豁免。**

### 决议 5：机器地板不可豁免

**原则：声明只能作用于声明，不能作用于观测。**

- `declared_risk` 是 agent 说的 → 可豁免；
- **机器地板**是 runtime 从**自己发出的 grant、自己记的缺口**算出来的事实 → **任何声明都不该抹掉它**。

`review_policy === "waived"` 不再短路（`历史任务状态运行时:148`），只能盖住 `declared_risk` 那一半，`machineRiskFloor` 永远参与计算。

「豁免必须 user」不作为独立要求——`--granted-by user` 同样是 agent 自己敲的，那是减速带不是闸门。

> 这条与票 06 的「**判据的身份不是判据的话**」是同一句话的两个面：runtime 自己观测到的事实，不该被 agent 的声明覆盖。

## 账本按新规则重算（10 个终态任务）

| | 旧 | 新 |
|---|---|---|
| 零评审关单 | **5/10** | **2/10** |
| 证明缺口触发 | 10/10（形态注定，无鉴别力） | **4/10**（时序违规，有鉴别力） |

10 单里 7 单评级变化。三个自证豁免的任务（含 2 个 critical）从 `none` 升到 `second_model` / `fresh_context`。

## 认下的代价（诚实记录）

**新规则会漏掉 `07-13 14:58` 那单**：writes=21、owner 亲手 declare `routine`、无判据 amend → 新规则下机器地板为空 → **零评审**。旧的意外链强制过它一次 `fresh_context`。

即：坏钟抓到过它，新表漏了它。`many_touched_files` 地板（`历史任务状态运行时:131`）管的是「碰了几个文件」（>10），不是「写了多少次」——21 次写落在 ≤10 个文件里就溜过去。

**此项不在本票裁**，已出票：[11 — 风险地板的口径](../../.scratch/loop-engineering-best-practice/issues/11-risk-floor-calibration.md)。

## 给票 10 的预裁（解锁条件）

票 10 `Blocked by: 07` 的理由是「判据进仓内文件 = 进 `repo` 受信桶」。**该顾虑经决议 3 消解**：

- 形态退出分级 → 判据挪进仓内文件**不会**白拿 `repo` + `full` → 不会静默拿到 adequate；
- 反过来也成立：**若形态仍进分级，票 10 的修复会同时（a）让 agent 自写的检查器拿满级信任、（b）静默关掉当下唯一在跑的评审触发器。** 休眠洞不是「醒来」，是被 10 的修复亲手打开。

**结论：票 10 可自由选传输形态，评级不受形态影响；但它要消除的是传输故障本身（决议 4 不给语义豁免）。** 10 解锁。

## 迁移面 / 执行项（进 #04，本图 plan-not-do）

1. `lib/criterion.mjs`：`provenance` 与 `input_coverage` 退出证明分级；新增 `criterion.authored_by`（沿用 `granted_by` 词汇）。戳破 `full` 的过度声称。
2. `历史任务状态运行时:102-105`：`projectProofAssurance` 的缺口判定改为**仅时序违规**（动工后 amend）。
3. `历史任务状态运行时:148`：`projectReviewRequirement` 的 `waived` 早返回下沉——`machineRiskFloor` 必须先算；豁免只作用于 `declared_risk`。
4. **schema 缺口**：`task_amended` 事件**不带 `artifact_revision`**，故「开单后立刻修判据」（A1 的 r2，开单 2 分钟后、判据压根没跑起来）与「动工后改判据」（r11/r16，隔天、9 次写入之后）在账本里**长得一模一样**。**决议 4 的线，现有 schema 答不了。** 落地时须给 amend 事件补 `artifact_revision`（`artifact_revision > 0` 即「动工后」的机器可读形态）。与票 09 的账本消费者改造合并考虑。
5. **传输故障误分类**（本票查证时发现，非本票裁决，归票 10）：`"The command line is too long."` 被记成 `verdict=unsatisfied, exec_error=null, exit=1`——**判据压根没跑起来，账本却显示「判据跑了，说没达标」**。runtime 手上有 tail 证据却没用它分类。与票 06 的「runtime 手上有 `output_tail` 却扔了」同形。

## 交付票 08 的结论（08 明文引用本票）

票 08 写着「评审升格（无人值守下 weak-close 是否强制独立评审）不在本票——归票 07，此处引用其结论」。**本票的答复是：不升格，因为规则本就恒定。**

**评审等级由机器地板决定，而机器地板不可豁免（决议 5）——这条不分档位。** 无人值守不是一个可以豁免它的档位；`review_policy: waived` 在任何档位都只能盖住 `declared_risk` 那一半。

**对 08 的硬约束（这是本票给 08 的真正交付物）**：过夜任务若拿了 `destructive` / `install` / `whole_repo` / `publish` grant，或触发了时序违规缺口，机器地板即为 `substantial`／`critical` → 强制 `fresh_context`／`second_model` → **该任务在早晨有人评审前无法关单**。

即：**「整夜自跑 + 早晨可信验收」在本票规则下是自洽的，「整夜自跑 + 自己关单」不是。** 账本里那两个 critical 递归删除+重装任务零评审关单，正是后者的样子——而那恰恰是 owner 最不希望在无人值守时发生的事。08 要设计的是**在此约束下**的配方（例如：过夜任务的 grant 面收窄到不触发 critical 地板，把需要地板的活留给白天；或接受「早晨评审后才终态」作为正常形态），**而不是等一个不会到来的档位豁免**。

## 本记录不判定

- 风险地板的口径（写入量 vs 触及文件数）——票 11。
- 判据的传输形态——票 10（本记录只解其锁并锐化其任务）。
- 08 的其余五问（驱动、沙箱、预算画像、挂起语义、早晨验收面）——票 08 自裁；本票只交付上面那条约束。
- **人类授权的不可伪造性**——`--granted-by user` 同样是 agent 敲的，runtime 看不见人。本票**绕开**了它（押在机器观测的时序上，作者只记账），未解决它。见地图 Not yet specified。
- 上述执行项的排序——#04。
