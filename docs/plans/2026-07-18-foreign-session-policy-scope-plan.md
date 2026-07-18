# 外部会话策略作用域修正实施计划

来源:`docs/issues/2026-07-18-foreign-session-policy-scope.md` 的实测评审(2026-07-18 会话,含 hook 探针矩阵)。
决策已定:P1/P2 建,P3 单独可选,同仓库多任务并行缓议。本文档是落地切分。

## 实施记录(2026-07-18)

阶段 0、阶段 1、阶段 2、阶段 3 已实现并全绿。经子代理两轴审查(Standards + Spec)后补做一轮修正,现 `npm test`:121 + 198 pass / 0 fail / 7 Windows skip。

**审查修正(2026-07-18,基于并行子代理 Standards/Spec 审查)**:
- **实质缺口(Spec)**:阶段 1 让外部会话的文件写(`cp`/`rm`/…)跨仓库无条件放行,只有 git -C 路径查目标仓库状态——违背 issue "目标属于仓库 B 时按 repoB 自身状态判断"。新增 `externalTargetDecision`:解析出的写目标落在外部仓库时,按该仓库自身 taskloop 状态裁决——控制状态(`.git`/`.taskloop`)恒受保护、与其活动任务 envelope 相交则冲突(点名那个仓库的 task)、否则并行放行;`containingRepoRoot` 定位目标所属仓库(`.git` 内部路径经 `--git-common-dir` 回退)。git 与文件写两条路径共用 `externalRepoActiveTask`。
- **Standards**:`gitCleanDashC` 手解析子命令位置违反"单一 git 分类器"约定 → 改为 `parseGitDashCInvocation` 复用 `gitSubcommandsAt`;并重命名消除与 `git clean` 破坏性检查的名字碰撞。`foreignFailureIsGitOnly` 的魔法 effect 数组 → 删除,`foreignAnalysisFailure` 改返回 `{category,message}`,git/host 分类单一来源。`readValidatedTaskProjection` 与 `siblingWorktreeOpenTasks` 的 digest 校验重复 → 抽 `digestVerifiedV3Projection` 共用。AGENTS.md 补记外部仓库作用域与 host-neutral session-id 文案两条。
- 测试新增 Part 5(外部仓库文件写:无状态放行、控制状态恒拒、与 repoB envelope 相交拒并点名、envelope 外并行放行、self 拥有放行),共 24 个。

**第二轮审查修正(2026-07-18,子代理复审)**:两轴复审确认首轮五项 Standards 与实质 Spec 缺口均已解决,并对新增代码提出:
- **fail-open(实质)**:`containingRepoRoot` 在 `--show-toplevel` 失败且 common-dir basename 非 `.git`(bare 仓库、`--separate-git-dir`、submodule 布局)时返回 null → 被当作"无仓库"放行,违背本阶段 fail-closed 不变量,对这些布局的 git 内部写是漏放。改:`containingRepoRoot` 返回 `{root}` / `{gitInternal:true}` / `null` 三态,git 内部但无法定位工作树根 → `externalTargetDecision` 按控制状态**拒**。探针实测 bare/separate-git-dir/`.git` 文件内部写均已拒,普通工作树文件与无仓库路径仍放行。
- **Standards 去重**:抽 `gitRevParse(dir,arg)`(`repoCommonDir` 与 `containingRepoRoot` 共用);抽 `foldedEnvelopeGlobs`(`foreignWriteDecision` 与 `externalTargetDecision` 共用)。
- **Spec 覆盖缺口**:补一条 Write 工具写入外部仓库冲突 envelope 的回归测试(此前 Part 5 仅用 Bash `cp` 驱动共享路径)。共 25 个测试,`npm test` 121 + 199 pass / 0 fail / 7 skip。

**阶段 3(`git -C` 跨仓库代查)**:外部会话的非只读 `git -C <dir> <subcommand>` 改由**目标仓库自身的 taskloop 状态**裁决(`gitExternalDelegation`,`lib/supervision.mjs`),而非本仓库地板。规则(全程 fail-closed):仅限干净的 `git -C <dir> <sub>` 形态;`push` 排除(不可逆外部);`destructive` 由效果地板先于 git 分支拦截(`git clean` 仍拒,不引入第二个 git 破坏性分类);仅当目标 git-common-dir 与本仓库不同才算外部(linked worktree 别名本仓库 git,永不外部)。目标状态读取复用 sibling-worktree 的 digest 校验快照读(无锁、best-effort):无状态/terminal → 放行;活动/挂起且属本会话 → 放行;他人活动任务 → 拒并点名那个仓库的 task;快照撕裂/不可读 → 拒。`foreignWriteDecision` 新增 `sessionId` 参数(判定 repoB 归属),`application.mjs` 传入。测试扩为 19 个(新增 Part 4 六个:无状态放行、push/clean 仍拒、self/子目录非外部、他人任务拒、self 任务放行、terminal 放行)。

**阶段 2(拒绝文案三分类 + 宿主中立)**:`foreignAnalysisFailure`/`foreignWriteDecision` 的拒绝语按三类重写(语义不变,仅文案):① 受保护资源(envelope 冲突点名任务 id + 文件,给 join/worktree;控制面写不提 join)、② 作用域不可解析("cannot resolve the write target",给绝对路径/拆分命令的可行动建议,不再是笼统禁止)、③ 宿主级风险地板(install/publish/destructive/remote-exec 等点名风险与授权,不再归因"foreign session ... denied")。`application.mjs:195/199` 的 "Codex hook session_id" 改为宿主中立 "host hook session id"。同提交更新 `taskloop.test.mjs`(Codex 文案、`not provable`→`resolve`)与 `foreign-session-scope.test.mjs`(UNPROVABLE 正则);`AGENTS.md` 记录三分类为 deliberate interface change。

**阶段 1 的机制在实施时被修正**:原计划假设"改一行 `unresolvedCommandWrite` narrowing"即可,但实测发现 `local.targets`(`localTargetsFromStructure`)只收集 shell 重定向目标,`cp`/`rm`/`mv`/`tee`/`mkdir`/`touch` 的**操作数目的地从不被解析**(`local.write=true` 但 `targets=[]`)。因此一行改动对它们是 no-op。真正的修法是**新增一个操作数目的地解析器**(经用户确认按新范围走):

- `lib/supervision.mjs`:新增 `writeToolProfile`/`extractWriteOperands`/`localWriteDestinations`,把六个 `LOCAL_WRITE_TOOLS` 的目的地按各自 getopt 语法解析并沿 cd 追踪解析为路径;任何无法确定完整目的地的形态(递归 `cp -r`/`-a`、`sed -i`、含 value/targetdir 字母的短簇、`-t` 缺值)返回 `enumerable:false` → **fail-closed 拒绝**。
- 新增 `envelopeRegionContains`(+`literalGlobPrefix`):捕获"写入 envelope 目录本身"这一泄漏方向(`cp x repoA/src` 落入 `src/**`),文件级 `insideEnvelope` 看不到。
- `foreignWriteDecision`:用 `commandWriteDestinations` 合并目的地,`!resolved` fail-closed;对所有已解析目的地追加**控制面守卫**(`controlPlaneRoots`),使外部会话 `cp` 进 `.taskloop`/`.git` 仍拒。新增 `home` 参数,`application.mjs` 传入。
- 血缘范围最小化:未改 `writeFileTargets`,故 owner 路径、全局 control-plane、untracked 追踪行为不变(owner 用 `cp` 逃逸 envelope 仍是既有行为,列为后续项)。

**已验证的行为翻转**(外部会话):`cp`/`rm`/`mv`/`tee`/`mkdir`/`touch`/重定向 → repoB 放行;同仓库非 envelope(`docs/`)放行;`cd <abs repoB> && cp` 放行。**仍拒**:落入 envelope(直接/`..`/`-t`/写入 envelope 目录/`cd` 相对进 envelope)、`.taskloop`/`.git`、`$VAR`/glob/反引号/`sed -i`(fail-closed)、install/publish/destructive/remote-exec 地板。

测试:`tests/foreign-session-scope.test.mjs` 从阶段 0 的 7 个不变量扩为 13 个(不变量 + 对抗 + 翻转)。原计划里 `cd <abs repoB> && cp` 作为"deny 不变量"已证伪(它是合法翻转),相应更新。

## Owner 路径修正(2026-07-18,先验证后实施)

前四阶段只改外部会话路径,owner 路径的跨仓库 scope-bleed 作为后续项。经本会话验证(75 个真实会话转录 1145 条命令 + 7 个历史任务真实 envelope + owner/foreign 对照探针)后按修订方案实施:

- **O1(控制面)**:`controlPlaneWriteFailure` 并入 `commandWriteDestinations` 目的地——owner `cp` 进 `.taskloop`/`.git` 从放行改为拒(与同目标 Write 工具、foreign 一致)。历史 1145 条命令中控制面命中数为 0,零摩擦。
- **O2(owner `git -C` 外部仓库)**:新增 `ownerGitDenial`,owner 路径的 git 授权检查对干净的 `git -C <外部仓库> <子命令>` 复用 `gitExternalDelegation`——按目标仓库状态判(无任务/本会话拥有→放行;他人任务→拒并点名),不再套 repoA 任务的 `envelope.git`。本地 git、`push`、repoA git 授权均不变。
- **O3a(owner 外部仓库文件写)**:新增 `ownerExternalTargetDenial`,owner 的可解析写目标落在外部仓库时走 `externalTargetDecision`(控制面/他人 envelope 拒,否则放行)。
- **O3b(降级)**:验证发现"owner 仓库内 envelope 外写"的 deny 在本仓库常用窄 envelope 下命中 37.5%–100%(全是合法清理),触发预注册翻盘条件——**不做 deny**(且这本就是现状,command 目的地从不进 owner envelope 检查)。原计划的"记入账本真实目的地"实现后发现会把 envelope 外写记为 `envelope_deviations`,改变报告语义并破坏既有测试,判定为范围外,**撤销记账改动**,保持 `<command>` 占位。

**有意保留的不对称**:owner 在自己仓库内被信任——shell 写可出 envelope(只有文件工具显式目标受 envelope 门禁)、不可解析目标不 fail-closed;这是"会话在自己声明范围内被信任"的设计,不是漏洞。同仓库多任务并行仍走 worktree。

测试:`tests/foreign-session-scope.test.mjs` 新增 Part 6(owner 六个:控制面、git -C 外部、他人任务拒、外部文件写、他人 envelope 拒、仓库内行为不变),共 31 个;`npm test` 121 + 205 pass / 0 fail / 7 skip。

**第三轮审查修正(2026-07-18,子代理复审 owner 路径)**:两轴复审确认 owner 路径修正正确——控制状态与 repoB-自身状态两条验收标准现对 owner 也闭合;owner/foreign 的信任不对称经 Spec 判定**站得住**(所有要求 envelope 强制的验收行都显式限定"外部会话",非目标"不取消活动任务的资源保护"针对的是不豁免外部会话、非 owner 自律);**无宿主级地板降级**——`ownerGitDenial` 只替代 `envelope.git` 授权,`commandSafetyFailure` 的效果地板仍无条件运行,`git -C repoB clean -fdx` 仍需本任务 destructive 授权(资源作用域 vs 宿主地板的正确区分)。据 Standards 两项 judgement call 修正:①`ownerGitDenial` 改为把未委查的未授权 op 聚合成一条消息(恢复旧聚合语义、单命令场景逐字节一致,同时保留委查);②抽 `allWriteTargets(tool, mapping, call)` 消除三处(`controlPlaneWriteFailure`/`foreignWriteDecision`/`ownerExternalTargetDenial`)逐字重复。`npm test` 121 + 205 pass / 0 fail / 7 skip。

**仍未做(非本 issue 直接诉求)**:外部会话 untracked 通知文案(`untracked.mjs:116`)对现已放行的跨仓库写仍提示 worktree,措辞可对齐——单独决策。

## TL;DR

- 根因不是"效果类拒绝先于归属"一条,而是两条:效果类地板无视目标归属(`lib/supervision.mjs:1529-1540`),加上外部会话对 shell 本地写的一票否决——已解析的绝对路径目标不参与放行判断(`lib/supervision.mjs:1555-1557`)。后者才是 `rm`/`cp` 跨仓库被拒的直接机制。
- 修正核心是**对齐而非放松**:让全部写目标可安全解析的 shell 命令,走文件工具(Write/Edit)今天已经在走的 canonical 目标 + envelope 相交路径。不新增任何信任面。
- 四个阶段,严格顺序:阶段 0 回归基线(含对抗不变量,先行合入)→ 阶段 1 目标同权 → 阶段 2 拒绝文案三分类与宿主中立 → 阶段 3(可选、单独决策)`git -C` 跨仓库代查。
- 不做:同仓库多任务资源级并行(现答案是 git worktree)、放松 install/publish 等效果类全局地板、同文件区域并行。

## 决策信封

```yaml
decision: BUILD            # 阶段 0-2;阶段 3 单独可选;同仓库多任务 DEFER
target_outcome: 外部会话拒绝仅发生在可证明触及受保护资源或作用域不可解析时,且错误可指认原因
baseline_and_frequency: 实测 7 类跨仓库操作中 4 类被误拒(rm/cp/git 写/install);跨仓库工作流每次触发
expected_benefit: 阶段 1 覆盖误拒主源(rm/cp/重定向类);阶段 2 让剩余拒绝可自诊断
delivery_and_maintenance_cost: core+supporting 约 1.5-2 天;阶段 3 另计 1-2 天;维护≈新增回归测试
status_quo_or_existing_mechanism: 维持现状 + "在目标仓库启动会话";worktree 覆盖同仓库并行
decision_flip_condition: 对抗测试证明 canonicalWriteTarget 可被绕过 → 阶段 1 回炉收窄;
  host 无法使用 worktree 流程 → 重新评估同仓库多任务
review_scope: implementation-authorization
review_budget: 默认
```

## 实测基线(2026-07-18,回归测试的锚)

fixture:repoA 含活动任务(envelope `src/**`,owner sessA),sessB 从 repoA 触发 hook(profile claude,mode deny),目标指向独立 repoB。

| 操作 | 现状 | 阶段 1 后期望 |
| --- | --- | --- |
| `git -C repoB status` | 放行 | 放行(不变) |
| `cd repoB && npm test` | 放行 | 放行(不变) |
| `npm --prefix repoB run build` | 放行 | 放行(不变) |
| `cargo test --manifest-path repoB/...` | 放行 | 放行(不变) |
| `> repoB/output.txt` 重定向 | 放行 | 放行(不变) |
| Write 工具写 repoB 文件 | 放行(untracked 通知) | 放行(不变) |
| `cp src repoB/dest` | **拒:write target is not provable** | 放行 + untracked 通知 |
| `rm repoB/generated-file` | **拒:write target is not provable** | 放行 + untracked 通知 |
| `git -C repoB add -A` | 拒:git not read-only | 不变(阶段 3 议题) |
| `npm --prefix repoB install` | 拒:install denied | 不变(地板保留,阶段 2 改文案归类) |
| `rm`/`cp` 指向 repoA envelope 内 | (经文件工具已拒) | 拒,点名文件与任务 |
| 同仓库 envelope 外单文件写 | 放行 + 通知 | 不变 |
| 同仓库 envelope 外第 2 个文件 | untracked 多文件拒 | 不变 |
| 同仓库开第二个任务 | 拒:already exists | 不变(DEFER) |

## 阶段 0:回归基线(阻塞后续合入)

新增 `tests/foreign-session-scope.test.mjs`,沿用 `tests/taskloop.test.mjs` 的 `run()`(:37)与 `fixture()`(:66)模式和 hook payload 形态(:504、:539)。

两类用例,分开落:

1. **不变量(必须现在就绿、永远绿)**——先于阶段 1 合入:
   - `cp x repoB/../repoA/src/a.txt`(`..` 穿越)→ envelope 拒;
   - 经 repoB 内符号链接指向 repoA envelope 的写 → envelope 拒;
   - 大小写折叠变体(`SRC/A.TXT`,darwin/win32 fold,`lib/supervision.mjs:1466`)→ envelope 拒;
   - `cd repoB && cp a b`(目录切换 + 相对目标)→ 拒(:1552-1554 保留);
   - `$VAR`/glob/反引号目标(`pathMeta`,:1467)→ 拒;
   - 无目标写形(`sed -i` 类)→ 拒;
   - 控制面写(`.taskloop/`、`.git/`)→ 拒(:1498);
   - install/publish/destructive/dynamic_exec 效果类 → 拒(:1529-1540)。
2. **期望行为(阶段 1 的红转绿)**——随阶段 1 提交落地:上表"阶段 1 后期望"列的翻转项。

工作量:约 0.5 天。验证:`npm test` 全绿(不变量部分)。

## 阶段 1:目标同权(P1,core)

唯一改动点:`lib/supervision.mjs:1555-1557` 的 `unresolvedCommandWrite`。现为:

```js
const unresolvedCommandWrite = call.commands.some(({ analysis }) => analysis.local.write);
```

改为:仅当某命令有本地写形且其目标为空或存在无法经 `canonicalWriteTarget`(:1479)解析者,才判不可证明:

```js
const unresolvedCommandWrite = call.commands.some(({ analysis }) =>
  analysis.local.write && (
    analysis.local.targets.length === 0 ||
    !analysis.local.targets.every((raw) => canonicalWriteTarget(repo, raw))
  ));
```

目标全部可解析时自然落入既有的 canonical + envelope 相交循环(:1558-1565):envelope 内 → 拒(点名文件);repo 内 envelope 外 / repo 外 → `untracked`,交给 `observeUntracked`(`lib/untracked.mjs:42`,repo 外目标只通知不拒,:97-101 已有此契约)。

**安全论证**:放行判断复用 Write/Edit 工具今天已信任的同一批原语(`canonicalPath` 走 `realpathSync` + case fold);若这些原语可被绕过,文件工具路径早已同洞。阶段 0 不变量就是这个论证的可执行形式。

不动:`foreignAnalysisFailure` 地板、cd+相对拒绝、控制面检查、owner 会话路径。

工作量:约 0.5 天(改动 + 红转绿 + 全量 `npm test`)。

## 阶段 2:拒绝文案三分类与宿主中立(P2,supporting)

把外部会话相关拒绝语分成三类,消息模板改而语义不改:

| 类别 | 现文案(位置) | 改后要点 |
| --- | --- | --- |
| ①任务资源冲突 | `cannot write inside the task envelope: <file>`(supervision.mjs:1564) | 已达标,补任务 id |
| ②作用域无法解析 | `write target is not provable` / `not safely resolvable` / `depends on a shell directory change`(:1553、:1557、:1560) | 明示是解析限制,建议绝对路径或拆分命令,不再归因"外部会话禁止" |
| ③宿主级风险地板 | `foreign session package installation is denied` 等(:1529-1540) | 说明是宿主级安全地板,与工作区会话绑定无关 |

另两处宿主中立化(本会话实测发现):`lib/application.mjs:195`、`:199` 的 `TASKLOOP_SESSION_ID conflicts with the Codex hook session_id` —— 检查本身宿主无关(claude profile 下实测触发),文案硬编码 "Codex",改为宿主中立表述。

配套(同一提交):

- 全仓 grep 精确旧文案更新测试断言(`tests/taskloop.test.mjs`、`tests/host-hooks.test.mjs`、`tests/command-safety-adversarial.test.mjs`);
- AGENTS.md 增一行记录 deny 文案的 deliberate interface change(仓库约定:hook 协议字节级兼容,变更需文档化)。

工作量:约 0.5 天。

## 阶段 3(可选,单独决策):`git -C` 跨仓库代查

进入条件:阶段 1/2 落地并在日常使用中验证后,仍有真实的跨仓库 git 写需求。

机制概要:`-C`/`--git-dir` 解析出的目标仓库 canonical 化后在本仓库之外时,由当前 hook 进程代查目标仓库 `.taskloop` 投影——无状态或 terminal → 放行(untracked 通知);他人活动任务 → 拒,引用**那个**仓库的任务。风险:跨仓库锁纪律、worktree 别名(git-common-dir)、递归代查。仅覆盖 git;`--prefix`/`--manifest-path` 不适用(npm scripts 可写任意路径,声明不可信)。

工作量:1-2 天。与阶段 1/2 不并行。

## 配套修正(supporting)

- `docs/issues/2026-07-18-foreign-session-policy-scope.md`:"实际行为"一节替换为实测矩阵(7 条复现中仅 4 条真实被拒),同仓库并行一节标注 DEFER 与 worktree 现答案。约 0.5 小时。
- 可选:`install.mjs` 或 `taskloop audit` 检测 Claude settings 中旧式无参 taskloop hook 并告警(本机曾因此长期运行 unknown profile、Stop 硬阻断静默退化;installer 现只对 Codex 旧配置告警,`install.mjs:561-564`)。约 0.25 天,单独可决。

## 范围与成本

| 层 | 组件 | 工作量 |
| --- | --- | ---: |
| core | 阶段 0 不变量 + 阶段 1 目标同权 + 红转绿 | 1 天 |
| supporting | 阶段 2 文案三分类 + 断言更新 + AGENTS.md 记录 | 0.5 天 |
| supporting | issue 文档实测矩阵修正 | 0.5 小时 |
| optional | 阶段 3 git -C 代查 | 1-2 天 |
| optional | 旧式无参 hook 检测告警 | 0.25 天 |
| **合计(core + supporting)** | | **≈1.5-2 天** |

## 验收 Oracle(整体)

- 实测矩阵按"阶段 1 后期望"列全部翻转,不变量用例全绿;
- `npm test` 全量通过(行为、架构、hook 协议、installer、skill 闭包套件);
- 拒绝消息可归入三类之一,且①类点名具体文件与任务、②类给出可行动建议、③类不再归因会话绑定;
- `git log` 中每阶段独立小提交,阶段 1 单提交可干净 revert(恢复一票否决即回到基线)。

## 顺序约束(hazard)

1. 阶段 0 不变量测试**先于**阶段 1 放宽合入——对抗用例是放行逻辑的前置证据,不是事后补票。
2. 阶段 2 文案、测试断言、AGENTS.md 记录同一提交,保持 hook 协议变更可审计。
3. 阶段 3 在阶段 1/2 验证前不开工,不并行。

## 回滚

每阶段一个独立提交。阶段 1 回滚 = 恢复 `unresolvedCommandWrite` 一票否决行;阶段 2 回滚 = 文案与断言同revert;阶段 3 独立分支,不影响前两阶段。
