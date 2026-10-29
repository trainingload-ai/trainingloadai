/** 跑步与骑行共用的瞬时速度异常判定。单位统一为 m/s、ms。 */
export type InstantaneousSpeedSport = "RUN" | "CYCLING";

export type TimedSpeedSample = {
  timestampMs: number;
  speedMetersPerSecond?: number | null;
};

export type InstantaneousSpeedPolicy = {
  maxSpeedMetersPerSecond: number;
  maxAccelerationMetersPerSecondSquared: number;
  maxTransitionWindowMs: number;
  isolatedPeakWindowSize: number;
  isolatedPeakMinimumDeltaMetersPerSecond: number;
  isolatedPeakMadMultiplier: number;
};

const RUN_POLICY: InstantaneousSpeedPolicy = Object.freeze({
  maxSpeedMetersPerSecond: 12,
  maxAccelerationMetersPerSecondSquared: 5,
  maxTransitionWindowMs: 5_000,
  isolatedPeakWindowSize: 3,
  isolatedPeakMinimumDeltaMetersPerSecond: 3,
  isolatedPeakMadMultiplier: 6,
});

const CYCLING_POLICY: InstantaneousSpeedPolicy = Object.freeze({
  maxSpeedMetersPerSecond: 35,
  maxAccelerationMetersPerSecondSquared: 6,
  maxTransitionWindowMs: 5_000,
  isolatedPeakWindowSize: 3,
  isolatedPeakMinimumDeltaMetersPerSecond: 6,
  isolatedPeakMadMultiplier: 6,
});

export function instantaneousSpeedPolicy(
  sport: InstantaneousSpeedSport,
): InstantaneousSpeedPolicy {
  return sport === "CYCLING" ? CYCLING_POLICY : RUN_POLICY;
}

/**
 * 在线采样门：只拦截不可能的正向跃升。
 *
 * 不对突然降速作同样的硬拒绝，因为急刹、停下都可能是真实事件；离线的
 * 双向窗口会再识别“升上去又立刻掉回来”的孤立峰值。
 */
export function isPlausibleInstantaneousSpeedTransition(args: {
  sport: InstantaneousSpeedSport;
  candidate: TimedSpeedSample;
  previous?: TimedSpeedSample | null;
}): boolean {
  const policy = instantaneousSpeedPolicy(args.sport);
  const candidateSpeed = finiteNonNegative(args.candidate.speedMetersPerSecond);
  if (candidateSpeed == null) return false;
  if (candidateSpeed > policy.maxSpeedMetersPerSecond) return false;

  const previousSpeed = finiteNonNegative(args.previous?.speedMetersPerSecond);
  if (previousSpeed == null || !args.previous) return true;

  const elapsedMs = args.candidate.timestampMs - args.previous.timestampMs;
  if (
    !Number.isFinite(elapsedMs) ||
    elapsedMs <= 0 ||
    elapsedMs > policy.maxTransitionWindowMs
  ) {
    return true;
  }

  const acceleration = (candidateSpeed - previousSpeed) / (elapsedMs / 1_000);
  return acceleration <= policy.maxAccelerationMetersPerSecondSquared;
}

export type InstantaneousSpeedSeriesResult = {
  speedsMetersPerSecond: Array<number | null>;
  correctedIndexes: number[];
};

/**
 * 离线防御：用当前点前后各最多 3 个样本确认孤立高峰，再在相邻正常点间
 * 线性插值。持续高速的右侧窗口同样会变高，因此不会被当作单点毛刺抹掉。
 */
export function sanitizeInstantaneousSpeedSeries(
  samples: readonly TimedSpeedSample[],
  sport: InstantaneousSpeedSport,
): InstantaneousSpeedSeriesResult {
  const policy = instantaneousSpeedPolicy(sport);
  const speeds = samples.map((sample) =>
    finiteNonNegative(sample.speedMetersPerSecond),
  );
  const corrected = new Set<number>();

  for (let index = 0; index < samples.length; index += 1) {
    const speed = speeds[index];
    if (speed == null) continue;

    if (speed > policy.maxSpeedMetersPerSecond) {
      corrected.add(index);
      continue;
    }

    const left = neighboringSpeeds(samples, speeds, index, -1, policy);
    const right = neighboringSpeeds(samples, speeds, index, 1, policy);
    if (left.length === 0 && right.length === 0) continue;

    const leftMedian =
      left.length > 0 ? median(left.map((item) => item.speed)) : null;
    const rightMedian =
      right.length > 0 ? median(right.map((item) => item.speed)) : null;
    const localBaseline =
      leftMedian == null
        ? rightMedian
        : rightMedian == null
          ? leftMedian
          : Math.max(leftMedian, rightMedian);
    if (localBaseline == null) continue;
    const localSpeeds = [...left, ...right].map((item) => item.speed);
    const localMedian = median(localSpeeds);
    const medianAbsoluteDeviation = median(
      localSpeeds.map((value) => Math.abs(value - localMedian)),
    );
    const noiseAwareMinimumDelta = Math.max(
      policy.isolatedPeakMinimumDeltaMetersPerSecond,
      policy.isolatedPeakMadMultiplier * 1.4826 * medianAbsoluteDeviation,
    );
    if (speed - localBaseline < noiseAwareMinimumDelta) {
      continue;
    }

    if (
      (left.length === 0 || right.length === 0) &&
      !boundaryTransitionIsImplausible(
        samples,
        speeds,
        index,
        left.length === 0 ? 1 : -1,
        policy,
      )
    ) {
      continue;
    }

    corrected.add(index);
  }

  const sanitized = [...speeds];
  const nearestLeft = nearestUsableIndexes(speeds, corrected, 1);
  const nearestRight = nearestUsableIndexes(speeds, corrected, -1);
  for (const index of corrected) {
    sanitized[index] = interpolatedNeighborSpeed(
      samples,
      speeds,
      index,
      nearestLeft[index],
      nearestRight[index],
    );
  }

  return {
    speedsMetersPerSecond: sanitized,
    correctedIndexes: [...corrected].sort((left, right) => left - right),
  };
}

function boundaryTransitionIsImplausible(
  samples: readonly TimedSpeedSample[],
  speeds: readonly (number | null)[],
  centerIndex: number,
  direction: -1 | 1,
  policy: InstantaneousSpeedPolicy,
) {
  for (
    let index = centerIndex + direction;
    index >= 0 && index < samples.length;
    index += direction
  ) {
    const elapsedSeconds =
      Math.abs(samples[index].timestampMs - samples[centerIndex].timestampMs) /
      1_000;
    if (
      elapsedSeconds <= 0 ||
      elapsedSeconds * 1_000 > policy.maxTransitionWindowMs
    ) {
      return false;
    }
    const neighborSpeed = speeds[index];
    if (neighborSpeed == null) continue;
    return (
      ((speeds[centerIndex] ?? 0) - neighborSpeed) / elapsedSeconds >
      policy.maxAccelerationMetersPerSecondSquared
    );
  }
  return false;
}

function nearestUsableIndexes(
  speeds: readonly (number | null)[],
  corrected: ReadonlySet<number>,
  direction: -1 | 1,
) {
  const result = new Array<number>(speeds.length).fill(-1);
  let nearest = -1;
  const start = direction === 1 ? 0 : speeds.length - 1;
  const end = direction === 1 ? speeds.length : -1;
  for (let index = start; index !== end; index += direction) {
    result[index] = nearest;
    if (!corrected.has(index) && speeds[index] != null) {
      nearest = index;
    }
  }
  return result;
}

function neighboringSpeeds(
  samples: readonly TimedSpeedSample[],
  speeds: readonly (number | null)[],
  centerIndex: number,
  direction: -1 | 1,
  policy: InstantaneousSpeedPolicy,
) {
  const result: Array<{ timestampMs: number; speed: number }> = [];
  for (
    let index = centerIndex + direction;
    index >= 0 && index < samples.length;
    index += direction
  ) {
    const elapsedMs = Math.abs(
      samples[index].timestampMs - samples[centerIndex].timestampMs,
    );
    if (elapsedMs > policy.maxTransitionWindowMs) break;
    const speed = speeds[index];
    if (speed != null) {
      result.push({ timestampMs: samples[index].timestampMs, speed });
      if (result.length >= policy.isolatedPeakWindowSize) break;
    }
  }
  return result;
}

function interpolatedNeighborSpeed(
  samples: readonly TimedSpeedSample[],
  speeds: readonly (number | null)[],
  centerIndex: number,
  leftIndex: number,
  rightIndex: number,
) {
  const leftSpeed = leftIndex >= 0 ? speeds[leftIndex] : null;
  const rightSpeed = rightIndex >= 0 ? speeds[rightIndex] : null;
  if (leftSpeed == null) return rightSpeed;
  if (rightSpeed == null) return leftSpeed;

  const leftTime = samples[leftIndex].timestampMs;
  const rightTime = samples[rightIndex].timestampMs;
  if (rightTime <= leftTime) return (leftSpeed + rightSpeed) / 2;
  const ratio = Math.min(
    1,
    Math.max(
      0,
      (samples[centerIndex].timestampMs - leftTime) / (rightTime - leftTime),
    ),
  );
  return leftSpeed + (rightSpeed - leftSpeed) * ratio;
}

function median(values: readonly number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}
