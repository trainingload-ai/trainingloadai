import { Injectable, Logger } from '@nestjs/common';
import {
  BodyMetricType,
  PlanWorkoutActivityLinkRole,
  PlanWorkoutActivityLinkSource,
  PlanWorkoutStatus,
  SportType,
  WorkoutPlanStepDurationType,
  WorkoutPlanValueUnit,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { UserService } from '@/api/user/user.service';
import { UserQueryService } from '@/api/user/user-query.service';
import { PlanRepository } from '../persistence/plan.repository';
import { PlanWorkoutRepository } from '../persistence/plan-workout.repository';
import { PlanActivityLinkRepository } from '../persistence/plan-activity-link.repository';
import { ActivityReadService } from '../../activity/activity-read.service';
import {
  resolveActivityCalendarDayStr,
  scheduledDateFromCalendar,
} from '../plan-link-calendar.util';

/** 期望时长与活动时长偏差阈值：|act-plan|/plan ≤ RATIO */
const DURATION_RATIO = 0.5;

function durationValueToSeconds(
  value: number,
  unit: WorkoutPlanValueUnit | null | undefined,
): number {
  const u = unit ?? WorkoutPlanValueUnit.SECONDS;
  switch (u) {
    case WorkoutPlanValueUnit.SECONDS:
      return Math.max(0, value);
    default:
      return Math.max(0, value);
  }
}

@Injectable()
export class PlanLinkMatcherService {
  private readonly logger = new Logger(PlanLinkMatcherService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
    private readonly plans: PlanRepository,
    private readonly workouts: PlanWorkoutRepository,
    private readonly links: PlanActivityLinkRepository,
    private readonly activityRead: ActivityReadService,
    private readonly users: UserQueryService,
  ) {}

  /** 累加该 workout 下所有 TIME 步骤时长（秒）；无有效时长返回 null */
  async sumExpectedDurationSeconds(workoutId: string): Promise<number | null> {
    const steps = await this.links.findSteps({
      where: { workoutId },
      select: {
        durationType: true,
        durationValue: true,
        durationUnit: true,
      },
    });
    let sec = 0;
    for (const s of steps) {
      if (s.durationType !== WorkoutPlanStepDurationType.TIME) continue;
      if (typeof s.durationValue !== 'number' || s.durationValue <= 0) continue;
      sec += durationValueToSeconds(s.durationValue, s.durationUnit);
    }
    return sec > 0 ? sec : null;
  }

  /**
   * 活动分析完成后尝试自动关联 ACTIVE 计划中的课表。
   *
   * **按活动发生日匹配（与上传/分析完成时刻无关）**：用 `activity.startTime` 的 UTC 瞬间，
   * 在 `activity.timezone` → 用户资料时区 的链上格式化为当地日历日 `YYYY-MM-DD`，
   * 只查询 `PlanWorkout.scheduledDate` 等于该日的 PLANNED/IN_PROGRESS 课表；不会用「今天」替代。
   *
   * 不变量：activity 已有任意 active link 则跳过；一节 workout 同时最多一条 PRIMARY。
   */
  async tryAutoLinkForActivity(activityId: number): Promise<void> {
    try {
      const activity = await this.activityRead.findUnique({
        where: { id: activityId },
        select: {
          id: true,
          userId: true,
          sportType: true,
          sportDefinitionCode: true,
          startTime: true,
          timerTime: true,
          elapsedTime: true,
          state: true,
          timezone: true,
        },
      });

      if (!activity || activity.state !== 1) return;
      if (!activity.startTime) return;

      const sport = activity.sportType;
      const isStrengthActivity =
        activity.sportDefinitionCode === 'STRENGTH_TRAINING';
      if (
        !sport ||
        (sport === SportType.UNKNOWN && !isStrengthActivity) ||
        sport === SportType.STRETCHING
      ) {
        return;
      }

      const actDur =
        typeof activity.timerTime === 'number' && activity.timerTime > 0
          ? activity.timerTime
          : typeof activity.elapsedTime === 'number' && activity.elapsedTime > 0
            ? activity.elapsedTime
            : null;
      if ((actDur === null || actDur <= 0) && !isStrengthActivity) return;

      // check 是否已经关联了课表
      const existing = await this.links.findFirst({
        where: { activityId: activity.id, unlinkedAt: null },
      });
      if (existing) return;

      const activePlan = await this.plans.findFirst({
        where: { userId: activity.userId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!activePlan) return;

      const userTz = this.userService
        ? await this.userService.getPreferredTimezone(activity.userId)
        : ((
            await this.users.bodyMetrics().findFirst({
              where: { userId: activity.userId, type: BodyMetricType.TIMEZONE },
              orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
              select: { value: true },
            })
          )?.value ?? null);

      // 日历日完全由 startTime + 时区决定；与本次请求/入库时间无关（前天骑的车只匹配前天排期）
      const dayStr = resolveActivityCalendarDayStr(
        new Date(activity.startTime),
        activity.timezone,
        null,
        userTz,
      );
      if (!dayStr) return;

      const scheduledEq = scheduledDateFromCalendar(dayStr);

      const workouts = await this.workouts.findMany({
        where: {
          planId: activePlan.id,
          scheduledDate: scheduledEq,
          ...(isStrengthActivity
            ? {
                structureKind: 'STRENGTH',
                sportDefinitionCode: 'STRENGTH_TRAINING',
              }
            : { sportType: sport }),
          status: {
            in: [PlanWorkoutStatus.PLANNED, PlanWorkoutStatus.IN_PROGRESS],
          },
        },
        select: {
          id: true,
          planId: true,
          structureKind: true,
          sportDefinitionCode: true,
          plannedDurationSeconds: true,
        },
      });

      if (workouts.length === 0) return;

      type Scored = {
        workoutId: string;
        planId: string;
        expectedSec: number | null;
        diff: number;
      };
      const scored: Scored[] = [];

      for (const w of workouts) {
        const expectedSec =
          isStrengthActivity &&
          typeof w.plannedDurationSeconds === 'number' &&
          w.plannedDurationSeconds > 0
            ? w.plannedDurationSeconds
            : await this.sumExpectedDurationSeconds(w.id);
        if (!isStrengthActivity && (expectedSec === null || expectedSec <= 0)) {
          continue;
        }

        if (
          !isStrengthActivity &&
          actDur != null &&
          expectedSec != null &&
          Math.abs(actDur - expectedSec) / expectedSec > DURATION_RATIO
        ) {
          continue;
        }

        const taken = await this.links.findFirst({
          where: {
            planWorkoutId: w.id,
            unlinkedAt: null,
            role: PlanWorkoutActivityLinkRole.PRIMARY,
          },
          select: { id: true },
        });
        if (taken) continue;

        scored.push({
          workoutId: w.id,
          planId: w.planId,
          expectedSec,
          diff:
            actDur != null && expectedSec != null
              ? Math.abs(actDur - expectedSec)
              : 0,
        });
      }

      if (scored.length === 0) return;

      scored.sort((a, b) => a.diff - b.diff);
      const best = scored[0]!;

      // link + 自动 DONE 同事务，避免出现「已链接但 status 仍 PLANNED」的不一致中间态
      await this.prisma.$transaction(async (tx) => {
        const autoMarked = await this.workouts.markDoneIfApplicable(
          best.workoutId,
          activity.startTime ?? null,
          tx,
        );
        await this.links.create(
          {
            data: {
              planId: best.planId,
              planWorkoutId: best.workoutId,
              activityId: activity.id,
              source: PlanWorkoutActivityLinkSource.AUTO,
              role: PlanWorkoutActivityLinkRole.PRIMARY,
              autoMarkedWorkoutDone: autoMarked,
            },
          },
          tx,
        );
      });
    } catch (e) {
      this.logger.warn(
        `[PlanLinkMatcher] tryAutoLinkForActivity(${activityId}) failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }
}

export { markWorkoutDoneIfApplicable } from '../persistence/plan-workout-done';
