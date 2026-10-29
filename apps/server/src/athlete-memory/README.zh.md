# Athlete Memory 模块导读

这个模块保存的是“用户在对话中表达、且未来可能有用的主观事实”，例如睡眠感受、疼痛、偏好、目标和临时限制。它不复制 `Plan`、`Activity`、`HealthData`、`Profile` 等已有结构化事实。

## 代码边界

- `domain/`：纯领域规则。包括操作类型、绝对时间校验、生命周期和衰减；不依赖 NestJS、Prisma 或模型 SDK。
- `application/`：用例协调。负责校验模型决策、生成 Ambient Context、历史搜索和用户管理。
- `infrastructure/persistence/`：Prisma 适配器。只有这里负责写 Fact、Evidence、Event 和 Job 终态。
- `presentation/`：HTTP DTO 与 Controller，只做认证用户映射、输入校验和错误转换。
- `../api/ai/memory/`：属于 `AiModule` 的对话集成。它负责创建 Job、调用 Memory Judge 和驱动 worker，但不能绕过 Memory 应用服务直接写事实。

依赖方向是：

```text
AiModule -> AthleteMemoryModule -> Store port <- Prisma adapter
```

`AthleteMemoryModule` 不反向依赖 `AiModule` 或 `HealthData`，因此不会形成循环依赖或第二个健康事实源。

## 写入流程

```text
USER 消息落库
  + 同一事务创建 PENDING extraction job
        |
        v
worker 领取 lease
        |
        v
Memory Judge 强制返回结构化 operations
        |
        v
服务端重新校验 operation / 时间 / 用户边界
        |
        v
同一短事务写 Fact + Evidence + Event + Job 终态
```

远端模型调用永远不在数据库事务内。模型负责语义判断，服务器负责权限、支持的枚举、时间范围、幂等、并发版本和最终写入。

一次 Judge 最多允许一次 `NEEDS_LOOKUP`，所以每个 Job 最多调用模型两次。模型失败、超时或格式错误走有界退避；用户隔离错误直接进入 `DEAD`，不会重复探测其他用户的标识符。

## 三类记录分别表示什么

- `AthleteMemoryFact`：当前可查询投影。它会被修正、替代、解决或撤回。
- `AthleteMemoryEvidence`：支持事实的来源消息与哈希。助手消息只能帮助理解上下文，不能成为 Evidence。
- `AthleteMemoryEvent`：事实如何变化的追加式审计，不保存模型私有推理；模型产生的事件会关联其 extraction job，便于隐私删除时定位派生判定。

`eventStart/eventEnd` 是事实实际发生时间；`assertedAt` 是用户何时说出它。两者不能混用，否则“今天回忆前天没睡好”会被误判为今天刚发生。

## 读取与衰减

每轮 Coach 开始前只读取一次 Ambient Memory，并将该不可变快照复用于本轮所有 agent step。历史查询由只读工具 `memory.search` 完成。

衰减只决定“现在的直接影响”，不决定物理删除：

- `ACUTE_RECOVERY` 在 1–3 天内可进入 Ambient，20 天后直接影响接近零，但仍可历史检索。
- `UNTIL_RESOLVED` 超过 `reviewAfter` 后是 `STALE_UNRESOLVED`，表示需要重新确认，不能推断已经恢复。
- `STABLE` 不按时间衰减，只能通过修正、替代或删除改变。
- `EPISODIC` 默认不进入当前上下文，但保留用于回顾。

原始聊天文本不会进入 system memory block。注入内容只有经过校验的规范化 claim，并明确标记为“数据而非指令”。

## 删除与来源变化

- 删除单条记忆和清除历史是物理删除，隐私删除优先于审计保留；同时删除相关 Memory extraction job 及其中的 Judge decision，但不会删除普通 Coach 对话。
- 删除/编辑会话消息时，消息变化、Evidence 撤回和旧 extraction job 清理使用同一事务；尚未产出 Evidence 的旧任务也会被清掉。
- 若事实还有其他 Evidence，则降低置信度而不撤回事实。
- 用户在管理界面明确修正过的事实拥有独立用户权威，不会因原会话删除而消失。
- 若当前 replacement 被直接删除或其唯一来源被删除，仍有独立依据的 predecessor 会恢复为 `ACTIVE`；历史节点不能被直接更正成第二个活动事实。
- 账户删除通过数据库外键级联清理 Fact、Evidence、Event 和 Job。

## 启用条件

Memory 服务能力默认可用，不使用环境 Feature Flag。跨对话记忆偏好默认开启，并且独立于 AI consent；用户显式关闭后才会保持关闭。托管部署缺少当前版本 AI consent 时只暂停实际提取、写入、搜索和自动注入，不改写记忆偏好；完成授权后，已开启的偏好会自动恢复生效。

## 关键测试

- `memory-operation-validator.spec.ts`：模型输出、绝对时间和注入/凭证防护。
- `memory-decay-policy.spec.ts`：20 天急性观察与持续未解决状态。
- `athlete-memory-query.service.spec.ts`：Ambient/Search 分离及用户隔离。
- `prisma-athlete-memory.store.integration.spec.ts`：真实 PostgreSQL 事务、lease、跨用户、纠错、来源撤回和 supersession 恢复。
- `memory-judge.service.spec.ts`：强制函数调用和模型契约。
