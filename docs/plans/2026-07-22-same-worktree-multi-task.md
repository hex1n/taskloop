# Workloop 多任务放置与隔离方案

日期：2026-07-22
状态：方案修订完成；待评审，未授权实施
模式：Plan
深度：Deep
决策：BUILD（来源：用户要求按最佳设计重构，不考虑兼容）
适用边界：同一 Git 仓库中的任务既可在一个 worktree 内按路径分区，也可每个 task 独占 worktree；非 Git 目录只支持分区模式
输入来源：当前仓库 `AGENTS.md`、README、Contract 7 的 `lib/application.mjs`、`历史任务状态运行时`、`lib/event-store.mjs`、`lib/task-store.mjs`、`lib/criterion.mjs`、`历史监督运行时`、session/worktree 历史方案、现有 Hook/runtime 测试和本轮用户约束

## TL;DR

当前最佳设计不是“一个 repo 只能有一个 active task”，也不是“所有并行任务都强制创建 worktree”，而是一个统一 task 模型下的两种一等 placement：

> `partitioned` 允许不相交任务共享 worktree；`exclusive_worktree` 让每个 task 独占 working tree、index、HEAD 和 branch。每个 worktree 仍只有一个事件权威；两种模式共享 session、criterion、evidence、Hook 和终态语义。Git stage/commit 始终限定任务路径，宿主始终保留工具执行与审批权。

本方案不新增 Runtime Contract 8。Runtime Contract 7 继续只表达三个稳定边界：

1. 工具执行和批准权属于宿主；
2. Workloop 观察事实并认证任务，不在默认模式拦截执行；
3. worktree 内的 append-only 事件流是唯一权威。

多任务数量、projection 布局和事件 framing 属于独立 schema，不再用 Runtime Contract 主版本表达。由于用户明确不考虑兼容，本次采用唯一当前模型的硬切换：删除现有 Contract 5/6 compatibility runtime、旧 payload/reducer 分支、installer pin 和兼容测试；不做迁移器、不保留双读写。旧状态只允许字节保全后显式归档。

## 行动方案

1. 将单一 `TaskProjection` 重构为一个 per-worktree `RepositoryState` 聚合，内部包含一个或多个 task。
2. 为 task 增加 `placement`：`partitioned` 或 `exclusive_worktree`；task 身份、session 参与关系、写作用域和验收作用域继续共享同一模型。
3. 把 artifact reconciliation 上移到 repo 层：仓库变化只记录一次，再确定任务归属和干扰。
4. 让所有 CLI 动词显式或可推导地选择 `task_id`；`join` 连接 task，不再按 repo 接管唯一任务。
5. 将 `git add` 和 `git commit` 定义为任务路径事务；Workloop 提供显式 `stage`/`commit` 深模块保证范围和串行性，直接 Git 命令仍由宿主执行并由 Hook 事后核对。
6. 保持 `observe`/`nudge` 完全不返回 allow/deny/block；冲突只影响归属、assurance 和 terminal certification。显式 `deny` 仍是唯一执行拦截模式。
7. 在同一次发布中删除 Contract 5/6 的读取、决策、projection、installer pin 和 fixture；不先发布一个“新模型 + 旧兼容层”的中间态。
8. 用 `git worktree list --porcelain -z` 派生同一 Git common repository 的 task catalog；不创建第二个中央权威。显式 `open --placement exclusive-worktree` 可创建并初始化独立 worktree，但 terminal 不自动删除、切换或合并它。
9. 将 Hook 归属改为 target-authority first：session 从哪个 repo 启动不等于操作属于哪个 repo；可证明只写 repo 外部的操作不进入源 task 权威。

## 当前最佳性检查

- 决胜条件：任务证据不串线、简单任务共享 worktree、强隔离任务独占 worktree、宿主权限边界不变、Git 提交不夹带、跨 worktree 可发现、崩溃后各权威可重放、生产代码没有旧 Contract 分支。
- 胜出方案：唯一当前模型 + 双 placement：per-worktree 聚合权威、task placement、session→task 绑定、repo artifact delta 路由、任务级 Git 事务、Git-derived worktree catalog，并删除所有旧 Runtime 兼容路径。
- 最接近替代：所有任务都强制独立 git worktree。它隔离最强、状态模型更小，但给纯文件不相交任务增加不必要的 branch/worktree 生命周期。
- 替代方案胜出的条件：绝大多数任务都需要独立分支、repo-wide criterion 或动态共享输出，以至 `partitioned` 很少安全可用。
- 胜出方案的失败条件：placement 自动选择或隐式切换导致任务落错工作树，或 worktree 创建失败后被错误清理。缓解方式是 placement 必须显式、创建失败保留现场、永不自动清理。
- 边际停止点：不为历史数据开发迁移器，不重命名 Runtime Contract 7 只为消除数字，不开发通用调度器、不自动 merge/remove worktree、不解释任意 shell 的完整副作用、不在同一 worktree 虚拟多分支、不引入分布式锁。

## 下一步验证

实施前冻结两层 fixture。第一层是不接宿主的纯状态机：

1. Task A 和 Task B 在同一 worktree 以不相交写作用域打开；
2. 两个 session 的事件交错写入同一 ledger；
3. 删除 projection 后可从 ledger 重建两个 task 的精确状态；
4. A 的正常写入只推进 A 的 artifact revision；
5. A 写入 B 的作用域时，A 得到 scope deviation，B 得到 foreign-task interference；
6. 一条 repo transaction 可以原子更新两个 task；
7. 重叠写作用域在 `open`/`amend` 控制面提交前失败，ledger 不产生半条记录。
8. 生产安装产物、manifest 和运行时源码中不存在 `compatibility_runtimes`、Contract 5/6 reader/decider 或旧 Runtime pin。
9. Session A 绑定 Task A，但一次操作只写可解析的 repo 外文件：Task A 的 operation、budget、artifact、criterion freshness 和 Stop rounds 全部不变。

第二层使用临时 Git 仓库：创建 Task C 的独占 worktree，证明它拥有独立 index/HEAD/branch；`tasks --all-worktrees` 同时发现共享 worktree 中的 A/B 和独占 worktree 中的 C；C 的 stage/commit 不改变 A/B worktree 的 index 或 HEAD。

若同一 worktree 的 A/B 需要复制 ledger，聚合模型失败；若跨 worktree 发现必须引入第二个持久中央 registry，worktree catalog 方案失败。两者都通过才进入实施拆解。

## 验收预言机

方案完成必须同时满足：

```text
同一 worktree 可有 N 个 active/suspended task
AND 每个 task 的 placement 明确为 partitioned 或 exclusive_worktree
AND exclusive_worktree 中至多有一个 live task
AND 每个 session 在该 worktree 至多绑定一个 live task
AND 任意写路径最多属于一个 live task
AND repo artifact delta 只持久化一次
AND 每个 task 只接收自己的 artifact 变化或显式 interference
AND task A 的完成不要求 task B terminal
AND task add/commit 的实际路径集合是其写作用域的子集
AND observe/nudge 永不改变宿主执行决定
AND 删除 state.json 后可以只靠 events.jsonl 完整重建
AND 安装目录只保留一个当前 Runtime
AND 旧格式状态只能被识别和归档，不能被读取、迁移或继续执行
AND 同一 Git common repository 的所有可读 worktree task 可被派生 catalog 发现
AND exclusive_worktree 的 stage/commit 不改变其他 worktree 的 index 或 HEAD
AND 可证明纯外部目标的操作不改变启动 repo 中任何 task 的权威状态
```

边界验收：范围不明的 Bash、跨任务写入、普通无 pathspec 的 `git add .`/`git commit` 都不得被静默归属为某个 task 的干净证据。

## 根问题

当前实现把三个不同问题压在“worktree 唯一 active task”上：

1. 仓库事实应该写入哪个权威？
2. 某个 session 正在服务哪个任务？
3. 某个文件变化属于哪个任务？

worktree 是共享内容和事件事务边界，不是 task 身份。强制一个 worktree 只有一个 task 会把合法的独立工作错误合并；按 session 单独建 ledger 又会失去对同一 working tree 的原子观察。

同时，当前源码为了保留 Contract 5/6，把事件 payload、reducer、projection、installer manifest、runtime pruning 和测试矩阵都分叉。用户已明确不需要旧任务继续运行，这些分支不再保护真实约束，只会扩大每次状态模型修改的组合面。

解决后的状态是：task、session、文件归属和 placement 均是一等实体。同一 worktree 共享一个事实权威；不同 worktree 各自拥有事实权威，并通过 Git 的 worktree catalog 被联合发现而不合并权威。

## 真实约束、约定与假设

| 项目 | 分类 | 方案含义 |
|---|---|---|
| 同一 worktree 的文件内容物理共享 | 真实约束 | repo artifact 必须集中观察，不能每个 task 各自声称全仓事实 |
| Git index、HEAD 和当前分支物理共享 | 真实约束 | stage/commit 需要短事务串行；独立历史必须用 worktree |
| linked worktree 共享 object store/common refs，但各有 working tree、index 和 HEAD | 真实约束 | worktree task 可独立 stage/commit；同 ref 更新仍由 Git 原生锁保证 |
| 宿主拥有工具执行与审批权 | 真实约束 | 默认 Hook 只能记账和影响认证，不能拦截 |
| 一次 shell 操作可能触及多个 task | 真实约束 | operation 必须有 repo 级关联身份，不能强塞给一个 task |
| Hook 的 `cwd` 只表示启动上下文，不表示目标资源归属 | 真实约束 | 每个可解析目标按其所在 authority 路由；纯外部目标不得污染源 task |
| criterion 可能读取整个 repo | 真实约束 | 任务需要验收作用域；默认全仓以保持保守正确 |
| 每个 repo 只能有一个 active task | 历史约定 | 删除 |
| `join` 等于转移 repo 唯一 owner | 历史约定 | 改成加入指定 task；协调者转移独立建模 |
| 升级必须保留 Contract 5/6 Runtime | 已取消的产品约定 | 删除 pins、旧 reader/reducer 和兼容 fixture |
| 所有并行任务都需要独立 worktree | 已被用户场景推翻的假设 | 只在分支/历史或共享输出无法隔离时成立 |
| task 文件集合可以预先声明 | 负载假设 | 若经常无法声明，same-worktree 并行应退回 worktree |

## 方案比较

| 机制 | 优点 | 失败模式 | 裁决 |
|---|---|---|---|
| 保持一个 worktree 一个 task | 无改造成本 | 错误合并独立任务，阻止有效并行 | 淘汰 |
| 所有任务强制一个 task 一个 worktree | 隔离最强，复用 Git | 纯文件任务操作成本偏高，无法按任务选择成本更低的隔离 | 最强替代 |
| 仅靠 session 标签和人工约定 | 实现很小 | 无法证明真实写入和 commit 范围 | 淘汰 |
| 每 task 独立 ledger | task 读取简单 | 同一工作树变化被重复/冲突记录，跨任务原子性消失 | 淘汰 |
| 新模型继续携带 Contract 5/6 pins | 旧任务还能完成 | 每个事件和安装改动继续承担多代组合复杂度 | 淘汰 |
| 只支持同-worktree 分区 | 无 worktree 生命周期代码 | 无法满足独立 branch/HEAD 和隔离验收 | 淘汰 |
| 双 placement、per-worktree 聚合权威 | 简单任务低成本并行，复杂任务强隔离 | placement/catalog/worktree 生命周期测试更多 | 胜出 |

## 目标架构

```text
Git common repository
├── Worktree W1 — placement: partitioned
│   └── RepositoryState authority
│       ├── Task A
│       └── Task B
└── Worktree W2 — placement: exclusive_worktree
    └── RepositoryState authority
        └── Task C

git worktree list ──> derived task catalog (not authority)
Host Hook cwd ──────> exact worktree authority ──> session/task routing
```

新的持久化布局：

```text
.workloop/
  events.jsonl      # 唯一权威
  state.json        # 可删除、可重建的 repo 聚合快照
  .repo.lock/       # repo transaction lock
  .criterion.lock/  # 现有外部 criterion 执行租约
  .git.lock/        # 仅供显式 workloop stage/commit 的短事务锁
```

删除单任务语义的 `.workloop/task.json`。`state.json` 不是多个 task snapshot 的目录，而是 ledger 的一个聚合 projection；跨任务不变量只在一个 reducer 中定义一次。

## RepositoryState 模型

```js
RepositoryState = {
  runtime_contract: 7,
  repository_state_schema_version: 1,
  repo_sequence: 42,
  artifact: {
    checkpoint_id: "sha256:...",
    entries: [],
  },
  tasks: {
    "<task-id>": TaskState,
  },
  repo_evidence: {
    unassigned_operations: [],
    global_resource_events: [],
  },
}
```

`active_task_ids`、session 索引和 path-claim 索引不持久化为第二权威；它们从 `tasks` 派生。任务数量相对较小，扫描换取更少的不变量和更可靠的重放。

repo reducer 按完整 record 事务工作：克隆当前状态，依次应用同一 record 中的 repo/task events，最后统一验证跨任务不变量，全部通过后才允许 append。

## Task Placement 与 Worktree Catalog

task placement 只有两个值：

```js
TaskPlacement = {
  mode: "partitioned" | "exclusive_worktree",
  repository_id: "sha256:<git-common-dir identity>",
  worktree_id: "sha256:<canonical worktree identity>",
  branch: "<observed branch or detached HEAD>",
}
```

- `partitioned`：当前 worktree 可有多个 live task，但写作用域必须互不重叠；共享 index/HEAD 的 stage/commit 进入本 worktree 的短 Git 事务。
- `exclusive_worktree`：该 worktree 至多一个 live task；它拥有独立 working tree、index 和 HEAD，仍保留 task 写作用域以防提交无关文件。
- 两种 placement 的 task event、criterion、budget、review、participant 和 terminal schema 完全相同。
- placement 在 task open 后不可原地修改；要换隔离模式，终止原 task 并在目标 worktree 新开 task，避免跨权威搬运历史。

同一 Git 仓库的联合视图由 `git worktree list --porcelain -z` 加每个 worktree 的 digest-valid `state.json` 派生：

- catalog 只做发现、定位和冲突 advisory，不是第二权威；
- 每个 task 的真实状态仍只由所在 worktree 的 `events.jsonl` 决定；
- 不可读、缺失或损坏的 worktree 显示为 `unknown`，不得从 catalog 消失后被解释为没有任务；
- 跨 worktree 写作用域重叠只提示未来 merge conflict，不阻止 task，因为 working tree/index 已物理隔离；
- HOME outcome 行同时记录 `repository_id`、`worktree_id` 和 `task_id`，既能按 Git 仓库聚合，也不会把不同 worktree 的事件序列混为一个权威。

显式创建独立 worktree：

```sh
workloop open --placement exclusive-worktree \
  --worktree-path ../repo-task-a \
  --branch workloop/task-a \
  --base HEAD \
  ...task arguments...
```

规则：

1. 只有显式 `exclusive-worktree + worktree-path` 才运行 `git worktree add`；不根据风险或文件重叠自动创建。
2. 不使用 `--force`，目标路径和 branch/base 必须通过 Git 原生校验。
3. worktree 创建成功后，task authority 只初始化在新 worktree；源 worktree 不复制 task event。
4. task open/criterion 随后失败时保留已创建 worktree并返回恢复 receipt，不自动删除可能已产生文件的目录。
5. task terminal 不自动 remove、merge、delete branch 或切换宿主 cwd；这些仍是显式 Git/宿主动作。
6. 对用户已创建的 worktree，可在目标路径执行 `open --placement exclusive-worktree` 而不提供 `--worktree-path`。

## Task、Session 与 Join

每个 task 包含：

```js
TaskState = {
  task_id,
  placement,
  lifecycle,
  coordinator_session_id,
  participant_session_ids,
  write_scope,
  verification_scope,
  criterion,
  evidence,
  interference,
}
```

规则：

- `open` 创建 task，并自动把当前真实 host session 设为 participant 和 coordinator。
- `join --task <id>` 把当前 session 加入该 task，不再把其他 participant 踢出。
- `handoff --task <id>` 只改变 coordinator，不改变 participant。
- lifecycle、criterion、scope 和 terminal 操作由 coordinator 执行；普通 participant 可以产生工具证据和执行 `verify`。
- 一个 session 在同一 worktree 至多参加一个 live task，从而 Hook 只靠 `cwd + session_id` 就能确定 task。
- 同一个 session 可以在不同 repo/worktree 各参加一个 task，因为 `cwd` 先确定权威边界。
- `tasks --all-worktrees` 可以定位同一 Git common repository 中的 task；`join --task <id>` 可解析其目标 worktree，但不能替宿主改变 cwd，后续 Hook 仍由实际 tool cwd 路由。
- suspended task 保留写作用域；terminal task 释放写作用域。

## 写作用域与验收作用域

不再用任意 glob 同时承担归属和证据展示。新 CLI 使用结构化声明：

```text
--write-path <repo-relative-file>   # 精确文件
--write-root <repo-relative-dir>    # 整个子树
--verify-path <file-or-dir>         # criterion freshness 依赖
--verify-all                        # 默认；任何 repo 内容变化都使观察过期
```

在 `partitioned` placement 的同一 worktree 内，写作用域是独占 claim：两个 live task 的 file/subtree claim 不得相同，也不得存在祖先/后代重叠。claim 的创建和 amend 必须在 `.repo.lock` 内与 ledger append 原子执行。不同 worktree 或 `exclusive_worktree` 之间的相同路径不是在线冲突，只进入跨 worktree merge advisory。

claim 指向的路径若在 task open 前已经 dirty 或 staged，默认拒绝归为新任务；只有显式 `--adopt-existing --reason ... --granted-by user` 才建立带来源的 birth evidence。这样后续 `stage` 不会把用户或另一段历史遗留的修改伪装成当前 task 产物。

验收作用域可以重叠，它回答“哪些路径变化会让该 task 的 criterion observation 过期”。默认 `--verify-all` 保守正确；只有能够说明验收读取边界的任务才缩小它。这样不会为了并行而伪造 criterion 独立性。

rename/move 必须同时拥有源路径和目标路径；生成文件必须位于某个 write root。无法规范化、包含变量或依赖运行时展开的 claim 在控制面拒绝创建，但这不影响宿主直接执行工具。

## Repo Artifact 与跨任务归属

repository reconciliation 只产生一次 repo delta：

```js
RepoArtifactDelta = {
  operation_id,
  actor_session_id,
  from_checkpoint,
  to_checkpoint,
  changed_entries,
  coverage,
}
```

reducer 对每个 changed path 做确定性归属：

1. actor session 绑定 Task A，路径也属于 A：A 的正常 artifact evidence；
2. actor 绑定 A，但路径属于 B：A 记录 `write_outside_scope`，B 记录 `foreign_task_interference`；
3. actor 未绑定，但路径属于 B：B 记录 external interference，不伪装成 participant 工作；
4. 路径不属于任何 task：repo-level unassigned evidence；
5. 一个 operation 改动 A、B 两边：保留同一 `operation_id`，在一个 repo transaction 中更新双方。

任何 interference 都使受影响 task terminal held，直到相关路径被 revert，或 coordinator 通过显式、有原因的 adoption 记录接纳该变化。不存在“因为文件最后看起来正确，所以自动归属”的捷径。

task 的 `artifact_revision` 只在其拥有的路径变化时推进；其他 task 的正常写入只根据 `verification_scope` 决定是否使本 task 的 criterion observation 过期，不会污染 touched files 或写入预算。

## Hook 路由与权限边界

Hook 路由顺序固定：

```text
payload cwd -> launch context only
tool targets -> canonical target authorities
target authority + session_id -> participant task
operation_id -> cross-authority Pre/Post correlation
each authority reconciliation -> actual changed paths in that root
```

- `observe`：静默记账。
- `nudge`：记账并给建议，但所有 Pre/Stop 都省略 execution denial / completion block。
- `deny`：显式 opt-in，才允许按政策拒绝 Pre；其多任务路由与 `nudge` 使用同一事实模型。
- 可证明目标全部位于启动 repo/worktree 之外，且不属于任何受监督 authority：不向启动 repo 写 operation/task event，不推进其 budget、artifact、criterion freshness 或 evidence revision。
- 目标位于另一个受监督 repo/worktree：由目标 authority 和该处的 session binding 裁决；启动 repo 不代管它。
- 同一 operation 同时命中多个 authority：共享同一 `operation_id`，各 authority 只记录自己范围内的 intent/receipt/artifact；不存在跨 authority 原子事务，也不得伪装成一个 task 操作。
- 目标在启动 repo 内但不属于任何 task：写入该 repo 的 unassigned evidence；这与“repo 外部、无人监督”不同。
- 无目标或目标含混时，无法证明它是纯外部操作；只记录 launch authority 的 unknown/unassigned 诊断，不能归为 task 的干净证据。
- Stop 只有在该 session 自上次 Stop 后产生过当前 task 的归属事件或显式 task 控制命令时，才为该 task 记 census/round；纯外部操作后的 Stop 直接 release，不触碰源 task。
- 未绑定 session 的 Stop 直接 release。
- Hook 状态不可读时，`observe`/`nudge` 继续 fail open；不能把 repo 错误转嫁为宿主权限拒绝。

target-authority 路由只决定“事实记到哪里”，不绕过宿主对危险命令、网络、密钥或外部路径的批准与风险分类。所谓“源 repo 完全不受影响”，只表示源 worktree 的 task ledger、budget、artifact、criterion freshness 和 Stop round 不变；外部文件本身仍可能被多个 session 竞争修改。若外部目标需要任务级隔离与认证，它必须成为自己的 authority，而不能借源 repo 的 task 身份。

task 的 write scope 只描述其 authority root 内的 repo-relative 路径，不允许用 `../` 或绝对路径把外部文件纳入当前 task。如果任务真正要认证 repo 外产物，应在那个目录建立独立 Workloop authority，或把它作为显式外部 criterion 证据处理；不能借启动 repo 的 session 归属偷渡。

## Git Add / Commit 任务事务

`partitioned` task 共享同一 worktree 的 index、HEAD 和 branch：index/commit 内容按路径分区，物理更新进入本 worktree 的短事务。`exclusive_worktree` task 各有 index/HEAD/branch，不共享 Workloop Git 锁；共同 object store/ref 的并发由 Git 原生 lock/compare 语义处理。

核心后置条件：

```text
index delta paths ⊆ task.write_scope
commit(first-parent) paths ⊆ task.write_scope
```

新增显式深模块：

```sh
workloop stage --task <id>
workloop commit --task <id> --message "..."
```

`stage`：

1. 在 task 所在 worktree 的 `.git.lock` 内重新计算相对 task birth baseline、且已归属于当前 task 的实际 changed paths；
2. 只选择 write scope 内、当前仍有变更的具体路径；
3. 执行等价于 `git add -A -- <concrete-paths>`；
4. 对比 index delta，确认没有越出 task scope；
5. 记录 task-scoped stage receipt。

`commit`：

1. 在同一个短锁内重新解析 task 路径，不信任旧 stage 列表；
2. 以显式 pathspec 执行 task-only commit；
3. 捕获生成的 commit OID；
4. 用 first-parent diff 验证 commit 路径全部属于 task；
5. 其他 task 已 staged 的路径不得进入本 commit，也不得被清除；
6. 提交 receipt 进入当前 task evidence。

这两个命令只有在宿主/用户显式调用后才执行 Git，不会自动提交，也不改变宿主审批权。宿主直接运行 `git add -- <paths>` 或 `git commit --only -- <paths>` 仍然允许；Hook 事后验证。宽范围 `git add .`、无 pathspec commit 或无法绑定 OID 的并发提交在 `nudge` 下不拦截，但不能形成干净的 task commit receipt。

`partitioned` task commits 位于同一分支并按发生顺序串联。需要独立分支、独立 base 或 rebase/merge/reset/stash 的任务使用 `exclusive_worktree`；Workloop 不在一个 worktree 内模拟多 HEAD。即便是独占 worktree，stage/commit 仍以 task write scope 为边界，不能因为物理隔离就提交无关文件。

## CLI 选择语义

所有 task 动词接受 `--task <id>`。缺省规则只保留无歧义情况：

1. 当前 host session 在该 worktree 只绑定一个 live task：选择它；
2. 没有真实 host identity，但 repo 只有一个 live task：选择它；
3. 其他情况：列出候选并要求 `--task`，不得选择“最近更新的 task”。

新增：

```sh
workloop open --repo . --placement partitioned ...
workloop open --repo . --placement exclusive-worktree \
  --worktree-path ../repo-task-a --branch workloop/task-a --base HEAD ...
workloop tasks --repo .
workloop tasks --repo . --all-worktrees
workloop status --repo . --task <id>
workloop join --repo . --task <id> --reason "..."
workloop handoff --repo . --task <id> --reason "..."
workloop stage --repo . --task <id>
workloop commit --repo . --task <id> --message "..."
```

`open --placement partitioned` 在当前 worktree 建 task，并在一次 repo transaction 内验证 write-scope claim。`open --placement exclusive-worktree` 要么在当前已独占 worktree 初始化 task，要么在显式提供 `--worktree-path` 时先执行受约束的 `git worktree add`；失败时返回分阶段 receipt，绝不猜测、迁移或清理用户文件。

`tasks --all-worktrees` 从 Git worktree catalog 读取各 worktree 自己的 projection；`join` 可以给出目标路径，但不会替宿主切换 cwd。`status --repo .` 在多任务时输出 repo 摘要；单任务时可以保持紧凑 task 视图。机器 JSON 永远显式区分 `repository`、`worktree` 与 `task` projection。

## 版本策略与硬切换

不新增 Runtime Contract 8。以后只有以下边界改变才升级 Runtime Contract：

- 工具执行/审批权从宿主转移；
- Workloop 从认证器变成调度器或强制执行器；
- repo append-only authority 被替换；
- 默认 Hook 的 fail-open/non-blocking 安全语义改变。

本次仅改变权威内部的实体数量和 projection，因此独立版本：

```text
runtime_contract: 7                    # 不变
repository_state_schema_version: 1     # 新 state.json
event_record_schema_version: 3         # repo-scoped + task-scoped events
outcome_projection_schema_version: 5   # 若终态行形状不变则不升
```

用户明确不考虑兼容，因此：

- 不读旧 `.workloop/task.json`；
- 不将旧单任务事件流迁移为多任务流；
- 不双写旧/新 projection；
- 删除 active-release manifest 中的 `compatibility_runtimes`；
- 删除 Contract 5/6 compatibility runtime pin、Runtime 目录保留规则和手动调用出口；
- `createTask`、event catalog、reducer、outcome projector 和 application orchestration 只接受唯一当前模型；
- 删除 `ACTIVE_OLDER_CONTRACT_READ_ONLY` 及“使用 pinned runtime 完成旧任务”的分支；
- installer 不再因为 source repo 存在旧 active task 而维护旧 Runtime，只负责安装当前 Runtime；
- 激活成功后，installer 按既有 ownership/digest 证明删除它拥有的旧 Runtime 目录；无法证明归属的目录仍保留并报告，不扩大删除权限；
- 发现旧状态时 fail closed，要求显式 `archive-incompatible-state --granted-by user`；
- archive 保留 repo authority、HOME outcome projection 的全部原始字节，随后分别新建当前格式；
- 兼容 fixture 改为单一“旧格式必须拒绝且可无损归档”fixture，不再证明旧任务能继续执行。

这是安全保全，不是兼容层。不得自动删除或覆盖旧状态。

## Placement 选择规则

以下条件同时成立时选择 `partitioned`：

- task 的写路径可以在 open 前规范化，并与现有 live task 证明不相交；
- task 可以共享当前 branch、HEAD 和提交顺序；
- criterion 可以显式收窄 verification scope，或接受其他任务写入导致 observation stale；
- 不需要 rebase、merge、reset、stash、checkout/switch 等改变共享 Git 状态的操作。

以下任一条件成立时选择 `exclusive_worktree`：

- 两个任务需要写同一文件或同一生成目录；
- 任务需要独立 branch/HEAD/history；
- 需要 rebase、merge、reset、stash、checkout/switch；
- criterion 必须在不包含其他任务中间状态的树上运行；
- 写目标大多是运行时动态生成，无法给出可靠 claim；
- repo-wide criterion 在并发写入下反复 stale，无法获得稳定窗口。

placement 是 open 时的显式任务属性，不做运行时自动升级或隐式搬迁。只有用户显式调用带 `--worktree-path` 的 `open --placement exclusive-worktree` 时，Workloop 才创建 worktree；风险提示、scope 冲突或 criterion stale 只给出诊断与建议，不触发创建。已打开 task 若需要改变 placement，先终止原 task，再在目标 worktree 新开 task。

## 预计修改范围

- `历史任务状态运行时`：由单 Task reducer 提炼 TaskState reducer，并新增 RepositoryState 事务 reducer。
- `lib/prims.mjs`：删除 Contract 5/6 常量、payload map 和兼容分派，只保留当前 schema vocabulary。
- `lib/event-store.mjs`：repo/task scoped event record、跨 task 原子事务、repo cursor；删除旧 payload contracts。
- `lib/task-store.mjs`：`state.json` 聚合快照、repo cursor 校验和重建。
- `lib/worktree-placement.mjs`：Git common-dir/worktree identity、placement 校验、显式 worktree 创建 receipt 和派生 catalog；不持有 task 权威。
- `lib/application.mjs`：task selection、open/join/handoff/tasks/status、multi-task criterion commit。
- `lib/criterion.mjs`：单次 repo checkpoint、verification scope freshness 和 task delta attribution。
- `历史监督运行时`：session→task 路由、结构化 write scope、跨任务 operation 分类、Git pathspec。
- `lib/outcome-projector.mjs` / `lib/evidence-ledger.mjs`：只消费当前事件；task terminal projection 保持逐 task，repo interference 查询作为新增观察。
- `install.mjs` / `uninstall.mjs`：删除 compatibility pins/manifest/保留逻辑，加入当前格式硬切换诊断与新 `state.json`。
- `skills/loop-core` / `skills/workloop` / README / `AGENTS.md`：多任务、join、Git 事务和 placement 选择/生命周期语义。
- tests：删除 Contract 5/6 行为与 installer pin fixture；新增聚合 reducer、原子性、target-authority/纯外部 Stop 路由、criterion stale、Git index/commit、worktree 创建/catalog、旧格式拒绝/归档、installer、Windows 路径与锁。

## 范围与成本

| 范围 | 组成 | 预估 | 风险 | 价值 |
|---|---|---:|---|---|
| 核心 | RepositoryState reducer、repo/task events、聚合 snapshot | 2–2.5 天 | 权威重放错误 | 建立正确多任务内核 |
| 核心 | session participant/coordinator、task selection、CLI | 1–1.5 天 | 绑定歧义 | 消除 session 串账 |
| 核心 | repo artifact delta、scope 归属、interference、criterion freshness | 2–2.5 天 | 并发 stale 与误归属 | 任务证据真正隔离 |
| 核心 | task-scoped stage/commit 与 Git receipt | 1–1.5 天 | index/ref 竞态 | 防止提交夹带 |
| 核心 | worktree placement、显式创建 receipt、Git-derived catalog | 1.5–2.5 天 | 创建半成功、路径/branch 歧义、跨 worktree 发现不完整 | 为强隔离任务提供一等入口 |
| 核心 | 删除 Contract 5/6 runtime/reducer/projector/installer 兼容分支 | 0.5–1 天 | 删除遗漏或死引用 | 恢复唯一当前模型 |
| 支撑 | Hook/installer/skill/docs 硬切换 | 0.5–1 天 | 用户状态保护 | 可正确安装和使用 |
| 支撑 | 故障注入、Windows、真实 Codex E2E、性能基准 | 1.5–2 天 | 边界组合多 | 证明原子与跨平台行为 |
| 不实施 | 风险触发的自动创建、terminal 自动清理/合并 worktree | — | 驱动器越界、误删现场 | 显式生命周期已满足目标 |
| **总计（核心 + 支撑）** | | **10–14.5 天** | | |

交付多出一次兼容删除审计，但长期维护组合面由“Contract 5 + 6 + 7 + 新状态”降为“唯一当前状态”。维护成本主要剩 RepositoryState 不变量和 Git 行为测试；Host Adapter 不增加新的权限策略分支。

## 价值门禁

```yaml
decision: BUILD
decision_source: user
target_outcome: 每个 task 可显式选择同-worktree 路径分区或独占 worktree，并在两种模式下分别记账、认证和提交，不串 session、文件证据或 Git commit
baseline_and_frequency: 当前一个 worktree 只能有一个 live task；第二个 session 只能 join 接管或改用 worktree
expected_benefit: 每个 task 可选择满足其约束的最低成本隔离：可分区任务省去额外 worktree 生命周期，强隔离任务获得独立 index/HEAD/branch；两者都消除任务证据和 commit 串线；使用频率尚未测量，BUILD 来源是用户的明确重构决定
delivery_and_maintenance_cost: 10–14.5 工程日；一次性删除兼容分支，后续维护聚合 reducer、worktree catalog/creation、Git fixture 和当前多任务 Hook 矩阵
status_quo_or_existing_mechanism: 所有任务由用户手工创建独立 worktree，正确但无法为纯文件不相交任务选择更低成本模式，也没有统一 task catalog 和 receipt
decision_flip_condition: 若真实负载几乎全部稳定落在单一 placement，双模式的 catalog/生命周期成本长期高于节省的人工操作，则收敛到占优模式
review_scope: correctness-only
review_budget: one independent plan review plus one focused re-review if blockers are found
```

## 明确不做

- 不新增 Runtime Contract 8。
- 不兼容、迁移或继续执行任何旧格式任务。
- 不保留 Contract 5/6 Runtime pin、reader、reducer、projector 或兼容 fixture。
- 不允许重叠写作用域靠“不同 session”自证安全。
- 不把 Hook 变成宿主权限系统。
- 不让 `join` 根据 repo 猜测唯一 task。
- 不把其他 task 的正常写入计入当前 task 的 touched files、写预算或 artifact revision。
- 不因风险、冲突或 stale 自动创建 worktree；只有显式 `open --placement exclusive-worktree --worktree-path ...` 可以创建。
- 不自动删除、切换、合并 worktree，不自动删除 branch，也不改变宿主 cwd。
- 不开发任意 shell 副作用解释器；含混操作保留为 repo-level unknown/interference。

## 停止点

当前方案已收敛到最小完整模型：每 worktree 一个权威、两种一等 placement、多 task projection、target-authority 路由、结构化路径归属、session task binding、任务级 Git 事务，以及 Git-derived worktree catalog。继续加入自动 placement、terminal 自动合并/清理、通用调度、任意命令推演或跨机器协调不会改变本次 Value Gate 或验收预言机，因此停止扩展。
