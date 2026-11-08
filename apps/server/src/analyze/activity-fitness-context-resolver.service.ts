import { Injectable } from '@nestjs/common';
import {
  BodyMetricType,
  HeartRateZoneModel,
  MetricSource,
  PaceZoneModel,
  PeakType,
  PowerZoneModel,
  ScaleType,
  SportType,
  UserFitnessMetricType,
  ZoneType,
} from '@prisma/client';
import {
  FITNESS_CONTEXT_RESOLUTION_VERSION,
  type ResolvedBodyMetricValue,
  type ResolvedFitnessMetricValue,
  type ResolvedZoneVersion,
} from './resolved-fitness-context';
import { ActivityDependencyFingerprintService } from './activity-dependency-fingerprint.service';
import { PrismaService } from '@/prisma/prisma.service';
import { UserService } from '@/api/user/user.service';
import { UserAnalysisConfigService } from '@/api/user/user-analysis-config.service';
import { ActivityInputFingerprintService } from './activity-input-fingerprint.service';
import {
  FITNESS_TIMELINE_PROJECTION_VERSION,
  FitnessTimelineProjector,
  fitnessTimelineFingerprint,
  type FitnessTimelineMetric,
  type FitnessTimelineObservation,
  type FitnessTimelineSport,
} from '@/algorithm/fitness-timeline';
import {
  resolveHeartRateSettings,
  resolvePaceZoneSettings,
  resolvePowerZoneSettings,
  type UserZoneSetting,
  type UserZoneValue,
} from '@/utils/zones';
import { generateHeartRateZonesFromProfile } from '@/heart-rate/heart-rate.utils';
import { generatePowerZonesFromProfile } from '@/power/util';
import { generatePaceZonesFromProfile } from '@/api/pace/pace.utils';
import {
  permitsMeasuredPowerFitness,
  resolveMeasuredPowerEvidence,
} from '@/training-load/measured-power-evidence';

const METRICS: readonly UserFitnessMetricType[] = [
  UserFitnessMetricType.FTP,
  UserFitnessMetricType.CP,
  UserFitnessMetricType.W_PRIME,
  UserFitnessMetricType.P_MAX,
  UserFitnessMetricType.MAX_HR,
  UserFitnessMetricType.LTHR,
  UserFitnessMetricType.RESTING_HR,
  UserFitnessMetricType.CS,
  UserFitnessMetricType.TP,
  UserFitnessMetricType.VO2_MAX,
];

function timelineSport(sport: SportType): FitnessTimelineSport {
  return sport === SportType.RUN ||
    sport === SportType.CYCLING ||
    sport === SportType.SWIM
    ? sport
    : 'UNKNOWN';
}

function timelineMetric(type: UserFitnessMetricType): FitnessTimelineMetric {
  return type as FitnessTimelineMetric;
}

function metricValue(
  resolved: ReturnType<FitnessTimelineProjector['resolve']>,
): ResolvedFitnessMetricValue {
  if (resolved.origin === 'UNAVAILABLE') {
    return {
      value: null,
      value2: null,
      source: 'UNAVAILABLE',
      effectiveAt: null,
      evidenceFingerprint: resolved.evidenceFingerprint,
      reason: resolved.reason,
    };
  }
  const source =
    resolved.origin === 'ACTIVITY_BOOTSTRAP'
      ? 'ACTIVITY_BOOTSTRAP'
      : resolved.origin === 'DEFAULT_RESTING_HEART_RATE'
        ? 'DEFAULT'
        : resolved.origin === 'AUTO'
          ? MetricSource.AUTO
          : MetricSource.MANUAL;
  return {
    value: resolved.value,
    value2: resolved.value2 ?? null,
    source,
    effectiveAt: resolved.effectiveAt,
    evidenceFingerprint: resolved.evidenceFingerprint,
    sourceMetricId:
      resolved.sourceMetricId ??
      (typeof resolved.sourceActivityIds?.[0] === 'number'
        ? `activity:${resolved.sourceActivityIds[0]}`
        : null),
  };
}

@Injectable()
export class ActivityFitnessContextResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UserService,
    private readonly fingerprints: ActivityDependencyFingerprintService,
    private readonly analysisConfigs: UserAnalysisConfigService,
    private readonly inputFingerprints: ActivityInputFingerprintService,
  ) {}

  async resolve(args: {
    activity: {
      id: number;
      userId: string;
      sportType: SportType | null;
      startTime: Date | null;
      endTime: Date | null;
      timerTime: number | null;
      elapsedTime: number | null;
      eftp: number | null;
      ecp: number | null;
      ewPrime: number | null;
      epmax: number | null;
    };
    projector: FitnessTimelineProjector;
  }) {
    const { activity, projector } = args;
    if (!activity.startTime) throw new Error('ACTIVITY_START_TIME_REQUIRED');
    const sport = activity.sportType ?? SportType.UNKNOWN;
    const end =
      activity.endTime ??
      new Date(
        activity.startTime.getTime() +
          Math.max(activity.timerTime ?? 0, activity.elapsedTime ?? 0) * 1000,
      );
    const bootstraps = await this.bootstrap(activity, end);
    const metrics: Partial<
      Record<UserFitnessMetricType, ResolvedFitnessMetricValue>
    > = {};
    for (const type of METRICS) {
      const bootstrap = bootstraps.get(type);
      metrics[type] = metricValue(
        projector.resolve({
          metric: timelineMetric(type),
          sport: timelineSport(sport),
          at: activity.startTime,
          bootstrap,
          allowRestingHrDefault: type === UserFitnessMetricType.RESTING_HR,
        }),
      );
    }

    const [composedProfile, analysisConfig, inputFingerprints] =
      await Promise.all([
        this.users.getComposedUserProfile(
          activity.userId,
          sport,
          activity.startTime,
        ),
        this.analysisConfigs.resolveAt(activity.userId, activity.startTime),
        this.inputFingerprints.resolve(activity.id),
      ]);
    const profile = composedProfile ?? {};
    const value = (type: UserFitnessMetricType) =>
      metrics[type]?.value ?? undefined;
    const value2 = (type: UserFitnessMetricType) =>
      metrics[type]?.value2 ?? undefined;
    const restingHeartRate = metrics[UserFitnessMetricType.RESTING_HR];
    const measuredRestingHeartRate =
      restingHeartRate?.source === 'DEFAULT'
        ? undefined
        : (restingHeartRate?.value ?? undefined);
    Object.assign(profile, {
      // Historical analysis must never inherit today's mutable global
      // calculation preferences from UserProfile. The version resolved at the
      // activity start is the sole source of truth for every HEAVY task.
      loadSources: analysisConfig.loadSources.join(','),
      altitudeOptimizationModel: analysisConfig.altitudeOptimizationModel,
      altitudeThreshold: analysisConfig.altitudeThreshold ?? undefined,
      defaultVdotSource: analysisConfig.defaultVdotSource,
      vo2maxCorrectionFactor:
        analysisConfig.vo2maxCorrectionFactor ?? undefined,
      heartRateZoneModel: analysisConfig.heartRateZoneModel,
      paceZoneModel: analysisConfig.paceZoneModel,
      powerZoneModel: analysisConfig.powerZoneModel,
      ftp: value(UserFitnessMetricType.FTP),
      cp: value(UserFitnessMetricType.CP),
      wPrime:
        value(UserFitnessMetricType.W_PRIME) ??
        value2(UserFitnessMetricType.CP),
      Pmax: value(UserFitnessMetricType.P_MAX),
      maxHeartRate: value(UserFitnessMetricType.MAX_HR),
      // The versioned 60 bpm default is a load-calculation fallback only.
      // It must not become a general profile value or affect HRR zones.
      restingHeartRate: measuredRestingHeartRate,
      lthr: value(UserFitnessMetricType.LTHR),
      cs: value(UserFitnessMetricType.CS),
      dPrime: value2(UserFitnessMetricType.CS),
      tp: value(UserFitnessMetricType.TP),
      vo2max: value(UserFitnessMetricType.VO2_MAX),
    });
    const [zones, bodyMetrics] = await Promise.all([
      this.resolveZones(activity.userId, sport, activity.startTime, {
        maxHeartRate: profile.maxHeartRate,
        restingHeartRate: profile.restingHeartRate,
        lthr: profile.lthr,
        ftp: profile.ftp,
        cp: profile.cp,
        cs: profile.cs,
        tp: profile.tp,
        vo2max: profile.vo2max,
        heartRateZoneModel: analysisConfig.heartRateZoneModel,
        powerZoneModel: analysisConfig.powerZoneModel,
        paceZoneModel: analysisConfig.paceZoneModel,
      }),
      this.resolveBodyMetrics(activity.userId, activity.startTime),
    ]);
    return this.fingerprints.resolve({
      resolutionVersion: FITNESS_CONTEXT_RESOLUTION_VERSION,
      activityId: activity.id,
      activityStart: activity.startTime,
      activityEnd: end,
      sport,
      profile,
      analysisConfig,
      inputFingerprints,
      metrics,
      zones,
      bodyMetrics,
    });
  }

  private async bootstrap(
    activity: {
      id: number;
      sportType: SportType | null;
      eftp: number | null;
      ecp: number | null;
      ewPrime: number | null;
      epmax: number | null;
    },
    effectiveAt: Date,
  ) {
    const result = new Map<UserFitnessMetricType, FitnessTimelineObservation>();
    const sport = timelineSport(activity.sportType ?? SportType.UNKNOWN);
    const add = (
      type: UserFitnessMetricType,
      value: number | null,
      value2?: number | null,
    ) => {
      if (value == null || !Number.isFinite(value) || value <= 0) return;
      result.set(type, {
        metric: timelineMetric(type),
        sport,
        value,
        value2: value2 ?? null,
        effectiveAt,
        sourceActivityIds: [activity.id],
        evidenceFingerprint: fitnessTimelineFingerprint({
          version: FITNESS_TIMELINE_PROJECTION_VERSION,
          method: 'ACTIVITY_SELF_BOOTSTRAP',
          activityId: activity.id,
          type,
          value,
          value2: value2 ?? null,
        }),
      });
    };
    const sources = await this.prisma.activitySource.findMany({
      where: { activityId: activity.id, isActive: true, isPrimary: true },
      select: { metadata: true },
    });
    if (permitsMeasuredPowerFitness(resolveMeasuredPowerEvidence(sources))) {
      add(UserFitnessMetricType.FTP, activity.eftp);
      add(UserFitnessMetricType.CP, activity.ecp, activity.ewPrime);
      add(UserFitnessMetricType.W_PRIME, activity.ewPrime);
      add(UserFitnessMetricType.P_MAX, activity.epmax);
    }
    const maxHr = await this.prisma.activityPeakMetric.findFirst({
      where: {
        activityId: activity.id,
        type: PeakType.hr,
        scaleType: ScaleType.TIME,
        scaleValue: 5,
        value: { gte: 80, lte: 240 },
      },
      orderBy: { value: 'desc' },
    });
    const max = maxHr?.value;
    if (max != null && Number.isFinite(max) && max > 0) {
      result.set(UserFitnessMetricType.MAX_HR, {
        metric: 'MAX_HR',
        sport: 'UNKNOWN',
        value: Math.round(max),
        value2: null,
        effectiveAt,
        sourceActivityIds: [activity.id],
        evidenceFingerprint: fitnessTimelineFingerprint({
          method: 'ACTIVITY_SELF_BOOTSTRAP',
          activityId: activity.id,
          type: 'MAX_HR',
          windowSeconds: 5,
          value: max,
        }),
      });
    }
    return result;
  }

  private async resolveBodyMetrics(
    userId: string,
    at: Date,
  ): Promise<ResolvedBodyMetricValue[]> {
    const rows = await this.users.listBodyMetricEvidenceAt(userId, at);
    const latest = new Map<BodyMetricType, (typeof rows)[number]>();
    for (const row of rows)
      if (!latest.has(row.type)) latest.set(row.type, row);
    return Object.values(BodyMetricType).map((type) => {
      const row = latest.get(type);
      return {
        type,
        value: row?.value ?? null,
        effectiveAt: row?.effectiveDate ?? null,
        sourceId: row?.id ?? null,
        evidenceFingerprint: fitnessTimelineFingerprint({
          type,
          id: row?.id ?? null,
          value: row?.value ?? null,
          effectiveAt: row?.effectiveDate.toISOString() ?? null,
          changeSource: row?.changeSource ?? null,
          originProvider: row?.originProvider ?? null,
        }),
        reason: row ? null : 'BODY_METRIC_UNAVAILABLE',
      };
    });
  }

  private async resolveZones(
    userId: string,
    sport: SportType,
    at: Date,
    profile: {
      ftp?: number;
      cp?: number;
      maxHeartRate?: number;
      restingHeartRate?: number;
      lthr?: number;
      cs?: number;
      tp?: number;
      vo2max?: number;
      heartRateZoneModel?: HeartRateZoneModel;
      powerZoneModel?: PowerZoneModel;
      paceZoneModel?: PaceZoneModel;
    },
  ): Promise<ResolvedZoneVersion[]> {
    const rows = await this.prisma.userZoneSettingVersion.findMany({
      where: {
        userId,
        sportType: { in: [sport, SportType.UNKNOWN] },
        createdAt: { lte: at },
      },
      orderBy: { createdAt: 'desc' },
    });
    const selected = new Map<ZoneType, (typeof rows)[number]>();
    for (const zoneType of Object.values(ZoneType)) {
      selected.set(
        zoneType,
        rows.find(
          (row) => row.zoneType === zoneType && row.sportType === sport,
        ) ??
          rows.find(
            (row) =>
              row.zoneType === zoneType && row.sportType === SportType.UNKNOWN,
          )!,
      );
    }
    return [...selected.entries()].flatMap(([zoneType, row]) => {
      const saved = row && Array.isArray(row.zones);
      const generated = saved
        ? null
        : zoneType === ZoneType.HEART_RATE
          ? generateHeartRateZonesFromProfile(profile, sport)
          : zoneType === ZoneType.POWER
            ? generatePowerZonesFromProfile(
                {
                  FTP: profile.ftp,
                  CP: profile.cp,
                  powerZoneModel: profile.powerZoneModel,
                },
                sport,
              )
            : generatePaceZonesFromProfile(profile, sport);
      const raw: UserZoneSetting = saved
        ? {
            configurationSource: 'saved',
            benchmark: row.benchmark,
            zones: row.zones as unknown as UserZoneValue[],
          }
        : {
            ...generated,
            configurationSource: 'generated',
            model:
              zoneType === ZoneType.HEART_RATE
                ? profile.heartRateZoneModel
                : zoneType === ZoneType.POWER
                  ? profile.powerZoneModel
                  : profile.paceZoneModel,
            zones: generated?.zones ?? [],
          };
      const resolved = !saved
        ? raw.zones
        : zoneType === ZoneType.HEART_RATE
          ? resolveHeartRateSettings(raw, profile)
          : zoneType === ZoneType.POWER
            ? resolvePowerZoneSettings(raw, {
                FTP: profile.ftp,
                CP: profile.cp,
              })
            : resolvePaceZoneSettings(raw, profile);
      if (!resolved?.length) return [];
      const calculationFingerprint = fitnessTimelineFingerprint({
        zoneType,
        sport: saved ? row.sportType : sport,
        benchmark: raw.benchmark,
        zones: resolved,
      });
      return [
        {
          zoneType,
          sport: saved ? row.sportType : sport,
          versionId: saved ? row.id : null,
          effectiveAt: saved ? row.createdAt : at,
          calculationFingerprint,
          provenanceFingerprint: fitnessTimelineFingerprint({
            calculationFingerprint,
            versionId: saved ? row.id : null,
            configurationSource: raw.configurationSource,
            model: raw.model,
            changeSource: saved ? row.changeSource : null,
            originProvider: saved ? row.originProvider : null,
            originExternalId: saved ? row.originExternalId : null,
          }),
          setting: { ...raw, zones: resolved },
        },
      ];
    });
  }
}
