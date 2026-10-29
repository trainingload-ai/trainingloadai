import { Injectable, Logger } from '@nestjs/common';
import { PlanWorkoutActivityLinkRole, SportType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { LoadReadoutService } from '../../activity/load-readout.service';

/**
 * 计划维度的 estimated vs actual 复盘汇总
 * ============================================
 * - 条形图/运动拆分：全部课次的 estimated vs actual（含未开始）
 * - totals 合规率与列表 rollup：仅 DONE 课次的 estimated / actual（避免未完成课次关联活动抬高合规）
 * - actualLoad 走 LoadReadoutService.batchGetActualLoad（与 PMC 同口径）
 *
 * 不写库；前端按需调用，对纯只读路径不会影响其它写流程。
 */

type SportBucket = 'RUN' | 'CYCLING' | 'SWIM' | 'OTHER';

type WorkoutRow = {
  id: string;
  status: string;
  sportType: SportType;
  dayOffset: number | null;
  estimatedLoad: number | null;
  links: Array<{
    role: string;
    unlinkedAt: Date | null;
    activityId: number;
  }>;
};

export interface PlanSummaryByWeek {
  weekIndex: number;
  workoutCount: number;
  doneCount: number;
  plannedCount: number;
  inProgressCount: number;
  skippedCount: number;
  movedCount: number;
  /** 全部课次的期望/实际（条形图：含未开始课次的计划量） */
  estimatedLoad: number;
  actualLoad: number;
  /** 仅 DONE 课次的 actual/estimated，与 totals 合规口径一致 */
  complianceRate: number;
}

export interface PlanSummaryBySport {
  sport: SportBucket;
  workoutCount: number;
  doneCount: number;
  estimatedLoad: number;
  actualLoad: number;
  /** 仅 DONE 课次的合规比例 */
  complianceRate: number;
}

/** 聚合中间态：周/维度条形用全部课次负荷，合规率用 DONE 合计 */
type WeekBucketAgg = PlanSummaryByWeek & {
  doneEstimatedLoad: number;
  doneActualLoad: number;
};

type SportBucketAgg = PlanSummaryBySport & {
  doneEstimatedLoad: number;
  doneActualLoad: number;
};

/** 列表接口「每条计划一行」的负荷与完成概览（来自单次 batchGetActualLoad） */
export type PlanListRollup = {
  workoutCount: number;
  doneCount: number;
  /** 仅 DONE 课次的期望负荷快照合计 */
  estimatedLoadTotal: number;
  /** 仅 DONE 课次关联活动的实际负荷合计 */
  actualLoadTotal: number;
  /** doneCount / workoutCount，0..100 */
  sessionCompletionRate: number;
  /** 仅 DONE 课次：actualLoadTotal / estimatedLoadTotal；无可对比基准时为 null */
  complianceRate: number | null;
};

/** listPlans 映射课次行到此类型后再 rollupForWorkouts */
export type WorkoutRollupInput = {
  status: string;
  sportType: SportType;
  estimatedLoad: number | null;
  links: Array<{
    role: string;
    unlinkedAt: Date | null;
    activityId: number;
  }>;
};

export interface PlanSummary {
  planId: string;
  status: string;
  periodWeeks: number | null;
  totals: {
    workoutCount: number;
    doneCount: number;
    plannedCount: number;
    inProgressCount: number;
    skippedCount: number;
    movedCount: number;
    /** 仅 DONE 课次的期望负荷合计（合规分子分母） */
    estimatedLoad: number;
    /** 仅 DONE 课次关联活动的实际负荷合计 */
    actualLoad: number;
    /** doneCount / workoutCount，0..100，仅看节数完成率 */
    completionRate: number;
    /** 仅 DONE 课次：actualLoad / estimatedLoad；estimated=0 时为 null */
    complianceRate: number | null;
  };
  weeks: PlanSummaryByWeek[];
  bySport: PlanSummaryBySport[];
}

export class PlanSummaryNotFoundError extends Error {
  constructor() {
    super('Plan not found');
    this.name = 'PlanSummaryNotFoundError';
  }
}

import { PlanRepository } from '../persistence/plan.repository';
import { PlanWorkoutRepository } from '../persistence/plan-workout.repository';

@Injectable()
export class PlanSummaryService {
  private readonly logger = new Logger(PlanSummaryService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly loadReadout: LoadReadoutService,
    private readonly plans: PlanRepository,
    private readonly workouts: PlanWorkoutRepository,
  ) {}

  async summarize(userId: string, planId: string): Promise<PlanSummary> {
    const plan = await this.plans.findUnique({
      where: { id: planId },
      select: {
        id: true,
        userId: true,
        status: true,
        periodWeeks: true,
      },
    });
    if (!plan || plan.userId !== userId) {
      throw new PlanSummaryNotFoundError();
    }

    const workouts = (await this.workouts.findMany({
      where: { planId },
      orderBy: [{ dayOffset: 'asc' }, { sessionIndex: 'asc' }],
      select: {
        id: true,
        status: true,
        sportType: true,
        dayOffset: true,
        estimatedLoad: true,
        links: {
          where: { unlinkedAt: null },
          select: { role: true, unlinkedAt: true, activityId: true },
        },
      },
    })) as WorkoutRow[];

    const activityIds = collectPrimaryActivityIds(workouts);
    const actualMap = activityIds.length
      ? await this.loadReadout.batchGetActualLoad(activityIds)
      : new Map<number, { actualLoad: number | null }>();

    const totals = makeEmptyTotals();
    const weekBuckets = new Map<number, WeekBucketAgg>();
    const sportBuckets = new Map<SportBucket, SportBucketAgg>();

    for (const w of workouts) {
      const week = weekIndexFromOffset(w.dayOffset ?? 0);
      const sport = bucketSport(w.sportType);
      const estimated =
        typeof w.estimatedLoad === 'number' && Number.isFinite(w.estimatedLoad)
          ? w.estimatedLoad
          : 0;
      const actual = readActualLoad(w, actualMap);

      const weekRow = ensureWeekBucket(weekBuckets, week);
      const sportRow = ensureSportBucket(sportBuckets, sport);

      totals.workoutCount += 1;
      weekRow.workoutCount += 1;
      sportRow.workoutCount += 1;

      switch (w.status) {
        case 'DONE':
          totals.doneCount += 1;
          weekRow.doneCount += 1;
          sportRow.doneCount += 1;
          break;
        case 'IN_PROGRESS':
          totals.inProgressCount += 1;
          weekRow.inProgressCount += 1;
          break;
        case 'SKIPPED':
          totals.skippedCount += 1;
          weekRow.skippedCount += 1;
          break;
        case 'MOVED':
          totals.movedCount += 1;
          weekRow.movedCount += 1;
          break;
        default:
          totals.plannedCount += 1;
          weekRow.plannedCount += 1;
      }

      weekRow.estimatedLoad += estimated;
      sportRow.estimatedLoad += estimated;
      weekRow.actualLoad += actual;
      sportRow.actualLoad += actual;

      if (w.status === 'DONE') {
        totals.estimatedLoad += estimated;
        totals.actualLoad += actual;
        weekRow.doneEstimatedLoad += estimated;
        weekRow.doneActualLoad += actual;
        sportRow.doneEstimatedLoad += estimated;
        sportRow.doneActualLoad += actual;
      }
    }

    return {
      planId: plan.id,
      status: plan.status as string,
      periodWeeks: plan.periodWeeks ?? null,
      totals: finalizeTotals(totals),
      weeks: finalizeWeeks(weekBuckets, plan.periodWeeks ?? 0),
      bySport: finalizeSports(sportBuckets),
    };
  }

  /**
   * 纯聚合：listPlans 拉齐课次后在单次 batchGetActualLoad 结果上按计划汇总。
   */
  rollupForWorkouts(
    workouts: WorkoutRollupInput[],
    actualMap: Map<number, { actualLoad: number | null }>,
  ): PlanListRollup {
    const t = makeEmptyTotals();
    for (const w of workouts) {
      const estimated =
        typeof w.estimatedLoad === 'number' && Number.isFinite(w.estimatedLoad)
          ? w.estimatedLoad
          : 0;
      const actual = readActualLoad(w, actualMap);
      t.workoutCount += 1;
      switch (w.status) {
        case 'DONE':
          t.doneCount += 1;
          break;
        case 'IN_PROGRESS':
          t.inProgressCount += 1;
          break;
        case 'SKIPPED':
          t.skippedCount += 1;
          break;
        case 'MOVED':
          t.movedCount += 1;
          break;
        default:
          t.plannedCount += 1;
      }
      if (w.status === 'DONE') {
        t.estimatedLoad += estimated;
        t.actualLoad += actual;
      }
    }
    const f = finalizeTotals(t);
    return {
      workoutCount: f.workoutCount,
      doneCount: f.doneCount,
      estimatedLoadTotal: roundLoad(f.estimatedLoad),
      actualLoadTotal: roundLoad(f.actualLoad),
      sessionCompletionRate: f.completionRate,
      complianceRate: f.complianceRate,
    };
  }
}

function collectPrimaryActivityIds(workouts: WorkoutRow[]): number[] {
  const ids = new Set<number>();
  for (const w of workouts) {
    for (const link of w.links) {
      if (
        link.role === PlanWorkoutActivityLinkRole.PRIMARY &&
        link.unlinkedAt == null &&
        typeof link.activityId === 'number'
      ) {
        ids.add(link.activityId);
      }
    }
  }
  return Array.from(ids);
}

function readActualLoad(
  w: Pick<WorkoutRow, 'links'>,
  map: Map<number, { actualLoad: number | null }>,
) {
  for (const link of w.links) {
    if (link.role !== PlanWorkoutActivityLinkRole.PRIMARY) continue;
    if (link.unlinkedAt != null) continue;
    const readout = map.get(link.activityId);
    if (readout && typeof readout.actualLoad === 'number') {
      return readout.actualLoad;
    }
  }
  return 0;
}

function bucketSport(sport: SportType): SportBucket {
  if (sport === SportType.RUN) return 'RUN';
  if (sport === SportType.CYCLING) return 'CYCLING';
  if (sport === SportType.SWIM) return 'SWIM';
  return 'OTHER';
}

function weekIndexFromOffset(offset: number) {
  return Math.floor(Math.max(0, offset) / 7) + 1;
}

function makeEmptyTotals() {
  return {
    workoutCount: 0,
    doneCount: 0,
    plannedCount: 0,
    inProgressCount: 0,
    skippedCount: 0,
    movedCount: 0,
    estimatedLoad: 0,
    actualLoad: 0,
  };
}

function ensureWeekBucket(map: Map<number, WeekBucketAgg>, weekIndex: number) {
  const existing = map.get(weekIndex);
  if (existing) return existing;
  const next: WeekBucketAgg = {
    weekIndex,
    workoutCount: 0,
    doneCount: 0,
    plannedCount: 0,
    inProgressCount: 0,
    skippedCount: 0,
    movedCount: 0,
    estimatedLoad: 0,
    actualLoad: 0,
    complianceRate: 0,
    doneEstimatedLoad: 0,
    doneActualLoad: 0,
  };
  map.set(weekIndex, next);
  return next;
}

function ensureSportBucket(
  map: Map<SportBucket, SportBucketAgg>,
  sport: SportBucket,
) {
  const existing = map.get(sport);
  if (existing) return existing;
  const next: SportBucketAgg = {
    sport,
    workoutCount: 0,
    doneCount: 0,
    estimatedLoad: 0,
    actualLoad: 0,
    complianceRate: 0,
    doneEstimatedLoad: 0,
    doneActualLoad: 0,
  };
  map.set(sport, next);
  return next;
}

function finalizeTotals(totals: ReturnType<typeof makeEmptyTotals>) {
  const completionRate =
    totals.workoutCount > 0
      ? Math.round((totals.doneCount / totals.workoutCount) * 100)
      : 0;
  const complianceRate =
    totals.estimatedLoad > 0
      ? Math.round((totals.actualLoad / totals.estimatedLoad) * 100)
      : null;
  return {
    ...totals,
    completionRate,
    complianceRate,
  };
}

function finalizeWeeks(map: Map<number, WeekBucketAgg>, periodWeeks: number) {
  const total = Math.max(periodWeeks ?? 0, ...map.keys());
  const out: PlanSummaryByWeek[] = [];
  for (let week = 1; week <= total; week += 1) {
    const row = map.get(week);
    if (row) {
      const complianceRate =
        row.doneEstimatedLoad > 0
          ? Math.round((row.doneActualLoad / row.doneEstimatedLoad) * 100)
          : 0;
      out.push({
        weekIndex: row.weekIndex,
        workoutCount: row.workoutCount,
        doneCount: row.doneCount,
        plannedCount: row.plannedCount,
        inProgressCount: row.inProgressCount,
        skippedCount: row.skippedCount,
        movedCount: row.movedCount,
        estimatedLoad: roundLoad(row.estimatedLoad),
        actualLoad: roundLoad(row.actualLoad),
        complianceRate,
      });
    } else {
      out.push({
        weekIndex: week,
        workoutCount: 0,
        doneCount: 0,
        plannedCount: 0,
        inProgressCount: 0,
        skippedCount: 0,
        movedCount: 0,
        estimatedLoad: 0,
        actualLoad: 0,
        complianceRate: 0,
      });
    }
  }
  return out;
}

function finalizeSports(map: Map<SportBucket, SportBucketAgg>) {
  const order: SportBucket[] = ['RUN', 'CYCLING', 'SWIM', 'OTHER'];
  return order
    .map((sport) => map.get(sport))
    .filter((row): row is SportBucketAgg => Boolean(row))
    .map((row) => ({
      sport: row.sport,
      workoutCount: row.workoutCount,
      doneCount: row.doneCount,
      estimatedLoad: roundLoad(row.estimatedLoad),
      actualLoad: roundLoad(row.actualLoad),
      complianceRate:
        row.doneEstimatedLoad > 0
          ? Math.round((row.doneActualLoad / row.doneEstimatedLoad) * 100)
          : 0,
    }));
}

function roundLoad(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}
