export const CROSS_SOURCE_ACTIVITY_MATCH_POLICY = {
  // 候选召回窗口：超过 2 分钟直接认为不是同一活动。
  maxStartDiffSeconds: 120,
  // 影子活动的“当地开始时间精确命中”阈值；最终仍要求候选唯一。
  nearExactStartDiffSeconds: 5,
  closeStartDiffSeconds: 30,
  durationAbsoluteToleranceSeconds: 60,
  durationRelativeTolerance: 0.03,
  distanceAbsoluteToleranceMeters: 150,
  distanceRelativeTolerance: 0.03,
  minimumConfidence: 0.8,
  runnerUpConfidenceMargin: 0.05,
  matcherVersion: 'cross-source-v2',
} as const;

export type CrossSourceActivityMatchEvidence = {
  matcherVersion: typeof CROSS_SOURCE_ACTIVITY_MATCH_POLICY.matcherVersion;
  startDiffSeconds: number;
  durationDiffSeconds: number | null;
  durationDiffRatio: number | null;
  distanceDiffMeters: number | null;
  distanceDiffRatio: number | null;
  endpointsNear: boolean;
  score: number;
  hardThresholds: {
    startSeconds: number;
    duration: 'max(60s,3%)';
    distance: 'max(150m,3%)';
  };
};

export type CrossSourceActivityMatch = {
  confidence: number;
  evidence: CrossSourceActivityMatchEvidence;
};

function difference(left?: number | null, right?: number | null) {
  return left == null || right == null ? null : Math.abs(left - right);
}

function ratioDifference(left?: number | null, right?: number | null) {
  if (
    left == null ||
    right == null ||
    Math.max(Math.abs(left), Math.abs(right)) === 0
  ) {
    return null;
  }
  return Math.abs(left - right) / Math.max(Math.abs(left), Math.abs(right));
}

/**
 * 跨来源活动身份的唯一评分策略。
 *
 * 调用方负责先验证用户、运动大类和来源边界；本策略只评估时间、时长、
 * 距离与端点证据，供正式导入关联和影子活动解析共同使用。
 */
export function evaluateCrossSourceActivityMatch(args: {
  startDiffSeconds: number;
  leftElapsedTime?: number | null;
  rightElapsedTime?: number | null;
  leftDistance?: number | null;
  rightDistance?: number | null;
  hasCoordinateEvidence?: boolean;
  endpointsNear?: boolean;
  subSportMatches?: boolean;
}): CrossSourceActivityMatch | null {
  if (
    !Number.isFinite(args.startDiffSeconds) ||
    args.startDiffSeconds >
      CROSS_SOURCE_ACTIVITY_MATCH_POLICY.maxStartDiffSeconds
  ) {
    return null;
  }

  const durationDiff = difference(args.leftElapsedTime, args.rightElapsedTime);
  const durationRatio = ratioDifference(
    args.leftElapsedTime,
    args.rightElapsedTime,
  );
  const distanceDiff = difference(args.leftDistance, args.rightDistance);
  const distanceRatio = ratioDifference(args.leftDistance, args.rightDistance);
  const durationCompatible =
    durationDiff == null ||
    durationDiff <=
      Math.max(
        CROSS_SOURCE_ACTIVITY_MATCH_POLICY.durationAbsoluteToleranceSeconds,
        (args.rightElapsedTime ?? 0) *
          CROSS_SOURCE_ACTIVITY_MATCH_POLICY.durationRelativeTolerance,
      );
  const distanceCompatible =
    distanceDiff == null ||
    distanceDiff <=
      Math.max(
        CROSS_SOURCE_ACTIVITY_MATCH_POLICY.distanceAbsoluteToleranceMeters,
        (args.rightDistance ?? 0) *
          CROSS_SOURCE_ACTIVITY_MATCH_POLICY.distanceRelativeTolerance,
      );
  const independentEvidence =
    durationDiff != null ||
    distanceDiff != null ||
    args.hasCoordinateEvidence === true;
  // 近似时间本身不够：至少还要有时长、距离或轨迹端点之一作为独立证据。
  if (!durationCompatible || !distanceCompatible || !independentEvidence) {
    return null;
  }

  let score =
    args.startDiffSeconds <=
    CROSS_SOURCE_ACTIVITY_MATCH_POLICY.nearExactStartDiffSeconds
      ? 45
      : args.startDiffSeconds <=
          CROSS_SOURCE_ACTIVITY_MATCH_POLICY.closeStartDiffSeconds
        ? 35
        : 20;
  if (durationRatio != null) {
    score += durationRatio <= 0.01 ? 30 : durationRatio <= 0.03 ? 20 : 0;
  }
  if (distanceRatio != null) {
    score += distanceRatio <= 0.01 ? 20 : distanceRatio <= 0.03 ? 10 : 0;
  }
  if (args.endpointsNear) score += 15;
  if (args.subSportMatches) score += 5;

  const confidence = Math.min(1, score / 100);
  if (confidence < CROSS_SOURCE_ACTIVITY_MATCH_POLICY.minimumConfidence) {
    return null;
  }
  return {
    confidence,
    evidence: {
      matcherVersion: CROSS_SOURCE_ACTIVITY_MATCH_POLICY.matcherVersion,
      startDiffSeconds: args.startDiffSeconds,
      durationDiffSeconds: durationDiff,
      durationDiffRatio: durationRatio,
      distanceDiffMeters: distanceDiff,
      distanceDiffRatio: distanceRatio,
      endpointsNear: args.endpointsNear === true,
      score,
      hardThresholds: {
        startSeconds: CROSS_SOURCE_ACTIVITY_MATCH_POLICY.maxStartDiffSeconds,
        duration: 'max(60s,3%)',
        distance: 'max(150m,3%)',
      },
    },
  };
}

/**
 * 从已达最低置信度的候选中选出唯一第一名。
 *
 * 第一名与第二名差距不足时返回 ambiguous，让调用方保留影子并等待更多证据，
 * 而不是靠数组顺序静默选择一条正式 Activity。
 */
export function rankUniqueCrossSourceMatch<T extends { confidence: number }>(
  matches: T[],
) {
  const ranked = [...matches].sort(
    (left, right) => right.confidence - left.confidence,
  );
  const best = ranked[0] ?? null;
  const runnerUp = ranked[1] ?? null;
  const confidenceMargin =
    best && runnerUp ? best.confidence - runnerUp.confidence : null;
  return {
    best,
    runnerUp,
    confidenceMargin,
    ambiguous:
      confidenceMargin != null &&
      confidenceMargin <
        CROSS_SOURCE_ACTIVITY_MATCH_POLICY.runnerUpConfidenceMargin,
  };
}
