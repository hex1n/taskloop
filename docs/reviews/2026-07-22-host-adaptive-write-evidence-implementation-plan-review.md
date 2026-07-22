# 路径感知写入证据实施计划审查记录

日期：2026-07-22  
候选计划：`docs/plans/2026-07-22-host-adaptive-write-evidence-implementation.md`  
最终 revision：`7fb3acc8e27a3f44a32d7aca58f1b48e5140cad7bf98ed3be222bc03a3efa21f`  
作者：Codex root lane  
required reviewer：`gpt-5.6-terra-plan-reviewer`  
independence：second-model、fresh context、read-only  
review depth：full  
预算：calibrated default，最多 4 次 reviewer invocation  

## 两轨结论

```text
technical_verdict: SUSPENDED
implementation_decision: BUILD
```

子代理对最终 exact revision 的完整审查结论是 `GO`，且 blocker、should-fix、optional、verification gap 全部为零。

但机械 Exact Gate 仍返回 false，因为 gate checker 把第一、二轮已修入后续 revision 的两个 `decision_blocking` verification gap（V1、V2）继续视为永久 open。冻结的 4 次预算已用完，不能再调用 reviewer 进行显式重分类或 rebuttal acceptance。因此本记录不能把流程状态写成 technical `GO`；上游用户决定的 `BUILD` 不被审查改变。

## 审查轮次

| Round | Revision | Kind | Verdict | Findings |
|---|---|---|---|---|
| R1 | `4524309c…4386` | blocker sweep | NO-GO | B1、B2、V1 |
| R2 | `9f1e530c…9827d` | complete | NO-GO | B3、S1、V2 |
| R3 | `4670d58a…c1e` | complete | NO-GO | B4 |
| R4 | `7fb3acc8…a21f` | complete | GO | none |

同一 persistent reviewer session 完成 4 次 invocation，未启动 helper，未重试。调用方可观察成本采用 derived measurement：4 model invocations、约 229,174 input characters、约 9,700 output characters、约 507,527 ms 累计 wall time；provider token count 与费用不可用，未记为零。

## Findings 与处置

### B1 — fixed

原问题：task projection 没有 event-sourced capability binding/coverage interval，snapshot replay 后可能从单次 exact receipt 错误推出整项 history full。

父级验证：confirmed。现有 authority 完全从 event ledger replay，运行时临时分类确实会丢失。

修订：增加 capability registry、operation-scoped lease、coverage intervals 和 evidence revision；task-level full 不再由单次 receipt 推导。

### B2 — fixed

原问题：只保留上一个 runtime，第二次 Contract 6 install 后可能 prune 唯一的 Contract 5 逃生 binary。

父级验证：confirmed。现有 `pruneRuntimes()` 删除除 active hash 外的 runtime。

修订：首次 Contract 6 激活永久 pin `compatibility_runtimes.contract_5`，后续 install 自动 prune 必须排除该 hash。

### V1 — fixed in candidate, historical gate classification remains

原问题：缺少 checkpoint authority ABA 测试；stale candidate 的 bytes 再次匹配时可能错误追加 delta。

父级验证：confirmed。

修订：candidate 绑定 base checkpoint、task/evidence revision 和 event cursor；增加 E17 与 authority-only/ABA fault injection。

### B3 — fixed

原问题：长生命周期 exhaustive lease 仍可能覆盖 invisible surface switch 产生的 delta。

父级验证：confirmed。

修订：full history 只在 explicit complete mode 下使用；write-shaped Pre 先 reconcile unowned gap，再建立单次 operation lease，Post/Failure reconcile 后关闭；默认任务保持 partial/unknown。

### S1 — fixed

原问题：Contract 6 复用 event kind，但缺少 `{active task contract, event kind, payload_version}` dispatch matrix。

父级验证：confirmed。当前三处 validator 均以 kind + payload v1 为主。

修订：加入 Contract 5/6 逐事件版本矩阵、mixed task replay 规则和三验证点一致性测试 E20。

### V2 — fixed in candidate, historical gate classification remains

原问题：没有真实验证跨仓库 active Contract 5 task 在多次 Contract 6 upgrade 后的 read-only 与 finish/abandon 逃生链路。

父级验证：confirmed。

修订：增加 E21；在非安装源仓库建立 active Contract 5，执行两次以上 v6 upgrade，验证只读命令、mutation refusal 及 pinned v5 的真实 finish/abandon。

### B4 — fixed

原问题：独立 `not-needed` decider 可能绕过 complete-history、finite-write、evidence/cursor stability gate。

父级验证：confirmed。当前 engine 确实存在独立 not-needed terminal path。

修订：`achieved` 与 `not_needed` 共用 terminal assurance gate，再分别执行 criterion 或 baseline/no-success/evidence oracle；`abandoned` 明确为非成功管理性退出。

## 最终 reviewer output

```text
revision: 7fb3acc8e27a3f44a32d7aca58f1b48e5140cad7bf98ed3be222bc03a3efa21f
review_kind: complete
verdict: GO
coverage:
  rubric_dimensions: [internal coherence, implementation feasibility against current module boundaries, event/checkpoint authority and replay integrity, host capability and coverage inference soundness, compatibility and public-contract precision, Contract 5/6 migration and rollback safety, closure/concurrency/failure semantics, verification and acceptance completeness, scope sequencing and 9.5–10 day cost credibility]
  severities: [blocker, should-fix, optional, verification-gap]
blockers: []
should_fix: []
optional: []
verification_gap: []
```

## Mechanical gate

状态文件：`docs/reviews/2026-07-22-host-adaptive-write-evidence-implementation-plan-review-state.json`

命令：

```sh
node /Users/hex1n/.agents/skills/plan-review/scripts/check-gate-state.mjs \
  docs/reviews/2026-07-22-host-adaptive-write-evidence-implementation-plan-review-state.json
```

结果：

```json
{
  "pass": false,
  "failures": [
    "decision-blocking verification gap remains: V1",
    "decision-blocking verification gap remains: V2"
  ]
}
```

## 精确下一步

若需要机械 gate 也关闭，必须由用户扩展至少 1 次 reviewer invocation 预算，让同一 reviewer 显式确认 V1/V2 已从 decision-blocking gap 转化为 candidate 内已关闭的 acceptance obligations，或提供适用于“历史 gap 已被新 revision 修复”的 gate-state 表达规则。在此之前，不修改最终 candidate，也不把流程状态写成 technical GO。
