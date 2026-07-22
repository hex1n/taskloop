# Workloop Git / Filesystem 多根任务权威与 Worktree 隔离方案

日期：2026-07-22
状态：方案层缺陷已修订；跨平台证据门禁未通过，技术评审暂停，未授权实施
模式：Plan
深度：Deep
决策：BUILD（来源：用户明确要求重新规划并建设该能力）
评审范围：correctness-only
适用边界：Git 仓库支持同 worktree 路径分区和每 task 独占 linked worktree；完全位于 Git worktree 之外的 filesystem root 支持路径分区
输入来源：仓库 `AGENTS.md`、README、`lib/application.mjs`、`lib/task-engine.mjs`、`lib/event-store.mjs`、`lib/task-store.mjs`、`lib/criterion.mjs`、`lib/supervision.mjs`、`lib/outcome-projector.mjs`、installer/uninstaller、现有测试、旧方案及其 NO-GO 审查记录、本轮 Git remove/prune 临时实验证据、四个独立机制 option card

## TL;DR

当前最佳路径是：

> 使用统一 Authority Provider 模型：Git target 的唯一 append-only 权威位于 `$GIT_COMMON_DIR/workloop/events.jsonl`；完全不属于任何 Git worktree 的 filesystem target，其唯一权威位于 `~/.workloop/authorities/<authority-id>/events.jsonl`，目标根只保存非权威 `.workloop/locator.json`。两类 provider 使用同一个 reducer/event schema；路径和 locator 都不是事实源。

位于 Git worktree 内但未被 tracked、被 `.gitignore` 忽略或尚未 `git add` 的目录，仍属于该 Git common authority；“是否被 Git 跟踪”不参与 authority 选择。只有 `git rev-parse` 证明目标不在任何 Git worktree 内时，才使用 filesystem provider。

这同时解决两种生命周期问题：linked worktree 被 `remove/prune` 后，Git task 仍在 common-dir；非 Git root 被移动或删除后，filesystem task 仍在 detached authority，并显示 `root_unavailable`。HOME outcomes 仍是另一套按 authority ID 分片、可删除重建的 projection，不能与 filesystem authority shards 混用。

## 行动方案

1. 新增统一 authority resolver，按实际 target 选择 `git_common` 或 `filesystem_detached` provider；禁止根据 launch cwd、Git tracked 状态或旧 `.workloop/events.jsonl` 猜测。
2. Git provider 从任意 worktree 解析绝对 `$GIT_COMMON_DIR`，以 `$GIT_COMMON_DIR/workloop/events.jsonl` 为唯一权威；一个 common repository 的 ledger 包含全部 worktree/task。
3. Filesystem provider 为完全不在 Git worktree 内的显式 root 生成 `authority_id`，以 `~/.workloop/authorities/<authority-id>/events.jsonl` 为唯一权威；root 内 `.workloop/locator.json` 只是受保护 locator。
4. 两种 provider 共享 `AuthorityState`/task/session/scope/criterion/event schema；Git 额外拥有 worktree attachment 和 Git receipt 能力。
5. 给 authority、worktree incarnation 和 task 分配生成式稳定 ID；路径、branch、HEAD、Git admin-dir 和 filesystem locator 都只是可变化 observation。
6. 保留两种 Git placement：`partitioned` 与 `exclusive_worktree`；filesystem root 只支持 `partitioned`，多个 live task 仍需 write scope 不相交。
7. locator 只携带 authority 已提交 claim 的引用，不独立证明身份。每个 Git admin-dir/filesystem root attachment 都经 authority 内的 `staged -> claimed -> unavailable/collision/retired` 状态机解析；locator 丢失只使 attachment unavailable，不删除权威或自动新建身份。
8. 将 Git worktree list 和 filesystem locator scan 都降级为 liveness/reconciliation sensor；authoritative ledger 自身才是 task catalog。
9. 将 HOME outcome monolith 替换为与 filesystem authorities 物理分离的 per-authority projection namespace；控制命令不重写旧 HOME monolith。
10. 将 Git `stage`/`commit` receipt 绑定不可变 commit object，并在 terminal 前重新认证 landing；filesystem task 不暴露 stage/commit。
11. 保持 target-authority-first Hook 路由以及 `observe`/`nudge` 非阻塞语义；宿主继续拥有执行和审批权。
12. 硬切换到唯一当前格式：不读取、不迁移、不双写旧 worktree/root ledger 或 Contract 5/6 runtime；旧字节只有显式归档路径。

## 最佳性检查

- 决胜条件：普通 root/worktree 生命周期不丢权威；一个 subject 恰好一个可重放事实源；Git 与非 Git 目标路由确定；故障尽量按 authority 分片；不改变宿主审批；跨平台可维护。
- 胜出方案：provider-based authority。Git 使用 common-dir repo-local ledger；非 Git 使用 HOME 中独立的 detached authority shard。它为每类 target 选择最接近但位于普通删除边界之外的稳定控制根，同时复用一个 reducer/event model。
- 最接近替代：所有 Git/非 Git authority 都放 HOME。它统一物理存储并能承受整个 repo 删除，但把 Git repo 也耦合到 HOME 故障，牺牲 repo-local containment。
- 替代方案胜出的条件：产品明确要求整个 Git common repository 删除后 task 仍必须恢复，或平台禁止在 Git common-dir 写自有控制数据。
- 胜出方案的失败条件：受支持平台的 common-dir 或 HOME shard/locator 无法满足安全锁与身份唯一性，或混合 provider 让 target routing 出现不可消除的双重归属。
- 边际停止点：不引入 Git refs/object journal、跨机器同步、自动 worktree 删除/合并或分布式锁；这些不会改善当前本机多 session/task 的核心结果，成本却显著增加。

## 下一步验证

在实施拆解前先冻结一个最小 authority/identity spike；它不实现业务 reducer，只验证会翻转机制的边界。该 spike 是 **decision-blocking implementation-entry gate**：macOS、Linux 与受支持 Windows 矩阵的证据全部通过前，本方案不得获得技术 `GO`，也不得进入产品实现：

1. 在 macOS/Linux/Windows 临时 Git repo 创建 main + 两个 linked worktree；为每个 `$GIT_DIR` 写随机 locator，并在 `$GIT_COMMON_DIR/workloop` 写 sentinel ledger。
2. 依次覆盖正常 `git worktree remove`、目录失踪后 `git worktree prune --expire now`、worktree move、同路径重新创建、同 basename 导致 Git admin-dir 名称复用。
3. 证明 common ledger 始终保留；新 worktree 没有旧 locator，不能自动继承旧 `worktree_id`；复制 locator 后 authority 进入 collision，原件和副本都不能形成干净 task 路由。
4. 并发启动两个进程分别对 common ledger 与 detached HOME ledger 做 CAS/锁保护的 genesis/append；遍历允许的 `G -> A`、`C -> A` 和禁止的反向/多 authority/O 嵌套，故障注入覆盖拿锁后 append 前崩溃、append 后 snapshot 前崩溃、锁 owner/reaper 竞争和 torn tail，断言不出现死锁、重复 sequence、双锁 owner、split authority 或静默截断。
5. 创建一个完全不在 Git worktree 内的 filesystem root，证明 root 中只有 locator，真实 ledger 位于 `~/.workloop/authorities/<id>`；覆盖同文件对象 move、跨卷/无法证明文件身份的 move、root delete、同路径重建和 locator copy。只有稳定对象身份可证明相同且旧 anchor 同时不可用时允许自动更新路径，其余 move 必须显式 `reattach`。
6. 在 Git worktree 内创建 tracked、untracked 和 ignored 目录，证明三者都路由到同一个 Git common authority，绝不创建 filesystem authority。
7. 覆盖 staged locator 写入、authority claim append、claimed locator 发布的每个崩溃点；对 `recover-attachment`、`cleanup-staged-locator`、`abandon-staged-authority`、`reattach`、`fork-identity` 的每个前置状态、epoch/digest mismatch、重复 command ID 和 append/publish 间崩溃做表驱动验证。任何 target scan/Hook 都不得自动调用它们或收养 staged/pending attachment。
8. 覆盖 nested filesystem root、filesystem root 内 `git init`、locator/authority 丢失和两个 root 复制同 locator；重叠 authority 默认拒绝，Git 初始化要求显式硬切换。
9. 对 Git admin-dir、Git common-dir、`$GIT_COMMON_DIR/workloop`、root `.workloop`、HOME authorities/outcomes/archive/locks 注入直接写目标，证明它们在 provider 选择前被识别为 control plane，绝不成为 task artifact evidence；默认 Hook 仍不拦截宿主执行。
10. 若任一受支持平台无法满足 common-dir、detached HOME shard、locator claim 唯一性、有界 framed publication 或安全锁语义，重新比较“全 HOME authority”和显式用户提供 control root；否则才可进入实施。

本轮已在本机验证：`$GIT_COMMON_DIR/workloop/` 在 linked worktree 的正常 remove 和登记 prune 后均保留，而被 prune 的 worktree 已从 `git worktree list` 消失。临时 fixture 已移入废纸篓，可恢复。

## 验收预言机

```text
一个 Git common repository 恰好有一个 replayable events.jsonl
AND 一个非 Git filesystem root 恰好映射到一个 detached replayable events.jsonl
AND 删除 state.json 后只靠该 ledger 可重建全部 worktree/task 状态
AND partitioned worktree 可有 N 个 write-scope 不相交的 live task
AND exclusive_worktree 中至多一个 live task
AND worktree remove/prune 后相关 task 仍存在并显示 placement_unavailable
AND 同路径新 worktree 获得新 worktree_id，绝不继承旧 task
AND git worktree list 缺失不能被解释为“没有 task”
AND Git worktree 内的 tracked/untracked/ignored target 都选择 Git common authority
AND 完全位于 Git 外的 root 只有在稳定对象身份匹配且旧 anchor 不可用时才自动保留 identity；否则须显式 reattach
AND 非 Git root 删除后 authority/task 仍存在并显示 root_unavailable
AND 同路径新建的非 Git root 不继承旧 authority/task
AND nested/duplicated locator 不会产生双重或隐式 task 路由
AND staged/pending locator 在任何崩溃点都不能被 target scan 自动收养
AND recovery/reattach/fork/cleanup 只有显式 user provenance 和匹配 epoch/digest 才能转移状态，重试幂等
AND 只出现 G->A 或 C->A 的短嵌套；无双 authority/O 嵌套，criterion/Git/projection 不在 A 内执行
AND Git/Workloop/HOME control-plane target 在 authority 选择前被排除，绝不成为 task artifact evidence
AND 每个 task 只接收其 worktree 和 write scope 的 artifact evidence
AND task commit receipt 的 diff paths 是 write_scope 子集
AND terminal 前重新证明 commit 仍 landed 且 criterion observation fresh
AND 删除或损坏 HOME projection 不改变任何 authority/task 决策
AND repo 级硬切换不修改其他 repo 的 HOME shard 或旧 HOME monolith
AND observe/nudge 永不改变宿主执行与 Stop 决定
AND 旧 worktree .workloop 与 Contract 5/6 状态从不被当前 reducer 读取
```

边界验收：whole-repo 删除会删除 Git repo-local authority，必须明确报告这是超出自动恢复边界的破坏性操作；需要保留时先显式导出。非 Git authority 可承受 subject root 删除，但不能承受其 detached control shard 所在 HOME/control root 被删除。Outcome projection 永远不能伪造两类 authority 的恢复。

## 根问题

问题不是“.workloop 有没有被 Git 跟踪”，而是：

> 权威若位于被监督对象自己的普通删除边界内，合法的 worktree/root 生命周期就能同时删除事实与发现线索。根治不是统一放进某个固定目录，而是为每类 subject 选择一个位于其普通生命周期之外的稳定 control root，并保持每个 subject 只有一个事实源。

同一个 Git common repository 的 worktrees 共享 refs/object store 和 common metadata，但拥有不同 working tree/index/HEAD。任务隔离需要在执行位置上区分 worktree，在事实存续上却需要一个比单个 worktree 更稳定的 repository 边界。

解决后的状态：Git common repository 或 detached filesystem shard 是 authority boundary；Git worktree/filesystem root 是 attachment/artifact boundary；task 是认证边界；session 是参与者；路径 scope 是归属边界；HOME outcomes 是可重建观察层。HOME 中的 filesystem authority 与 outcomes 目录物理、锁和 API 都分离。

## 真实约束、约定与假设

| 项目 | 分类 | 方案含义 |
|---|---|---|
| linked worktree 可被正常 remove/prune | 真实约束 | live task 事实不能只存在 worktree 目录 |
| linked worktrees 共享 Git common-dir | 真实约束 | common-dir 可承载 repo-local 单一权威 |
| worktree 之间 index/HEAD/working tree 独立 | 真实约束 | Git 锁、artifact checkpoint 和 criterion freshness 按 worktree 区分 |
| 同 worktree 的 index/HEAD 共享 | 真实约束 | partitioned stage/commit 必须短锁并按 task path 验证 |
| 宿主拥有工具执行与审批权 | 真实约束 | 默认 Hook 只观察/认证，不能靠拦截保证存续 |
| HOME projection 当前跨 repo 共用且是 derived | 真实约束 | 新设计应分片；它不能承担 task authority |
| Git tracked 状态不等于 filesystem containment | 真实约束 | Git worktree 内 ignored/untracked target 仍使用 Git provider |
| 非 Git root 没有 common-dir | 真实约束 | 默认 authority 必须 detached；root 内只留 locator |
| 非 Git root 可移动、复制或删除 | 真实约束 | 路径不是身份；copy/reuse 必须检测冲突，删除后 authority 保留 orphan state |
| `.workloop/events.jsonl` 必须位于 subject 根 | 历史约定 | Git 与非 Git current authority 都删除；仅保留 locator/legacy detection |
| 每 worktree 一个 authority | 被证伪的假设 | 改为每 Git common repository 一个 authority |
| `git worktree list` 是 task catalog | 被证伪的假设 | 只作为 liveness sensor |
| 整个 repo 删除后必须自动恢复 active task | 未验证需求 | 默认不要求；若成为硬需求则改选 HOME authority |
| Git common-dir 自有目录在全部受支持平台可用 | 待验证假设 | 由下一步 spike 决定机制是否成立 |
| HOME detached shard 对本机非 Git task 足够耐久 | 待验证假设 | 若 HOME 不可作为 control root，要求用户显式提供外部 authority-dir |

## 价值门禁

| 机制家族 | 当前能力 | 主要缺口 | 裁决 |
|---|---|---|---|
| 维持现状 | Git/non-Git root 内各放 `.workloop` | worktree/root 删除可同时丢权威和线索 | 淘汰 |
| 现有 Git/文件能力 | Git 手工 worktree；非 Git 手工备份/复制目录 | 隔离内容但不隔离/保存 Workloop 证据 | 不足 |
| 人工流程 | 删除前 checklist、手工 archive、限定 Git/path 操作 | 无法证明每个 host/session 遵守，也不能恢复漏做步骤 | 仅作为临时 runbook |
| 建设 provider authority | Git common-dir + filesystem detached shard + 统一 reducer | 多 provider identity/routing 测试增加 | 胜出 |

```yaml
decision: BUILD
decision_source: user
target_outcome: Git 与非 Git filesystem root 中的多个 task 都可并行、可发现、可重放、互不串账；普通 worktree/root 生命周期不会静默删除唯一权威
baseline_and_frequency: 当前 authority 位于被监督 worktree/root 内；并发任务、worktree churn 和 repo 外 filesystem 操作都是用户明确要求支持的常规场景
expected_benefit: 消除 worktree/root 生命周期导致的静默权威丢失；Git task 获得双 placement 和 commit 认证；非 Git task 获得路径分区、detached durability 和相同 session/evidence/criterion 语义
delivery_and_maintenance_cost: 17–23 工程日；长期维护两个 authority provider、一个 reducer、Git/filesystem locator/reconciliation、Git race fixture、HOME authority/outcome 分离和当前 Hook 矩阵
status_quo_or_existing_mechanism: Git task 手工独立 worktree、filesystem task 手工备份目录，并在删除前 close/archive；成本更低但无法机器证明且漏做会丢权威
decision_flip_condition: 若 provider spike 无法在受支持平台给出唯一 target routing，或 HOME 不能作为本机 filesystem control root，则要求显式外部 authority-dir 或收缩非 Git 支持范围
review_scope: correctness-only
review_budget: 4 reviewer invocations
```

成本从上一版 14.5–20 天上调为 17–23 天，因为非 Git root 不能安全复用 Git common-dir，也不能继续把唯一 ledger 放在可删除 subject 内。用户已明确决定建设；若总成本超过 23 天、需要常驻跨 repo 服务或需要跨机器 authority，应重新运行 Value Gate。

## 机制锦标赛

| 机制 | 优点 | 根本失败模式 | 预估 | 裁决 |
|---|---|---|---:|---|
| Provider authority：Git common-dir + filesystem detached shard | 每类 subject 使用最近的稳定外部 control root；共享一个 reducer | provider/locator 路由组合面增加 | 17–23 天（完整方案） | 胜出 |
| 所有 authority 放 HOME | Git/non-Git 物理存储统一，whole-repo 删除后仍恢复 | HOME 故障影响全部 repo/root；Git 丧失 repo-local containment | 13–18 天 | 最接近替代 |
| Worktree ledger + common locator/tombstone | 保留当前局部结构，删除后至少知道曾有 task | 未受控删除仍丢 replay bytes；active/retired authority 切换形成复杂双地址协议 | 中高 | 淘汰 |
| Git hidden refs/object journal | CAS、对象不可变、remove/prune 后保留，可 bundle | custom ref/GC/传输/隐私/修复 UX，非 Git 还需第二实现 | 4–6 周 | 过度设计 |

反演测试：当 HOME 是唯一被允许的控制位置、Git repo 经常整体删除、任务必须跨 clone/机器续作，或组织禁止 `.git` 自有数据时，provider 方案的 Git common-dir 部分会成为劣势，应改为全 HOME authority。若非 Git root 永远不会移动/删除且强烈要求目录自包含，root-local ledger 才可能更便宜；当前需求明确关注生命周期安全，因此不选。

## 目标架构

```text
Git common repository
│
├── $GIT_COMMON_DIR/workloop/                 # 唯一 repo authority root
│   ├── events.jsonl                          # 唯一可重放事实源
│   ├── state.json                            # 可删除聚合 projection
│   ├── locks/repository/                     # 极短 authority transaction lock
│   ├── locks/git/<worktree-id>/              # 每 worktree stage/commit lock
│   ├── locks/criterion/<task-id>/             # criterion execution lease
│   └── archive/legacy/...                    # opaque，不被当前 runtime 读取
│
├── Worktree W1 ($GIT_DIR locator: id=W1)
│   ├── Task A — partitioned — scope src/a/
│   └── Task B — partitioned — scope src/b/
│
└── Worktree W2 ($GIT_DIR locator: id=W2)
    └── Task C — exclusive_worktree

HOME
├── ~/.workloop/authorities/<authority-id>/    # 非 Git root 的唯一 authority
│   ├── events.jsonl
│   ├── state.json
│   └── locks/...
└── ~/.workloop/outcomes/<authority-id>/       # derived, best-effort；物理隔离
    ├── outcomes.jsonl
    └── cursor.json

Filesystem root F1 (outside every Git worktree)
└── .workloop/locator.json                     # non-authoritative id + nonce only
```

对于 main worktree，`$GIT_DIR == $GIT_COMMON_DIR`，locator 放在 authority root 内的独立 locator 文件；对于 linked worktree，locator 位于该 worktree 专属 Git admin-dir。locator 只证明“这个当前 Git worktree incarnation 声称哪个 ID”，不能创建、关闭或恢复 task。

对于 filesystem root，`.workloop/locator.json` 只包含 `authority_id`、`attachment_id`、claim epoch/state、nonce 和 format generation，不含 task state；authority 只保存 nonce digest。真实 ledger 与 outcomes 分处 `authorities/` 和 `outcomes/`；任何代码路径都不得从 outcomes 回填 authority。root 内的 locator 随 move 一起移动，但必须通过 anchor 规则才能重新绑定；root 删除后 detached ledger 仍能通过 `workloop authorities` 显示 orphan。

## Authority Provider 与 Root 选择

provider 只有两个 current 值：

```js
AuthorityProvider =
  | { kind: "git_common", control_root: "$GIT_COMMON_DIR/workloop" }
  | { kind: "filesystem_detached", control_root: "~/.workloop/authorities/<authority-id>" }
```

选择算法是协议的一部分：

1. 对每个规范化 target 先计算 Git/Workloop/HOME control-plane roots；命中者返回 `control_plane` 分类，不进入任何普通 task provider/write-scope 选择。
2. 对其余 target 找最近包含它的 Git worktree，而不是查询 `git ls-files`。
3. 若存在 Git worktree，无论 target tracked、untracked、ignored 或尚不存在，均选择该 Git common authority。
4. 若不存在 Git worktree，向上查找受保护 filesystem locator；只有 locator 对应已提交且 anchor 有效的 claim 时才选择其 detached authority。
5. 没有 locator、locator 仍 staged/pending、claim 冲突或 anchor 不可证明的非 Git target 是 unsupervised/indeterminate external target；不会因为 session 从某个 repo/root 启动就归入该 task。
6. 创建 filesystem authority 必须显式指定 root；默认拒绝与已有 Git 或 filesystem authority 嵌套/重叠。需要管理子目录时，在现有 authority 内用 task write scope 分区。

不提供 current `filesystem_local` authority。把 ledger 放回 `<root>/.workloop` 会使一次正常 root 删除同时删除 task 与发现线索，重复旧 worktree 设计错误。若 HOME 不适合作 control root，用户可在未来独立设计中选择显式外部 `--authority-dir`；本轮不引入自动 fallback 或双写。

filesystem root 执行 `git init` 后会同时出现旧 locator 和新 Git boundary。current runtime 必须将其标记为 `authority_kind_conflict`：CLI/control mutation fail closed，默认 Hook 仍放行但不归 task evidence。用户显式 abandon/archive filesystem task，再初始化 Git authority；不自动搬运事件或 task。

## AuthorityState 模型

```js
AuthorityState = {
  runtime_contract: 7,
  authority_format_version: 1,
  authority_id: "authority:<generated-uuid>",
  provider_kind: "git_common" | "filesystem_detached",
  authority_sequence: 42,
  attachments: {
    "<attachment-id>": {
      kind: "git_worktree" | "filesystem_root",
      attachment_state: "staged" | "claimed_pending_locator" | "claimed" | "reattach_required" | "placement_unavailable" | "collision" | "retired",
      claim_epoch: 1,
      locator_revision: 1,
      locator_nonce_digest: "sha256:...",
      claimed_anchor: {
        canonical_path: "/claimed/path",
        stable_object_id: "platform-object-id" | null,
        git_common_fingerprint: "sha256:..." | null,
        git_admin_fingerprint: "sha256:..." | null,
      },
      observed_path: "/last/known/path",
      observed_git_dir: "/last/known/git-dir" | null,
      observed_branch: "refs/heads/..." | null,
      artifact_checkpoint: "sha256:...",
    },
  },
  tasks: {
    "<task-id>": TaskState,
  },
  authority_evidence: {
    unassigned_operations: [],
    global_resource_events: [],
  },
}
```

`state.json`、session index、scope index 和 HOME outcomes 都可从 ledger 重建。跨 task/attachment 不变量只在一个 reducer 中定义一次；一条 record 可原子更新多个 task。Git provider 的 attachment 是 worktree；filesystem provider 当前恰好有一个 root attachment。locator 中的明文 token 只用于证明它对应某个已提交 claim；authority 只保存 token digest，并以 `authority_id + attachment_id + claim_epoch` 唯一寻址，路径和文件系统对象 ID 都只是 anchor observation。

### Attachment claim 状态机

attachment identity 必须只由 authority ledger 中可重放的状态转移决定：

```text
不存在
  -> attachment_staged
  -> attachment_claimed_pending_locator
  -> attachment_locator_published
  -> attachment_observed | attachment_unavailable | attachment_reattach_required | attachment_collision_detected
  -> attachment_reattached | attachment_retired
```

创建协议固定为两个可重放子协议：

1. 生成 `attachment_id + claim_epoch + locator_nonce`，预先计算 staged 与 claimed 两个 frame 的规范字节，并在任何 authority mutation 前确认两帧总长度和记录数均在 locator replay 上限内。
2. 获取 `A`，确认 attachment 尚无其他未完成 stage，追加绑定 `command_id`、user provenance、token digest、anchor 与 staged digest 的 `attachment_stage_intent`；随后 exclusive-create staged frame，完整 write、文件 fsync，并在 POSIX 上 fsync 所有新建父目录（Windows 使用同一文件句柄的 flush 语义）；锁内复读后追加 `attachment_staged` receipt。相同 command 的重试只可续写其精确空/前缀残片或重放同一 receipt，其他 locator/provenance 均拒绝。
3. 获取 `A` 并验证 `attachment_staged` receipt 与当前 staged frame/anchor，追加 `attachment_claimed_pending_locator`，同时绑定 staged digest、期望 claimed digest、token digest 与 epoch。
4. 保持同一个 `A`，向 locator journal 追加预先哈希的 claimed frame并 fsync；随后锁内复读并严格验证两帧链与 anchor，再追加 `attachment_locator_published`，最后释放 `A`。只有 final event 与完整 claimed frame 同时存在才可路由。崩溃在 stage intent、staged frame、stage receipt、claim pending、claimed frame、final 或输出前都保持不可路由；显式恢复只能在验证 command、provenance、token、epoch、digest 与当前 anchor 后截断精确 torn tail或继续原 command。该协议刻意不依赖跨平台原子 replace；locator 非 authority，追加 journal 将故障状态显式化并避免 Windows rename/replace 语义成为隐藏前提。

authority journal 另保留固定的 recovery byte/record reserve，普通 mutation 不得消耗。任何会先写 authority intent/pending、再改 locator、最后写 authority receipt/final 的多记录事务，都必须在第一条写入前用真实规范 frame 投影完整剩余序列，并同时检查单帧、总字节、总记录与 locator 下一帧上限。一个 authority 上存在未完成事务时，除同一 command 的 continuation 或显式恢复外，其他 mutation 全部返回 `recovery_required`；continuation/recovery 才可使用预留。因此容量不足只能在外部 publication 前零写入拒绝，不能留下无法完成的 stage、claim、reattach、cleanup 或 fork。

每次路由都在 authority 锁内比较 locator 的 authority/attachment/epoch/token digest 与 ledger claim，并核验 anchor：

- Git attachment 以 common authority ID、Git admin-dir 的平台稳定目录对象 ID 以及该 admin-dir 内的 claim 共同形成 anchor；不能只哈希 admin-dir 路径或 basename。`git worktree move` 只有在同一 admin-dir 对象与 claim 仍成立时才追加 worktree path observation；平台不能可靠提供该对象 ID 时，mechanism spike 必须失败并触发 fallback 设计。
- Filesystem attachment 优先使用平台稳定目录对象 ID。新路径只有在对象 ID 与已 claim anchor 相同、且旧路径在同一 reconciliation 中不可达时才可自动记为 move；对象 ID 不可用、变化或跨卷时进入 `reattach_required`，不得自动路由。
- 任一 claim 同时出现两个可达 anchor，必须先追加 `attachment_collision_detected`，使该 claim 的所有位置都不能形成干净 task evidence。若只发现一个新 anchor 但旧 anchor 不可达且稳定对象 ID 不同，则状态为 `reattach_required`，不能猜测它是 copy 还是跨卷 move。只允许用户显式选择 `reattach` 原 identity 或 `fork-identity`；两者都产生新的 ledger event/epoch。
- locator 丢失、anchor 暂时不可达或 authority shard 暂时不可读只产生 unavailable/indeterminate 状态；不得据此新建、复用、移动或关闭 identity。默认 Hook 继续放行宿主动作，但不认证 task evidence。

### 并发、锁顺序与可重入契约

所有锁均为 process-safe、owner-recorded、带超时的 **non-reentrant** 锁；同一进程再次获取自己已持有的同一锁是编程错误，不允许靠超时恢复。允许的锁类只有：

- `A(authority_id)`：短时 authority mutation lock，覆盖 verified replay/cursor、claim 或 task 决策、单次 batch append、claim locator 的有界原子 publication/finalization、tail 验证与 digest-bound `state.json` snapshot publication；snapshot 仍是 derived，发布失败不回滚已成功 append。
- `G(attachment_id)`：仅 Git attachment 的 stage/commit operation lock，串行化 Workloop 自己对该 worktree index/HEAD 的操作；不能阻止宿主直接 Git。
- `C(attachment_id, criterion_generation_id)`：criterion execution lease，防止同一 attachment/generation 重复执行长 criterion。
- `O(authority_id)`：derived outcome shard lock；只保护 projection，不参与任何 authority 决策。
- legacy archive/global maintenance lock 只供显式维护命令使用；获取它时该进程不得再持有 `A/G/C/O`，运行时 Hook 永不获取它。

唯一允许的嵌套是 `G -> A` 或 `C -> A`，且一次最多持有一个 `G` 或一个 `C`、一个 `A`：

```text
ordinary authority mutation: A -> release
Workloop stage/commit:        G -> A(preflight) -> release A -> Git -> A(receipt) -> release A -> release G
criterion:                    C -> A(snapshot) -> release A -> execute -> A(observation) -> release A -> release C
outcome projection:           A(copy verified cursor/records) -> release A -> O(publish) -> release O
multi-authority operation:    A1 -> release -> A2 -> release; never A1 + A2
```

反向 `A -> G`、`A -> C`、任意 `G + C`、任意两个 authority lock、以及 `O` 与任何其他锁同时持有都被 API 断言拒绝。跨 authority operation 只共享 `operation_id`，各 shard 独立提交，不伪造原子性；为确定诊断顺序可按 authority ID 排序，但仍须逐个释放。

`A` 内禁止启动子进程、运行 Git/criterion、做 repo-wide scan、网络 I/O、等待 projection/archive lock 或执行 HOME outcome publication；只允许有界 locator/stat 复核与 replace、ledger append/fsync 和 digest-bound snapshot replace。`G` 可覆盖 Git 子进程，但不能覆盖 criterion/projection；`C` 可覆盖 criterion 子进程，但不能覆盖 Git/projection。`O` 失败或超时只留下可重建 projection lag，绝不回头修改 authority。

Hook 获取 `A` 超时或遇到锁序断言时，`observe`/`nudge` 放行宿主并不给 clean evidence；显式 CLI control mutation 则失败且不产生部分 authority event。crash/reaper fixture 必须分别覆盖 `G/C` 外层持有时的 `A` owner 崩溃、A append 前后崩溃、O publication 崩溃和所有被禁止的锁序。

版本轴独立：

```text
runtime_contract: 7                    # 宿主权限/认证器边界不变
authority_format_version: 1            # 新 provider-based authority layout
event_record_schema_version: 4         # 不复用现有不兼容 schema-v3
authority_state_schema_version: 1
outcome_projection_schema_version: 6   # 新 HOME per-authority shards
```

Runtime Contract 不升级，因为工具执行权、默认 Hook 非阻塞语义和 append-only authority 类型都未改变；变化的是 provider、物理根、聚合范围和独立数据 schema。

## Worktree 身份与生命周期

### 注册

1. 解析绝对 `git-common-dir` 和当前 `git-dir`。
2. 按 attachment 三阶段 claim 协议生成 `worktree_id + claim_epoch + locator_nonce`。
3. 在 common authority 一条 record 中提交 `attachment_staged + attachment_claimed_pending_locator + task_opened`，再按 claim 协议发布 locator 并追加 `attachment_locator_published`。
4. task-open append 成功即为事实；snapshot/HOME projection 失败不回滚权威。locator 发布或 final event 失败则 task/attachment 显示 `claimed_pending_locator`，不可被普通 target 路由。
5. 任何中间态只允许显式 `recover-attachment` 或清理，不允许下一次 open 自动替换或收养 locator。

### Remove / prune

- Workloop 不自动 remove worktree。
- 显式 Workloop retire 只允许 terminal/无 live task 的 worktree，并先记录 `worktree_retired`；实际 Git 删除仍是单独宿主动作。
- 宿主直接 remove/prune live worktree 时不被 `observe`/`nudge` 拦截；common ledger 保留 task，并在查询/Hook reconciliation 时显示 `placement_unavailable`。
- `placement_unavailable` task 不可 achieve，也不把路径释放给同一 incarnation；可以显式 abandon。只有原 locator 随真实恢复回归时才可继续自动识别。

### Path reuse / recovery

- 路径、branch 或 Git admin-dir 名称相同都不构成身份相同。
- 新 worktree 没有匹配 locator nonce，必须获得新 `worktree_id`。
- locator 被复制到另一个 Git admin-dir 时，admin fingerprint 不匹配并提交 identity collision；该 claim 的原件与副本都禁止自动 task 路由。默认 Hook 仍放行宿主执行，但不产生干净 task evidence。
- 本方案不把 orphaned task 自动迁移到新 worktree。需要换执行位置时，abandon/close 原 task，再在新 worktree 新开 task；避免跨 attachment 搬运历史。
- 删除整个 common repository 会删除 authority。需要长期保留时，用户先显式 `workloop export-authority --output <outside-repo-path>`；HOME projection 不能恢复它。

## Filesystem Root 身份与生命周期

### 注册

1. `open --root <path> --root-kind filesystem` 先证明目标不属于任何 Git worktree，且不与现有 authority 重叠。
2. 在 HOME `authorities/` 下创建带生成式 ID 的 staged shard，写入 genesis 并 fsync。
3. 按 attachment 的 stage/claim 两个可重放子协议在 root 写 locator journal；locator 包含 authority/attachment/epoch 与随机 nonce，不包含 task state，authority 另存 provenance-bound stage intent/receipt。
4. authority append pending-claim/task record 成功后追加并 fsync claimed locator frame，锁内复读验证后再追加 `attachment_locator_published`；若 publish 或 final append 失败，shard 保持 `claimed_pending_locator`，只能按 ID、匹配 token 和显式命令恢复或清理，不能被 target 自动选中。

### Move / delete / reuse

- root move 时 locator 随目录移动，但 nonce 相同本身不证明是 move。只有平台稳定目录对象 ID 与 claimed anchor 相同、旧 anchor 在同一 reconciliation 中不可达时，才自动追加 path observation；否则标记 `reattach_required`，由用户显式确认 move。
- root 被删除时 HOME ledger 保留，task 显示 `root_unavailable`，可查询和 abandon，但不能 achieve。
- 同路径新建的目录没有匹配 locator，必须创建新 authority ID，不能继承旧 task。
- 复制带 locator 的目录且原 anchor 仍可达时会产生 duplicate attachment；新对象 ID 与 claimed anchor 不同，authority 追加 collision，原件与副本都不自动路由 task。若只看到副本而原 anchor 不可达，则进入 `reattach_required`，仍不自动路由。用户必须显式选择 `reattach` 原 identity 或执行 `fork-identity`；本轮不自动复制历史。
- filesystem provider 不提供 Git stage/commit；artifact、criterion、budget、session 和 terminal 语义与 Git task 相同。
- 删除 HOME authority shard 等价于删除整个 Git common repository：这是 authority destruction boundary，不由 outcome projection 恢复。

## Task、Session 与 Placement

```js
TaskPlacement = {
  mode: "partitioned" | "exclusive_worktree",
  authority_id,
  attachment_id,
}
```

- `partitioned`：同一 Git worktree 或 filesystem root 可有多个 live task，但结构化 write scope 必须互不重叠。
- `exclusive_worktree`：一个 worktree incarnation 至多一个 live task；仍声明 task scope，避免提交无关文件。
- filesystem provider 拒绝 `exclusive_worktree`；需要物理副本隔离时由宿主创建另一个 filesystem root，并为它建立新的 detached authority。
- placement 在 task open 后不可隐式更改。
- 一个 session 在同一 attachment 至多绑定一个 live task；同一 session 可在不同 attachment/authority 参加不同 task，因为 target authority 先确定路由边界。
- `join --task <id>` 加入指定 authority ledger 中的 task；可报告目标 attachment 路径，但不替宿主改变 cwd。
- suspended task 保留 scope；terminal task 释放 scope；placement unavailable task 保留历史 claim 但不阻止新 incarnation 使用同一 repo-relative path。

Placement 选择：

- Git 中写 scope 可证明不相交、可共享 branch/HEAD/提交顺序、criterion freshness 可接受时用 `partitioned`；filesystem 当前总是该模式。
- 需要独立 branch/base/history、重叠生成目录、repo-wide isolated criterion 或 rebase/merge/reset/stash/checkout 时用 `exclusive_worktree`。
- 不自动选择或升级 placement。只有显式 `open --placement exclusive-worktree --worktree-path ...` 可创建 worktree。

## Artifact、Criterion 与 Target-Authority 路由

每个 attachment 有独立 artifact checkpoint；task 只从其绑定 attachment 的 delta 接收证据。同 attachment 的 changed paths 在一个 reconciliation 中按 scope 分配；不同 Git worktree 的相同 repo-relative path 仅产生未来 merge advisory。

Hook 路由：

```text
tool targets
  -> canonical filesystem roots
  -> control-plane classification and exclusion
  -> Git containment check
  -> Git common-dir + worktree locator OR filesystem root locator + detached shard
  -> attachment claim/anchor validation
  -> session + task binding
  -> operation intent/receipt + artifact reconciliation
```

- control-plane classification 必须先于 provider 选择。受保护集合至少包括：worktree `.git` file/directory、绝对 Git admin-dir、Git common-dir、`$GIT_COMMON_DIR/workloop`、filesystem root `.workloop`、HOME `authorities/`、`outcomes/`、legacy archive 与其 lock/temp/recovery 路径。
- Workloop runtime 自己的控制写入只能走内部 authority/projector API 与其事务凭据；普通工具对 control plane 的直接 target 永不成为 task artifact/write-scope evidence。宿主 Git 命令对 Git internals 的合法间接修改按 command intent 与 Git receipt 观察，不把内部文件逐个归 task。
- `observe`/`nudge` 下，control-plane direct write、locator 含混和 authority 不可读均尽可能在仍健康的目标 authority 记录 `protected_resource_interference`，否则只输出 indeterminate diagnostic，并继续放行宿主；不能把“写遥测”作为放行前提。只有用户显式选择的 deny profile 才能请求宿主阻断。控制命令自身仍可因无法安全更新 authority 而 fail closed。
- `cwd` 只是 launch context，不是归属证明。
- 可证明位于启动 authority 外、且不属于其他 Git/filesystem authority 的操作不写源 task ledger。
- 命中另一个受监督 root 时，由目标 authority 处理。
- 同一 operation 命中多个 authority 时共享 `operation_id`，各自只记录自己的部分；不伪造跨 authority 原子性。
- 目标含混时不归为干净 task evidence；`observe`/`nudge` 仍 fail open。
- Host 对 destructive/network/secret 等批准继续独立生效。

criterion 在锁外执行；提交 observation 时比较 task attachment 的 artifact checkpoint、task revision、verification scope 和 placement availability。其他 attachment 的变化只有在 task 明确声明跨 authority 外部依赖时才使 observation stale。

## Git Stage / Commit Receipt

`partitioned` task 共享同一个 worktree index/HEAD，因此同一 `worktree_id` 的 Workloop stage/commit 使用一个短锁；不同 linked worktree 使用不同锁。宿主直接 Git 不受该锁约束，所以锁不是安全证明，后置条件才是。

干净 commit receipt 至少绑定：

```text
task_id
worktree_id
head_before
commit_oid
commit_parents == [head_before]
commit_diff_paths subset_of task.write_scope
outside_scope_index_after == outside_scope_index_before
authority_sequence
```

- Workloop 以具体 pathspec stage，并验证 index delta。
- commit 只选择 task paths；其他 task staged entries 不得进入 commit，也不得被清除。
- receipt 认证不可变 commit object 的内容，不声称 HEAD 永远未被宿主移动。
- 写 receipt 前若 HEAD/parent/index 与预期不一致，记录 uncertain/interference，不生成 clean receipt。
- terminal 前重新验证 `commit_oid` 仍是当前 HEAD 的 ancestor、task paths 未被后续提交逆转、criterion observation 仍 fresh。
- 直接 host commit 只有在 Hook 能唯一绑定 OID、parent 和 path diff 时才可形成 receipt；否则宿主执行仍成功，但 Workloop terminal held。

竞态 fixture 必须在 precheck、stage 后、commit 后、post-diff、authority append 前分别注入 direct `add/commit/reset/checkout` 和 HEAD movement，证明 out-of-scope 或无法唯一归因的提交永远拿不到 clean receipt。

## HOME Authority / Projection 隔离与硬切换

HOME 中有两种完全不同的树：

```text
~/.workloop/authorities/<authority-id>/...   # 仅 filesystem provider 的 critical authority
~/.workloop/outcomes/<authority-id>/...      # Git/filesystem 都可重建的 best-effort projection
```

它们使用不同 path resolver、锁和模块 API。authority 代码禁止 import outcome reader；outcome projector 只能消费 caller 已验证的 event records，不能反向打开或修复 authority。

新 projector 只写：

```text
~/.workloop/outcomes/<authority-id>/outcomes.jsonl
~/.workloop/outcomes/<authority-id>/cursor.json
```

每个 shard 只从对应 common/root authority 重建；一个 shard 的锁、损坏或重建不修改其他 shard。跨 repo 查询扫描 shards，它们仍然只是 observation cache。

旧 `~/.workloop/outcomes.jsonl` 和旧 cursor 目录：

- 当前 runtime 永不读取、抽取、迁移或覆盖；repo 级命令绝不碰它们。
- 默认原地保留字节，因此硬切换不会损伤其他 repo 的历史行。
- 只有显式 HOME-wide `archive-incompatible-home-projection --granted-by user` 才在全局锁下将整个旧 monolith/cursors 作为一个 opaque generation 做 copy-fsync-digest-verify-publish；失败时保留源字节。
- archive 不是兼容 reader，新 runtime 不消费其中内容。

旧 Git worktree 根的 `.workloop`：

- 当前 runtime 检测到后拒绝把它当 authority。
- 显式 repo 级 `archive-incompatible-state --granted-by user` 枚举当前 Git 仍登记且可读的 worktree，把每个旧 `.workloop` 作为 opaque tree 归档到 common authority 的 `archive/legacy/`，验证后才允许初始化新 ledger。
- 已经丢失/pruned 的旧 worktree 无法恢复，必须明确报告；不伪造 archive 成功。
- 不读取旧 task、不迁移事件、不继续执行旧任务、不双写。

旧非 Git root 的 `.workloop`：

- 若其中存在旧 authority 文件而不是 current locator，filesystem open/control command fail closed。
- 显式 `archive-incompatible-state --root <path> --granted-by user` 先在新 detached shard 的 opaque archive 中完成 copy-fsync-digest-verify，再以 locator 替换旧控制目录；任何失败保留原 root 字节且不发布新 authority。
- archive 只保全字节，不生成 task/event，不允许旧任务继续。

installer 只安装当前 runtime，不自动修改任何 Git/filesystem authority 或 HOME old projection；首次控制命令执行格式检查并给出显式 archive 下一步。

## CLI 语义

```sh
workloop open --repo . --placement partitioned --write-path ...
workloop open --repo . --placement exclusive-worktree \
  --worktree-path ../repo-task-a --branch workloop/task-a --base HEAD ...
workloop open --root /path/to/files --root-kind filesystem \
  --placement partitioned --write-path ...
workloop tasks --repo .
workloop tasks --repo . --worktree .
workloop tasks --root /path/to/files
workloop authorities
workloop status --repo . --task <id>
workloop status --authority <id> --task <id>
workloop join --repo . --task <id> --reason "..."
workloop join --authority <id> --task <id> --reason "..."
workloop reconcile-worktrees --repo . --record
workloop retire-worktree --repo . --worktree <path> --reason "..."
workloop recover-staged-locator [--repo <path> | --authority <id>] --attachment <id> \
  --locator <path> --expect-locator-digest <sha256> --reason "..." --granted-by user
workloop recover-attachment [--repo <path> | --authority <id>] --attachment <id> \
  --locator <path> --expect-epoch <n> --reason "..." --granted-by user
workloop cleanup-staged-locator --locator <path> \
  --expect-locator-digest <sha256> --reason "..." --granted-by user
workloop abandon-staged-authority --authority <id> \
  --expect-genesis-digest <sha256> --reason "..." --granted-by user
workloop reattach [--repo <path> | --authority <id>] --attachment <id> \
  --select-anchor <path> --expect-epoch <n> --reason "..." --granted-by user
workloop fork-identity [--repo <path> | --authority <id>] --attachment <id> \
  --select-anchor <path> --expect-epoch <n> --reason "..." --granted-by user
workloop stage --repo . --task <id>
workloop commit --repo . --task <id> --message "..."
workloop export-authority --repo . --output <outside-repo-path>
workloop export-authority --authority <id> --output <outside-authority-path>
```

`tasks --repo .` 默认读取 common ledger 中的所有 task；不再需要遍历每个 worktree 才知道 task 存在。`tasks --root` 先验证 locator 再读取 detached ledger。`authorities` 枚举 HOME filesystem shards 和调用者显式提供的 Git roots，但 HOME outcome shards不计入 authority。所有 task 动词接受 `--task`；仅在当前 session/attachment 恰好绑定一个 live task 时允许省略。

authority selector 必须恰好选择一种：Git attachment 使用 `--repo <任一仍可读 worktree>` 解析 common authority；filesystem attachment 使用 `--authority <authority-id>` 直接读取 HOME shard。命令不得通过全局 outcome projection 猜 Git authority，也不接受命令行 claim token；token 只从指定 locator 读取，避免 shell history 泄漏。

恢复命令是显式 control mutation，均要求 `--granted-by user`、非空 `--reason`，以及适用于当前状态的精确 `--expect-epoch`、locator digest 或 genesis digest，只能由 CLI 调用；Hook、reconciliation 和 installer 永不自动调用：

| 命令 | 唯一合法前置状态 | 效果与必须证明的后置条件 |
|---|---|---|
| `recover-staged-locator` | locator 文件存在，但只包含空内容或预计算 staged frame 的精确前缀；authority genesis、attachment identity、stable anchor、user provenance 与完整 locator digest 均匹配，且 claim 尚未开始 | 在一个 `A` 内只截断已验证的残片，追加并 fsync 精确 staged frame，再追加 `staged_locator_recovered` receipt；locator 或 receipt 输出丢失后的重试返回同一 receipt，缺失或非前缀 locator 不得被重建或替换 |
| `recover-attachment` | authority 为 `claimed_pending_locator`；locator 为对应 staged，或已写成 claimed 但缺 final event；token、staged/claimed digest、anchor 与 epoch 全匹配 | 在一个 `A` 内从现存步骤继续：必要时发布 claimed locator，复读验证后追加唯一 `attachment_locator_published` final event；不得创建、关闭、迁移 task，重复调用返回同一 receipt |
| `cleanup-staged-locator` | locator 为 `staged`，且解析到的所有可达 authority 都不存在对应 committed claim；不得用于 pending/claimed/collision | 只删除该精确 locator 文件，不递归删除 `.workloop`，并返回被删除字节的 digest；只要存在或无法排除 committed claim 就 fail closed |
| `abandon-staged-authority` | detached shard 只有完整 genesis/staging records，或只有尚未产生 source fork intent 的 destination reservation；零 attachment claim、零 task，且调用者给出的 genesis digest 及可选 destination-intent digest 精确匹配；不得用于 Git common authority | 在该 shard 使用 recovery reserve 追加 terminal `authority_staging_abandoned`，保留可审计字节并从默认 active inventory 隐藏；不删除 shard，不发布 locator，重复调用幂等 |
| `reattach` | `reattach_required`、`placement_unavailable` 或 `collision`；selected anchor 携带匹配旧 claim；除 collision 选择外旧 anchor 必须不可达 | 在 `A` 内追加 `attachment_reattach_pending`，预留单调递增 epoch 并绑定 selected stable anchor，发布新 epoch locator并复读后才追加 final `attachment_reattached`；任何旧 epoch locator 以后均为 stale、不可路由。collision 时未选择的副本保持 stale，不被删除 |
| `fork-identity` | `collision` 或 `reattach_required`，selected anchor 可读且当前 locator/epoch 匹配；用户明确选择‘这是副本而非原 identity’ | 不复制 task/history。Git 在同一 common authority 原子记录旧 collision 选择与新 `attachment_claimed_pending_locator`，发布并复读新 locator 后追加 final event。filesystem 先分别预检源 authority 的 success/abort 两种闭合容量，以及新 detached authority 的 genesis、destination intent、source-ready、pending、final 完整容量；目标先追加 command-bound destination intent，源再追加 fork intent，最后目标锁内追加 source-ready。destination intent 阻断目标无关 mutation，source intent 阻断同源 reattach/第二个 fork；source-ready 与 attended abandon 在目标锁内串行竞争。abandon 先赢时，重试在源 authority 幂等追加 `attachment_fork_aborted` resolution；source-ready 先赢时禁止 abandon，并逐个 authority 完成新 claim 与旧 collision resolution，两次 `A` 绝不同时持有。所有 fork authority 帧的 partial tail 均须先用 digest-bound `authority_tail_recovered` 修复；严格校验且位于本事务 intent 之后的回执才允许消费 emergency continuation reserve，source-ready 前的目标仍可显式 abandon。一个 anchor 不得同时路由两个 authority |

每个成功 receipt 必须返回并持久绑定 `command_id`、user grant/reason、authority ID、attachment ID（若适用）、previous/new epoch（若适用）、previous/new anchor digest、locator/genesis digest、authority sequence 和发生的 event IDs。命令在 append 后输出前崩溃时，以 `command_id + expected epoch/genesis digest` 重试只能得到同一结果；状态、epoch、digest 或 anchor 任一不符即拒绝，不做“尽力修复”。

所有会推进 locator 状态的 control command 都复用同一 framed-journal publication 子协议：先在 authority 追加带 `command_id` 的 pending/intent event，再向有界 locator journal 追加预先哈希的下一状态 frame并 fsync，锁内复读验证完整 frame chain 后追加 final event；只有 final event 与末帧同时匹配才可路由。命令崩溃时，Hook 只看到 pending/torn locator并放行但不认证；重试先截断未完成 frame，再从 ledger 中的同一 `command_id` 继续，绝不另开 claim。

## 旧审查问题的闭环

| Finding | 新机制闭环 | 验证证据 |
|---|---|---|
| `B-WORKTREE-AUTHORITY-LOSS-001` | 权威移到 common-dir；ledger 自己保存所有 attachment/task | remove/prune/path-reuse fixture |
| `B-HOME-ARCHIVE-SCOPE-001` | repo 命令不碰旧 HOME monolith；新 projection 按 repo 分片 | 两 repo shard 隔离与 legacy untouched fixture |
| `VG-WORKTREE-REMOVAL-FAILSAFE-001` | ledger 保留 task，Git list 只更新 availability | registered-missing/remove/prune fixture |
| `VG-HOME-ARCHIVE-ATOMICITY-001` | 默认不搬旧 HOME 字节；显式全局 opaque archive 单独测试 | copy/failure/digest/publish injection |
| `VG-PARTITIONED-GIT-RACE-001` | commit object receipt 与 terminal landing proof 分离 | 五阶段 unmanaged Git race matrix |

## 预计修改范围

- `lib/authority-root.mjs`（新 leaf）：control-plane-first target 分类、Git containment/common-dir、filesystem detached shard、current format、locator claim/anchor 解析；只依赖 `prims`。
- `lib/prims.mjs`：新 authority/schema vocabulary；删除 Contract 5/6 compatibility constants 和 dispatch。
- `lib/event-store.mjs`：provider-neutral authority record、跨 task/attachment 原子 event batch、authority cursor、verified tail。
- `lib/task-store.mjs`：provider control-root 下的 `state.json`、authority/attachment/task projection 和 rebuild。
- `lib/task-engine.mjs`：AuthorityState reducer、Git/filesystem attachment、placement/scope/session 不变量。
- `lib/application.mjs`：provider resolution、locator registration、filesystem authority inventory、open/join/tasks/reconcile/retire/export/stage/commit orchestration。
- `lib/criterion.mjs`：per-attachment checkpoint、placement availability、freshness；Git provider 追加 landing commit。
- `lib/supervision.mjs`：control-plane exclusion、target Git-containment/filesystem-locator routing、attachment claim validation、session/task binding、跨 authority attribution、直接 Git receipt。
- `lib/outcome-projector.mjs`：HOME per-authority outcome shards；与 filesystem authority API 隔离；删除 monolith current reader/migration。
- `install.mjs` / `uninstall.mjs`：唯一当前 runtime；不触碰 repo state/旧 HOME projection；删除 Contract 5/6 pins。
- skills/README/`AGENTS.md`：新 authority boundary、双 placement、orphan/retire、Git receipt 和权限语义。
- tests：provider resolver、control-plane exclusion、Git/filesystem locator claim/publish crash/copy/collision/reattach、remove/prune/root move/delete/path reuse、common/HOME authority lock/replay、multi-task reducer、tracked/untracked/ignored routing、nested/git-init conflict、Git race、outcome isolation、opaque archive、installer、macOS/Linux/Windows。

## 范围与成本

| 范围 | 组成 | 预估 | 风险 | 价值 |
|---|---|---:|---|---|
| 核心 | Git/filesystem provider resolver、authority/attachment IDs、locator handshake | 4–5 天 | 双重归属、身份复用、崩溃中间态 | 根治 worktree/root 权威丢失 |
| 核心 | AuthorityState、multi-task/attachment reducer 与 ledger | 2–2.5 天 | 重放/跨实体不变量 | 单一事实源 |
| 核心 | artifact/criterion/session/target-authority 路由 | 2–3 天 | Git containment、nested root、stale 与误归属 | 证据隔离 |
| 核心 | task-scoped Git receipt 与 terminal landing proof | 2–2.5 天 | unmanaged Git 竞态 | 防止提交夹带/伪认证 |
| 核心 | filesystem HOME authority、per-authority outcome projection 与 legacy hard cut | 2–3 天 | authority/projection 混淆、HOME 故障 | 非 Git durability + outcome 隔离 |
| 核心 | 删除 Contract 5/6 runtime/reader/projector/installer 分支 | 0.5–1 天 | 死引用 | 唯一当前模型 |
| 支撑 | Hook/CLI/installer/skills/docs | 1.5–2 天 | 接口遗漏 | 可正确操作 |
| 支撑 | remove/prune、root move/delete/copy、crash、Git race、Windows 与 E2E fixture | 3–4 天 | provider 组合面大 | 证明安全边界 |
| **总计（核心 + 支撑）** | | **17–23 天** | | |

持续成本：维护一个 reducer、两个 authority provider、locator/reconciliation 协议、Git phase-race matrix 和严格隔离的 HOME authority/outcome trees。机会成本：三到五周内不应同时扩展 scheduler、跨机器 task 或自动 worktree merge。

## 明确不做

- 不把 `.workloop` 加入 Git tracked files。
- 不在 current Git worktree 或非 Git subject root 内保存唯一 ledger；其中只允许 locator/legacy bytes。
- 不使用 Git refs/notes/objects 保存权威。
- 不用 HOME projection 恢复 task authority。
- 不把 filesystem HOME authority 与 HOME outcome projection 合并为同一文件、锁或 reader API。
- 不允许 filesystem authority 与 Git root、或两个 filesystem authorities 默认嵌套；用同一 authority 内的 task scope 分区。
- 不支持跨 clone、跨机器或多用户共享 task authority。
- 不保证整个 common repository 被直接删除后自动恢复；只提供显式 export。
- 不自动创建 placement；只有用户显式 exclusive-worktree open 可创建 worktree。
- 不自动 remove、prune、merge、切换 worktree，不自动删除 branch，不改变宿主 cwd。
- 不让默认 Hook 拦截宿主 Git、control-plane direct write 或文件操作；含混/受保护目标只影响 Workloop 证据认证。显式 deny profile 仍由用户选择。
- 不兼容、读取、迁移或继续执行旧 Contract/task 状态。
- 不开发任意 shell 完整副作用解释器；含混操作保留为 unknown/interference。

## 停止点

方案已收敛到实现目标所需的最小稳定边界：Git common-dir 与 filesystem detached 两个 authority provider、统一 reducer、attachment locator/availability、Git 双 placement、filesystem 分区、task/session/path 归属、Git receipt、target-authority Hook 路由和 per-authority derived projection。

继续加入 root-local authority fallback、Git object journal、自动 recovery/rebind、跨机器同步或自动 worktree/root lifecycle 会重新引入双权威、扩大权限或显著增加恢复协议，但不改善本轮本机多 task/attachment 的验收预言机，因此停止扩展。
