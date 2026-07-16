# 01 — 当前 loop engineering 一手证据调研（2026-07 refresh）

Type: research
Status: resolved

## Question

截至 2026-07，loop engineering（agent 工作循环工程）的公开一手最佳实践有哪些主张、新增或变化？**不继承**仓库旧研究矩阵（docs/research/2026-07-11）的结论——独立收集一手来源：Anthropic/OpenAI 官方工程博客与文档、主要 agent harness 的源码与文档、有署名的实践者一手文章，覆盖循环收敛/停机、验证与防 reward-hacking、预算、恢复/持久化、安全边界、eval、多 agent、context 管理。产出供 #02 第一性推导做**反例校验**的证据集，每条主张注明出处与日期。

## Answer

证据集已产出：**41 条一手证据**，8 主题分节，全部本次实际拉取（非记忆断言），每条注明出处/日期/原文关键句。落在分支 `research/loop-engineering-evidence-refresh`（commit `423053b`）的 `docs/research/2026-07-15-loop-engineering-evidence-refresh.md`，未 push。查看：`git show research/loop-engineering-evidence-refresh:docs/research/2026-07-15-loop-engineering-evidence-refresh.md`。

要点（供 #02 反例校验）：

- **停机/收敛**：Anthropic 2026-06-30 首次以「loop engineering」命名方法论，核心机制「evaluator 拦截 Stop、不满足打回」，与 taskloop stop-gate 同构；Codex 侧主张人工撰写的「Done when」里程碑清单冻结目标。
- **防 reward-hacking**：「过早自称完成」仍是公认最大失效模式，解法是外部结构化状态取代自陈；2026-03 新增「eval awareness」（模型反推被评测并破解答案库）→ 评测完整性需持续对抗性设计。
- **预算**：Messages API 新增 soft task budgets；SDK 延续 max_turns/max_budget_usd 硬熔断+可续跑。
- **恢复/持久化**：会话可序列化/任意点恢复是延续共识；新增 SessionStore 外部存储与「日志外置使 harness 可崩溃重启」表述。
- **安全**：OS 级沙箱+分层审批延续；新增凭证 mask 与 reviewer-agent 自动审批。
- **eval/observability**：新增子智能体调用链折叠进同一 trace（beta）；OpenAI 独立 Evals 控制台将于 2026 年内弃用。
- **多 agent**：官方基调转保守——「单线程写 + 只读评审子智能体」是被认可的形态（Cognition 量化：58% 严重缺陷捕获率）；默认不上多智能体。
- **context**：compaction 服务端产品化；token 预算实时注入。

对 #03（supervisor charter）最有分量的 3 条：官方解法方向是「外部结构化状态 + 更强的外置 evaluator」而非编排器；多 agent 证据反向——支持「保持单写入者 + 只读评审」，不支持全功能 supervisor。

已知缺口（如实标注在文档验证状态节）：未找到满足一手纪律的 martinfowler.com/HumanLayer 2026 年文章；Codex「Running Codex safely」页面 403 未核实；Codex 侧无「防过早停止」一手对应物。

## Comments

- 2026-07-15 charting session：已发车 /research 后台 agent（worktree 隔离），findings 落 `research/loop-engineering-evidence-refresh` 分支的 `docs/research/` 下。
- 2026-07-15：agent 完成，41 条证据经主报告作者对 4 条最高权重证据独立复核（quote 与日期一致）；分支与 commit 已在主仓库验证存在。关单。
