import { sha256Hex, stableJson } from './ai-common.util';
import { Injectable } from '@nestjs/common';
import { PlanExecutionContextService } from '@/api/plan/plan-execution-context.service';
import { PlanWorkoutRepository } from '@/api/plan/persistence/plan-workout.repository';
import { TrainingDataCoverageQueryService } from './training-data-coverage-query.service';
import { coachingSemanticValue } from './coach-fact-semantic';

/** Read current training owners without treating previous AI assessments as facts. */
@Injectable()
export class CoachTrainingFactContextService {
  constructor(
    private readonly execution: PlanExecutionContextService,
    private readonly coverage: TrainingDataCoverageQueryService,
    private readonly workouts: PlanWorkoutRepository,
  ) {}

  async build(userId: string, date: string, timezone: string) {
    const start = new Date(`${date}T00:00:00Z`);
    const [execution, activities, independent] = await Promise.all([
      this.execution.buildContext({
        userId,
        surface: 'COACH_CHAT',
        anchorDate: date,
        timezone,
      }),
      this.coverage.recentActivityFacts(
        userId,
        new Date(start.getTime() - 90 * 86_400_000),
        1_001,
      ),
      this.workouts.findMany({
        where: {
          userId,
          planId: null,
          scheduledDate: {
            gte: start,
            lt: new Date(start.getTime() + 14 * 86_400_000),
          },
        },
        orderBy: [{ scheduledDate: 'asc' }, { id: 'asc' }],
        take: 101,
        select: {
          id: true,
          revision: true,
          name: true,
          sportType: true,
          status: true,
          scheduledDate: true,
          plannedDurationSeconds: true,
        },
      }),
    ]);
    return {
      truncated: independent.length > 100 || activities.length > 1_000,
      activityRevision: sha256Hex(
        stableJson(coachingSemanticValue(activities)),
      ),
      facts: coachingSemanticValue({
        plan: execution.plan,
        day: execution.day,
        tomorrow: execution.tomorrow,
        nextWorkouts: execution.nextWorkouts,
        load: execution.recentLoad,
        workoutMatching: execution.workoutMatching,
        activities: activities.slice(0, 12),
        independent,
        competitions: {
          upcoming: execution.competitionContext?.upcomingEvents,
          recent: execution.competitionContext?.recentEvents,
        },
      }),
    };
  }
}
