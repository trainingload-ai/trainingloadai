import { Injectable, Logger } from '@nestjs/common';
import {
  MetricSource,
  PeakType,
  Prisma,
  ScaleType,
  SportType,
  UserFitnessMetricType,
} from '@prisma/client';
import { calculateCp } from '@/algorithm/fitness-cp';
import { computeCriticalSpeed, type CSPoint } from '@/algorithm/cs';
import { TimeDecayEstimator } from '@/algorithm/time-decay';
import { selectLthrEstimate } from '@/algorithm/lthr-observation';
import { validateFitnessMetricCandidate } from '@/api/user/fitness-metric-validator';
import { PrismaService } from '@/prisma/prisma.service';
import {
  fitnessTimelineFingerprint,
  FITNESS_TIMELINE_WINDOWS_DAYS,
  type FitnessTimelineObservation,
} from '@/algorithm/fitness-timeline';
import {
  permitsPowerDerivedMetrics,
  resolveMeasuredPowerEvidence,
} from '@/training-load/measured-power-evidence';
import { resolveEffectiveActivityVo2Max } from './vo2max/vo2max-source';
import type { UserProfileResponse } from '@/api/user/user.interface';
import { UserAnalysisConfigService } from '@/api/user/user-analysis-config.service';

const PREPARED_PEAK_SELECT =
  Prisma.validator<Prisma.ActivityPeakMetricSelect>()({
    activityId: true,
    sport: true,
    type: true,
    scaleType: true,
    scaleValue: true,
    value: true,
    activity: {
      select: {
        sportType: true,
        sportDefinitionCode: true,
        startTime: true,
        activitySources: {
          where: { isActive: true, isPrimary: true },
          select: { metadata: true },
        },
      },
    },
  });

const PREPARED_VO2_SELECT = Prisma.validator<Prisma.ActivitySelect>()({
  id: true,
  startTime: true,
  sportType: true,
  vo2max: true,
  fitnessMetricsSnapshot: {
    select: {
      resolutionVersion: true,
      resolvedVo2maxValue: true,
    },
  },
});

type PreparedVo2Row = Prisma.ActivityGetPayload<{
  select: typeof PREPARED_VO2_SELECT;
}> & {
  resolvedTimelineValue: number | null;
};

export type PreparedFitnessTimelineEvidence = {
  peakRows: Prisma.ActivityPeakMetricGetPayload<{
    select: typeof PREPARED_PEAK_SELECT;
  }>[];
  lthrRows: Prisma.ActivityLthrObservationGetPayload<object>[];
  vo2Rows: PreparedVo2Row[];
  peakRowsByActivity: Map<
    number,
    Prisma.ActivityPeakMetricGetPayload<{
      select: typeof PREPARED_PEAK_SELECT;
    }>[]
  >;
  lthrRowsByActivity: Map<
    number,
    Prisma.ActivityLthrObservationGetPayload<object>[]
  >;
  vo2RowsByActivity: Map<number, PreparedVo2Row[]>;
  activatedActivityIds: Set<number>;
  activePeakRows: PreparedFitnessTimelineEvidence['peakRows'];
  activeLthrRows: PreparedFitnessTimelineEvidence['lthrRows'];
  activeVo2Rows: PreparedFitnessTimelineEvidence['vo2Rows'];
};

type ObservationCalculationArgs = {
  userId: string;
  effectiveAt: Date;
  eligibleActivityIds: readonly number[];
  profile: UserProfileResponse;
  currentMaxHr?: number | null;
  currentRestingHr?: number | null;
  prepared?: PreparedFitnessTimelineEvidence;
  eligibleActivityIdSet?: ReadonlySet<number>;
};

function eligible(args: ObservationCalculationArgs, activityId: number) {
  return (
    args.eligibleActivityIdSet?.has(activityId) ??
    args.eligibleActivityIds.includes(activityId)
  );
}

function groupByActivityId<T extends { activityId: number }>(rows: T[]) {
  const grouped = new Map<number, T[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.activityId);
    if (bucket) bucket.push(row);
    else grouped.set(row.activityId, [row]);
  }
  return grouped;
}

function activatePreparedEvidence(
  prepared: PreparedFitnessTimelineEvidence,
  eligibleActivityIds: readonly number[],
) {
  for (const activityId of eligibleActivityIds) {
    if (prepared.activatedActivityIds.has(activityId)) continue;
    prepared.activatedActivityIds.add(activityId);
    prepared.activePeakRows.push(
      ...(prepared.peakRowsByActivity.get(activityId) ?? []),
    );
    prepared.activeLthrRows.push(
      ...(prepared.lthrRowsByActivity.get(activityId) ?? []),
    );
    prepared.activeVo2Rows.push(
      ...(prepared.vo2RowsByActivity.get(activityId) ?? []),
    );
  }
}

const DAY_MS = 86_400_000;
const RUN_CS_MIN_TRIAL_SECONDS = 120;
const RUN_CS_MAX_TRIAL_SECONDS = 900;
const RUN_CS_MIN_SPEED_MPS = 1.8;
const RUN_CS_MIN_R2 = 0.95;
const ENDURANCE_SPORTS: readonly SportType[] = [
  SportType.RUN,
  SportType.CYCLING,
  SportType.SWIM,
];

function since(at: Date, days: number) {
  return new Date(at.getTime() - days * DAY_MS);
}

function observation(args: {
  metric: FitnessTimelineObservation['metric'];
  sport: FitnessTimelineObservation['sport'];
  value: number;
  value2?: number | null;
  effectiveAt: Date;
  activityIds: number[];
  evidence: unknown;
}): FitnessTimelineObservation {
  return {
    metric: args.metric,
    sport: args.sport,
    value: args.value,
    value2: args.value2 ?? null,
    effectiveAt: args.effectiveAt,
    sourceActivityIds: [...new Set(args.activityIds)].sort((a, b) => a - b),
    evidenceFingerprint: fitnessTimelineFingerprint(args.evidence),
  };
}

@Injectable()
export class FitnessTimelineObservationService {
  private readonly logger = new Logger(FitnessTimelineObservationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analysisConfigs: UserAnalysisConfigService,
  ) {}

  private async prepareVo2Rows(
    userId: string,
    activityIds: readonly number[],
  ): Promise<PreparedVo2Row[]> {
    if (activityIds.length === 0) return [];
    const [rows, configVersions] = await Promise.all([
      this.prisma.activity.findMany({
        where: {
          id: { in: [...activityIds] },
          sportType: SportType.RUN,
          vo2max: { isNot: null },
        },
        select: PREPARED_VO2_SELECT,
      }),
      this.analysisConfigs.listVersions(userId, new Date()),
    ]);
    return rows.map((row) => {
      const snapshot = row.fitnessMetricsSnapshot;
      const historicalConfig =
        this.analysisConfigs.resolveFromVersionsOrDefault(
          configVersions,
          row.startTime,
        );
      const resolvedTimelineValue =
        (snapshot?.resolutionVersion ?? 0) >= 4
          ? (snapshot?.resolvedVo2maxValue ?? null)
          : (resolveEffectiveActivityVo2Max(
              row.vo2max,
              historicalConfig.defaultVdotSource,
              historicalConfig.vo2maxCorrectionFactor,
            )?.value ?? null);
      return { ...row, resolvedTimelineValue };
    });
  }

  /** 一次 Replay 只读一次事实表；后续 change point 计算只做内存窗口筛选。 */
  async prepare(
    userId: string,
    activityIds: readonly number[],
  ): Promise<PreparedFitnessTimelineEvidence> {
    const ids = [...new Set(activityIds)].filter(
      (id) => Number.isSafeInteger(id) && id > 0,
    );
    if (ids.length === 0) {
      return {
        peakRows: [],
        lthrRows: [],
        vo2Rows: [],
        peakRowsByActivity: new Map(),
        lthrRowsByActivity: new Map(),
        vo2RowsByActivity: new Map(),
        activatedActivityIds: new Set(),
        activePeakRows: [],
        activeLthrRows: [],
        activeVo2Rows: [],
      };
    }
    const [peakRows, lthrRows, vo2Rows] = await Promise.all([
      this.prisma.activityPeakMetric.findMany({
        where: {
          activityId: { in: ids },
          type: { in: [PeakType.power, PeakType.pace, PeakType.hr] },
        },
        select: PREPARED_PEAK_SELECT,
      }),
      this.prisma.activityLthrObservation.findMany({
        where: { userId, activityId: { in: ids } },
      }),
      this.prepareVo2Rows(userId, ids),
    ]);
    return {
      peakRows,
      lthrRows,
      vo2Rows,
      peakRowsByActivity: groupByActivityId(peakRows),
      lthrRowsByActivity: groupByActivityId(lthrRows),
      vo2RowsByActivity: new Map(
        vo2Rows.map((row) => [row.id, [row]] as const),
      ),
      activatedActivityIds: new Set(),
      activePeakRows: [],
      activeLthrRows: [],
      activeVo2Rows: [],
    };
  }

  /**
   * HEAVY may replace an activity's VO2 candidates and frozen snapshot after
   * the replay-wide evidence preload. Refresh only those activities before
   * their end event publishes observations; all other evidence remains a
   * single bounded preload.
   */
  async refreshPreparedVo2Rows(
    prepared: PreparedFitnessTimelineEvidence,
    userId: string,
    activityIds: readonly number[],
  ) {
    const ids = [...new Set(activityIds)].filter(
      (id) => Number.isSafeInteger(id) && id > 0,
    );
    if (ids.length === 0) return;
    const replacements = await this.prepareVo2Rows(userId, ids);
    const replacementIds = new Set(ids);
    prepared.vo2Rows = [
      ...prepared.vo2Rows.filter((row) => !replacementIds.has(row.id)),
      ...replacements,
    ];
    for (const id of ids) {
      const rows = replacements.filter((row) => row.id === id);
      if (rows.length > 0) prepared.vo2RowsByActivity.set(id, rows);
      else prepared.vo2RowsByActivity.delete(id);
    }
    prepared.activeVo2Rows = [
      ...prepared.activeVo2Rows.filter((row) => !replacementIds.has(row.id)),
      ...replacements.filter((row) =>
        prepared.activatedActivityIds.has(row.id),
      ),
    ];
  }

  async calculate(
    args: ObservationCalculationArgs,
  ): Promise<FitnessTimelineObservation[]> {
    if (args.eligibleActivityIds.length === 0) return [];
    const preparedArgs: ObservationCalculationArgs = {
      ...args,
      eligibleActivityIdSet: new Set(args.eligibleActivityIds),
    };
    if (preparedArgs.prepared) {
      activatePreparedEvidence(
        preparedArgs.prepared,
        preparedArgs.eligibleActivityIds,
      );
    }
    const [power, pace, maxHr, lthr, vo2Max] = await Promise.all([
      this.powerModel(preparedArgs),
      this.paceModels(preparedArgs),
      this.maxHeartRate(preparedArgs),
      this.lthr(preparedArgs),
      this.vo2Max(preparedArgs),
    ]);
    return [...power, ...pace, ...maxHr, ...lthr, ...vo2Max];
  }

  private async powerModel(args: ObservationCalculationArgs) {
    const rows = args.prepared
      ? args.prepared.activePeakRows.filter(
          (row) =>
            row.type === PeakType.power &&
            row.scaleType === ScaleType.TIME &&
            eligible(args, row.activityId) &&
            row.activity.startTime != null &&
            row.activity.startTime >=
              since(
                args.effectiveAt,
                FITNESS_TIMELINE_WINDOWS_DAYS.POWER_MODEL,
              ) &&
            row.activity.startTime <= args.effectiveAt,
        )
      : await this.prisma.activityPeakMetric.findMany({
          where: {
            activityId: { in: [...args.eligibleActivityIds] },
            type: PeakType.power,
            scaleType: ScaleType.TIME,
            activity: {
              startTime: {
                gte: since(
                  args.effectiveAt,
                  FITNESS_TIMELINE_WINDOWS_DAYS.POWER_MODEL,
                ),
                lte: args.effectiveAt,
              },
            },
          },
          select: PREPARED_PEAK_SELECT,
        });
    const out: FitnessTimelineObservation[] = [];
    for (const sport of [SportType.RUN, SportType.CYCLING]) {
      const best = new Map<number, { value: number; activityId: number }>();
      for (const row of rows) {
        if (row.sport !== sport || row.value == null || row.value <= 0)
          continue;
        if (
          !permitsPowerDerivedMetrics(
            resolveMeasuredPowerEvidence(row.activity.activitySources),
          )
        ) {
          continue;
        }
        const current = best.get(row.scaleValue);
        if (!current || row.value > current.value) {
          best.set(row.scaleValue, {
            value: row.value,
            activityId: row.activityId,
          });
        }
      }
      if (best.size <= 4) continue;
      const points = [...best.entries()]
        .map(([seconds, row]) => ({ seconds, value: row.value }))
        .sort((left, right) => left.seconds - right.seconds);
      const result = calculateCp(points);
      if (!result.valid || !(result.cp > 0) || !(result.ftp > 0)) continue;
      const rejection = this.powerModelRejection(sport, {
        cp: result.cp,
        ftp: result.ftp,
        wPrime: result.wPrime,
        pMax: result.pMax,
      });
      if (rejection) {
        this.logger.warn(
          `[CP] 拒绝不自洽的功率模型结果：用户=${args.userId}, 运动=${sport}, CP=${result.cp}, FTP=${result.ftp}, Pmax=${result.pMax}, W'=${result.wPrime}, 原因=${rejection}`,
        );
        continue;
      }
      const activityIds = [...best.values()].map((row) => row.activityId);
      const evidence = {
        method: 'CP_MODEL',
        windowDays: FITNESS_TIMELINE_WINDOWS_DAYS.POWER_MODEL,
        sport,
        points,
        activityIds,
      };
      out.push(
        observation({
          metric: 'CP',
          sport,
          value: result.cp,
          value2: result.wPrime,
          effectiveAt: args.effectiveAt,
          activityIds,
          evidence,
        }),
        observation({
          metric: 'FTP',
          sport,
          value: result.ftp,
          effectiveAt: args.effectiveAt,
          activityIds,
          evidence,
        }),
      );
      if (result.wPrime && result.wPrime > 0) {
        out.push(
          observation({
            metric: 'W_PRIME',
            sport,
            value: result.wPrime,
            effectiveAt: args.effectiveAt,
            activityIds,
            evidence,
          }),
        );
      }
      if (result.pMax && result.pMax > 0) {
        out.push(
          observation({
            metric: 'P_MAX',
            sport,
            value: result.pMax,
            effectiveAt: args.effectiveAt,
            activityIds,
            evidence,
          }),
        );
      }
    }
    return out;
  }

  /** 与 recalculateUserCPAndFTP 相同：任一 CP/FTP/W′/Pmax 不成立则整组不发布。 */
  private powerModelRejection(
    sport: SportType,
    model: {
      cp: number;
      ftp: number;
      wPrime?: number | null;
      pMax?: number | null;
    },
  ): string | null {
    const wPrime =
      model.wPrime != null && model.wPrime > 0 ? model.wPrime : null;
    const pMax = model.pMax != null && model.pMax > 0 ? model.pMax : null;
    const context = {
      [UserFitnessMetricType.CP]: model.cp,
      [UserFitnessMetricType.FTP]: model.ftp,
      ...(pMax != null ? { [UserFitnessMetricType.P_MAX]: pMax } : {}),
      ...(wPrime != null ? { [UserFitnessMetricType.W_PRIME]: wPrime } : {}),
    };
    const candidates: Array<{ type: UserFitnessMetricType; value: number }> = [
      { type: UserFitnessMetricType.CP, value: model.cp },
      { type: UserFitnessMetricType.FTP, value: model.ftp },
    ];
    if (pMax != null) {
      candidates.push({ type: UserFitnessMetricType.P_MAX, value: pMax });
    }
    if (wPrime != null) {
      candidates.push({ type: UserFitnessMetricType.W_PRIME, value: wPrime });
    }
    for (const candidate of candidates) {
      const validation = validateFitnessMetricCandidate(
        { ...candidate, sport, source: MetricSource.AUTO },
        context,
      );
      if (validation.valid === false) return validation.reason;
    }
    return null;
  }

  private async paceModels(args: ObservationCalculationArgs) {
    const rows = args.prepared
      ? args.prepared.activePeakRows.filter(
          (row) =>
            row.type === PeakType.pace &&
            row.scaleType === ScaleType.DISTANCE &&
            eligible(args, row.activityId) &&
            row.activity.startTime != null &&
            row.activity.startTime >=
              since(
                args.effectiveAt,
                FITNESS_TIMELINE_WINDOWS_DAYS.THRESHOLD_PACE,
              ) &&
            row.activity.startTime <= args.effectiveAt,
        )
      : await this.prisma.activityPeakMetric.findMany({
          where: {
            activityId: { in: [...args.eligibleActivityIds] },
            type: PeakType.pace,
            scaleType: ScaleType.DISTANCE,
            activity: {
              startTime: {
                gte: since(
                  args.effectiveAt,
                  FITNESS_TIMELINE_WINDOWS_DAYS.THRESHOLD_PACE,
                ),
                lte: args.effectiveAt,
              },
            },
          },
          select: PREPARED_PEAK_SELECT,
        });
    const out: FitnessTimelineObservation[] = [];
    for (const sport of [SportType.RUN, SportType.CYCLING, SportType.SWIM]) {
      const thresholdBest = new Map<
        number,
        { value: number; activityId: number; startTime: Date | null }
      >();
      const criticalSpeedBest = new Map<
        number,
        { value: number; activityId: number; startTime: Date | null }
      >();
      const csCutoff = since(
        args.effectiveAt,
        FITNESS_TIMELINE_WINDOWS_DAYS.CRITICAL_SPEED,
      );
      for (const row of rows) {
        if (
          row.sport !== sport ||
          row.value == null ||
          row.value <= 0 ||
          (sport === SportType.RUN &&
            ['WALKING', 'HIKING'].includes(
              row.activity.sportDefinitionCode ?? '',
            ))
        ) {
          continue;
        }
        const candidate = {
          value: row.value,
          activityId: row.activityId,
          startTime: row.activity.startTime,
        };
        const current = thresholdBest.get(row.scaleValue);
        if (!current || row.value > current.value) {
          thresholdBest.set(row.scaleValue, candidate);
        }
        if (row.activity.startTime && row.activity.startTime >= csCutoff) {
          const currentCs = criticalSpeedBest.get(row.scaleValue);
          if (!currentCs || row.value > currentCs.value) {
            criticalSpeedBest.set(row.scaleValue, candidate);
          }
        }
      }
      const candidates = [...criticalSpeedBest.entries()]
        .map(([distance, row]) => ({
          activityId: row.activityId,
          distance_m: distance,
          time_s: distance / row.value,
          weight: 1,
        }))
        .filter(
          (point) =>
            point.distance_m > 0 &&
            point.time_s > 0 &&
            (sport !== SportType.RUN ||
              (point.time_s >= RUN_CS_MIN_TRIAL_SECONDS &&
                point.time_s <= RUN_CS_MAX_TRIAL_SECONDS)),
        );
      const independentActivities = new Set(
        candidates.map((point) => point.activityId),
      ).size;
      const minimumPoints = 3;
      if (
        candidates.length >= minimumPoints &&
        (sport !== SportType.RUN || independentActivities >= 3)
      ) {
        const result = computeCriticalSpeed(candidates as CSPoint[]);
        if (
          result.cs > 0 &&
          (sport !== SportType.RUN ||
            (result.cs >= RUN_CS_MIN_SPEED_MPS &&
              (result.dPrimeM ?? 0) > 0 &&
              (result.r2 ?? 0) >= RUN_CS_MIN_R2))
        ) {
          out.push(
            observation({
              metric: 'CS',
              sport,
              value: result.cs,
              value2: result.dPrimeM,
              effectiveAt: args.effectiveAt,
              activityIds: candidates.map((point) => point.activityId),
              evidence: {
                method: 'CRITICAL_SPEED',
                windowDays: FITNESS_TIMELINE_WINDOWS_DAYS.CRITICAL_SPEED,
                sport,
                candidates,
              },
            }),
          );
        }
      }
      if (sport === SportType.RUN) {
        const best5k = thresholdBest.get(5000);
        if (best5k?.value && best5k.value <= 12) {
          const paceSecPerKm = 1000 / best5k.value + 20;
          out.push(
            observation({
              metric: 'TP',
              sport,
              value: 1000 / paceSecPerKm,
              value2: paceSecPerKm,
              effectiveAt: args.effectiveAt,
              activityIds: [best5k.activityId],
              evidence: {
                method: 'FIVE_K_OFFSET',
                windowDays: FITNESS_TIMELINE_WINDOWS_DAYS.THRESHOLD_PACE,
                activityId: best5k.activityId,
                speedMps: best5k.value,
                offsetSecPerKm: 20,
              },
            }),
          );
        }
      }
    }
    return out;
  }

  private async maxHeartRate(args: ObservationCalculationArgs) {
    const requiredSeconds = args.currentMaxHr ? 1 : 5;
    let peak = args.prepared
      ? args.prepared.activePeakRows
          .filter(
            (row) =>
              row.type === PeakType.hr &&
              row.scaleType === ScaleType.TIME &&
              row.scaleValue === requiredSeconds &&
              eligible(args, row.activityId) &&
              row.value != null &&
              row.value >= 80 &&
              row.value <= 240 &&
              row.activity.sportType != null &&
              ENDURANCE_SPORTS.includes(row.activity.sportType),
          )
          .sort(
            (left, right) =>
              (right.value ?? 0) - (left.value ?? 0) ||
              left.activityId - right.activityId,
          )[0]
      : await this.prisma.activityPeakMetric.findFirst({
          where: {
            activityId: { in: [...args.eligibleActivityIds] },
            type: PeakType.hr,
            scaleType: ScaleType.TIME,
            scaleValue: requiredSeconds,
            value: { gte: 80, lte: 240 },
            activity: {
              sportType: {
                in: [SportType.RUN, SportType.CYCLING, SportType.SWIM],
              },
            },
          },
          orderBy: [{ value: 'desc' }, { activityId: 'asc' }],
        });
    if (!peak && args.currentMaxHr) {
      peak = args.prepared
        ? args.prepared.activePeakRows
            .filter(
              (row) =>
                row.type === PeakType.hr &&
                row.scaleType === ScaleType.TIME &&
                eligible(args, row.activityId) &&
                row.value != null &&
                row.value >= 80 &&
                row.value <= 240 &&
                row.activity.sportType != null &&
                ENDURANCE_SPORTS.includes(row.activity.sportType),
            )
            .sort(
              (left, right) =>
                (right.value ?? 0) - (left.value ?? 0) ||
                right.scaleValue - left.scaleValue,
            )[0]
        : await this.prisma.activityPeakMetric.findFirst({
            where: {
              activityId: { in: [...args.eligibleActivityIds] },
              type: PeakType.hr,
              scaleType: ScaleType.TIME,
              value: { gte: 80, lte: 240 },
              activity: {
                sportType: {
                  in: [SportType.RUN, SportType.CYCLING, SportType.SWIM],
                },
              },
            },
            orderBy: [{ value: 'desc' }, { scaleValue: 'desc' }],
          });
    }
    if (!peak?.value || peak.value <= (args.currentMaxHr ?? 0)) return [];
    return [
      observation({
        metric: 'MAX_HR',
        sport: SportType.UNKNOWN,
        value: Math.round(peak.value),
        effectiveAt: args.effectiveAt,
        activityIds: [peak.activityId],
        evidence: {
          method: 'OBSERVED_ACTIVITY_PEAK',
          activityId: peak.activityId,
          windowSeconds: peak.scaleValue,
          value: peak.value,
        },
      }),
    ];
  }

  private async lthr(args: ObservationCalculationArgs) {
    const rows = args.prepared
      ? args.prepared.activeLthrRows
          .filter(
            (row) =>
              eligible(args, row.activityId) &&
              row.observedAt >=
                since(
                  args.effectiveAt,
                  FITNESS_TIMELINE_WINDOWS_DAYS.LTHR_AGGREGATION,
                ) &&
              row.observedAt <= args.effectiveAt,
          )
          .sort(
            (left, right) =>
              right.observedAt.getTime() - left.observedAt.getTime() ||
              right.algorithmVersion - left.algorithmVersion,
          )
      : await this.prisma.activityLthrObservation.findMany({
          where: {
            userId: args.userId,
            activityId: { in: [...args.eligibleActivityIds] },
            observedAt: {
              gte: since(
                args.effectiveAt,
                FITNESS_TIMELINE_WINDOWS_DAYS.LTHR_AGGREGATION,
              ),
              lte: args.effectiveAt,
            },
          },
          orderBy: [{ observedAt: 'desc' }, { algorithmVersion: 'desc' }],
        });
    const out: FitnessTimelineObservation[] = [];
    for (const sport of [SportType.RUN, SportType.CYCLING]) {
      const latest = new Map<number, (typeof rows)[number]>();
      for (const row of rows.filter((candidate) => candidate.sport === sport)) {
        if (!latest.has(row.activityId)) latest.set(row.activityId, row);
      }
      const valid = [...latest.values()]
        .filter((row) => row.protocol === 'OBSERVED' || row.protocol === 'TEST')
        .filter(
          (row) =>
            validateFitnessMetricCandidate(
              {
                type: UserFitnessMetricType.LTHR,
                value: Math.round(row.candidateBpm),
                sport,
                source: MetricSource.ESTIMATED,
              },
              {
                [UserFitnessMetricType.MAX_HR]: args.currentMaxHr ?? undefined,
                [UserFitnessMetricType.RESTING_HR]:
                  args.currentRestingHr ?? undefined,
              },
              { requireReferenceMetrics: true },
            ).valid,
        )
        .map((row) => ({
          ...row,
          protocol: row.protocol as 'OBSERVED' | 'TEST',
        }));
      const estimate = selectLthrEstimate(valid, args.effectiveAt);
      if (!estimate?.autoEligible) continue;
      out.push(
        observation({
          metric: 'LTHR',
          sport,
          value: estimate.value,
          effectiveAt: args.effectiveAt,
          activityIds: valid
            .filter((row) => estimate.observationIds.includes(row.id))
            .map((row) => row.activityId),
          evidence: {
            method: 'PASSIVE_30M_TAIL20',
            estimate,
            observationIds: estimate.observationIds,
          },
        }),
      );
    }
    return out;
  }

  private async vo2Max(args: ObservationCalculationArgs) {
    const rows = args.prepared
      ? args.prepared.activeVo2Rows.filter(
          (row) =>
            eligible(args, row.id) &&
            row.startTime != null &&
            row.startTime >=
              since(
                args.effectiveAt,
                FITNESS_TIMELINE_WINDOWS_DAYS.VO2_MAX_TRUNCATION,
              ) &&
            row.startTime <= args.effectiveAt,
        )
      : (
          await this.prepareVo2Rows(args.userId, args.eligibleActivityIds)
        ).filter(
          (row) =>
            row.startTime >=
              since(
                args.effectiveAt,
                FITNESS_TIMELINE_WINDOWS_DAYS.VO2_MAX_TRUNCATION,
              ) && row.startTime <= args.effectiveAt,
        );
    const points = rows.flatMap((row) => {
      const value = row.resolvedTimelineValue;
      return value && row.startTime
        ? [{ date: row.startTime, value, activityId: row.id }]
        : [];
    });
    const value = TimeDecayEstimator.calculate(points, {
      decayDays: FITNESS_TIMELINE_WINDOWS_DAYS.VO2_MAX_DECAY,
      truncationMultiple:
        FITNESS_TIMELINE_WINDOWS_DAYS.VO2_MAX_TRUNCATION /
        FITNESS_TIMELINE_WINDOWS_DAYS.VO2_MAX_DECAY,
      referenceDate: args.effectiveAt,
    });
    if (value == null || value <= 0) return [];
    return [
      observation({
        metric: 'VO2_MAX',
        sport: SportType.UNKNOWN,
        value,
        effectiveAt: args.effectiveAt,
        activityIds: points.map((point) => point.activityId),
        evidence: {
          method: 'TIME_DECAY',
          decayDays: FITNESS_TIMELINE_WINDOWS_DAYS.VO2_MAX_DECAY,
          truncationDays: FITNESS_TIMELINE_WINDOWS_DAYS.VO2_MAX_TRUNCATION,
          points,
        },
      }),
    ];
  }
}
