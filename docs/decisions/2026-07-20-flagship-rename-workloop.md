# 旗舰改名 workloop：整体与旗舰 skill 同名，硬切换无兼容层

- 日期：2026-07-20（硬切换裁决 2026-07-21 追记）
- 类型：命名裁决 + 迁移策略取舍
- 状态：已裁；Phase 1–3 已落地并实测，Phase 4 仅剩 npm 发布
- 关联：`docs/plans/2026-07-20-rename-taskloop-to-workloop.md`（执行方案与风险段）、`AGENTS.md`（硬切换规则、卸载语义）

## 问题

`taskloop` 这个名字要不要换、换成什么，以及**整体与它内部某个 skill 同名是否可接受**。

后一半才是真障碍。运行时 + 四个 skill（`loop-core`、`workloop`、`judgmentloop`、`meta-loop`）的结构里，若整体叫 `workloop`，就会与其中一个 skill 重名。

## 根据（一句话）

**"整体部分不得同名"不是一条真约束，而是一条被误当作约束的品味偏好；JS 工具链的旗舰模式（webpack 仓库 + webpack 包、babel + @babel/core）早已证明整体与旗舰同名可读、可用、可检索。**

拆掉的是这条反对意见，不是名字本身。

## 裁决

- 仓库、运行时、CLI 改名 **workloop**；**skill 层四个名字全部不动**。
- 消歧规约（已写入 loop-core）：skill 散文里不加限定的 "workloop" 指 skill；运行时首次点名写 "the workloop runtime"，此后一律 "the runtime"。
- **历史文档一字不改**：`docs/decisions/`、已落盘的 `docs/plans/`、`docs/research/`、`docs/reviews/`、`docs/e2e-test/` 里的 "taskloop" 保持原样。历史是证据，与 review receipt 不回填翻译同一原则。

### 备选名：七轮全否

warden / arbiter / marshal → andon → warrant / earnest → anchor → greenloop / testloop / passloop，七轮全部被品味否决。结论是用户第一直觉正确。npm `workloop` 已核实空闲。

### 迁移策略：硬切换，不做任何兼容层（2026-07-21）

方案原 Phase 2 设计了过渡期：env 双读、判据前缀双收、`migrate-state-dir` verb、安装器旧 manifest 回退。**四项均已实现，随后全部删除未发布。**

理由：**用户基数为一，过渡期只存在于本机本仓库**，兼容代码的维护成本高于它消除的风险。兼容层的正当性来自"有你控制不到的调用方"，这个前提在此不成立。

代价是改名成了一次性手工迁移。这个代价是真的，见下。

## 证据：硬切换在四处各自出血一次，全部静默

根因一条：**产品名同时是状态目录名、`~/bin` manifest 名、sandbox 可写根、以及各宿主已落盘的 hook 命令行**，而运行时会按需自建状态目录。四处全在版本控制之外，不出现在任何 diff 里。

1. **仓库状态目录**：`mv .taskloop .workloop` 在目标已存在时**嵌套而非改名**，3.0MB 事件账本被孤立，`status` 静默报 no task。已恢复，`audit` 验证 2363 records / 3003 events 链完整。
2. **HOME 产出账本**：`~/.workloop` 从未创建，`~/.taskloop` 存着活的 4552 行跨仓库投影。发现时**尚未触发**——下一次终态事件就会新建空账本。已改名，`audit-outcomes` 验证 4552 行全部认领。
3. **managed skills manifest**：manifest 名含产品名，改名后四棵已装 skill 树被判为非本工具所有，`install.mjs` 写下 `needs_manual_intervention` 并在 `activateRuntimeShims` 之前 return，新 shim 装不上而旧 shim 继续服务旧运行时。手工改 manifest 名即解。
4. **Codex hook 配置**：`~/.codex/hooks.json` 硬编码旧 shim 路径。清理旧 shim 时只查了 `~/.claude/settings.json` 与 `~/.codex/config.toml`，遗漏此文件，两个 hook 一并指向不存在的路径（`MODULE_NOT_FOUND`）。**这一处是清理动作自己造成的**。

## 可迁移的结论

- **改名前先盘点"名字进了哪些持久化路径"**，只 grep 源码不够——本次四处全在版本控制之外。
- **`mv A B` 不是改名，语义由 B 存在与否决定**。迁移已存在的目标必须逐项移动并对每个碰撞 fail-closed；整目录 `mv` 只在目标确不存在时安全。作废的 `migrate-state-dir` verb 原本要编码的正是这条，现由散文与 `uninstall.mjs` 的保全逻辑共同承载。
- **确认"没有引用"时不要用会静默截断的检查**。第 4 处正是 `grep -r ... | head -20` 被会话记录灌满、活配置被挤出输出所致。删除不可逆，检查可以重跑。

## 翻转条件

- 若 workloop 获得本机之外的真实用户，则"兼容层不划算"的前提失效，后续改名必须重新按过渡期设计裁决——本次的无兼容层结论不可直接套用。
- 若 npm `workloop` 在发布前被他人占用，回退到 `@hex1n/workloop`，其余裁决不变。
