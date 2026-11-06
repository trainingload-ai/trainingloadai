# 活动指标因果时间线与顺序重放

状态：核心流程、逐用户修复与本地真实数据库验证已实现；完整对象核验、性能优化及人工审核通过前禁止发布。
适用范围：Public Core、Managed 组合迁移、导入后处理、指标变更复算与历史数据修复

## 1. 目标

活动分析必须只使用活动发生时已经可知的数据，同时允许当前活动使用自身产生的可靠 bootstrap。活动成功完成分析后形成的新观测，只能从活动结束时刻起供后续活动使用。

系统必须同时满足：

- 不使用未来活动推算出的阈值回填更早活动；
- 新用户首项活动可用自身 eFTP、eCP、MAX_HR 等候选完成本次分析；
- 后续活动能够使用前序活动形成的 AUTO 时间线；
- 指标、Zone、体重等输入改变时，只重算 calculation fingerprint 改变的活动；
- 不可用输入会清理旧派生结果，不保留假零或过期值；
- 同一用户的 Replay 严格串行，不同用户受全局租约容量限制并行；
- 进程退出、租约接管和分页续跑保持幂等且不跳页。

## 2. 因果语义

Replay 合并三类事件：

1. `EXTERNAL_METRIC`：MANUAL 等权威指标在精确 UTC 时刻生效；
2. `ACTIVITY_END`：成功分析的活动观测在结束时刻生效；
3. `ACTIVITY_START`：解析该活动的不可变计算上下文并执行 HEAVY。

同一时刻的顺序固定为：权威指标、活动结束、活动开始；同类活动按 `activityId ASC`。同一 `type + sport + effectiveAt` 最终只保留一个 change point。

零时长活动的 START 与 END 相同。它先使用该时刻开始前的上下文计算，成功提交后再发布自身观测；同一时刻开始的其他活动仍共享相同的 pre-start 上下文，避免活动 ID 顺序造成未来泄漏。

活动开始时按以下顺序解析：

1. 活动时点已经生效的 MANUAL/AUTO；
2. 当前活动自身的可靠 bootstrap；
3. 明确允许的版本化 DEFAULT；
4. `UNAVAILABLE`。

MANUAL 只在相同生效时刻优先于 AUTO。若自动更新仍开启，之后产生的新 AUTO change point 可以继续演进时间线。

## 3. 指标窗口与传播规则

| 指标              | 窗口                     | 规则                                                     |
| ----------------- | ------------------------ | -------------------------------------------------------- |
| CP、FTP、W′、Pmax | 90 天                    | 复用现有 CP 算法；只使用可靠实测功率                     |
| CS、D′            | 90 天                    | 与 TP 的 180 天候选独立选点，旧记录不得遮蔽窗口内记录    |
| TP                | 180 天                   | 使用已有配速推算规则                                     |
| LTHR              | 90 天聚合、42 天交叉支持 | 复用现有观测选择器和候选校验                             |
| VO2Max            | 40 天衰减、120 天截断    | 复用已有活动 VO2Max 来源解析                             |
| MAX_HR            | 持续状态                 | 新用户由 5 秒峰值初始化；之后只升不降；MANUAL 同时刻接管 |

力量训练、Generic 室内活动等非耐力活动不会发布耐力阈值。MAX_HR 观测只接受 RUN、CYCLING、SWIM 的合法心率峰值。

用户关闭某项自动更新时，当前活动仍可使用自身 bootstrap，候选以 ESTIMATED 证据保存，但不会成为后续活动可见的 AUTO。

无实测 RHR 时，仅 TRIMP/EPOC 可使用版本化 `60 bpm` 默认值，并记录 `DEFAULT_RESTING_HEART_RATE` provenance。该默认值不写入用户指标，也不用于 HRR Zone。

## 4. 数据模型

### 4.1 有效投影与审计

`UserFitnessMetric` 的系统投影增加：

- `projectionVersion`；
- `projectionRunId`；
- `projectionFingerprint`。

AUTO/ESTIMATED 使用活动结束的精确 UTC 时刻，不压缩到自然日零点。MANUAL 保持既有日期语义。

不使用 `supersededAt` 隐藏失效 AUTO。替换投影时，在同一事务中：

1. 将旧行完整复制到 `UserFitnessMetricProjectionAudit`；
2. 物理删除旧 AUTO；
3. 写入当前正确时间线。

因此旧应用或应用层回滚也不会重新选中失效投影。

### 4.2 活动上下文快照

`ActivityFitnessMetricsSnapshot` 使用 `resolutionVersion = 5`，除计算上下文外还固化活动输入、配置和历史读取口径：

- `calculationFingerprint`：只包含会改变计算结果的值；
- `provenanceFingerprint`：包含来源、版本 ID 和证据指纹。
- `inputFingerprint`、`inputDimensionFingerprints`：覆盖活动字段、RPE、Parquet、Lap 和 PRIMARY 来源；
- `analysisConfigFingerprint`、`resolvedLoadSources`：固化活动开始时生效的计算配置；
- `actualLoad`、`actualLoadSource`：固化历史实际负荷，不再用今天的配置解释过去；
- `analysisTimezone`、`pmcLocalDate`：固化活动的自然日归属。

Resolved context 包含：

- FTP、CP、W′、Pmax、MAX_HR、LTHR、RHR、CS、D′、TP、VO2Max；
- 活动时点生效的 Zone 版本及解析后数值；
- 活动时点可追溯的体重、身高、生日、性别；
- 当前活动 bootstrap；
- DEFAULT/UNAVAILABLE 原因与 provenance。

仅 provenance 变化时只刷新快照，不读取高频 records，也不触发 PMC。

### 4.3 时变配置

`UserProfile` 和 `UserAutoUpdateConfig` 继续表示当前状态；历史分析只读取 `UserAnalysisConfigVersion` 和 `UserAutoUpdateConfigVersion`。活动使用 `startTime` 时生效的分析配置，观测使用 `endTime` 时生效的自动更新权限。

配置变更只向未来生效，不创建历史 Replay。迁移无法还原旧配置历史，因此现有用户以 Unix epoch 写入一份迁移时基线；迁移后的变化按精确 UTC 时刻追加版本。开启自动更新时可在开启时刻把最新 ESTIMATED 提升为 AUTO，但不得回填原估算时刻。

### 4.4 Job 与租约

`UserPostProcessJob`、`ActivityRecomputeJob` 保存版本化 `replayCheckpoint`；复算任务增加 `priority`。

`ActivityAnalysisLease` 同时约束：

- 同用户最多一个 Replay；
- 全局 Replay 默认最多 2 个；
- DATA_REPAIR 默认最多 1 个；
- 租约 5 分钟，每 60 秒心跳；
- owner token fencing。

领取和容量判断使用 PostgreSQL advisory transaction lock 串行化。停滞的复算任务只有在分析租约失效后才允许接管。分页 checkpoint 与 AUTO 投影在同一事务提交，崩溃最多导致幂等重放当前页，不会跳页。

每项活动的最终负荷一旦变化，HEAVY 结果、活动状态与 `pendingPmcRecomputeFrom` 会在同一个 `SERIALIZABLE` 事务中提交。Replay 开始和结束时都会先消费该持久化待办，PMC 成功重算后才清除；进程在任意提交边界退出时最多重复一次幂等 PMC 重算，不会永久漏算。Worker 只推进 Job 状态，不覆盖 Replay 已原子写入的 checkpoint。

## 5. 模块边界

### 算法层

`FitnessTimelineProjector` 是框架无关的纯状态机，只处理事件顺序、优先级、去重、bootstrap、DEFAULT 和 change point。它不访问数据库，也不复制 CP、CS、LTHR、VO2Max 公式。

### AnalyzeModule

- `ChronologicalActivityReplayService`：编排顺序重放；
- `FitnessTimelineObservationService`：复用现有算法生成候选；
- `ActivityFitnessContextResolverService`：解析活动时点上下文；
- `ActivityDependencyFingerprintService`：生成 calculation/provenance 指纹；
- `ActivityImpactResolver`：将输入变化收敛到 HEART_RATE、POWER、PACE、VO2_MAX 或 FULL；
- `ActivityAnalysisLeaseService`：跨 worker、跨实例租约与 fencing。

### ActivityMetricsModule

- `computeHeavy(...)` 在事务外只读取事实并生成内存 mutation plan；
- `commitComputedHeavy(..., tx)` 在短事务内清理过期派生结果、持久化输出与 snapshot；
- `BindFitnessMetricsTask` 在 Replay 中只消费 Resolved context，不再查询当前用户档案。

### UsersModule

`applyTimelineProjectionBatch` 原子归档、删除和写入有效 AUTO。该入口不会发送 `FITNESS_METRIC_CHANGED`，防止 Projector 递归触发自身。

## 6. Replay 事务与并发

事务外计算前读取 `FitnessEvidenceRevision`。每次短事务提交时：

1. 取得用户级 PostgreSQL advisory transaction lock；
2. 校验分析租约 owner token；
3. 校验 evidence revision 未漂移；
4. 原子提交当前 mutation plan；
5. 读取提交后的新 revision，作为下一活动的预期版本。

如果 revision 漂移，未提交结果被丢弃并从当前 Replay 重新解析，最多尝试 3 次；仍冲突则交给持久化 Job 重试。任一活动 HEAVY 失败立即停止该用户 Replay，后续活动不能越过失败活动继续计算。

阈值变为不可用时，相关旧 TSS、IF、TRIMP、EPOC、BikeScore、Zone 分布等会在同一提交中删除。计算失败不会留下部分写入。

## 7. 影响范围与性能

直接 MANUAL 指标变更、滚动模型和历史导入都从真实生效时刻检查完整后缀。MAX_HR、LTHR、VO2Max 等会跨指标传播，不能在下一条同类型 MANUAL 处提前截断；只有 calculation fingerprint 改变的活动读取 Parquet 并执行相关 HEAVY 维度。

Replay 预加载窗口需要的峰值、LTHR 与 VO2Max 事实，change point 计算不重复查询数据库。分页使用因果闭合边界：若第 100 项活动与后续活动重叠，页面扩展到重叠链结束，避免把活动结束事件拆到下一页。

PMC 只从最早“最终负荷数值、运动分类或自然日归属实际变化”的日期重算；同一 Job 内多次变化会把持久化待办合并为最早开始、最晚结束的窗口。仅 provenance 变化不触发。无负荷保持不可用，不把 `null` 当作 `0`。活动自然日优先使用活动时区，其次使用活动时点生效的用户 TIMEZONE Body Metric，最后回退 UTC；数据库统一用 UTC 零点保存这个日历日期键，禁止使用服务器本地时区重新分日。

`lookbackDays` 仅保留为权益与审计字段，不能截断已经接受的历史数据变更。

### 7.1 本地性能与回归证据

纯 `FitnessTimelineProjector` 在 Apple Silicon 本地环境进行 12 轮重复测试，结果如下。该测试不访问数据库或 Parquet，因此查询数、连接数和高频读取数均为 `0`；峰值内存是单轮执行前后的最大 heap 增量，不代表进程常驻内存。

真实 PostgreSQL 下的冷/热 Replay、500/2,000 项及并发压力测试仍待执行。下表不能用于承诺生产修复总耗时或替代真实数据库压测。

| 时间线规模 | p50 | p95 | 最大 heap 增量 | DB 查询 | Parquet/高频读取 | DB 连接 |
| ---------- | --- | --- | --------------- | ------- | ---------------- | ------- |
| 500 项     | 3.008 ms | 3.268 ms | 4,067,072 bytes | 0 | 0 | 0 |
| 2,000 项   | 13.834 ms | 23.807 ms | 14,278,816 bytes | 0 | 0 | 0 |

Replay 集成测试同时验证：当所有活动的 calculation fingerprint 全命中时，`computeHeavy` 调用次数和高频 records 读取次数都为 `0`。生产并发不由单进程内存锁控制，而由数据库租约限制为默认最多 `2` 个 Replay，其中 DATA_REPAIR 最多 `1` 个。

本地未提交的 73 个 FIT fixture 已完成 TrackSwap 与 Garmin SDK 对照回归：总计 5,335,075 bytes、194,026 条 Record、104 条 strength set；两侧解码失败、原生字段不一致、规范化 Record/set 数量不一致均为 `0`。其中包含 57 个无 Lap 但有 Record 的文件、5 个力量训练文件和 16 个 Generic 文件。源 FIT 与 SHA-256 清单位于 Git 忽略目录 `.local/fit-release-corpus`，不进入远程仓库。

发布门禁默认执行完整数据库链路，必须提供专用本地 QA 用户：

```bash
pnpm --dir apps/server test:fit-release-corpus -- --user-id=<local-qa-user-id>
```

仅检查文件完整性和 Garmin SDK/TrackSwap 全字段一致性时，必须显式降级：

```bash
pnpm --dir apps/server test:fit-release-corpus -- --parity-only
```

完整模式会额外验证 Import、LIGHT、Replay、HEAVY、v5 snapshot、Record Parquet 点数、活动 READY、无假零负荷和 PMC pending checkpoint 已清空。`--parity-only` 的成功不能替代发布前完整模式。

## 8. 导入与修复

User Post Process Worker 和 Activity Recompute Worker 都调用同一 Replay。历史导入会从最早受影响活动扫描到当前时间，因此前序观测对已有后续活动的影响不会丢失。

修复命令默认 dry-run：

```bash
pnpm --dir apps/server repair:activity-fitness-timeline
```

限制扫描用户数：

```bash
pnpm --dir apps/server repair:activity-fitness-timeline -- --limit=100
```

确认后只创建低优先级 DATA_REPAIR Job：

```bash
pnpm --dir apps/server repair:activity-fitness-timeline -- --limit=100 --apply
```

扫描范围包括：

- Import Item 已 DONE 且 `analysisRequired=true`，但活动仍未 READY；
- Post Process 已终止但关联活动仍为 ANALYZING；
- snapshot 缺少 v5 活动输入、配置、实际负荷指纹，或活动已有可靠 bootstrap 但 snapshot 缺阈值；
- FTP/CP 缺失造成的 IF、TSS、BikeScore 假零；
- 旧 AUTO 缺 projection version/fingerprint；
- PMC 日期、负荷来源或数值与 snapshot 不一致；
- DEAD Job 仍保留未消费的 PMC checkpoint。

Finding 按用户合并，从最早受影响时刻重放。DATA_REPAIR 默认每页最多 100 项活动并保存 checkpoint；任务幂等，运行中收到新证据时创建持久化 follow-up，不丢更新。

该 CLI 只排队 Replay，不能修复原解析或 Parquet 物化时已经丢失的字段。部署前必须区分“输入正确、只需重放”和“需要从原来源重建输入”：先验证原对象、checksum 与 PRIMARY，完成安全数据集重建和 LIGHT 后，再执行 Replay。源本身无采样、时间无法确定或文件不可恢复时，必须保留稳定原因，不伪造输入或直接改派生数字。

旧 AUTO 若按自然日零点生效，可能早于当天首项活动。完整存量修复不能把这些旧 AUTO 当成首项活动的可信 seed；替换区间与 seed 选择必须覆盖这种边界。该存量重建检查属于发布门禁。

## 9. 发布与回滚

这是一个完整正确性改造，不拆分发布半成品。发布前必须同时具备：

- 增量兼容 schema 与迁移；
- Projector、Replay、统一 worker、修复入口；
- Public Core 测试与本地 73 FIT fixture 回归；
- Managed 组合迁移和固定 Public commit；
- 本文运行手册与性能结果。

部署时第一步必须完成数据库一致性备份、checksum 和隔离恢复校验；备份未通过，禁止执行迁移、应用切换或数据修复。数据集重建期间保留原文件、旧 Parquet 和旧指针清单，防止数据库备份引用的对象提前被 GC。

Public Core 提供 schema、服务、worker、CLI 和测试。Managed 复制对应 Core migration 到自己的组合迁移，并在完成 Public commit 后更新固定 commit。73 个源 FIT 只保存在本地 fixture 目录，不进入远程仓库。

失效 AUTO 已物理删除，旧应用不会重新读取审计表中的投影。应用回滚不等于恢复修改前的指标数值；数据恢复必须依据已校验的数据库备份和保留对象清单。数据库迁移保持向后兼容，不在回滚时手工降级 schema。

## 10. 验收清单

- Projector：确定性、prefix invariance、分页一致、重叠/同时间/零时长、无未来泄漏；
- 指标：MAX_HR 初始化和只升不降、RHR DEFAULT provenance、所有窗口、AUTO disabled；
- Pipeline：事务外计算、revision fencing、原子提交、失败回滚、不可用清理、局部维度与 FULL 等价；
- 数据库：精确时刻、同日多活动、MANUAL 同时刻优先、审计后物理删除、旧版本读取安全；
- 并发：两类 Job 同用户互斥、全局容量、心跳丢失、租约接管、计算中外部指标变更；
- 修复：dry-run 对账、幂等、分页续跑、低优先级、稳定不可修复原因；
- PMC：负荷来源切换、两年历史重算、重复 invalidate、无负荷不当作零；
- 性能：73 FIT、500/2,000 项时间线、p50/p95、查询数、Parquet 读取数、连接数、峰值内存；fingerprint 全命中时高频读取必须为 0；
- E2E：目标活动能用自身 eFTP/eCP bootstrap；新用户观测只影响后续；早期 MAX_HR 只重算相关维度；Generic/力量训练不发布耐力阈值；不可用值显示为不可用而不是 `0`。
