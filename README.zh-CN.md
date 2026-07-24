# workloop

[English README](README.md)

workloop 是一个零依赖 runtime，用于 **loopengineering（工程闭环）**：把 agent
意图变成一个可持续执行、可恢复、可验证、可交接的工程闭环。一个 loop 从明确的
目标和写入范围开始，保留过程证据，运行显式 criterion，并把上下文留给下一个人或
agent。

宿主独占权限提示与执行审批权。Workloop 不增加第二套审批，而是为宿主正在执行的
工作提供可靠的上下文与证据。

## 工程闭环

1. **定义**：以 goal、归属与有限的 write scope 打开 task。
2. **执行**：agent 与宿主工具在选定 root 中完成实际改动。
3. **观察**：记录 task-local receipt，但不裁决工具能否执行。
4. **验证**：运行只读 acceptance criterion，并认证结果。
5. **延续**：跨 session 查询、暂停、恢复、修复或交接，而不是从聊天记录重建上下文。

Git receipt、filesystem identity、recovery journal、Hook 与 outcome projection
都是让这个闭环可靠的机制，不是产品的主叙事。

## Loop 可以运行在哪里

每个 task 只选择一个持久化 provider，对应它的 workspace：

- **Git workspace**：main/linked worktree 可以共享 repository；不相交 task
  保持独立 write scope 与 task-scoped receipt。
- **任意 filesystem 目录**：显式 `--filesystem-root` 支持 Git 之外的目录，
  拒绝重叠/嵌套 loop，完全不要求 repository。
- **独占 worktree**：exclusive loop 使用一个显式 linked worktree，不修改调用方
  当前 worktree，也不会猜测 branch cleanup。

provider journal 让 loop 可以 replay。路径只是 attachment，而不是 identity：移动
workspace 保持 identity；复制则需要 recovery、reattach 或显式 fork。

## 运行一个 loop

公共 CLI 只有以下 verb：

```text
open stage commit certify status audit ledger tasks join suspend resume abandon
recover-attachment cleanup-staged-locator reattach abandon-staged-authority
fork-identity archive-incompatible-state hook hooks
```

定义一个 Git-backed loop：

```sh
node bin/workloop.mjs open \
  --target src/widget.mjs \
  --goal "make the widget deterministic" \
  --write-path src/widget.mjs \
  --write-path tests/widget.test.mjs \
  --command-id open-widget-1 --granted-by user --reason "requested change"

node bin/workloop.mjs stage --target src/widget.mjs --task-id <task-id> \
  --command-id stage-widget-1 --granted-by user --reason "stage only this task"
node bin/workloop.mjs commit --target src/widget.mjs --task-id <task-id> \
  --message "fix: deterministic widget" --command-id commit-widget-1 \
  --granted-by user --reason "commit only this task"
node bin/workloop.mjs certify --target src/widget.mjs --task-id <task-id> \
  --criterion-file examples/read-only-criterion.mjs --command-id certify-widget-1 \
  --granted-by user --reason "criterion passed"
```

Certification adapter 必须只读；tri-state 退出码 `4` 代表 satisfied、`3`
代表 unsatisfied、`2` 代表 indeterminate。Git certification 还要求对应 task
的 clean receipt 仍然落地。

Git 之外的目录使用显式 filesystem provider，完全不需要 Git：

```sh
node bin/workloop.mjs open \
  --filesystem-root /absolute/path/to/data \
  --goal "repair external index" \
  --write-path index.json --command-id open-index-1 \
  --granted-by user --reason "requested repair"
```

当 attachment 不可用时，使用 `--authority <authority-id>` 查询或恢复。
`status`、`audit`、`ledger`、`tasks` 都是只读操作。

## Hook 只观察，宿主负责审批

recipe 必须指定一个 host profile：

```sh
node bin/workloop.mjs hooks --profile codex --mode nudge
node bin/workloop.mjs hooks --profile claude --mode nudge
```

`observe` 与 `nudge` 是非阻塞的观察机制：PreToolUse 记录 operation intent，
PostToolUse 记录 completion receipt，Stop 直接 release。evidence 不可用时，
它们 fail open；审批权仍在宿主。只有显式配置的 `deny` PreToolUse mode 可以
返回拒绝，它不能替代宿主的审批系统。

只有 `codex` 和 `claude` 是有效 profile。`codex-safe` 被刻意移除。

## 证据与恢复

provider journal 是唯一事实来源。每个 loop 的 outcome shard 写入
`WORKLOOP_AUTHORITY_HOME`（默认 `~/.workloop`）。某个 shard 缺失或损坏不会
改变 loop；下一次成功发布会重建它。

旧 repository artifact 不会被迁移或解析。下面命令在显式 user provenance
下，把识别到的不兼容文件逐字节复制到 `.workloop-incompatible-archive/`，源文件
保持不变：

```sh
node bin/workloop.mjs archive-incompatible-state --target . \
  --granted-by user --reason "retain pre-provider artifacts"
```

## 当前 runtime、安装与验证

本版本是 provider Contract 的硬切换：不接受旧的 `current-*` 命令别名、旧 Hook
profile 或 compatibility runtime pin，也不会读取或转换旧 task runtime。

```sh
node install.mjs
npm test
node bin/workloop.mjs help
```

安装器会先 stage 一个 runtime digest，只有 managed skill 成功后才激活 shim。
Hook 配置仍属于宿主，安装器不会修改它。已有 Codex workloop Hook 若不是
`--profile codex`，安装会在 stage skill 或覆盖 shim 之前拒绝激活；请手动更新
Hook 配置后重新安装。

手动安装测试可使用 `WORKLOOP_INSTALL_HOME`。未归属或本地修改的 skill tree
会被保留，不会被 installer 自动接管。

`npm test` 覆盖 provider transaction seam、installer activation gate、Git
main/linked/exclusive-worktree authority、task-scoped Git receipt、detached
filesystem authority、attachment recovery 与相互独立的 outcome shard。
