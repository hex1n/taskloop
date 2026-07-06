# judgment — 品味工作环(taskloop 方言)

交付物的 done-when 是判断而非机器检查(文档/方案/报告/设计)时用这张卡。
机器闸门在这个域只做记账(envelope、写预算照常),裁决换了实现:

- **rubric 先于动笔**,充当出生即红:3–7 条具体到"评审者能指着违例"的
  标准(成功判据、失效模式、反目标、指名读者),用户认可后冻结。写不出
  rubric 的探索性工作 → 不开环,直接做。
- 开任务时把 rubric 存档为文件,`open` 的 criterion 用一条诚实的占位
  校验(如 rubric 文件存在性)并在 alignment 写明:"绿只证明流程走完,
  质量裁决在人"。不假装机器能判品味。
- **fresh-context 评审**充当幂等裁决:每轮独立上下文只读 rubric + 草稿,
  每条发现必须引用 rubric 条目;作者自读永远不算独立评审,无独立上下文
  则记降级。
- 静默改 rubric = 本域的移动球门柱:改条目必须留痕(旧→新+理由),放宽
  须用户重新认可。
- 判停:连续两轮无实质发现,或四轮上限 → `suspend --outcome needs_input
  --judgment "awaiting user acceptance; last verdict: <...>"`,交用户
  验收。**验收是人的动词**:用户收货后由人跑 `done`(此时占位判据绿)或
  转向。
