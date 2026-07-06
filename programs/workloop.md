# workloop — 唯一的工作环(taskloop 方言)

一个壳,三种判据溯源。先判溯源,再开任务,然后同一个循环体。

## 0 · 判据从哪来(唯一的真分叉)

- **given** —— 用户拍板方案时给了判据(测试命令/SQL 断言/对账 diff)。
  直接 `open`。
- **recovered** —— 手上只有一个失败。先复现:重放输入、固定环境、拿到
  真实的红输出,**红是从世界挣来的,不是声明出来的**;复现产物(输入、
  预期、实际)就是 criterion 的原料。复现不了 → 不开环,先向用户要缺的
  输入。
- **absent(keep-green)** —— 校验类任务,判据本来就该绿。
  `open --keep-green --reason`,循环体只做只读核验,绿则 `not-needed
  --evidence`。

品味类交付(判据写不出可执行形式)→ 走 judgment 程序卡,不硬造判据。

## 1 · 开任务

`taskloop open`:goal + 红判据 + alignment + envelope + 预算。alignment
写不诚实("绿其实证明不了什么")→ 先加强判据再开环。

## 2 · 循环体

改最窄的一步 → 跑最小验证 → 尝试停(闸门现场跑判据)。红的反馈尾直接
喂下一轮;每轮 `status` 核对没越 envelope。recovered 溯源多一道生效门:
重放必须打在**新构建/新进程/新数据**上,打在旧世界上的绿不算数。

## 3 · 出场

- 判据绿 → 机器收 done,汇报:轮次、episode 数、touched files、
  alignment 里"不覆盖"部分的人工核验结果。
- 缺外部输入/部署 → `suspend --outcome needs_input --judgment
  "<剩余判据;当前失败;下一步>"`(已改文件机器已记,不用你报)。
- 机器判 stuck / out_of_budget → 任务已自动挂起,读横幅决定:续跑
  (直接继续,预算是任务级的,该加轮次走 `amend --rounds --reason`)、
  或 `abandon --reason`。
- 干完发现本来就不用干 → `not-needed --evidence`。
