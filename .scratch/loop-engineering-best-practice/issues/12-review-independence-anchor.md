# 12 — 评审独立性锚点：`acting_session`

Type: grilling
Status: resolved
Blocked by: 07

## Question

**graduate 自地图雾区「人类授权的不可伪造性」**——该条写着 graduate 条件是「**票 08 裁完档位后此洞在无人值守下变尖**（无人值守 = 没人能当场否认那句「用户要求的」）」。08 已裁完档位（档 1），洞变尖了，条件达成。本票只 graduate **有锚点的那一半**（评审面）；没锚点的那一半（`granted_by: user` 等纯声明字段）留在雾区。

**病灶（票 08 决议 6 裁定，本票不复议）**：评审闸门是 agent 自己能写的一张纸。

```
taskloop review --level second-model --reviewer 随便写 --blocking-findings 0 --advisory-findings 0
→ 地板满足 → achieve → terminal
```

- `reviewer` 是自由字符串、`blocking_findings_count` 是自填数字（`lib/application.mjs:726-727`）；
- `acceptedReview`（`lib/task-engine.mjs:135-143`）只核对 generation_id、两个 revision、level 够不够高、`blocking_findings_count === 0`——**没有一行检查评审者是谁**；
- 活证：[档 1 准入验证](../../../docs/research/2026-07-11-taskloop-vs-loop-engineering.md)追加 3 的 C2 臂——「agent 自记 fresh-context review 过 weak-close 闸」，当时记为「review 记录软点」。

**锚点就在同一行记录里，没人用**（`lib/application.mjs:726` 末字段）：

```js
acting_session: normalizedIdentity(hostSessionId()) === "cli" ? null : hostSessionId()
```

**`fresh_context` 的字面意思就是「新语境」= 另一个 session。** 这是**机器观测**，不是声明——正是票 07 决议 5「声明只能作用于声明，不能作用于观测」要的东西。与 06（手上有 `output_tail` 却扔了）、07 执行项 5（手上有 tail 却没拿它分类）**三票同形**。

裁决项：

1. **规则**：`acceptedReview` 是否要求 `review.acting_session !== ` 干活那个 session？「干活那个 session」取哪个口径——任务的 owner session、产出 `last_substantive_task_revision` 的 session、还是全部写入 session 的集合？`second_model` 与 `fresh_context` 的刻度是否不同（前者是否该要求更强的东西，而 session 差异答不了「换了模型」）？
2. **`acting_session: null` 怎么办**：裸 CLI 记录的评审 `acting_session` 为 null（`normalizedIdentity(hostSessionId()) === "cli"`）。null 是「人在终端里敲的」还是「不知道」？**若 null 视为独立，则 agent 只要从裸 CLI 敲 review 就绕过**——这条决定本票是修好还是修了个寂寞。
3. **代价**：账本 7 个 `task_reviewed` 事件按新规则重算，多少变成不合格？**票 07 的重算「零评审关单 5/10 → 2/10」是乐观的**（它假设那 3 个自证豁免的任务会被地板抓住，实则会换到 review 门自签）——本票须给出真实数字。
4. **落点**：`lib/task-engine.mjs`（`acceptedReview`）。是否需要 schema 补字段，还是 `acting_session` 已够。

**证据基数**：账本 7 个 `task_reviewed`，其中 C2 臂那次是**已确证的自签**。样本 >0 但不大——票 06/11 的教训是 n=1 足以**重写问题**、不足以**裁参数**。

**与票 08 的关系**：08 裁定过夜正常形态为 D2（早晨评审即终态），但**标注当前不可强制**——本票是让 D2 可强制的那张票。**08 认下的代价第 1 条（「票 12 落地前过夜的 D2 只能靠纪律」）由本票消化。**

上下文：[过夜配方决策记录](../../../docs/decisions/2026-07-15-overnight-unattended-recipe.md)决议 6 与「副产品：对票 07 决议 5 的更正」节；[信任链决策记录](../../../docs/decisions/2026-07-15-trust-chain-authorship-review.md)决议 5。

## Answer

**票面立论证否，但方向与前几票相反：不是「洞是假的」，是「锚点比票面以为的更真，只是不在票面找的地方」。** 详见[评审独立性锚点决策记录](../../../docs/decisions/2026-07-16-review-independence-anchor.md)。

**根据：执行者的身份不是判断者的身份。**

1. **`fresh_context` = 不共享信念**（断言由 artifact 重新推导）。内核**从没定义过**这个词（`REVIEW_ORDER` 只是梯子，唯一措辞是 workloop:63「at least that independent」）；票面「= 另一个 session」是现造的所指，**已被实测证否**。机器锚得到它的**必要条件**，锚不到**属性本身**。
2. **不立闸门——理由是闸门反噬，不是 n 不够**。穷举记录动作：**P1 父自敲（无 `agent_id`）／P2 派 subagent 口述命令（有，橡皮图章）／P3 subagent 自读自判（有，诚实）**。锚分得开 P1 与 {P2,P3}，**分不开 P2/P3**，而 P1→P2 成本 ≈ 0 → **闸门让 P1 灭绝、P2 免费 → 可观测状态换成不可观测状态**。这是 **08 决议 6 副产品的逐字重演**（焊死自报家门的门 → 诚实的自签 → 洗过的图章）。**记账严格优于闸门**，与 07 决议 4 同形。
3. **锚点存在、双宿主对称、内核零命中——同形第七例**。实测 Claude Code 2.1.211：主线程 `agent_id` **缺席**、subagent **在场**（`a08aaeb05c4dd53ac` = 宿主 spawn 时给父的 agentId），**而 session_id 父子逐字节相同**；subagent 的 env 里没有它（父子 134 个变量名、md5 一致）→ **宿主授权、agent 写不到**。Codex **源码级对称**（schema pin `rust-v0.144.1` + PR #22882：*"Root-agent hook inputs omit these fields."*）→ **host-neutral，用它不违反内核中立性**。而 `agent_id` 全仓 grep **零命中**——**最赤裸的一例：两个宿主都递到手边，内核从没看见**。
4. **唯一建设项 = 注入时优先取 `agent_id`，两 profile 对称；零 schema 变更**（注入机器 `application.mjs:102-118` 已在仓里，含 `:115` 的冲突 deny，只是注了 `sessionId`；v3 已记 `acting_session`）。**代价：整个锚挂在未装的 PreToolUse 上 → 本票落地依赖「无机器判据的仓内工作」那条雾裁完。** `acting_session: null` 口径定为**没有适配器在场 = 什么都没证明 = 不算独立**。
5. **决裁项 3 的真实数字 = n 0，不是 7**：字段 `f475360`（07-12）就存在、早于 7 次评审，但 **v2 白名单 `main:lib/outcome-ledger.mjs:13` 销毁了它**（连 `review_id` 都不放行）→ 重算**结构上给不出**。**故本票不给这个数字**。v3 已修 → 注入落地后前瞻可算。
6. **HOSTS.md 两处皆错，且它是本票立论的源头**（执行项 → #04）：`:31-33`「subagents are foreign sessions」**被实测证否**（`isForeignSession` 对 subagent 恒 false；运行时行为无害，错的是文档）；`:61-62` 引文属实但结论**过时**（能力缺口已由 PR #22882 补上，且就在其自称实测的 0.144.x）。**票面的错不是凭空造的，是从内核自己的宿主契约文档继承的**——本图第四次误读级更正，**前三次错在账本，这次错在仓内文档，且它会持续生产错误的票**。

**副产品：本图第六次「拿当前实现当参照系」，栽的是本 session。** 中途曾推荐「锚点不存在、建设项 = 零」并已成文待落笔——错在**只测了当前实现读的通道（env），就把它当成了可观测通道的全集**；宿主授权的身份走的是**钩子 payload**。owner 一句「fresh_context 能想办法观测到吗」掀翻重来。

**移交 16**（辖区扩为「两个门的输入认识论」）：`level` 是零代价裸声明、且是评审门上唯一有法律效力的字段（与 `change_classes` 同病、方向相反：那个撒谎方向是不填，这个是填高）；**P2/P3 不可判定 → 评审内容真实性只能由人裁 → judgmentloop 同形**。

**雾区改写为「runtime 的本体论边界」**，三态：人**边界外无锚**／语境独立性**在边界上**（必要条件可观测、属性不可）／模型多样性**不对称**（Codex payload 有 `model`，Claude 没有 → 内核押不了）。**该条原留给 12 的问题已答**：null 不可信，且 grant 面共用不了 `agent_id`——它证明「哪个 agent」，**人不是 agent** → **人那一面的无锚点判断被坐实**。
