# 判据传输形态（票 10）决策记录

日期：2026-07-16
票：[.scratch/loop-engineering-best-practice/issues/10-criterion-transport-form.md](../../.scratch/loop-engineering-best-practice/issues/10-criterion-transport-form.md)
维度：1（目标与判据）判据半边 × 4（裁决与信任）
落点：**runtime**（`lib/criterion.mjs`、`lib/application.mjs`、`lib/task-engine.mjs`）+ **skills**（默认配方文本）
收口：owner 确认即关（本票非 02/04，不需 /plan-review）

## 一句话

票面问「引号还是长度」，账本答**都不是**——判据从没跑起来过，而 runtime 把「跑不起来」读成了「判据说没达成」，还拿它当作「这判据会说不」的证据放行开单。

## 证据（全部一手，来自 `~/.taskloop/outcomes-v2.jsonl` 与业务仓 `.taskloop/task.json`）

样本 A1 = `1e123be8-8d1b-4e5c-b227-1351adaee96a`（FIELD_OPTION 战队保号，`fundsalesmrksupport`，07-13→07-14，rounds=4）。

### 1. 撑爆命令行的是「解引号」这个动作本身

`task_opened` 的判据 `kind=command`、**长 9442 字符**，形态是 `powershell.exe -NoProfile -EncodedCommand <9400 字符 base64>`。解码后脚本 **3525 字符**。

- 膨胀 **9442 / 3525 = 2.68×**（UTF-16LE ×2 × base64 ×4/3 = 2.67×，吻合）
- **脚本本身 3525 字符，本来就装得下 cmd.exe 的 8191 上限**
- 编码是为了让 CJK 与 `&` 活着穿过 cmd.exe 的解析器

即：**长度不是独立问题，是「解引号」买来的。** 且 `--criterion-powershell` 并不存在——agent 手工造了 EncodedCommand，从 `--criterion` 递进去。

### 2. 红见证门禁被一个从没跑起来的判据通过

`initial_observation` 逐字：

```
verdict=unsatisfied   exec_error=null   exit_code=1
tail="The command line is too long."
```

policy `default` 的 `open_requirement: "unsatisfied"`（`lib/task-engine.mjs:22`，`:370` 执行）看见它要的红 → 开单成功 → CLI 打印 `opened; criterion unsatisfied`。

`execution_error` **没有**被置位（`executionError()` 对 shell + status 1 返回 null），故下游无法用它做鉴别器。

**门禁对坏判据的通过率 100%，对好判据 <100%——它与判据健康度反相关。**

### 3. 三次 amend 里只有一次跟传输有关

| amend | 原因 | 与载体有关？ |
|---|---|---|
| rev2 | 压缩 PowerShell 判据以满足命令行长度限制 | 是 |
| rev11 | PowerShell 精简环境缺少 `Get-FileHash`，改用 .NET SHA-256 | **否** |
| rev16 | 修正 Windows PowerShell `Test-Path` 参数分隔语法 | **否** |

后两个是**判据压根无法执行**（缺 cmdlet、语法错），换任何载体都照样产生假红。**修载体只救 1/3。**

### 4. 失败指纹量的是 PowerShell 的噪声

4 次 attempt 的 `signature` **全是 `4b720486`**，跨 **3 个 criterion generation**（`fa0013c2` / `f394229e` / `66ea57e0`）与 **4 个 artifact_revision**（0/0/6/8）。`failure_summary` 全文是 CLIXML：`.../I64><PR N="Record"><AV>Preparing modules for first use.</AV>...`

机制：`lib/application.mjs:625` `signature = fnv1aHex(observation.execution.output_tail)`，而 `output_tail` = `stdout + stderr` 的**最后 4096 字符**（`lib/criterion.mjs:109`）。PowerShell 往 stderr 灌 CLIXML 进度记录，超过 4096 就**把判据自己的话整个挤出窗口**。

- `stuck` = 三次指纹相同（`lib/task-engine.mjs:483-484`）→ **该任务三次尝试后必 stuck，与 agent 做了什么无关**
- 关键：attempt 4 跑的 `66ea57e0` **正是后来变绿的那个 generation**，即它是**真红**——**真红与假红在账本里同为 `4b720486`**。鉴别器不可能取材于 tail。

### 5. 判据语义被压缩去迁就载体

终态判据仍是 EncodedCommand，**7386 字符**（压到 8191 以下）。所谓「压缩判据、保持原验收语义」，实际是**把「什么算完成」的定义压缩到 2.68× 编码预算之内**。

### 6. 业务真相机器够不到 → 判据退化为封条

`proof_gap_acceptances[0]`，`granted_by: **self**`，原文：

> 外部 SOFARPC/DB 结果无法由只读本地判据重复探测；本次会话已实际执行两次 updateSeasonV2 与 rankingList，证据 JSON 记录请求号、前后映射和榜单结果，并用源码 SHA-256 指纹绑定当前实现；本地 7 个聚焦测试已通过

终态 `achieved` + `proof.state: provisional`（reasons: `criterion_provenance`、`criterion_input_coverage`）。评审 1 次 `fresh_context`，reviewer `codex-field-option-review`，`acting_session: 019f5ad5-...`（真独立 session）。

### 7. 本会话实测

| 探针 | 结果 |
|---|---|
| `spawnSync("<abs>/check.cmd")`（即 `criterion.mjs:123` 对非 .js 的那条路） | **EINVAL**（Node CVE-2024-27980 修复禁止无 shell 生成 .cmd） |
| `spawnSync("<abs>/check.sh")` | **EFTYPE** |
| `rem nothing`（什么都不做） | **exit 0 → satisfied** |
| 纯空白命令 | **exit 0 → satisfied** |
| 不存在的 exe | exit 1 + stderr 为**中文且乱码**（`'...' �����ڲ����ⲿ��`） |

最后一行是 tail 模式匹配不可行的活证：载体的错误话术随 locale 与编码变化。

## 决议

### 决议 1：红必须可归因——判据亲口说的「不」才算红

**立论（第一性，不依赖 taskloop 有无此门）**：干活的人自己写判据，循环的诚实性全压在「判据是真的」上。只看红证明不了（恒红也过），只看绿也证明不了（恒绿也过）；**同一个判据先说不、后说是**——红→绿 transition——是自写判据**唯一的自证结构**，由「自写」这件事本身逼出来。

**假红不是「门没关严」，是让这个证明去证明了另一件事**：红=判据坏了、绿=判据修好了，则 transition 证明的是**判据被修好了**，不是活被干完了。A1 逐字如此：红在 `fa0013c2`（cmd.exe 拒绝），绿在 `66ea57e0`，中间隔三次 amend。

**机器能查的下限**：TDD 的红从不是「exit 非 0」，而是「因我预期的原因失败，且我读了那条消息」——人在回路里读。机器读不了「原因对不对」，能查的下限就是**判据至少开过口**。决议 1 是 TDD 的红在机器里剩下的那部分，不是全部。

**连带修复**（`applyObservationMutation`，`lib/task-engine.mjs:754-755`：attempts 与 `spent.rounds` 只在 `unsatisfied` 时累加）：假红重分类为 `indeterminate` 后不再造 attempt → 不再累积恒等指纹 → **虚假 stuck 消失**（残余见票 15）；**rounds 预算不再被没跑起来的判据烧掉**。

### 决议 2：`unsatisfied` 从 `exit 1` 挪走（专用号，如 3）

**立论（第一性，重述）**：筛选汇报通道的问题不是「哪条方便」，而是**「这条通道除了判据，还有谁会往里写」**——因为整票的病就是分不清谁在说话。

| 通道 | 谁还往里写 | 判据要学什么 |
|---|---|---|
| 退出码 | cmd.exe（8191→1）、PowerShell（语法错→1）、OS（127/9009）、shell（126） | 什么都不用学 |
| stdout/stderr | 解释器（CLIXML 实证）、被调工具（mvn） | 格式约定 |
| 报告文件 | **只有判据**（路径由 runtime 现指定） | 路径 + 格式 |

第一性的答案本是**报告文件**（唯一结构独占）。但**专用号在拥挤通道里划出事实独占**：3 与 4 谁都不说。真实差距遂变为：报告文件 = 结构独占 + 判据要读环境变量写文件 + runtime 管路径/清理/并发；专用号 = 事实独占 + 把 `exit 1` 改成 `exit 3`。

**且退出码是唯一零约定、跨语言、跨平台的通道——判据越简单，这个优势越大**（判据经常只有三行）。

**代价即目的**：`exit /b %ERRORLEVEL%` 这类透传型判据必须改写成翻译型（`if errorlevel 1 exit /b 3`）——把工具的码翻译成判据的裁决，正是要逼出来的动作。

**残余风险**：某工具真用 exit 3 表达别的意思（robocopy 用 0–8 表示成功）——仅在透传时发生，而本决议禁止透传。

### 决议 3：`satisfied` 从 `exit 0` 挪走（专用号，如 4）；`0` = 没说话

`exit 0` 是全世界的「没事」。实测 `rem nothing` → 0 → satisfied。更阴的是 **PowerShell 默认 `$ErrorActionPreference = 'Continue'`**：判据中途炸了不停，跑到末尾照样 exit 0 → 假绿 → **终态不可逆**。A1 的作者第一行写 `$ErrorActionPreference='Stop'` 是自觉，不是 runtime 的保证。

迁移成本已由决议 2 付清（作者已在改退出行），边际成本近零，边际收益真实：**「跑到末尾但没表态」不再等于「达成」**。

**原则：沉默不是同意，也不是否定——沉默就是没说话。**

### 决议 4：形态 = `kind:"file"`；派发补全为「任何本机能执行的文件」；skills 默认**推荐** `.mjs`（推荐，非强制）

**立论（第一性，不取材于 `criterion.mjs:121` 现有那行）**：

1. **脚本必须离开命令行** → 文件。命令行只放路径，8191 上限与 shell 解析器都碰不到脚本正文——引号与长度**同时**消失（同一根因的两个症状）。
2. **防篡改要 `declared_inputs`+hash** → 只有 `kind:"file"` 填充（`criterion.mjs:175-177`），`criterionDrift` 才有的可比。而今天 `.cmd`/`.sh` 走 `kind:"file"` 是 **EINVAL/EFTYPE**（实测）→ 只剩 `kind:"command"` → **`declared_inputs` 为空 → drift 永远为空 → 判据脚本可在动工后被静默改写且不产生 amend 事件 → 绕开票 07 决议 4 的整条时序规则**。故今天**「不写 JavaScript」的代价是丢掉防篡改**——那不是设计选择，是惩罚。
3. **封条类判据（见决议 4 的限制节）实际要算什么**：读文件、算 SHA-256、解析 JSON、比对 → 需要**有标准库的语言**。cmd/bat 干不了；PowerShell 干得了但 A1 死了（噪声/长度/精简环境缺 cmdlet）；node 原生且 **taskloop 保证它在**（`process.execPath` 就是 taskloop 自己）。→ **推荐** `.mjs`。
4. **但翻译类判据（`check.cmd` 跑 mvn，纯翻译退出码、不需标准库）完全合理** → **不强制**。

**执行面**（进 #04）：`criterion.mjs:121` 的派发补全为按类型启动——`.mjs/.js` → `process.execPath`（无 shell，唯一跨平台且解释器必存）；`.cmd`/`.ps1`（win32）、`.sh`/shebang（posix）→ 各自正确启动。`.ps1` 的 CLIXML 噪声问题**不用白名单绕**，归票 15 治本。

**自我更正（记录以防复发）**：本票初次推荐「只 `.mjs`」，头号卖点是**「仓内代码改动：0」**——而 `.mjs` 之所以现成，只因 `criterion.mjs:121` 恰好写了 `.cjs|.mjs|.js`。**那是既成事实，不是第一性结论。** 由 owner 当场抓到（「我主要是 java 后端 这个是最佳设计吗」）。**这是本图第四次「用被评估对象当参照系」翻盘**（前三次：票 02 根问题照抄 charter、票 02 骨架照抄分层、票 03 整体——owner 原话「你总是参考当前实现」）。本次同一会话内 owner 连抓三处：①「载体」是自造词且从未定义；②「零代码」当卖点；③把 `open_requirement` 当前提去争论松紧，而非先问该不该有这道门。

### 决议 5：未提交红测 `tests/taskloop-powershell-criterion.test.mjs` —— 弃

它要加的 `--criterion-powershell` 把脚本编成 UTF-16LE base64 `EncodedCommand`——**正是杀死 A1 的那个形态**，且平台锁死。膨胀 2.67×，约 3000 字符以上的判据必炸。

**依据（本票决议 1 的自指）**：该文件两个 import（`powershellCriterionCommand`、`payloadRepo`）在 `lib/application.mjs` **都不存在**（该模块只导出 `{ main, recoverV3TaskSnapshot }`），import 即炸 → **它自己就是一个恒红的检查器** → 恒红 = 没说话 = 无鉴别力。它是本票诊断的那个病的实例。从未进过 git。

**明记（自觉的丢弃，非静默删除）**：文件末尾第 5 个 test `hook repository routing recognizes a shell tool workdir` 与 PowerShell **毫无关系**——它测 `payloadRepo({cwd, tool_input:{workdir}})`，而 `workdir` 在 `lib/application.mjs` 全无踪迹。那是**另一个不存在功能的红测**，无证据、无主、不在本图路上。随文件一并弃；若日后真要「hook 路由识别 shell 工具的 workdir」，另起炉灶重开，不靠这个文件留存。

## 决议 1 的限制（owner 2026-07-16 提出，必须与决议 1 同读）

> Java 中业务比较复杂，可能单个测得没有问题，但是串起来就有问题了。TDD 只能保证编译没有错，不能保证业务的正确性。

**这条限制逐字写在 A1 的账本里**（见证据 6）：「本地 7 个聚焦测试已通过」＋「外部 SOFARPC/DB 结果无法由只读本地判据重复探测」。

**红→绿证明判据能分辨两个世界状态——但那两个状态是判据定义的。** 当业务真相机器够不到，判据退化成**封条**：查「证据 JSON 在」+「源码 SHA-256 指纹匹配」。**封条的两个状态是「证据不在／证据在」，不是「业务错／业务对」。** 它证明的不是业务对，是「你手工验过之后没人动过代码」。

**且这条限制是 A1 死因的上游**，因果链完整：

```
业务测不了
  → 判据退化成封条
    → 封条要算 SHA-256 + 解析 JSON
      → cmd.exe 干不了 → 伸手拿 PowerShell
        → Get-FileHash 在精简环境不存在（amend rev11）
          → 改用 .NET SHA-256
            → EncodedCommand → 9442 字符 → cmd.exe 拒绝 → 假红 → 开单放行 → 信任链污染
```

taskloop 做对了一半：它没假装封条是判据——`proof.state: provisional` + 强制 acceptance。但 `granted_by: **self**`：封条的验收是 agent 自己批的，人的那两次手工调用只作为 reason 字符串里的一句自述存在。

**移交票 14**（本票只记限制，不裁）。grant 面的不可伪造性属本图 fog「人类授权的不可伪造性」，已在册，不在本票。

## 移交

- **[票 14](../../.scratch/loop-engineering-best-practice/issues/14-unreachable-business-truth-seal.md)**：业务真相机器够不到时，判据退化为封条——这类工作的合法形态。维度 1 × 4 接缝。
- **[票 15](../../.scratch/loop-engineering-best-practice/issues/15-failure-signature-provenance.md)**：失败指纹取材于 `fnv1aHex(output_tail)`——两个方向都错（被淹则恒等 → 虚假 stuck；带时间戳则永不相等 → stuck 永不触发）。**修正维度 5「停止半边关闭」的判决**。

## 与其他票的关系

- **票 07**：其决议 3「形态退出证明分级」解锁本票的形态自由；本票决议 4 反过来证明形态仍有**非信任面**的后果（`declared_inputs` → drift → 时序规则），故「形态不影响评级」成立，但「形态无所谓」不成立。
- **票 06**：其三处接线把 `output_tail` 接进给 agent 的消息。本票证据 4 表明 `output_tail` 可被载体淹没——**06 的接线在 A1 这类样本上会把 CLIXML 噪声打给 agent**。决议 4 的默认配方（`.mjs`，不产生 CLIXML）移除该噪声源；残余归票 15。不重开 06。
- **四票同形再添一例**：06（手上有 `output_tail` 却扔了）／07（有 tail 却没拿它分类）／08（有 `acting_session` 却没拿它判独立性）／13（有 untracked 观测却用完即弃）——本票是**同形中最重的一例**：runtime 不只是扔掉证据，而是**把证据读成了健康的凭证**（`"The command line is too long."` → 「这判据会说不」→ 放行）。
- **根据线**：06「判据的身份不是判据的话」／07「声明只能作用于声明，不能作用于观测」／08「`acting_session` 是观测，`reviewer` 是声明」——本票是 **「exit code 与 output_tail 是信道的，不是判据的」**：runtime 分不清信道上是谁在说话。
