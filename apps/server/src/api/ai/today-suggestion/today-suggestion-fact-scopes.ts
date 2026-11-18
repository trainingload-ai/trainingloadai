import { createHash } from 'node:crypto';
import { stableJson } from '../core/ai-common.util';
import { coachingSemanticValue } from '../core/coach-fact-semantic';
import type { TodaySuggestionConstraintProjection } from './today-suggestion.types';
import type { CoachFactScope } from '../core/coach-fact-scope.port';
const hash = (value: unknown) =>
  createHash('sha256').update(stableJson(value)).digest('hex');

export function todayCoachingFactScopes(
  projection: TodaySuggestionConstraintProjection,
): CoachFactScope[] {
  const reviews = (projection.lightContext.workoutMatching ?? []) as Array<{
    activityHashId: string;
    [key: string]: unknown;
  }>;
  const shared = projection.lightContext.sharedFacts as
    | {
        revision?: string;
        health?: unknown;
        training?: unknown;
        memory?: { semanticRevision?: string; disabled?: boolean };
        status?: string;
      }
    | undefined;
  return [
    ...reviews.map((review) => ({
      topic: `workout-match:${review.activityHashId}`,
      revision: hash({ review, allowAi: projection.allowAi }),
    })),
    {
      topic: `today:${projection.date}`,
      revision: hash(
        coachingSemanticValue({
          date: projection.date,
          timezone: projection.timezone,
          health: shared?.health,
          training: shared?.training,
          matching: reviews,
          memory: shared?.memory?.semanticRevision,
          memoryDisabled: shared?.memory?.disabled,
          factReadStatus: shared?.status,
          today: projection.todayWorkouts,
          tomorrow: projection.tomorrowWorkouts,
          load: projection.lightContext.load,
          activities: projection.lightContext.recentActivities,
          allowAi: projection.allowAi,
          featureAllowed: projection.featureAllowed,
          highConcern: projection.highConcern,
          decisionId: projection.activeDecisionId,
          feedback: projection.userFeedback,
        }),
      ),
    },
    {
      topic: `coach-context:${projection.date}`,
      revision: shared?.revision ?? 'unverified',
    },
    {
      topic: `athlete-state:${projection.date}`,
      revision: shared?.revision ?? 'unverified',
    },
  ].map((scope) => ({ ...scope, timezone: projection.timezone ?? 'UTC' }));
}
