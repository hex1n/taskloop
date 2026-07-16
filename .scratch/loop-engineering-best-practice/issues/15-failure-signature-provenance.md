# 15 — 失败指纹的取材：`fnv1aHex(output_tail)`

Type: grilling
Status: resolved
Blocked by: 10

## Question

`stuck` 判定用的失败指纹取材于**判据输出的哈希**——`lib/application.mjs:625`：

```js
signature: observation.verdict === "unsatisfied" ? fnv1aHex(observation.execution.output_tail) : null
```

而 `output_tail` = `stdout + stderr` 的**最后 4096 字符**（`lib/criterion.mjs:109`）。**这条通道是拥挤的**（票 10 决议 2 的用语：解释器与被调工具都往里写），故指纹量的可能根本不是判据的话。

**两个方向都错**：

- **输出被淹 → 指纹恒等 → 虚假 stuck**。A1 实证：4 次 attempt 的 signature **全是 `4b720486`**，跨 **3 个 criterion generation**（`fa0013c2`/`f394229e`/`66ea57e0`）与 **4 个 artifact_revision**（0/0/6/8）。`failure_summary` 全文是 PowerShell 的 CLIXML：`<AV>Preparing modules for first use.</AV>`。`stuck` = 三次指纹相同（`lib/task-engine.mjs:483-484`）→ **该任务三次尝试后必 stuck，与 agent 做了什么完全无关**；账本里两次 `stuck` 挂起由此而来。
- **输出带时间戳/路径/随机 id → 指纹永不相等 → `stuck` 永不触发**。（未在账本中观测到，属推导；开工时应先找样本或证否。）

**票 10 决议 1 只修了一半**：假红重分类为 `indeterminate` 后不再造 attempt（`task-engine.mjs:754` 只在 `unsatisfied` 时 push），故**由坏判据造出的**恒等指纹消失。但**真红的 tail 照样会被载体淹没**——A1 的 attempt 4 跑的 `66ea57e0` 正是后来变绿的那个 generation，**它是真红，指纹仍是 `4b720486`**。且票 10 决议 4 裁定 `.ps1` 等平台原生脚本合法（不用白名单绕开机制缺陷），故该残余是**活的**。

**本票修正维度 5 的关闭判决**：[维度框架](../../../docs/decisions/2026-07-15-loop-engineering-dimension-framework.md)判「维度 5 迭代控制：停止半边**关闭**（P0/P1 已落地）」。A1 证否之——机制确实落地了，但**它量的是 PowerShell 的启动噪声**。这不是新开一维，是关闭判决的证据被推翻：框架当时未读 attempts 的 signature 字段。（本图第二次账本误读级别的更正；前一次是票 05 更正票 02 漏读 `outcomes-v2.jsonl`。）

裁决问题：

1. **`stuck` 到底想测什么？** 「同一个失败重复出现」是「agent 在原地打转」的代理。这个代理对不对？真正想测的是不是「**artifact 变了但判据的裁决没变**」——而那两个字段（`artifact_revision`、`criterion_generation_id`）runtime **手上就有**，且 `attempts` 里逐条记着？（注意 `task-engine.mjs:488` 的第二条 stuck 规则 `NO_PROGRESS_STOPS` **已经**用 `criterion_generation_id@artifact_revision` 判重——即正解可能已在同一函数里躺着。）
2. **指纹还要不要取材于输出？** 若要，取材范围怎么定（全量而非 tail？判据的专用报告？）；若不要，`stuck` 用什么触发？
3. **与票 10 决议 2/3 的接线**：专用退出码落地后，判据的裁决与载体的噪声已在退出码层分开——那**消息层**（给 agent 看的 `failure_summary`）要不要也换独占通道？（注意这撞票 06 的三处接线：06 把 `output_tail` 接进给 agent 的消息，而本票证明该通道可被淹。**06 已裁，本票不重开它**，但需给出接线在 `.ps1` 判据下的行为。）
4. **`failure_summary` 的 160 字符窗口**：取的是 tail 的**最后** 160 字符（`application.mjs:626`），而判据的话在**开头**——A1 的成功观测 tail 以 `satisfied: FIELD_OPTION E2E and 7 tests passed` **开头**，后面跟 CLIXML。即**窗口开在了噪声那一端**。这是独立的取材错误，一并裁。

**落点**：runtime（`lib/application.mjs:625-626`、`lib/task-engine.mjs:483-488`、可能 `lib/criterion.mjs:109`）。

**开工须先自检**：不要拿当前实现当参照系——本图已四次栽在这上面。先问「一个循环凭什么判定 actor 在原地打转」，再看 taskloop 现在拿什么判。

## Answer

2026-07-16 裁决。全文见[失败指纹取材决策记录](../../../docs/decisions/2026-07-16-failure-signature-provenance.md)。

**票面问「取材范围怎么改」，裁决答指纹根本不该取材于信道。** 五条决议：

1. **物种拆分**：stuck = 「重放」（世界没变还在判，必然性论证，输入 = 身份对，机器全握）+「白变」（世界在变但失败理由没变，归纳论证，输入 = 失败身份，机器今天没有）。「判据自己在抖」不属 stuck 辖区（10 决议 1 已分出去）。现行规则 1 想测白变但拿信道哈希冒充失败身份——**把「stderr 恒定」读成了「失败恒同」**。
2. **白变取材 = 判据的话，且只能是判据的话**。信道永远拥挤（工具输出不受判据控制），挑信道干净部分 = 与解释器军备竞赛。判据没说话 → 白变不测，诚实退化，**绝不拿噪声凑指纹**。
3. **独占槽 = stdout 约定前缀行**，取最后一条匹配。零陈旧风险（进程 stdout 天然绑定本次执行，报告文件做不到）、跨语言零依赖；**消息行不是裁决通道**（裁决独占在退出码，两通道互不推断）。
4. **规则排布**：说话 → 3 次同指纹 stuck（不限定 artifact 动没动）；沉默 → 指纹 null、null 不参与相同判定，7 次身份对规则**原样兜底、参数不动**。零 schema 变更，v3 发布前落地无历史包袱。
5. **消息层同源换血**：有话逐字用话；没话回退 tail **开头** 160（窗口从噪声端翻到 stdout 端）。06 接线换源不重开。

**维度 5「停止半边关闭」判决修正后才真正关闭**（机制落地过，但量的是信道状态不是失败身份）。根据：**失败指纹必须取材于判据的话**——06/07/08/10 同一根线的第五句。票面问题 1-4 全部裁定；「方向错 2」（话带时间戳 → 指纹永不相等）转为纪律面执行项。执行项三件进 #04（runtime 换源与票 10 专用退出码同批、前缀契约定版、理由行纪律并轨 14 三禁）。
