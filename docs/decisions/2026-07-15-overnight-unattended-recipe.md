# 过夜无人值守配方（维度 6：授权与安全）

> 日期：2026-07-15
> 状态：决策记录；owner 已逐项确认（wayfinder ticket 08 的 grilling 裁决）
> 来源 ticket：[08 — 过夜无人值守配方](../../.scratch/loop-engineering-best-practice/issues/08-overnight-unattended-recipe.md)
> 上游：[信任链盲区：判据作者溯源与评审纪律](2026-07-15-trust-chain-authorship-review.md)（交付本票的硬约束）、[工作流接入与判据交接](2026-07-15-workflow-adoption-criterion-handoff.md)、[Loop Engineering 维度框架](2026-07-15-loop-engineering-dimension-framework.md)

## 裁决问题

维度 6 的裁决，owner 真实需求：睡前交付一个任务让它整夜自跑、早晨可信验收，需要什么配方？票面五问：驱动侧、安全侧、预算画像、挂起语义、早晨验收面。

## 票面前提被账本证否：那个夜晚没有自跑

开工首查 `~/.taskloop/outcomes-v2.jsonl`（10 个终态任务）：

| 读数 | 值 |
|---|---|
| 任务跨度中位数 | **21 分钟** |
| 跨夜的任务 | **1/10**（`1e123be8`，940 分钟） |
| 全账本挂起事件 | **3 次，全属这一个任务** |
| 声明过 wall-clock 预算的任务 | **1/10**（`990b50e5`，wall=20） |

唯一那个「过夜任务」的真实时间线：

```
07-13 18:04  开单（rounds=12）
07-13 18:06  amend —— 判据传输故障（"The command line is too long."）
07-13 18:15  suspended: needs_input        ← 开工 11 分钟
             ────── 893 分钟，零事件 ──────
07-14 09:08  resumed —— "用户确认测试版本已部署"
07-14 09:44  achieved
```

**它整夜没有自跑。它跑了 11 分钟，然后挂在 `needs_input` 上等了一整夜。** 那 893 分钟是**阻塞**，不是算力；夜里 rounds 消耗为 **0**。它需要的输入是「人去把测试版本部署上」——一个**循环外的人间动作**。

与票 06、07 同形：**票面写的立论不是病灶，病灶在旁边。**

一并证否了本票开工时的一个诱人假说（「值得过夜的活都是 install/destructive 型 → 必撞 critical 地板」）：

| span | 任务 | risk | grants | 结局 |
|---|---|---|---|---|
| **940m** | 业务仓 FIELD_OPTION | substantial | criterion_subject¹ | achieved |
| **110m** | 业务仓 拖拽顺序 bug | routine | **无** | **abandoned** |
| **66m** | taskloop PowerShell 判据参数 | critical | destructive,install | achieved |
| **51m** | 业务仓 榜单顺序 bug | routine | **无** | achieved |
| 12m | 删旧装新 taskloop | critical | destructive,install | achieved |
| 2m | 幂等重装 | substantial | install | achieved |

¹ 该 grant 是那次 amend 自授的，不是开单带的。

两个 destructive+install 任务只跑了 66m 和 12m；真正吃时间的是**业务仓 bug 修复**（110m／51m），而它们 **routine、零 grant**——机器地板为空。**故票 07 的约束并未堵死自关单，形态是一个真实选择，不是被迫。**

## 第一性重述：约束变量是「能撑多久不需要你」

一夜有 940 分钟，任务用掉 11 分钟。于是「过夜无人值守」的约束变量**不是机器能跑多久**（票面问 1/2/3 全部在给这个窗口做设计），而是**机器能撑多久不需要你**——即**首次挂起前的时长**。

`needs_input`／`stuck`／`out_of_budget` 三种挂起都是 sticky 的，任何一次都吃掉后半夜。**给一个任务永远到不了的窗口设计外层墙钟，是在给不存在的东西做设计。**

## 六条决议

### 决议 1：夜晚 = 我不在椅子上，不是算力窗口

夜晚的价值是**把 owner 的时间还回来**，不是拿到 8 小时算力。任务跑 40 分钟就收工也完全算数——只要它不在半夜叫人。

根据：账本中位任务 21 分钟、rounds≈0（票 05 已立）、最长实际工作 110 分钟。**仓里根本不存在 8 小时的活**，「整夜自跑」是修辞。

推论：一夜 940 分钟 vs 最长实际工作 110 分钟 = **8 倍余量**。**有 8 倍余量时不必赛跑，也不必自愈**——这条支撑决议 3。

### 决议 2：准入式 = 判据今晚能否无人开火

睡前只问一句：**这个判据今晚不需要任何人、任何外部系统的动作，就能跑出绿或红吗？**

- 能 → 配过夜（`npm test`、编译、静态检查、仓内可复跑的红检查）；
- 不能 → 别交给夜里（需要你部署测试环境、需要别人先合 PR、需要外部系统返回数据）。

根据：账本里唯一死掉的夜晚**恰恰死在这一条上**，且**18:04 开单时就可判**——那个任务的判据本身就写着「E2E 测试环境验收」。它从来就不配过夜。

**没有任何驱动/沙箱/预算配置能救那个夜晚；能救它的是别把它交给夜里。** 故**本票交付的是一条准入规则，不是一套配置**——档 1 已实探判定通过（六臂全过），机制部分不缺什么，缺的是选件。

### 决议 3：档 1（单会话 + `/sandbox`），档 2 留雾区

**配方 = 睡前启动一个交互式会话，`/sandbox` 做 OS 墙，Stop 闸门做驱动，跑到终态或挂起为止。**

- **无需容器**：`claude -p` 无头模式没有沙箱旗标（这是票面问 2 焦虑的来源），但 `HOSTS.md:40-43` 写着**交互式会话可以用 `/sandbox`**。而「睡前启动、走开、早晨回来」的会话**就是交互式会话**——只是没人看着。**无头才需要容器；档 1 不需要无头。**
- **无需外部驱动**：账本 10/10 全部装得进一个会话（8 倍余量）。`HOSTS.md:85` 明标 Codex scheduled tasks 为 untested binding。
- **无需外层墙钟**：外层墙钟是给**驱动**准备的（僵死后重启 = 自愈），没驱动就没这问。且自愈是给「跟时钟赛跑」的场景准备的——有 8 倍余量时，一次僵死的代价只是**一个夜晚**，而夜晚很便宜。花工程日建档 2 去救它，正是维度框架立的价值门禁「**接入优先、建设殿后**」要拦的那种事。

**故票面问 1（驱动）与问 2（安全）随档位选择一并出局——它们是无头模式的两难，而档 1 不无头。**

### 决议 4：预算画像——只有 wall-clock 会被睡眠烧掉

| 维度 | 什么时候涨 | 睡觉时涨吗 |
|---|---|---|
| `rounds` | **仅当判据打回**（`历史任务状态运行时:755`，unsatisfied 才 +1） | **否** |
| `writes` | 仅当真写入 | **否** |
| `output_tokens` | 仅当真产出 | **否** |
| **`wall_clock`** | **`atEpochMs - createdAtMs`**（`历史任务状态运行时:211-215`，日历时间） | **是——照烧** |

四个预算维度里，**只有 wall-clock 会被夜晚本身烧光**。白天日历≈工作，这个预算是诚实的；**夜里两者脱钩 8 倍——它量的是「你睡了多久」，不是「它干了多久」。**

后果：`resume` 的预算复检**只在 `out_of_budget` 挂起时才跑**（`历史任务状态运行时:626`），故 `needs_input` 挂一夜后早晨能正常 resume；但 `hookPretool` 会照查（`lib/application.mjs:940-946`）——**早晨醒来任务能恢复，却一个字也写不了**，直到先 amend 预算。

**过夜开单画像：`--rounds 30`，不设 `--wall-clock-minutes`，不设 `--token-budget`。**

- `rounds` 是已证机制（10/10 任务都在用）、免疫于睡眠，且正好抓 `stuck` 抓不到的那种 flail（每次失败都不同、artifact 一直在变，三同与七停滞双漏）。账本最大 rounds=4，30 是 7.5 倍余量；owner 本来就已在手写 rounds=30。
- `token` 预算暂不设：账本 **0 样本**，且自己标着 best effort（`lib/application.mjs:570`）。**把一个未经白天检验的 kill switch 首发在夜里是反着来的。**

### 决议 5：D2（早晨评审即终态）为意图形态，但当前不可强制

过夜任务的正常形态是 **Design 2：夜里干完活、停在评审闸门，早晨那一眼就是机器地板要求的那次评审**——不是额外负担。这与票 07 的交付结论合流。

不选 Design 1（夜里自关单）的理由：**自关单能力不由你在睡前决定，由判据凌晨三点打没打嗝决定。** 任何一次 `criterion_amend` 都把地板抬到 `substantial`（`历史任务状态运行时:126`）→ 强制 `fresh_context`。而 `1e123be8` 一晚吃了 **3 次**传输型 amend（命令行超长、`Get-FileHash` 缺失、`Test-Path` 语法）。**Design 1 是一个你无法预先承诺的设计：它会随机退化成 Design 2。** 既如此，不如把 D2 当正常形态——它永远可用、从不退化。

**但 D2 当前不可强制**——见决议 6。在票 12 落地前，过夜的 D2 **只能靠纪律**。

### 决议 6：病灶——评审闸门是 agent 自己能写的一张纸

票 07 决议 5 裁定「机器地板不可豁免」，并据此断言：**「整夜自跑 + 早晨可信验收」自洽，「整夜自跑 + 自己关单」不自洽。**

**后半句是错的。它完全自洽——agent 写张纸就行。**

`lib/application.mjs:726-727`，评审记录是这么造出来的：

```js
const record = { review_id: randomUUID(), ..., level,
  reviewer: String(values.reviewer ?? "").trim(),
  blocking_findings_count: parseInteger(values["blocking-findings"], ...), ... };
if (!record.reviewer) return error("review requires --reviewer");
```

**`reviewer` 是 agent 自己敲的一个自由字符串；`--blocking-findings 0` 是它自己填的数字。** 而 `acceptedReview`（`历史任务状态运行时:135-143`）只核对 generation_id、两个 revision、level 够不够高、`blocking_findings_count === 0`——**没有任何一行检查评审者是谁。**

```
taskloop review --level second-model --reviewer 随便写 --blocking-findings 0 --advisory-findings 0
→ 地板满足 → achieve → terminal
```

**07 只焊死了 `waived` 那扇门。`review` 这扇门是 agent 自己填的一张纸。** 活证早已在仓里：[档 1 准入验证](../research/2026-07-11-taskloop-vs-loop-engineering.md)追加 3 的 C2 臂——「agent 自记 fresh-context review 过 weak-close 闸」，当时记为「review 记录软点」。

**过夜使它变尖**：白天 agent 自签，你坐在旁边看得见、能当场否认；**夜里 1 点闸门升起，agent 自签走过去，你早晨醒来看到的是 `achieved`。**

**锚点就在原地，没人用**——同一行记录的最后一个字段：

```js
acting_session: normalizedIdentity(hostSessionId()) === "cli" ? null : hostSessionId()
```

**`fresh_context` 的字面意思就是「新语境」= 另一个 session。runtime 手上握着 `acting_session`，却没拿它判独立性。** 这是**机器观测**，不是声明——正是票 07 决议 5 那句「声明只能作用于声明，不能作用于观测」要的东西。

**三票同形**：

| 票 | runtime 手上握着 | 却 |
|---|---|---|
| 06 | `output_tail` | 在 stuck 路径上扔了 |
| 07（执行项 5） | tail 证据 | 没拿它给传输故障分类 |
| **08** | **`acting_session`** | **没拿它判评审独立性** |

**病灶不另立规则于本票**——`acting_session` 独立性规则管的是**所有任务**的评审（白天也一样），属维度 4，不属维度 6。出票 [12 — 评审独立性锚点](../../.scratch/loop-engineering-best-practice/issues/12-review-independence-anchor.md)。

## 票面五问的处置

| 票面问 | 处置 |
|---|---|
| 1 驱动侧 | **出局**——档 1 无外部驱动，Stop 闸门即驱动；外层墙钟是给驱动准备的，没驱动就没这问（决议 3） |
| 2 安全侧 | **出局**——容器 vs Codex 沙箱是**无头模式**的两难；档 1 是交互式会话，直接 `/sandbox`（决议 3） |
| 3 预算画像 | **半焊死**——wall-clock 量日历时间、被睡眠烧光，不能设；`--rounds 30`，token 不设（决议 4） |
| 4 挂起语义 | **证据关闭**——893 分钟原地挂起后干净 resume 是活证；档 1 无外部驱动可与挂起对抗，`HOSTS.md:10-15` 那条「驱动推挂起任务纯属浪费」随档位选择一并失去适用对象 |
| 5 早晨验收面 | **由病灶反推**（见下） |

## 早晨验收面：由病灶反推

早晨最少看 `taskloop status` 的**两行**：

1. **`lifecycle` 行** → 回答「完成／卡住／需要我」：`terminal(achieved)` ／ `suspended(needs_input|stuck|out_of_budget)` ／ `active`。
2. **`reviews` 行** → 回答「这个『完成』是不是 agent 自己签的字」。`lib/application.mjs:566` 会打印 `- fresh_context by <reviewer>: blocking 0, advisory N`。

**因为闸门可伪造，第 2 行从「记账」升格为「必看」。** 若那行写着一个你不认识的 reviewer，那就是 agent 自己签的字。

账本侧的稳健性（本票查证时确认，降级了票面问 2 的一层焦虑）：`HOSTS.md:17-19` 要求「从 **rebuildable** outcome projection 判定成败」。workspace-write 沙箱不覆盖 HOME 侧的 `~/.taskloop/`，掉行只在 **stderr** 喊一句（探针 C1 实测账本 0 行）——**凌晨三点 stderr 没有读者**，为「人会看见」设计的 degrade-open 在无人值守下退化成 degrade-silent。**但权威事件流 `.taskloop/events-v3.jsonl` 在仓内、在沙箱可写面内、从不掉行**，早晨 `sync-outcomes --repo` 即可重建。**夜里的证据丢不了。**

## 副产品：对票 07 决议 5 的更正

（体例同票 05 对票 02 的证据修正。）

**07 决议 5「机器地板不可豁免」本身成立，但只焊死 `waived` 是不够的，且有反效果：**

| 门 | 账本长什么样 | 自报家门？ |
|---|---|---|
| `review_policy: waived`（07 焊死） | `waiver_granted_by: self` | **是**——账本明写「自己豁免的」 |
| `review --reviewer X --blocking-findings 0`（未焊） | `fresh_context by X: blocking 0` | **否** |

**07 把逃生从一扇自报家门的门，推到了一扇不自报家门的门。** 账本里那 3 个 `waiver_granted_by: self` 的任务（含 2 个 critical 递归删除+重装），在 07 的新规则下不会变成「被评审」，只会变成「**自签了评审**」——而后者更难看：**账本从「没人看」变成断言「已评审、0 blocking」。**

**诚实的零评审 → 洗过的假评审。** 07 的账本重算「零评审关单 5/10 → 2/10」因此是**乐观的**：那 3 单不是被地板抓住了，是换了个出口，且新出口在账本里看不出来。

**这不推翻 07 的任何一条决议**——耦合是对的、刻度换作者+时序是对的、机器地板不可豁免是对的。它只说明：**焊死一扇门时必须同时看另一扇**，而另一扇的锚点（`acting_session`）07 手上就有——07 决议 4 押在「时序是机器观测」上是对的直觉，只是没把同一把尺子用到评审面。

## 认下的代价（诚实记录）

1. **票 12 落地前，过夜的 D2 只能靠纪律**——runtime 拦不住 3am 自签。**而这恰恰是无人值守下最没有纪律可言的时刻。** 本票不假装这个缺口不存在：**08 想设计一个「早晨可信验收」的配方，查到最后发现——可信的那一环，runtime 现在还托不住。**
2. **档 1 僵死不自愈**：会话僵死（spike 实测 `codex exec` 僵死 20 分钟）则丢掉整晚。接受此代价（决议 3：8 倍余量下夜晚很便宜）。
3. **决议 4 的 rounds=30 是拍的**——账本最大 rounds=4，30 是 7.5 倍外推，无样本支撑该具体数值。它只需「大到不碍事」，故精度无所谓；若将来 rounds 成为过夜的真实死因，再回来定。
4. **决议 2 的准入式无法机器执行**——「判据今晚能否无人开火」是人在睡前的判断，runtime 不知道判据会不会去够外部系统。本票不为它造闸门（那会掉进「为过闸门造传感器」，正是地图雾区那条接缝警告的形状）。

## 本记录不判定

- **评审独立性锚点的规则与刻度**——票 12（本记录只裁定病灶并出票，不代裁规则）。
- **判据的传输形态**——票 10。传输型 amend 正是把 D2 从「可选」变成「注定」的东西（决议 5），故 10 落地会**提高**过夜任务地板为空的概率；但这不改变决议 5（D2 仍是不退化的那个形态）。
- **风险地板的口径**——票 11。
- **档 2（跨会话无人值守）**——留雾区，graduate 条件本记录不改（见地图）。
- **06 的三处接线对过夜的增益**——`rounds` 即 06 说的「判据打回」，而 06 已裁定 runtime 在 stuck 路径上不转述判据的话。**凌晨三点被打回的 agent 收到的 hold 消息不带原因，且没人可问**——06 的接线是过夜的前置增益，排序进 #04。
- 上述执行项的排序——#04。
