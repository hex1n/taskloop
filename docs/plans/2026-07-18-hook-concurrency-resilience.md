# taskloop Hook 故障诊断与修复记录

- 日期：2026-07-18（同日完结）
- 状态：**已完结**——初版的并发假设被实测证伪；真因已定位、修复并经生产验证
- 触发来源：一次 Codex session（asset_loan repo）的现场故障
- 文件名沿用初版的 `hook-concurrency-resilience`，是历史原因；本文最终记录的不是并发问题

## 故障现象

用户在 asset_loan 用 Codex「测试 workloop」做模拟重构。agent 每次 `apply_patch` 都被拒、补丁无法落盘，任务被反复 suspend/重开四次，agent 自我归因为「缺少真实 TASKLOOP_SESSION_ID / supervisor 不可用」，`git diff` 全空。被拒原文：

> `Command blocked by PreToolUse hook: taskloop: supervisor unavailable; refusing a write whose artifact revision cannot be recorded.`

矛盾点：事件流里同一时刻有 `write_authorized`（taskloop 授权了写），Codex 侧却是 deny。

## 最终真因（实测锁定）

### 1. apply_patch 空指针崩溃（直接故障）

`taskloopIdentityAssignments`（`lib/application.mjs`）有两个叠加缺陷：

- 缺少兄弟函数 `taskloopInvocations` 已有的 shell-tool guard——`taskloopPrefix` 对非 bash/powershell 工具返回 `null`；
- 过滤条件写成 `parsed?.explicit !== null`，在 `parsed === null` 时求值为 `undefined !== null` = **true**，把 `null` push 进数组。

Codex 的 apply_patch 以**非 shell 工具 + 多行 patch 文本作 command 字段**到达 hook：patch 的每一行都被当作一个 segment、各 push 一个 `null`，随后 `item.invocation` 抛 `TypeError: Cannot read properties of null (reading 'invocation')`，被 `dispatchHook` 的 catch 兜底成笼统的 "supervisor unavailable" deny。

崩溃点在 owner 路径 commit `write_authorized` **之后**（`allowTaskloopCommand` 是最后一步）——这精确解释了「events 有 4 次授权、文件却没写成」的矛盾。**单实例即可复现，与并发无关。**

锁定路径：P0（deny 带 cause）落地后，真实 Codex 复现直接打印出 `supervisor unavailable (Cannot read properties of null (reading 'invocation'))`；随后单元级复刻确认 `assignments=[null,null,null,null]`。

修复与验证：tool guard + null 条件修正；回归测试（active task + ApplyPatch + 多行 command）红→绿；asset_loan 生产复验——修复后 0 次 deny、`MiniCarLoanExtService.java` 真实落盘（+37/-40）。

### 2. session 绑定失效（伴生发现，同家族：host 输入形态超出 shell 假设）

Codex agent 习惯把 taskloop CLI 命令写成**反斜杠续行的多行形式**。命令含换行 → `directTaskloopInvocation` 保守拒绝重写（`/[;&|`\n\r]/` 防护）→ 不注入 `TASKLOOP_SESSION_ID` → CLI 以 `"cli"` 身份 open → `taskOwnerSessionId("cli")` 返回 null → `isForeignSession` 恒 false → **该任务的 foreign-session 保护静默失效**。

证据：asset_loan 全部 11 次 open/resume 的 `host_session_id` 均为 `"cli"`；证据账本 39 条 `control_plane_friction_candidate`（taskloop 记录了「不可安全重写」但信号只进遥测）；`foreign=true` 行数为 0。

修复：**A** 引号感知的续行折叠（POSIX 语义：单引号外 `\␊` 拼接删除，单引号内字面保留；仅作用于 taskloop 检测路径，重写输出仍用原始命令文本）；**B** friction 分支加 stderr 提示，引导 agent 用单行命令保持 session 绑定。真实 rollout 形态的多行 suspend 命令探针确认注入生效。

## 初版并发假设的证伪过程（保留为记录）

初版诊断为「host 双注册 → 两个 taskloop 实例争 task lock → 一个授权一个 fail-closed → host 取 deny」。三步被推翻：

1. **并发实测**：16 并发 × 640 次 hook 争同一 repo 锁，0 次 fail-closed，单进程最长仅等 1.2s——task lock 的等待循环把并发正常串行化，**锁争用根本不触发 fail-closed**（且当时的失败是 0.1s 即拒，不符合 15s 锁超时的时序）。
2. **配置复核**：`~/.codex/config.toml` 并无 pre_tool_use hook 定义——初版把 `hooks.state` 的两条加载元数据误读成两个 hook 注册，实际只有 `hooks.json` 一处；`sandbox_mode = "danger-full-access"` 同时排除了权限/沙箱拒绝。
3. **P0 直读真因**：可观测性落地后，真实复现直接点名空指针（见上）。

教训：

- `hooks.state` 元数据 ≠ hook 定义；下结论前要找到定义本体。
- 「同秒 allow + deny」不需要两个实例——单次调用先 commit 授权、后在收尾步骤崩溃即可解释。
- **可观测性先行的顺序是对的**：若当时直接实施初版 P1（锁重试 + 错误分流），就是给不存在的问题写代码。Value Gate 的翻盘条件（「若瞬态/完整性区分的前提不成立」）以另一种方式触发了：瞬态本身不存在。
- 顺带的正面结论：taskloop 的锁在真实并发（含 Claude subagent 并发路径）下表现健康。

## 实施记录

| 项 | 结果 |
|---|---|
| P0 可观测性（deny/hold 带 `err.code`/cause） | ✅ 已实现；文案属 hook 契约，按 AGENTS.md 规则作为有意接口变更同步了测试断言。它是本次锁定真因的钥匙 |
| 初版 P1（锁争用重试 + 错误分流） | ❌ **未建**——靶子被实测证伪 |
| 真·根治：apply_patch 空指针修复 | ✅ tool guard + null 条件；回归测试红→绿 |
| 敌意语料常驻测试 | ✅ `hooks never crash on hostile or malformed payloads`（34 例，含非 shell 工具/畸形 payload/foreign/Stop/多 profile，并行批跑） |
| A 续行折叠 + B friction 通知 | ✅ 已实现并测试（含单引号内换行不误折叠的反例） |
| 初版 P2（install 双注册检测） | ❌ 不做——双注册前提被证伪；Claude 现场亦为单注册 |
| runtime 部署 | ✅ `e20cbd813893` 已安装，含上述全部修复 |

全量测试：206 pass / 0 fail / 7 Windows-skip。

## 遗留与边界

- 已存在的 `"cli"` owner 任务不追溯重绑——A 只对新 open/resume 的 episode 生效。
- 折叠救不了真正的复合命令（`cd x && taskloop …`、引号内换行）；这些由 B 的 stderr 提示引导 agent 改写，属既有保守设计。
- 崩溃类兜底：`dispatchHook` catch-all 保证任何未来崩溃仍 fail-closed（安全方向），且 P0 使其自带真因——同类问题不会再是盲盒。
