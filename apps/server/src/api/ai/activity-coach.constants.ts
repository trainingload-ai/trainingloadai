/** DB prompt_version：单活动 AI 复盘产品线（与 Langfuse 解耦后的本地模板）。 */
export { ACTIVITY_AI_REVIEW_PROMPT_VERSION } from './core/prompt-contracts/activity-coach.contract';

/**
 * 证据快照版本：与 buildUnifiedActivityAnalysisInput 的字段集合绑定。
 * v6 = 增加服务端格式化的平均配速，避免模型自行换算秒数。
 */
export const ACTIVITY_COACH_EVIDENCE_VERSION = 'activity_review_evidence_v6';

export const ACTIVITY_COACH_MARKDOWN_FORMAT = 'activity_coach_markdown_v1';
