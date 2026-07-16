# 17 — 宿主钥匙的可观测性：权限模式进 hook payload 吗

Type: research
Status: resolved

## Question

[票 16](16-risk-floor-input-epistemology.md) 决议 1 的前置探测：账 B（权力钥匙）对**不可逆权力**要求事前的人类钥匙，而 runtime 验证不了「人」——真正不可伪造的事前钥匙在**宿主层**（host 权限提示／审批模式）。taskloop 能做的是**记录宿主钥匙的状态**——前提是它可观测。查证两个宿主：

1. **Claude Code**：PreToolUse hook payload 里有没有权限模式字段（`permission_mode` 或等价物）？哪个版本起？值域是什么（default／acceptEdits／bypassPermissions／plan…）？
2. **Codex**：hook payload 里对应的东西是什么（approval policy／sandbox mode）？值域？（票 12 先例：Codex 侧可作源码级核实，schema pin `rust-v0.144.1`。）
3. **最小公共面**：两边语义能不能对上？内核 host-neutral 判据把关——**只在半个宿主上成立的锚不进内核**（票 16 校准提示；`model` 字段的不对称是前车之鉴）。若不对称，退化处置是什么（记录 raw + 适配器归一化？）。
4. **`/sandbox`（08 档 1 配方）的「钥匙整体预转开」状态在 payload 里可见吗**——过夜任务的账 B 语义（宿主钥匙预先转开）能不能被记录。

**注意**：本票若证实可观测，同时给雾区「runtime 的本体论边界」的**人-面**开出第一个锚——宿主权限提示是人的动作、agent 伪造不了（与 `agent_id` 同级：宿主授权、agent 写不到）。

产出：双宿主对照表 + 内核可押的最小公共面。落 `research/host-key-observability` 分支。

上下文：[两个门的输入认识论决策记录](../../../docs/decisions/2026-07-16-gate-input-epistemology.md)决议 1；[评审独立性锚点决策记录](../../../docs/decisions/2026-07-16-review-independence-anchor.md)（`agent_id` 双宿主核实方法可复用）

## Answer

四问四答（findings 全文：`research/host-key-observability` 分支 `docs/research/2026-07-16-host-key-observability.md`，commit `1287a73`）：

1. **Claude Code 有**：`permission_mode` 是全 hook 事件（含 PreToolUse 与 Stop）的公共字段，六值 `default/acceptEdits/plan/auto/dontAsk/bypassPermissions`；本机三版本二进制实测 ≥2.1.156 在场；确切引入版本未证实（界定在 2025-09 前后窗口）。
2. **Codex 同名字段，但 schema 与运行时是两回事**：schema 五值，运行时唯一赋值函数 `hook_permission_mode()` 把 `AskForApproval` 四值**折叠成两个 wire 值**（`Never → "bypassPermissions"`，其余全 → `"default"`）；`SandboxPolicy` 完全不进 payload（`codex-rs/hooks` crate 搜 "sandbox" 零命中）。`rust-v0.144.1` 与 main 逐字节相同。
3. **最小公共面 = 一颗锚**：`permission_mode === "bypassPermissions"`（人已整体预转开）双宿主语义精确对称，可进内核。细档位区分（acceptEdits/plan/dontAsk vs default）只在 Claude 一侧成立——在 Codex 上**不是缺席而是恒定产出错值，比缺锚更危险**。退化处置：适配器 raw 值原样记账，内核只消费 bypassPermissions/其他 的二元投影。
4. **`/sandbox` 不可见**：官方文档与二进制 payload 字面量双重核查无 sandbox 字段；两宿主在「sandbox 轴不可观测」上对称（对称的是查不到，不是共同值域）。**08 档 1 靠 `/sandbox` 转开的过夜状态，hook payload 完全看不到**——账 B 想观测它只能走进程/文件系统级探测。

**副产品**：内核目前对两侧 `permission_mode` 消费为零（`decodeHook()` 不解析，全仓 grep 零命中）——与票 12 的 `agent_id` 同形，「两个宿主都递到手边，内核从没看见」第二次成立。四条未证实项列于 findings 文末。落点进 #04（bypassPermissions 锚、raw 记账、sandbox 轴无锚的处置）。

## Comments

- 2026-07-16：/research 后台 agent 已发出（隔离 worktree）。findings 预期落 `research/host-key-observability` 分支的 `docs/research/2026-07-16-host-key-observability.md`；agent 回报后由当班 session 核对并关单。已提示 agent：HOSTS.md 两处已被票 12 证伪，只当线索不当依据。
- 2026-07-16：agent 回报，当班 session 核对关单。核对动作：通读 findings 全文（152 行）；独立抽查最承重的本机断言——`claude.exe`（2.1.211）grep 实测 `permission_mode` 53 次命中、六值枚举字符串与 optional schema 声明逐字在场，与报告一致。未证实项 4 条已原样保留在 findings 内，不作结论使用。
