# workloop

[English README](README.md)

workloop 是一个零依赖 Node.js runtime，用于可审计的 multi-root agent
工作。宿主独占权限提示与执行审批权；Workloop 只负责持久化 task authority、
任务范围内的 Git receipt、attachment recovery、criterion certification 和
best-effort outcome projection。

本版本是 provider authority Contract 的硬切换：不接受旧的 `current-*`
命令别名、旧 Hook profile 或 compatibility runtime pin，也不会读取或转换旧
task runtime。

## Authority 模型

每个 task 只属于一个 provider authority：

- Git common directory authority 可以拥有 main/linked worktree attachment。
  多个 task 可以共用 attachment，但 write claim 必须不相交；task-scoped
  `stage` 与 `commit` receipt 保持这种隔离。
- Detached filesystem authority 由显式 `--filesystem-root` 创建，支持 Git
  之外的目录，并拒绝重叠或嵌套 claim。
- Exclusive worktree task 使用一个显式 linked worktree，不修改调用方的
  当前 worktree，也不会猜测 branch cleanup。

Authority record 是可 replay 的 provider journal；locator 只是 attachment，
不是 authority。移动 attachment 保持 identity；复制 locator 会进入 collision，
必须通过 recovery、reattach 或显式 fork 处理。

## 命令

公共 CLI 只有以下 verb：

```text
open stage commit certify status audit ledger tasks join suspend resume abandon
recover-attachment cleanup-staged-locator reattach abandon-staged-authority
fork-identity archive-incompatible-state hook hooks
```

Git task 示例：

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
  --criterion-file acceptance.mjs --command-id certify-widget-1 \
  --granted-by user --reason "criterion passed"
```

Certification adapter 必须只读；tri-state 退出码 `4` 代表 satisfied、`3`
代表 unsatisfied、`2` 代表 indeterminate。Git certification 还要求对应 task
的 clean receipt 仍然落地。

Git 之外的目录使用显式 filesystem provider：

```sh
node bin/workloop.mjs open \
  --filesystem-root /absolute/path/to/data \
  --goal "repair external index" \
  --write-path index.json --command-id open-index-1 \
  --granted-by user --reason "requested repair"
```

当 attachment 不可用时，使用 `--authority <authority-id>` 查询或恢复。
`status`、`audit`、`ledger`、`tasks` 都是只读操作。

## Hooks 与审批

recipe 必须指定一个 host profile：

```sh
node bin/workloop.mjs hooks --profile codex --mode nudge
node bin/workloop.mjs hooks --profile claude --mode nudge
```

`observe` 与 `nudge` 不主动拦截。PreToolUse 记录 operation intent，
PostToolUse 记录 completion receipt，Stop 直接 release。provider evidence
不可用时，这两种模式 fail open，并明确说明审批权仍在宿主。只有显式配置的
`deny` PreToolUse mode 可以返回拒绝；它不能替代宿主的审批系统。

只有 `codex` 和 `claude` 是有效 profile。`codex-safe` 被刻意移除。

## Outcome projection 与不兼容状态

provider authority 是唯一事实来源。每个 authority 的 outcome shard 写入
`WORKLOOP_AUTHORITY_HOME`（默认 `~/.workloop`）。某个 shard 缺失或损坏不会
改变 provider adjudication；下一次成功发布会重建它。

旧 repository artifact 不会被迁移或解析。下面命令在显式 user provenance
下，把识别到的不兼容文件逐字节复制到 `.workloop-incompatible-archive/`，源文件
保持不变：

```sh
node bin/workloop.mjs archive-incompatible-state --target . \
  --granted-by user --reason "retain pre-provider artifacts"
```

## 安装与验证

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
