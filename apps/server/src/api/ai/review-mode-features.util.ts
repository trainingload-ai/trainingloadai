/**
 * UserSetting.AI_REVIEW_MODE 解析（与活动自动化复盘队列共用）
 *
 * 约定：
 * - 从未写入：默认开启活动 / 每日 / 每周 / 每月 / 计划复盘；实际执行仍由 FeatureAccessPolicy 判定。
 * - 历史 `"1"` / `"true"` / `"是"`：全开。
 * - 历史 `"0"` / `"false"` / `"no"`：全关。
 * - JSON：缺失键默认开启；显式关闭用 false。
 */
export type AiReviewModeFeatures = {
  activityReview: boolean;
  dailyReview: boolean;
  weeklyReview: boolean;
  monthlyReview: boolean;
  planReview: boolean;
};

const ALL_OFF: AiReviewModeFeatures = {
  activityReview: false,
  dailyReview: false,
  weeklyReview: false,
  monthlyReview: false,
  planReview: false,
};

const ALL_ON: AiReviewModeFeatures = {
  activityReview: true,
  dailyReview: true,
  weeklyReview: true,
  monthlyReview: true,
  planReview: true,
};

/** 未配置 AI_REVIEW_MODE 时的默认（活动 / 日 / 周 / 月 / 计划复盘全开） */
const DEFAULT_UNSET = ALL_ON;

/**
 * 解析
 * @param rawValue 
 * @returns 
 */
export function parseAiReviewModeFeatures(
  rawValue: unknown,
): AiReviewModeFeatures {
  const rawText = String(rawValue ?? '').trim();
  if (!rawText) return DEFAULT_UNSET;
  const lower = rawText.toLowerCase();

  // 先尝试解析 单个 string
  if (lower === '1' || lower === 'true' || lower === '是') {
    return ALL_ON;
  }
  if (lower === '0' || lower === 'false' || lower === 'no') {
    return ALL_OFF;
  }
  // 再尝试 JSON 解析
  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    return {
      activityReview: parsed.activityReview !== false,
      dailyReview: parsed.dailyReview !== false,
      weeklyReview: parsed.weeklyReview !== false,
      monthlyReview: parsed.monthlyReview !== false,
      planReview: parsed.planReview !== false,
    };
  } catch {
    return DEFAULT_UNSET;
  }
}
