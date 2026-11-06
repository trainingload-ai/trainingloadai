import { Injectable } from '@nestjs/common';
import { $Enums, ZoneType, type Activity, type Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { resolveMeasuredPowerEvidence } from '@/training-load/measured-power-evidence';
import { ActivityAnalyzeMode } from './activity-analyze-mode';
import type {
  AnalyzeUserContext,
  MetricsContext,
  MetricsTaskOutcome,
} from './context';
import { ActivityMetricsOrchestratorService } from './orchestrator.service';
import type { ComputedMetricsRun } from './orchestrator.service';
import type { MetricsTask } from './task';
import { BindFitnessMetricsTask } from './tasks/bind-fitness-metrics.task';
import { CalculatedPowerSummaryTask } from './tasks/calculated-power-summary.task';
import { CaloriesTask } from './tasks/calories.task';
import { DerivedMetricsTask } from './tasks/derived-metrics.task';
import { EstimatedPowerMetricsTask } from './tasks/estimated-power-metrics.task';
import { HeartRateBaseTask } from './tasks/heart-rate-base.task';
import { HeartRateTrimpTask } from './tasks/heart-rate-trimp.task';
import { HeartRateZonesTask } from './tasks/heart-rate-zones.task';
import { MaxMeanHeartRateTask } from './tasks/max-mean-heart-rate.task';
import { MaxMeanPowerTask } from './tasks/max-mean-power.task';
import { PaceBaseTask } from './tasks/pace-base.task';
import { PaceGovssTask } from './tasks/pace-govss.task';
import { PaceZonesTask } from './tasks/pace-zones.task';
import { PeakPaceTask } from './tasks/peak-pace.task';
import { PowerBaseTask } from './tasks/power-base.task';
import { PowerCogganBikeTask } from './tasks/power-coggan-bike.task';
import { PowerZonesTask } from './tasks/power-zones.task';
import { RecordsBootstrapTask } from './tasks/records-bootstrap.task';
import { TrainingEffectTask } from './tasks/training-effect.task';
import { Vo2MaxTask } from './tasks/vo2max.task';
import { SwimScoreTask } from './tasks/swim-score.task';
import { LthrObservationTask } from './tasks/lthr-observation.task';
import { ActivityStatisticsTask } from './tasks/activity-statistics.task';
import type { ResolvedFitnessContext } from '@/analyze/resolved-fitness-context';
import type { ActivityMetricDimension } from '@/analyze/activity-impact-resolver';

/** Activity capability 的 metrics pipeline 公共入口。 */
@Injectable()
export class ActivityMetricsPipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: ActivityMetricsOrchestratorService,
    private readonly maxMeanPowerTask: MaxMeanPowerTask,
    private readonly maxMeanHeartRateTask: MaxMeanHeartRateTask,
    private readonly lthrObservationTask: LthrObservationTask,
    private readonly peakPaceTask: PeakPaceTask,
    private readonly recordsBootstrapTask: RecordsBootstrapTask,
    private readonly calculatedPowerSummaryTask: CalculatedPowerSummaryTask,
    private readonly activityStatisticsTask: ActivityStatisticsTask,
    private readonly estimatedPowerMetricsTask: EstimatedPowerMetricsTask,
    private readonly derivedMetricsTask: DerivedMetricsTask,
    private readonly trainingEffectTask: TrainingEffectTask,
    private readonly vo2MaxTask: Vo2MaxTask,
    private readonly bindFitnessMetricsTask: BindFitnessMetricsTask,
    private readonly heartRateBaseTask: HeartRateBaseTask,
    private readonly heartRateZonesTask: HeartRateZonesTask,
    private readonly heartRateTrimpTask: HeartRateTrimpTask,
    private readonly powerBaseTask: PowerBaseTask,
    private readonly powerZonesTask: PowerZonesTask,
    private readonly powerCogganBikeTask: PowerCogganBikeTask,
    private readonly paceBaseTask: PaceBaseTask,
    private readonly paceZonesTask: PaceZonesTask,
    private readonly paceGovssTask: PaceGovssTask,
    private readonly swimScoreTask: SwimScoreTask,
    private readonly caloriesTask: CaloriesTask,
  ) {}

  private async buildContext(
    activity: Activity,
    userId: string,
    resolved?: ResolvedFitnessContext,
  ): Promise<MetricsContext> {
    const activitySources = await this.prisma.activitySource.findMany({
      where: { activityId: activity.id, isActive: true, isPrimary: true },
      select: { metadata: true },
    });
    const fitnessMetrics = resolved
      ? Object.fromEntries(
          Object.entries(resolved.metrics).map(([type, metric]) => [
            type,
            metric?.value != null
              ? {
                  value: metric.value,
                  value2: metric.value2,
                  provenance: {
                    value: {
                      source: metric.source,
                      effectiveAt: metric.effectiveAt?.toISOString() ?? null,
                      sourceMetricId: metric.sourceMetricId ?? null,
                      evidenceFingerprint: metric.evidenceFingerprint,
                      reason: metric.reason ?? null,
                    },
                  },
                }
              : null,
          ]),
        )
      : undefined;
    const metric = (type: $Enums.UserFitnessMetricType) =>
      resolved?.metrics[type]?.value ?? undefined;
    const metric2 = (type: $Enums.UserFitnessMetricType) =>
      resolved?.metrics[type]?.value2 ?? undefined;
    const resolvedRestingHeartRate =
      resolved?.metrics[$Enums.UserFitnessMetricType.RESTING_HR];
    const restingHeartRate =
      resolvedRestingHeartRate?.source === 'DEFAULT'
        ? undefined
        : (resolvedRestingHeartRate?.value ?? undefined);
    const loadRestingHeartRateDefault =
      resolvedRestingHeartRate?.source === 'DEFAULT'
        ? (resolvedRestingHeartRate.value ?? undefined)
        : undefined;
    const profile = resolved
      ? {
          ...resolved.profile,
          ftp: metric($Enums.UserFitnessMetricType.FTP),
          cp: metric($Enums.UserFitnessMetricType.CP),
          wPrime:
            metric($Enums.UserFitnessMetricType.W_PRIME) ??
            metric2($Enums.UserFitnessMetricType.CP),
          Pmax: metric($Enums.UserFitnessMetricType.P_MAX),
          maxHeartRate: metric($Enums.UserFitnessMetricType.MAX_HR),
          restingHeartRate,
          lthr: metric($Enums.UserFitnessMetricType.LTHR),
          cs: metric($Enums.UserFitnessMetricType.CS),
          dPrime: metric2($Enums.UserFitnessMetricType.CS),
          tp: metric($Enums.UserFitnessMetricType.TP),
          vo2max: metric($Enums.UserFitnessMetricType.VO2_MAX),
        }
      : undefined;
    const analyzeContext: AnalyzeUserContext | undefined = profile
      ? {
          userWeight: profile.weight,
          userHeight: profile.height,
          age: profile.age,
          gender: profile.gender,
          LTHR: profile.lthr,
          MHR: profile.maxHeartRate,
          RHR: profile.restingHeartRate,
          FTP: profile.ftp,
          CP: profile.cp,
          CS: profile.cs,
          TP: profile.tp,
          rpe: activity.sessionRpe ?? undefined,
          vo2maxCorrectionFactor: profile.vo2maxCorrectionFactor,
        }
      : undefined;
    const zone = (type: ZoneType) =>
      resolved?.zones.find(
        (candidate) =>
          candidate.zoneType === type &&
          (candidate.sport === activity.sportType ||
            candidate.sport === $Enums.SportType.UNKNOWN),
      )?.setting;
    const heartRateZoneSetting = zone(ZoneType.HEART_RATE);
    const powerZoneSetting = zone(ZoneType.POWER);
    const paceZoneSetting = zone(ZoneType.PACE);

    return {
      inputs: {
        activity,
        userId,
        sportType: activity.sportType ?? $Enums.SportType.UNKNOWN,
        startTime: activity.startTime,
        timezone: activity.timezone,
        measuredPowerEvidence: resolveMeasuredPowerEvidence(activitySources),
      },
      cache: resolved
        ? {
            resolvedFitnessContext: resolved,
            profile,
            fitnessMetrics,
            loadRestingHeartRateDefault,
            hrThreshold: {
              maxHeartRate: profile?.maxHeartRate ?? null,
              restingHeartRate: profile?.restingHeartRate ?? null,
              lactateThresholdHeartRate: profile?.lthr ?? null,
              lthr: profile?.lthr ?? null,
            },
            heartRateZoneSetting,
            powerPreload: analyzeContext
              ? {
                  powerZones: powerZoneSetting ?? { zones: [] },
                  context: analyzeContext,
                }
              : undefined,
            pacePreload: analyzeContext
              ? {
                  paceZones: paceZoneSetting ?? { zones: [] },
                  context: analyzeContext,
                }
              : undefined,
          }
        : {},
      outputs: {},
      errors: {},
    };
  }

  private tasksFor(mode: ActivityAnalyzeMode): MetricsTask[] {
    if (mode === ActivityAnalyzeMode.LIGHT) {
      return [
        this.recordsBootstrapTask,
        this.calculatedPowerSummaryTask,
        this.activityStatisticsTask,
        this.maxMeanPowerTask,
        this.maxMeanHeartRateTask,
        this.lthrObservationTask,
        this.peakPaceTask,
        this.estimatedPowerMetricsTask,
        this.derivedMetricsTask,
        this.vo2MaxTask,
      ];
    }
    if (mode === ActivityAnalyzeMode.HEAVY) {
      return [
        this.recordsBootstrapTask,
        this.calculatedPowerSummaryTask,
        this.activityStatisticsTask,
        this.bindFitnessMetricsTask,
        this.heartRateBaseTask,
        this.heartRateZonesTask,
        this.heartRateTrimpTask,
        this.paceBaseTask,
        this.paceZonesTask,
        this.paceGovssTask,
        this.swimScoreTask,
        this.powerBaseTask,
        this.powerZonesTask,
        this.powerCogganBikeTask,
        this.trainingEffectTask,
        this.vo2MaxTask,
        this.caloriesTask,
      ];
    }
    return [
      this.recordsBootstrapTask,
      this.calculatedPowerSummaryTask,
      this.activityStatisticsTask,
      this.bindFitnessMetricsTask,
      this.maxMeanPowerTask,
      this.maxMeanHeartRateTask,
      this.lthrObservationTask,
      this.peakPaceTask,
      this.estimatedPowerMetricsTask,
      this.derivedMetricsTask,
      this.vo2MaxTask,
      this.trainingEffectTask,
      this.heartRateBaseTask,
      this.heartRateZonesTask,
      this.heartRateTrimpTask,
      this.paceBaseTask,
      this.paceZonesTask,
      this.paceGovssTask,
      this.swimScoreTask,
      this.powerBaseTask,
      this.powerZonesTask,
      this.powerCogganBikeTask,
      this.caloriesTask,
    ];
  }

  private tasksForHeavyDimensions(
    dimensions: readonly ActivityMetricDimension[] | undefined,
  ): MetricsTask[] {
    const full = this.tasksFor(ActivityAnalyzeMode.HEAVY);
    if (
      !dimensions?.length ||
      dimensions.includes('FULL') ||
      dimensions.includes('PROFILE')
    ) {
      return full;
    }
    const needsRecords = dimensions.some((dimension) =>
      ['HEART_RATE', 'POWER', 'PACE', 'VO2_MAX'].includes(dimension),
    );
    const keys = new Set([
      ...(needsRecords ? ['recordsBootstrap'] : []),
      'bindFitnessMetrics',
      ...(dimensions.includes('HEART_RATE')
        ? [
            'heartRateBase',
            'heartRateZones',
            'heartRateTrimp',
            'trainingEffect',
            'vo2Max',
            'calories',
          ]
        : []),
      ...(dimensions.includes('VO2_MAX') ? ['vo2Max'] : []),
      ...(dimensions.includes('POWER')
        ? [
            'calculatedPowerSummary',
            'powerBase',
            'powerZones',
            'powerCogganBike',
            'calories',
          ]
        : []),
      ...(dimensions.includes('PACE')
        ? ['paceBase', 'paceZones', 'paceGovss', 'swimScore']
        : []),
    ]);
    return full.filter((task) => keys.has(task.key));
  }

  async runByMode(args: {
    activity: Activity;
    userId?: string;
    mode: ActivityAnalyzeMode;
  }) {
    const userId = args.userId ?? args.activity.userId;
    if (!userId) return;
    const context = await this.buildContext(args.activity, userId);
    return this.orchestrator.runStrict(context, this.tasksFor(args.mode));
  }

  async runHeartRate(activityId: number, userId: string): Promise<void> {
    const context = await this.contextForActivity(activityId, userId);
    if (!context) return;
    await this.orchestrator.run(context, [
      this.recordsBootstrapTask,
      this.bindFitnessMetricsTask,
      this.heartRateBaseTask,
      this.heartRateZonesTask,
      this.heartRateTrimpTask,
    ]);
  }

  async runPower(activityId: number, userId: string): Promise<void> {
    const context = await this.contextForActivity(activityId, userId);
    if (!context) return;
    await this.orchestrator.run(context, [
      this.recordsBootstrapTask,
      this.bindFitnessMetricsTask,
      this.powerBaseTask,
      this.powerZonesTask,
      this.powerCogganBikeTask,
    ]);
  }

  async runPace(activityId: number, userId: string): Promise<void> {
    const context = await this.contextForActivity(activityId, userId);
    if (!context) return;
    await this.orchestrator.run(context, [
      this.recordsBootstrapTask,
      this.bindFitnessMetricsTask,
      this.paceBaseTask,
      this.paceZonesTask,
      this.paceGovssTask,
    ]);
  }

  async upsertFitnessMetricSnapshots(
    activity: Pick<Activity, 'id'>,
    userId: string,
  ): Promise<void> {
    const context = await this.contextForActivity(activity.id, userId);
    if (!context) return;
    await this.orchestrator.run(context, [this.bindFitnessMetricsTask]);
  }

  async recomputeVo2Max(activityId: number, userId: string): Promise<void> {
    const context = await this.contextForActivity(activityId, userId);
    if (!context) return;
    await this.orchestrator.run(context, [this.vo2MaxTask]);
  }

  async runHeavy(
    activity: Activity,
    userId: string,
  ): Promise<MetricsTaskOutcome[]> {
    const result = await this.runByMode({
      activity,
      userId,
      mode: ActivityAnalyzeMode.HEAVY,
    });
    return Object.values(result?.taskOutcomes ?? {});
  }

  async computeHeavy(args: {
    activity: Activity;
    userId: string;
    resolvedContext: ResolvedFitnessContext;
    dimensions?: readonly ActivityMetricDimension[];
  }): Promise<ComputedMetricsRun> {
    const context = await this.buildContext(
      args.activity,
      args.userId,
      args.resolvedContext,
    );
    return this.orchestrator.computeStrict(
      context,
      this.tasksForHeavyDimensions(args.dimensions),
    );
  }

  async commitComputedHeavy(
    run: ComputedMetricsRun,
    tx: Prisma.TransactionClient,
  ) {
    const activityId = run.context.inputs.activity.id;
    const outputs = run.context.outputs;
    const ran = new Set(run.tasks.map((task) => task.key));
    if (ran.has('powerCogganBike') && !outputs.powerCoggan) {
      await tx.activityCoggan.deleteMany({ where: { activityId } });
    }
    if (ran.has('powerCogganBike') && !outputs.powerBikeScore) {
      await tx.activityBikeScore.deleteMany({ where: { activityId } });
    }
    if (ran.has('heartRateTrimp') && !outputs.heartRateTrimp) {
      await tx.activityTrimp.deleteMany({ where: { activityId } });
    }
    if (ran.has('trainingEffect') && !outputs.trainingEffect) {
      await tx.activityTrainingEffect.deleteMany({ where: { activityId } });
    }
    if (ran.has('vo2Max') && !outputs.vo2max) {
      await tx.activityVO2Max.deleteMany({ where: { activityId } });
    }
    if (ran.has('paceGovss') && !outputs.paceGovss) {
      await tx.activityGOVSS.deleteMany({ where: { activityId } });
    }
    if (ran.has('swimScore') && !outputs.swimScore) {
      await tx.activitySwimScore.deleteMany({ where: { activityId } });
    }
    const unavailableZones = [
      ran.has('heartRateZones') && !outputs.heartRateZones
        ? ZoneType.HEART_RATE
        : null,
      ran.has('powerZones') && !outputs.powerZoneDistribution
        ? ZoneType.POWER
        : null,
      ran.has('paceZones') && !outputs.paceZoneDistribution
        ? ZoneType.PACE
        : null,
    ].filter((value): value is ZoneType => value != null);
    if (unavailableZones.length > 0) {
      await tx.activityZone.deleteMany({
        where: { activityId, zoneType: { in: unavailableZones } },
      });
    }
    return this.orchestrator.commitComputed(run, tx);
  }

  async commitResolvedSnapshot(args: {
    activity: Activity;
    userId: string;
    resolvedContext: ResolvedFitnessContext;
    tx: Prisma.TransactionClient;
  }) {
    const context = await this.buildContext(
      args.activity,
      args.userId,
      args.resolvedContext,
    );
    const run = await this.orchestrator.computeStrict(context, [
      this.bindFitnessMetricsTask,
    ]);
    return this.orchestrator.commitComputed(run, args.tx);
  }

  private async contextForActivity(activityId: number, userId: string) {
    if (!userId) return null;
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
    });
    return activity ? this.buildContext(activity, userId) : null;
  }
}
