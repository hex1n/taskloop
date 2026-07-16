# 11 — 风险地板的口径：写入量 vs 触及文件数

Type: grilling
Status: resolved
Blocked by: 07

## Question

票 07 的新规则（缺口 = 仅时序违规；机器地板不可豁免）落地后，账本重算暴露一处**真实退步**：

`07-13 14:58` 那单——**writes=21、owner 亲手 declare `routine`、无判据 amend**——新规则下机器地板为空 → **零评审关单**。旧的意外链（形态注定的缺口 → 自批 → 抬地板）曾强制过它一次 `fresh_context`。**坏钟抓到过它，新表漏了它。**

成因：`lib/task-engine.mjs:131` 的 `many_touched_files` 地板管的是「碰了几个文件」（`touched_files > 10`），不是「写了多少次」——21 次写落在 ≤10 个文件里就溜过去。

裁决项：

1. 机器风险地板是否该把**写入量／写入密度**纳入（而非仅触及文件数）？口径与阈值是什么？
2. 「declared `routine` 但实际写入量大」这个错配，该由地板抓，还是由票 05 决议 1（动手前开单为纪律）的上游纪律消化？
3. 现有 `many_touched_files` 阈值（>10）本身有没有证据支撑，还是拍的？

**证据基数警告**：本票的触发样本 **n=1**。票 06 的教训是 n=1 足以**重写问题**但不足以**裁参数**——开工时先确认账本里是否已积累更多同类样本（`declared_risk=routine` 且 writes 高的终态任务），否则本票可能该退回雾里等样本。

上下文：[信任链决策记录](../../../docs/decisions/2026-07-15-trust-chain-authorship-review.md)「认下的代价」节

## Answer

**根据：「够了」是判级的答案，不是记账的答案。**

**票面前提证否——触发样本 T6 不存在。**票面读的是终态 `floor.reasons = ["proof_gap_acceptance"]`，但 T6 **开单时**的 floor 是 `{"risk":"substantial","reasons":["multiple_envelope_roots"]}`（envelope 跨 `app/`+`docs/`），且 `amends=0`——envelope 从没变过，条件自始至终为真。它在终态消失，是因为 `proof_gap_acceptance`（`:125`）先抬级，`:130` 的 `&& risk === "routine"` 守卫随即让它不再被求值。故 07 新规则拿掉 proof gap 后，T6 地板**重算仍是 substantial** → 仍要 fresh_context → 而它确实有一份 accepted 的。**零评审关单不存在。n=1 → n=0。**本图第三次账本误读级别的更正，且是新类型：前两次是**没看**（05 更正 02 漏读文件、15 更正框架没读 signature 字段），这次是**看了，但字段本身有损**。（漏网 0：同类错配 T3(18)/T6(21) 两个都被地板抓住，且都不靠写入量。）

**决议 1 — 口径之争问在一条死规则上。** `many_touched_files` 在 **10/10 结构上不可达**（排在所有地板之后且要求 `risk === "routine"`，而 10/10 都被 07 已裁的饱和链先抬起来了：command 判据 → 必有 proof gap → 关单必 accept → 地板必 ≥ substantial → 走不到 `:131`）。**true 分支从没执行过一次。**故票面裁决项 3 的答案是「>10 今天不可证伪」，不是「对/不对」。

**决议 2 — 写入量：合格，但是更差的代理。**（首版推导作废——它拿 `spent.writes` 的实现语义定义票面概念，本图第五次栽在「拿当前实现当参照系」上，owner 当场抓出。）重推两道筛子：①**对撒谎免疫**——写入量是 runtime 数出来的观测，**合格，并不「不配」**；②**预测「人该看一眼」吗**——03 实证：fresh-context 抓事实错、抓法是逐个打开核对 → 评审收益 ∝ **独立声称数**。按此尺：文件数 > 改动量 > 写入次数。**故不预先裁死，取舍等证据**（雾区已记 graduate 条件）。

**决议 3（唯一建设项）— 去掉 reasons 上的守卫。** `:130-131` 改为去守卫 + `riskMax(risk,"substantial")`。**判级恒等可证**（riskMax 是单调 max；守卫成立时 risk 必为 routine，riskMax 结果与原赋值相同；不成立时 risk 已 ≥ substantial，riskMax 保持）。**纯记账修复**：`floor.reasons` 全仓无逻辑消费者（`:122` 的 `reasons[0]` 是 closure holds，另一数组；`:498`/`:560` 是展示）。**v3 下自动追溯全历史**——v3 的 `assurance` 无 `floor` 字段，floor 是 `projectAssurance` 读时投影而非事件快照，故改函数即重算历史，零 schema 变更零迁移。**代价：接受 v3 依赖**（v2 把 floor 快照进了事件 → v2 历史永久有损，救不回来；owner 裁定接受）。

**决议 4（撤销）— `touched_files` 进账本：不需要，v3 已有。** 裁决中一度裁定「`task_terminal` 加 `evidence`」，当场推翻：v3 已有 `write_authorized: ["files"]`，fold 即得 `spent.writes` 与 `evidence.touched_files`（`:746-747`），而 09 决议 3 已把 fold 裁给 `ledger --json`。在 v3 上加字段 = 把 v3 刚废除的投影选择重新引进来，且 `evidence` 名已被占（not_needed 证据文本）。**本次第二次「给已有的东西重新报价」**（03 记的 charter 病），病因是**混了两个世界**：分析的账本是 v2（装机 = main），读的代码是 v3（本分支）。

**副产品 — 票面立论是 v2 账本形状生的。** 两个规模观测各瘸一条腿：地板判级用 `touched_files` 但账本不记它；账本记 `spent.writes` 但地板不看它。考古的人打开 v2 只看得见 `writes=21`，于是自然得出「地板该量写入量」。**v3 废掉了那个形状，也就溶掉了这个问题。** **同形第五例**（06/07/08/13 是*手上有 X 却扔了*；11 的变体是**短路了**——判级够用即停，记账跟着停）。区别于 `closureReasonCode:122`：那是**摘要**（全集仍在），地板守卫是**销毁**（条件没被求值）——此区别即本票根据。

**移交** — 地板输入的认识论（6 个输入 4 个是声明的函数；`change_classes` 是零代价裸声明、只抬不降 → 奖励沉默；唯一测「实际动了什么」的规则是死的）→ [票 16](16-risk-floor-input-epistemology.md)，owner 裁定不在 11 里胀。

详见[风险地板口径决策记录](../../../docs/decisions/2026-07-16-risk-floor-calibration.md)。
