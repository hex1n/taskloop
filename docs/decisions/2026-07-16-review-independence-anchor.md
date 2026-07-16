# 评审独立性锚点：`acting_session` 与 `agent_id`（票 12 裁决）

- 日期：2026-07-16
- 票：[12 — 评审独立性锚点](../../.scratch/loop-engineering-best-practice/issues/12-review-independence-anchor.md)
- 地图：`.scratch/loop-engineering-best-practice/map.md`
- 状态：已裁

## 根据（一句话）

**执行者的身份不是判断者的身份。**

与 06「判据的身份不是判据的话」、07「声明只能作用于声明，不能作用于观测」、08「`acting_session` 是观测，`reviewer` 是声明」是同一根线的第四张脸——**但本票同时更正了 08 的那句话**（见决议 2）。

## 决议 1：`fresh_context` 的所指 = 不共享信念；机器锚得到必要条件，锚不到属性本身

内核**从没定义过** `fresh_context`：`REVIEW_ORDER = ["fresh_context","second_model"]`（`lib/task-engine.mjs:78`）只是根梯子，skills 里唯一措辞是 `skills/workloop/SKILL.md:63` 的「a reviewer at least that independent」。票面替它现造了机器所指「= 另一个 session」——**该所指已被实测证否**（决议 3）。

第一性重推：评审的价值在本图只有一处实证——票 03 的「**fresh-context agent ≥5 次抓事实错，抓法是逐个打开核对**」。它抓得到，是因为它**不共享干活 agent 的信念**：它没有「我写过 X」这段记忆，要说任何话就必须去打开文件，故其断言**由 artifact 重新推导**而非继承。

故所指 = **评审者的断言由 artifact 重新推导，而非从工作语境继承**。这是认识论属性，活在 agent 脑子里。

**但它有一个机器观测得到的必要条件**：一个独立语境**执行了**记录动作。锚点锚的是这个必要条件，**不是属性本身**——见决议 4 的 P2/P3。

**推论：内核早把正确的区分编码对了，只是押错了地方。** `self_reread` **不在 REVIEW_ORDER 上** → 结构上永不满足任何 level（账本那条 self_reread 评审正是 `accepted: false`）。内核要的就是「不共享信念」，它只是把这个区分 100% 押在了 `level` 这一个字符串上，**而 `level` 是零代价裸声明**（移交 16）。

## 决议 2：不立闸门——理由是闸门反噬，不是样本不足

把「记录评审」这个动作穷举，只有三种：

| | 谁敲 `taskloop review` | `agent_id` | 性质 |
|---|---|---|---|
| **P1** | 父自己敲 | **缺席** | 自签 |
| **P2** | 父派 subagent、**口述命令** | 在场 | 橡皮图章 |
| **P3** | 父派 subagent、subagent 自读自判自敲 | 在场 | 诚实 |

**锚点把 P1 与 {P2,P3} 分开，分不开 P2 和 P3。** 而 P1→P2 的成本差是**一次 subagent spawn ≈ 0**。

**故立闸门会毁掉它自己造出来的信号**：闸门让 P1 **灭绝**，而 P2 免费 → **可观测的状态（父自签 = `agent_id` 缺席）被换成不可观测的状态（subagent 签，与诚实的 P3 一模一样）**。

**这不是新推理，是 08 决议 6 副产品的逐字重演**：「焊死 `waived`（**自报家门**）而不焊死 `review`（**不自报家门**）= 把逃生推到看不出来的门，**诚实的零评审 → 洗过的假评审**」。此处 **`agent_id` 缺席就是自报家门**（「这是我自己签的」），焊死它 → 逃生推到 P2 → **诚实的自签 → 洗过的图章**。

**故「记账不作闸门」严格优于闸门**：记账保住 P1/P2 的可见性，闸门让 P1 灭绝而 P2 免费。**该结论不依赖样本数**——n=0（决议 5）只是顺带成立，不是理由。形态上与 07 决议 4（押时序「只记账不作闸门」）同形。

**对 08 决议 6 立论的更正**：08 的根据写「**`acting_session` 是观测，`reviewer` 是声明**」。**前半句在 CLI 路径上是错的**——`hostSessionId()`（`lib/application.mjs:66-70`）= `TASKLOOP_SESSION_ID` ?? `CLAUDE_CODE_SESSION_ID` ?? `"cli"`，而 agent 自己敲 shell，`TASKLOOP_SESSION_ID=任意值 taskloop review` 即可伪造。它**只有在钩子在场时才是观测**（钩子注入 + `lib/application.mjs:115` 对冲突覆盖的 deny）。**08 的结论不动摇**（评审闸门仍是 agent 自己能写的一张纸），立论重述。

## 决议 3：锚点存在，双宿主对称，内核零命中——同形第七例

**实测（Claude Code 2.1.211，2026-07-16，临时日志钩子，跑完即摘）**：

| 调用来源 | `session_id` | `agent_id` |
|---|---|---|
| 主线程 | `950cfa25-…` | **缺席** |
| subagent | `950cfa25-…`（**与父相同**） | **`a08aaeb05c4dd53ac`** |

`agent_id` 的值 = 宿主 spawn 时返回给父的 agentId；**subagent 自己的 env 里没有它**（env 名单实测：父子 **134 个变量名、md5 一致**；`CLAUDE_CODE_CHILD_SESSION` 父子**都是 `1`**，是布尔不是身份）。故它是**宿主授权、agent 写不到的**。`SubagentStop` 同样带，且带 `agent_transcript_path`。

**Codex 对称**（证据等级：**源码级**，非 prose 文档）：pin 到 `rust-v0.144.1` 的生成 schema 中，`PreToolUse`/`PostToolUse`/`PermissionRequest` 的 `properties` 已含可选 `agent_id`/`agent_type`；官方 PR #22882「Add subagent identity to hook inputs」（2026-05-21 合入，GPG 签名）原话：*"`agent_id`: the child thread id, `agent_type`: the subagent role. **Root-agent hook inputs omit these fields.**"*——**与 Claude Code 逐字同义**（存在即 subagent、缺席即主线程）。

**故锚点是 host-neutral 的**，内核用它不会变成 host-dependent（这正是本票中途被追加的约束）。

**而内核一次都没伸手接**：`agent_id` / `agent_type` 在 `lib/`、`skills/`、`bin/` 全仓 **grep 零命中**。

**同形第七例，也是最赤裸的一例**：06/07/08/13 是*手上有 X 却扔了*、11 是*短路了*、15 是*量错了东西*——**12 是两个宿主都递到手边，内核从没看见**。

## 决议 4：注入 `agent_id` 是唯一建设项，且零 schema 变更；落地依赖装 PreToolUse

**注入机器已经在仓里**：`lib/application.mjs:102-118` 已经解析 taskloop 调用、对冲突的显式覆盖 **deny**（`:115`）、并把宿主给的身份注进命令（`:117-118` 的 `export/`$env:` TASKLOOP_SESSION_ID='${sessionId}'`）。**它只是注了 `sessionId`（区分不了 subagent），没注 `agent_id`。**

建设项 = **注入时优先取 `agent_id`（在场时），两 profile 对称**。v3 已在事件里记 `acting_session`（`lib/event-store.mjs:82`）→ **零 schema 变更、零迁移**。

**代价（照实记）**：

- **整个锚挂在 PreToolUse 的注入上**，而 taskloop 的 PreToolUse **没装、且是 owner 的明确选择**（地图记载：它在等「无机器判据的仓内工作」那条雾裁完）。**故本票任何落地都先要装 PreToolUse** —— 12 与那条雾成了依赖关系。
- **`agent_id` 只证明「一个新语境执行了这条命令」，不证明「一个新语境做出了这个判断」**——父写 subagent 的 prompt。本次调查中**本 session 亲手演示过**：命令 subagent「运行这一条」，它就运行了。**P2/P3 机器不可判定**，其真实性只能由人裁 → 与 judgmentloop 同形（移交 16）。
- **`acting_session: null` 的口径由此确定**：null = **没有宿主适配器在场 = 什么都没证明**，**不算独立**（票面问「null 是『人在终端里敲的』还是『不知道』」——答案是后者）。

## 决议 5：决裁项 3 的「真实数字」= n 0，不是 7；v3 已修，前瞻可答

`acting_session` 于 `f475360`（2026-07-12）就进了 review record，**早于全部 7 次评审**。但 **v2 账本的白名单丢了它**：`main:lib/outcome-ledger.mjs:13` 的 `task_reviewed` 只放行 `level`/`reviewer`/`criterion_generation_id`/两个 revision/两个 count/`reviewed_at`/`assurance`——**连 `review_id` 都不在内**。故 **7 条历史事件一条都没有这个字段**，票面要的重算**结构上给不出**。

与 11「v2 把 floor 快照进了事件故 **v2 历史永久有损救不回来**」同族：**字段活在 `task.json` 快照里（闸门读得到），却在账本边界被白名单销毁（考古者读不到）**。v3（`lib/event-store.mjs:82`）记它 → **注入落地后第一批评审开始攒数**，届时 07 的「零评审关单 5/10 → 2/10」才有真实数字可算。

**故本票不给这个数字，也不该给**——给了就是编。

## 决议 6：HOSTS.md 两处皆错，且它是本票立论的源头（执行项 → #04）

- **`skills/loop-core/HOSTS.md:31-33`（Claude Code）**：「**A parent and its Task subagents carry different identities: subagents are foreign sessions**, so envelope writes stay with the parent. Join explicitly or use a separate worktree.」——**被本次实测证否**：subagent 与父 `session_id` 逐字节相同。`isForeignSession`（`lib/application.mjs:75-77`）比的是 `owner !== sessionId`，对 subagent **恒返回 false** → subagent 根本不是 foreign session。**运行时行为无害**（subagent 的写按父的 envelope 管，这正是想要的），**错的是文档**——它在教人绕一个不存在的约束。文档自称机制earned 自 **Claude Code 2.1.207** 的实测（`:6-7`），本机为 `2.1.211`：是版本漂移还是当初误读，无法从此处判定，但**今天为假**。
- **`HOSTS.md:61-62`（Codex）**：「Codex documents that subagent hook events carry the parent session ID, so taskloop treats a Codex parent and its subagents as one ownership domain.」——**引文逐字属实**（Codex 官方文档原话即 "Subagent hooks use the parent session id."），**但由它推出的结论已过时**：那个「只能当一个 ownership domain」是被一个**已不存在的能力缺口**逼出来的（PR #22882 已补上 `agent_id`，且随 0.144.x 发布——**恰是 HOSTS.md 自称做实测的那个版本**）。

**两条错向同一个方向**：文档描述的是一个「session 身份是唯一把手」的世界。真相是——**session 身份在两个宿主上都区分不了 subagent；`agent_id` 在两个宿主上都能。**

**而 `:31-33` 正是票 12 立论的源头**：票面的「`fresh_context` 的字面意思就是「新语境」= 另一个 session」**不是票面凭空造的，是从内核自己的宿主契约文档继承的**。**本图第四次账本/文档误读级别的更正**（前三次：05 更正 02 漏读 `outcomes-v2.jsonl`、15 更正框架没读 attempts 的 signature、11 的 `floor.reasons` 字段有损）——**但前三次错在账本，这一次错在仓内文档，且它会持续生产错误的票**。

## 副产品：本图第六次「拿当前实现当参照系」，这次栽的是本 session

本 session 中途曾推荐「**锚点不存在、结构上观测不到、建设项 = 零**」，并已成文待落笔。**它错了**：推导只测了**当前实现读的那个通道**（env，`hostSessionId()`），就把「这个通道里没有」推成了「结构上观测不到」——**而宿主授权的身份走的是钩子 payload（stdin），不是 env**。

owner 一句「fresh_context 能想办法观测到吗」把它掀翻。**校准**：`拿当前实现当参照系` 的第六种变体是——**拿当前实现读的通道，当作可观测的通道全集**。前五次记在 03/10/11（10 里 owner 连抓三处、11 的首版推导作废）。

## 移交：→ [票 16](../../.scratch/loop-engineering-best-practice/issues/16-risk-floor-input-epistemology.md)

16 原辖区是**地板**的 6 个输入；本票裁定**扩为「两个门的输入认识论」**（owner 2026-07-16 裁定），交进两件：

1. **`level` 是零代价裸声明**，且它是评审门上**唯一有法律效力的字段**（`acceptedReview` 只核对 generation/两个 revision/level 够不够高/`blocking_findings_count === 0`——**没有一行检查评审者是谁**）。与 `change_classes` 同病、方向相反：`change_classes` 撒谎方向是**不填**，`level` 是**填高**。
2. **P2/P3 不可判定** → 评审**内容**的真实性只能由人裁 → 与 judgmentloop 同形。

## 雾区改写：「人类授权的不可伪造性」→「runtime 的本体论边界」

owner 2026-07-16 裁定重述。按本票实测，该条**不是铁板一块，是三态**：

| 面 | 状态 |
|---|---|
| **人**（`granted_by: user` 等） | **边界外，无锚**——runtime 观测不到「人是否授权」，只观测得到「哪个 session/agent 敲的」 |
| **语境独立性**（`fresh_context`） | **在边界上**——必要条件双宿主对称可观测（`agent_id`），属性本身不可观测（P2/P3） |
| **模型多样性**（`second_model`） | **不对称**——Codex 的 hook payload 有 `model` 字段，**Claude Code 的没有**（本次实测 keys 无 model）→ **内核押不了它** |

**故票 12 的 graduate 前提被部分证否**：雾区原写「08 只 graduate 了**有锚点的评审面**」——评审面**只有半个锚点**（锚必要条件、锚不到属性）。评审面**不退回雾区**（它已被本票裁完），但雾区那条按上表改写。

**该条原留给 12 的问题（「若 12 裁定 null 可信，则 grant 面可共用此锚」）已答**：null 不可信（决议 4），且 grant 面**共用不了 `agent_id`**——`agent_id` 证明的是「哪个 agent」，人不是 agent。**人那一面的无锚点判断被坐实。**
