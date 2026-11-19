# 产品 AI Coach skills

产品技能位于 `apps/server/src/api/ai/core/skills/`，与 Codex 工程技能独立。`skill.registry.ts` 注册全部任务，`description` 定义交付物，`whenToUse` 区分会改变入口选择的分支；正文提供独有判断、证据选择、必要问题和完成条件。名称与别名保持历史兼容。

常驻 prompt 维护角色、证据、时间、沟通和确认原则。技能正文维护任务判断；`prompt-contracts/` 按领域注入共享语义；工具 schema 维护载荷，服务维护 ownership、revision、确认和不可变范围。简单定义可以直接回答，简单查询可以直接调用工具，无需先激活技能或完成固定问卷。

## 发现与能力边界

普通聊天在无技能和已有 active skill 时都能看到目录；激活后使用精简任务描述，切换通过现有 `skill.activate` 更新下一步提示词与工具 scope。交接保留打开的具体计划、日期范围、已确认限制和必要证据。`plan.active` 可能不是用户打开的计划。

`athlete-state`、`activity-review`、`period-review`、`plan-review-adjustment`、`rolling-plan` 和 `workout-generator` 由服务编排，不作为普通聊天的激活入口。服务按名称和旧别名查找仍可用。隐藏目录只是发现面设计，不承担授权：后台任务先按固定 candidate/allowed 工具集筛选，再排除写入和草案工具；换技能不能扩大这个集合。后台 prompt 不提供聊天切换目录，也不注入交互式 Workout operation 合同。

持久化问题回复恢复其实际 owner；专属 fitness 操作保留原采用/追踪协议。仅存在一个未完成测评，不会把以“今天”“根据”或“apply”开头的新目标自动归入测评。具体旧协议短回复仍能继续原任务，宽泛自然语言由模型结合当前目标判断。

## 相邻任务与组合

| 当前目标 | 入口与结束条件 | 后续边界 |
| --- | --- | --- |
| 概念、个人数值含义、新估计 | `metric-explainer` 解释；`fitness-assessment` 提交新结果、具体 blocker 或必要问题 | 图形/量化关系交 `training-analytics`；估计采用和跟踪分别确认 |
| 性能是否改善 | `performance-review` 给可比结果、进步判断与限制 | 数值趋势交 analytics；重新估计能力交 fitness |
| 近期是否训练 | `readiness-check` 给继续/减量/替换/休息；后台按 caller 合同提交 | 首页服务随后调用 generator 构造单 Workout，后者不重新决定训练适宜性 |
| 训练周回顾 | 聊天 `week-review` 给周判断与下一优先项；后台 `period-review` 交对应 scale digest | 计划执行对下一周的影响交 `plan-week-review` |
| 具体保存计划 | `plan-followup` 保持打开对象，狭窄问题可直接完成 | 日/周/全周期问题交对应 review；不会因为另有 ACTIVE 计划而换对象 |
| 新计划与可行性 | `plan-builder` 在 suitability READY 后交可保存草案；`plan-cycle-review` 评价可见未保存或已保存计划 | 评审本身不创建新计划；真正新周期 brief 交 builder |
| 保存 DRAFT 启动 | `plan-start` 评估同一计划，START preview→PLAN_START 卡→后来确认→提交回执 | 启动后可用性改变交 followup 的 SCHEDULE，保留原起点和历史 |
| 剩余安排或处方变化 | ACTIVE/PAUSED 日期变化用 SCHEDULE；处方变化用 ADAPT；完整继任计划才用 SUPERSEDE | 分页完整范围、明确 preserve 和当前确认；预览不是已写入 |
| 具体课程编辑与设备问题 | `workout-management` 给完整可评审变更；`integration-support` 给当前可用状态与支持的下一步 | 本地提交、第三方同步和设备送达分别陈述 |
| 后台复盘与构造 | 单 Activity snapshot→review；计划 day/week/cycle judgment→adjustment compiler；settled purpose→generator | 所有后台终点由 caller 的 schema 和 submit 校验，不能进入聊天确认流程 |
| 持续计划后台候选 | `rolling-plan` 按 MONTH 提交剩余自然月策略，按 WEEK/ADJUST 提交同一 ISO 自然周的未来 SCHEDULE 候选 | 跨月周复用两个自然月策略；个人设置缺口提交 NEEDS_INPUT；候选交计划域验证和发布，不创建 Decision |

`RollingPlanCandidateService.propose` 通过真实 `AiService.runBackgroundCoachTask` 和 `ReviewModelCallGuard` 协调候选；固定使用 USER 费用、同意与资格检查，不允许用户问题或绕过同意。调用者显式提供完整计划、窗口、相关日历、date-effective 限制和外部训练/健康事实，不能把默认背景上下文当作完整证据。只读工具上限为 `training.data_coverage`、`plan.by_id`、`workout.intensity_strategy`，前两者必须完成才能提交。月/周内容缺证据时保守处理；需要个人设置才能安全继续时，后台结果以 NEEDS_INPUT 结束，由端口返回稳定错误及原因，不打开确认流程或以高强度兜底。

候选结果固定当前任务的 planId、月份或 range.from/to；schedule 不接受 `scheduleConstraints`、`qualityContractTransition`、`rolling` 等设置变更。结构、目标与范围由候选端口验证，课程执行结构、历史保护、当前策略、租约和最终写入仍由计划域验证。自动行为必须由服务的有效策略和工具授权执行，技能文字不能授予新权限。

技能事件显示使用共享 `COACH_SKILL_LABELS` 的 `rolling-plan` → `rollingPlan` 映射，以及全部 10 个 `client-core` locale 的 `AiCoachPage.timeline.skills.rollingPlan`。Web 与 Native 消费同一稳定身份和本地化 key；Native 组合方需同步这些公共目录，不把内部 skill ID 当作可见文案。后台结果通知标题复用用户偏好语言与全部 10 个 server locale 的 `common.notification.rollingPlan.*`，不在运行时拼接固定语言标题。

## 验证与解释限制

确定性回归覆盖真实注册表的建议工具可达性、目录/别名、逐步技能切换、问题 owner 续接、后台能力上限及提示词预算。generic 保持 15k 字符、builder 保持 20k；其余 active prompt 也检查大小，并按真实后台模式注入合同。共享 payload 只在需要的任务加载。

这些验证证明配置和运行时边界，不量化模型回答质量。人工情景复核仍需覆盖：VO2max 当前/新估计/四周预测/干预效果，缺失记录与真正休息，未链接执行，长计划分页，DRAFT 与其他 ACTIVE 并存，以及 START 后的 SCHEDULE。任何未来模型评估都应使用独立工具事实和结果边界作依据，不能把 prompt 同义字符串断言当作质量证据。
