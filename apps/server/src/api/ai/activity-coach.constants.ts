/** DB prompt_version：单活动 AI 复盘产品线（与 Langfuse 解耦后的本地模板）。 */
export { ACTIVITY_AI_REVIEW_PROMPT_VERSION } from './core/prompt-contracts/activity-coach.contract';

/**
 * 证据快照版本：与 buildUnifiedActivityAnalysisInput 的字段集合绑定。
 * v8 uses the same recorded cadence statistics as the activity detail chart.
 */
export const ACTIVITY_COACH_EVIDENCE_VERSION = 'activity_review_evidence_v8';

export const ACTIVITY_COACH_MARKDOWN_FORMAT = 'activity_coach_markdown_v1';
