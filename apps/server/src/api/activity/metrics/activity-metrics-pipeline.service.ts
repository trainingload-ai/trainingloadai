import { Injectable } from '@nestjs/common';
import { $Enums, type Activity } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { resolveMeasuredPowerEvidence } from '@/training-load/measured-power-evidence';
import { ActivityAnalyzeMode } from './activity-analyze-mode';
import type { MetricsContext, MetricsTaskOutcome } from './context';
import { ActivityMetricsOrchestratorService } from './orchestrator.service';
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
  ): Promise<MetricsContext> {
    const activitySources = await this.prisma.activitySource.findMany({
      where: { activityId: activity.id, isActive: true, isPrimary: true },
      select: { metadata: true },
    });
    return {
      inputs: {
        activity,
        userId,
        sportType: activity.sportType ?? $Enums.SportType.UNKNOWN,
        startTime: activity.startTime,
        timezone: activity.timezone,
        measuredPowerEvidence: resolveMeasuredPowerEvidence(activitySources),
      },
      cache: {},
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

  private async contextForActivity(activityId: number, userId: string) {
    if (!userId) return null;
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
    });
    return activity ? this.buildContext(activity, userId) : null;
  }
}
