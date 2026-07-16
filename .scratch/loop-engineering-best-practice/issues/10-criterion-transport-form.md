# 10 — 判据传输形态

Type: grilling
Status: resolved
Blocked by: 07

## Question

判据怎么送到 runtime 手里？这是 [Gate 0 裁决](../../../docs/decisions/2026-07-15-supervisor-charter-gate0.md)从 supervisor 决策稿里救出的**唯一有硬证据**的条目（决策稿 §11 支撑项「显式 argv criterion + legacy command 兼容」，定价 1–2 日）。

**证据**（业务仓样本 `1e123be8`，v2 账本）：首次 observation 的 `output_tail` = `"The command line is too long."` → 被迫 amend（「压缩 PowerShell 判据以满足 Windows 命令行长度限制」）→ 该 amend 自授 5 个 `criterion_subject` grant → review floor 抬升 → 埋下 `criterion_provenance` + `criterion_input_coverage` 缺口 → 终态 `proof.state: provisional`。**一条判据传输故障，污染了信任链一整条。** 这是 A3 在账本里唯一一次真实开火，且开在判据面而非控制面。

裁决问题：

1. **问题定义**：要解的是**引号/编码**（shell 元字符、CJK），还是**长度**（Windows 命令行 8191 上限），还是两者？二者的解法不同，且可能互相拉扯——见第 3 问。
2. **配方 vs 机制**：现状 `lib/criterion.mjs:119-123` 已有 `kind: "file"` 形态，且 `kind:"command"` 走 `powershell.exe -NoProfile -File <path>` 这种短命令行完全可行——即最便宜的解法可能是**使用配方**（判据脚本落文件，命令行只放路径），仓内机制不动。若要动机制，动哪一块？（注意 `kind:"file"` 对 `.ps1` 的派发：:121 只对 `.cjs|.mjs|.js` 用 `process.execPath`，其余直接 spawn 文件本身。）
3. **未提交红测的处置**：`tests/taskloop-powershell-criterion.test.mjs`（未提交、红——import 的 `powershellCriterionCommand` 在 `lib/application.mjs` 不存在，:173 报错文案仍是旧的两选一）要的 `--criterion-powershell` 把脚本编成 **UTF-16LE base64 `EncodedCommand`**——正是撑爆命令行的那个形态，膨胀 ≈2.67×（UTF-16 翻倍 × base64 的 4/3），约 3000 字符以上的判据必炸。它解决引号/编码（用例含 `&` 与 CJK）但**继承并放大长度天花板**。留、改、还是弃？

4. **判据执行失败与判据不满足的可区分性**（[票 06](06-feedback-quality-criterion-as-teacher.md) 2026-07-15 移交）：同一样本暴露的结构性盲区——`cmd.exe` 层拒绝执行（命令行太长，判据脚本**压根没跑起来**）→ `exit_code = 1` → tri-state protocol 读成 `unsatisfied`（「判据跑了，说没达成」）→ **runtime 结构上分不清「判据没跑起来」与「判据说没达成」**。tri-state 的 `exit 2 = indeterminate` 本为此设计，但被**传输层失败绕过**：脚本没机会返回 2。这与第 1/2 问同源——载体决定了传输故障能不能被判据自己捕获并如实上报，故一并在本票裁。（06 已裁的那一半是「病因没被说回去」，属反馈面，不在本票。）

**为何 Blocked by 07**：机制形态直接撞票 07 的溯源盲区——把判据推进仓内文件，就是把它推进 `repo` 受信桶，而 `lib/criterion.mjs:178-182` 按**路径**判信任、不按**作者**判，正是 07 要裁的东西。07 先定溯源，本票才能定形态；**配方形态不受此阻塞**，但为免决议分裂，一并在本票裁。

**落点**：runtime（`lib/criterion.mjs` / `lib/application.mjs`）与/或 skills 文本（使用配方），由本票裁定。

## Comments

- **2026-07-15：07 已裁，本票解锁**（见[信任链决策记录](../../../docs/decisions/2026-07-15-trust-chain-authorship-review.md)「给票 10 的预裁」节）。三条对本票的影响：

  1. **阻塞理由消解**：07 决议 3 把**形态踢出证明分级**（`provenance`/`input_coverage` 两个坏代理退出，换成作者+时序）。**判据推进仓内文件不再等于推进 `repo` 受信桶**——评级不受形态影响。**本票可自由选传输形态**（配方派/机制派均不再有信任面的副作用），第 2 问的解空间完全打开。
  2. **反向警告（本票落地前必读）**：若形态**仍**进分级（即 07 不这么裁），本票的修复会同时（a）让 agent 自写的检查器白拿 `repo`+`full` 满级信任、(b) **静默关掉当下唯一在跑的评审触发器**（账本 5 次评审里 2 次纯由形态注定的缺口凭空造出）。休眠洞不是「醒来」，是被本票的修复亲手打开。**这条已由 07 拆除，记录于此以防形态分级被复活。**
  3. **本票任务被锐化**：07 决议 4 裁定**传输型 amend 不给豁免**——「判据语义不变」是不可验证的自证，给豁免等于开一道只需声明就能过的门。故 A1 那 3 次 amend 在新规则下**照炸不误**。**本票的职责是消除传输故障本身，而不是为它争取豁免。**

- **第 4 问已被独立证实（原始数据，非推断）**：A1 任务 `r1` 的 `initial_observation` 逐字为——
  ```
  verdict=unsatisfied   exec_error=null   exit_code=1
  tail="The command line is too long."
  ```
  即传输故障被记成一次**干干净净的 `unsatisfied`**：判据压根没跑起来，账本却显示「判据跑了，说没达标」。`execution_error` **没有**被置位，故**下游无法用它做鉴别器**（07 曾假设可以，被此数据证否）。runtime 手上有 tail 白纸黑字的证据却没用它分类——与票 06 的「runtime 手上有 `output_tail` 却扔了」**同形、同因、异地**。

- **对 07 决议 4 的落地约束（本票可据此反推形态要求）**：07 的线是「动工后 amend = 时序违规」，而 `task_amended` 事件**不带 `artifact_revision`**，故「开单 2 分钟后修跑不起来的判据」（A1 r2）与「隔天 9 次写入后改判据」（A1 r11/r16）在账本里长得一模一样。schema 补 `artifact_revision` 是 #04/09 的执行项；但**本票若把传输故障消灭在开单前，r2 这类 amend 根本不会发生**——这是本票价值的一个独立论据。

## Answer

2026-07-16 裁决。全文见[判据传输形态决策记录](../../../docs/decisions/2026-07-16-criterion-transport-form.md)。

**票面四问全部重写**——问题不是「引号还是长度」，是**判据从没跑起来过，而 runtime 把「跑不起来」读成了「判据说没达成」，还拿它当「这判据会说不」的证据放行了开单**。

**账本硬证据**：开单判据 `kind=command`、9442 字符 EncodedCommand，解码后脚本仅 **3525 字符**（本来就装得下 8191）——**膨胀 2.68× 是「解引号」买来的**，长度不是独立问题。`initial_observation` 逐字 `verdict=unsatisfied / exec_error=null / exit_code=1 / tail="The command line is too long."` → `open_requirement: "unsatisfied"` 看见它要的红 → 打印 `opened; criterion unsatisfied` 放行。**门禁对坏判据通过率 100%，对好判据 <100%——与判据健康度反相关。** 三次 amend 只有一次与载体有关（另两次是缺 `Get-FileHash`、`Test-Path` 语法错，换任何载体照样假红）——**修载体只救 1/3**。终态判据仍是 EncodedCommand、7386 字符，即**验收语义被压缩去迁就载体**。

**五条决议**：

1. **红必须可归因**——红→绿 transition 是自写判据唯一的自证结构（第一性推导，不依赖 taskloop 有无此门）；假红不是「门没关严」，是让证明去证明了**判据被修好了**而非活干完了（A1 逐字：红@`fa0013c2` → 绿@`66ea57e0`，中间三次 amend）。机器能查的下限 = 判据至少开过口。**连带修复**：假红重分类为 indeterminate 后不再造 attempt（`task-engine.mjs:754`）→ 虚假 stuck 消失（残余归 15）、rounds 不再被没跑起来的判据烧掉。
2. **`unsatisfied` 从 `exit 1` 挪走**（专用号如 3）——立论重述：汇报通道**必须独占**（「除了判据还有谁往里写」）；报告文件是唯一结构独占，但专用号能在拥挤通道里划出**事实独占**，且是唯一零约定、跨语言跨平台的通道，三行判据不值报告文件的成本。代价即目的：透传型 `exit /b %ERRORLEVEL%` 必须改写成翻译型。
3. **`satisfied` 从 `exit 0` 挪走**（专用号如 4）；**`0` = 没说话**。实测 `rem nothing` → 0 → satisfied；PowerShell 默认 `Continue` 下判据中途炸了仍 exit 0 → 假绿 → 终态不可逆。**沉默不是同意，也不是否定。**
4. **形态 = `kind:"file"`；派发补全为「任何本机能执行的文件」；skills 默认推荐 `.mjs`（推荐，非强制）**。第一性论据：①脚本离开命令行 → 引号与长度同时消失；②`declared_inputs`+hash 只有 file 有 → 今天 `.cmd`/`.sh` 是 **EINVAL/EFTYPE**（实测）→「不写 JS」= 丢掉 drift = 绕开 07 时序规则 = **惩罚**；③封条类判据要算 SHA-256+解析 JSON → 需标准库 → node 原生且必存 → 推荐 `.mjs`；④翻译类判据（`check.cmd` 跑 mvn）合理 → 不强制。`.ps1` 的 CLIXML 噪声不用白名单绕，归 15 治本。**自我更正**：初次推荐「只 `.mjs`」的头号卖点是「零代码」——**那是拿现有实现当参照系**，本图第四次栽在这上面，owner 当场抓到（「我主要是 java 后端 这个是最佳设计吗」）。
5. **未提交红测弃**。`--criterion-powershell` institutionalize 了杀死 A1 的形态且平台锁死；且该文件两个 import 都不存在 → **它自己就是个恒红检查器** → 按决议 1：恒红 = 没说话 = 无鉴别力。**明记**：第 5 个 test（`payloadRepo`/`workdir` hook 路由）与 PowerShell 无关，是另一个不存在功能的红测，随文件弃——**自觉丢弃，非静默删除**。

**决议 1 的限制**（owner 提出，必须同读）：**红→绿证明判据能分辨两个世界状态，但那两个状态是判据定义的。** 业务真相机器够不到时判据退化成**封条**（查证据+源码指纹），它的两个状态是「证据不在／证据在」，**不是「业务错／业务对」**。且这条限制是 A1 死因的**上游**：业务测不了 → 封条 → 要算 SHA-256 → cmd 干不了 → PowerShell → `Get-FileHash` 缺 → EncodedCommand → 9442 → 死。移交**票 14**。

**根据**：**exit code 与 output_tail 是信道的，不是判据的**——runtime 分不清信道上是谁在说话。与 06「判据的身份不是判据的话」／07「声明只能作用于声明，不能作用于观测」／08「`acting_session` 是观测，`reviewer` 是声明」是同一根线；**本票是同形中最重的一例**：runtime 不只是扔掉证据，而是**把证据读成了健康的凭证**。

**移交**：[票 14](14-unreachable-business-truth-seal.md)（封条形态）、[票 15](15-failure-signature-provenance.md)（失败指纹取材，**修正维度 5「停止半边关闭」的判决**）。
